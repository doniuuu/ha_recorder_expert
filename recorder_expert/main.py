from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import requests
import sqlite3
import os
import uvicorn
import logging
import yaml_manager

HA_DB_PATH = "/config/home-assistant_v2.db"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RecorderExpert")

logger.info("=== FILE SYSTEM DIAGNOSTICS ===")
if os.path.exists("/config/configuration.yaml"):
    logger.info("✅ SUCCESS: Main configuration.yaml found! Access to real HA /config confirmed.")
else:
    logger.error("❌ ERROR: Running in an isolated container! The 'config:rw' mapping from config.yaml FAILED.")
    try:
        logger.info(f"What I currently see in /config is only: {os.listdir('/config')}")
    except Exception: pass
logger.info("====================================")


app = FastAPI()
os.makedirs("frontend", exist_ok=True)
os.makedirs("lang", exist_ok=True)

app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")
app.mount("/lang", StaticFiles(directory="lang"), name="lang")

@app.get("/api/langs")
async def get_langs():
    try:
        langs = [f.replace('.json', '') for f in os.listdir('lang') if f.endswith('.json')]
        return {"langs": langs if langs else ['en']}
    except Exception:
        return {"langs": ['en']}

TOKEN = os.getenv("SUPERVISOR_TOKEN")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
BASE_URL = "http://supervisor/core/api"

@app.get("/api/data")
async def get_data(mode: str = 'recorder'):
    try:
        r = requests.get(f"{BASE_URL}/states", headers=HEADERS, timeout=10)
        states = r.json()
        known = yaml_manager.get_known_data(mode)  # None gdy brak pliku snapshotu

        entities = []
        for s in states:
            uom = s.get('attributes', {}).get('unit_of_measurement')

            if mode == 'logbook' and uom:
                continue

            eid = s['entity_id']
            # is_new tylko gdy snapshot istnieje i encja go nie ma
            is_new = (eid not in known['entities']) if known is not None else False

            entities.append({
                'entity_id': eid,
                'name': s.get('attributes', {}).get('friendly_name') or eid,
                'domain': eid.split('.')[0],
                'uom': uom,
                'state': s.get('state'),
                'is_new': is_new
            })

        config = yaml_manager.load_yaml_config(mode)
        recorder_config = yaml_manager.load_yaml_config('recorder') if mode == 'logbook' else None
        # Przekaż znane event types do frontendu (None = brak snapshotu = brak NEW)
        known_event_types = list(known['event_types']) if known is not None else None

        return {
            "entities": entities,
            "config": config,
            "recorder_config": recorder_config,
            "known_event_types": known_event_types
        }
    except Exception as e:
        logger.error(f"HA API Error: {e}")
        return {"error": str(e)}

@app.get("/api/event-types")
async def get_event_types():
    """Zwraca listę dostępnych event types przez HA Supervisor REST API."""
    available = []

    # --- DEBUG: sprawdź czy token jest dostępny ---
    token_present = bool(TOKEN)
    token_preview = (TOKEN[:8] + "...") if TOKEN and len(TOKEN) > 8 else repr(TOKEN)
    logger.info(f"[event-types] DEBUG: SUPERVISOR_TOKEN present={token_present}, preview={token_preview}")
    logger.info(f"[event-types] DEBUG: BASE_URL={BASE_URL}")
    logger.info(f"[event-types] DEBUG: Wywołuję GET {BASE_URL}/events")

    try:
        r = requests.get(f"{BASE_URL}/events", headers=HEADERS, timeout=10)
        logger.info(f"[event-types] DEBUG: HTTP status={r.status_code}")
        logger.info(f"[event-types] DEBUG: Response (pierwsze 500 znaków): {r.text[:500]}")

        if r.status_code == 200:
            events_data = r.json()
            logger.info(f"[event-types] DEBUG: Liczba obiektów w odpowiedzi: {len(events_data)}")
            if events_data:
                logger.info(f"[event-types] DEBUG: Przykładowy obiekt: {events_data[0]}")
            available = sorted([e['event'] for e in events_data if e.get('event') and e['event'] != '*'])
            logger.info(f"[event-types] OK: Pobrano {len(available)} typów. Przykłady: {available[:5]}")
        else:
            logger.error(f"[event-types] ERROR: HTTP {r.status_code}: {r.text[:300]}")
    except Exception as e:
        logger.error(f"[event-types] EXCEPTION: {type(e).__name__}: {e}")

    # Aktualnie skonfigurowane wykluczenia z YAML recordera
    recorder_cfg = yaml_manager.load_yaml_config('recorder')
    configured = recorder_cfg.get('exc_et', [])

    logger.info(f"[event-types] Zwracam available={len(available)}, configured={len(configured)}")
    return {"available": available, "configured": configured}


@app.post("/api/preview")
async def preview_yaml(request: Request):
    payload = await request.json()
    mode = payload.get('mode', 'recorder')
    inc_yaml, exc_yaml, inc_path, exc_path = yaml_manager.get_yaml_preview(payload.get('config', {}), mode)
    return {"inc_yaml": inc_yaml, "exc_yaml": exc_yaml, "inc_path": inc_path, "exc_path": exc_path}

@app.post("/api/save")
async def save_config(request: Request):
    payload = await request.json()
    force_create = payload.get('force_create', False)
    mode = payload.get('mode', 'recorder')

    if not force_create and not yaml_manager.check_files_exist(mode):
        return {
            "status": "confirm",
            "message": f"YAML files for {mode.upper()} mode do not exist in /config/recorder_expert. Create them?"
        }

    try:
        if yaml_manager.check_files_exist(mode):
            yaml_manager.create_backup(mode)

        yaml_manager.save_yaml_files(
            payload.get('config', {}),
            payload.get('known_entities', []),
            payload.get('known_event_types', []),  # lista wszystkich dostępnych ET w momencie zapisu
            mode
        )
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/backups")
async def api_get_backups(mode: str = 'recorder'):
    return {"backups": yaml_manager.get_backups(mode)}

@app.post("/api/backup/create")
async def api_create_backup(request: Request):
    payload = await request.json()
    yaml_manager.create_backup(payload.get('mode', 'recorder'))
    return {"status": "success"}

@app.post("/api/backup/restore")
async def api_restore_backup(request: Request):
    payload = await request.json()
    success = yaml_manager.restore_backup(payload.get('mode', 'recorder'), payload.get('backup_id'))
    return {"status": "success" if success else "error"}

@app.post("/api/backup/delete")
async def api_delete_backup(request: Request):
    payload = await request.json()
    filepath = os.path.join(yaml_manager.BACKUP_DIR, payload.get('backup_id'))
    if os.path.exists(filepath):
        os.remove(filepath)
        return {"status": "success"}
    return {"status": "error"}

@app.get("/")
async def index(): return FileResponse('frontend/index.html')

@app.get("/app.jsx")
async def get_app_jsx(): return FileResponse('frontend/app.jsx')

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8501, log_level="info")