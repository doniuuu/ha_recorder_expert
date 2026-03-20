import os
import io
import json
import glob
from datetime import datetime
from pathlib import Path
from ruamel.yaml import YAML

BASE_DIR = "/config/recorder_expert"
BACKUP_DIR = os.path.join(BASE_DIR, "backups")

os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)

ryaml = YAML()
ryaml.indent(mapping=2, sequence=4, offset=2)
ryaml.default_flow_style = False

def get_paths(mode):
    return os.path.join(BASE_DIR, f"{mode}_include_entities.yaml"), os.path.join(BASE_DIR, f"{mode}_exclude_entities.yaml")

KNOWN_DATA_PATH = os.path.join(BASE_DIR, "known_data.json")

def _load_known_data():
    """Wczytuje centralny plik snapshotu. Zwraca None gdy plik nie istnieje."""
    if not os.path.exists(KNOWN_DATA_PATH):
        return None
    try:
        with open(KNOWN_DATA_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

def _save_known_data(data):
    """Zapisuje centralny plik snapshotu."""
    try:
        with open(KNOWN_DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f)
    except Exception: pass

def load_yaml_config(mode):
    # [event_types] dodano klucz exc_et — tylko recorder obsługuje event_types w exclude
    db = {'inc_e': [], 'exc_e': [], 'inc_g': [], 'exc_g': [], 'inc_d': [], 'exc_d': [], 'exc_et': []}
    inc_file, exc_file = get_paths(mode)
    
    for f, m in [(inc_file, 'inc'), (exc_file, 'exc')]:
        if os.path.exists(f):
            try:
                with open(f, 'r', encoding='utf-8') as stream:
                    content = ryaml.load(stream) or {}
                    inner = content.get('include' if m == 'inc' else 'exclude', content)
                    if not isinstance(inner, dict): inner = content
                    
                    db[f'{m}_e'] = inner.get('entities', []) or []
                    db[f'{m}_g'] = inner.get('entity_globs', []) or []
                    db[f'{m}_d'] = inner.get('domains', []) or []
                    # [event_types] odczyt event_types tylko z pliku exclude i tylko dla recorder
                    if m == 'exc' and mode == 'recorder':
                        db['exc_et'] = inner.get('event_types', []) or []
            except Exception: pass
    return db

def generate_yaml_dicts(config):
    clean = lambda lst: sorted(list(set([x for x in lst if x and x.strip()])))
    inc_data, exc_data = {}, {}
    
    inc_d, inc_g, inc_e = clean(config.get('inc_d', [])), clean(config.get('inc_g', [])), clean(config.get('inc_e', []))
    if inc_d: inc_data['domains'] = inc_d
    if inc_g: inc_data['entity_globs'] = inc_g
    if inc_e: inc_data['entities'] = inc_e
        
    exc_d, exc_g, exc_e = clean(config.get('exc_d', [])), clean(config.get('exc_g', [])), clean(config.get('exc_e', []))
    if exc_d: exc_data['domains'] = exc_d
    if exc_g: exc_data['entity_globs'] = exc_g
    if exc_e: exc_data['entities'] = exc_e
    # [event_types] zapis event_types do exclude — HA Core obsługuje tylko recorder.exclude.event_types
    exc_et = clean(config.get('exc_et', []))
    if exc_et: exc_data['event_types'] = exc_et

    return inc_data, exc_data

def get_yaml_preview(config, mode):
    inc_data, exc_data = generate_yaml_dicts(config)
    inc_file, exc_file = get_paths(mode)
    buf_inc, buf_exc = io.StringIO(), io.StringIO()
    
    if inc_data: ryaml.dump(inc_data, buf_inc)
    if exc_data: ryaml.dump(exc_data, buf_exc)
    
    return buf_inc.getvalue() or "# No include rules", buf_exc.getvalue() or "# No exclude rules", inc_file, exc_file

def create_backup(mode):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    config = load_yaml_config(mode)
    if not any(config.values()): return 
    
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(BACKUP_DIR, f"{mode}_{ts}.json")
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(config, f)
    except Exception: pass

def get_backups(mode):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    files = glob.glob(os.path.join(BACKUP_DIR, f"{mode}_*.json"))
    backups = []
    for f in files:
        basename = os.path.basename(f)
        ts_str = basename.replace(f"{mode}_", "").replace(".json", "")
        try:
            dt = datetime.strptime(ts_str, "%Y%m%d_%H%M%S")
            backups.append({
                "id": basename, 
                "timestamp": dt.timestamp(), 
                "display": dt.strftime("%Y-%m-%d %H:%M:%S")
            })
        except Exception: pass
    backups.sort(key=lambda x: x["timestamp"], reverse=True)
    return backups

def restore_backup(mode, backup_id):
    filepath = os.path.join(BACKUP_DIR, backup_id)
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                config = json.load(f)
            save_yaml_files(config, None, mode)
            return True
        except Exception: pass
    return False

def save_yaml_files(config, known_entities_ids, event_types_ids, mode):
    inc_data, exc_data = generate_yaml_dicts(config)
    os.makedirs(BASE_DIR, exist_ok=True)
    inc_file, exc_file = get_paths(mode)

    Path(inc_file).touch(exist_ok=True)
    Path(exc_file).touch(exist_ok=True)

    with open(inc_file, "w", encoding='utf-8') as f:
        if inc_data: ryaml.dump(inc_data, f)
        else: f.write("")

    with open(exc_file, "w", encoding='utf-8') as f:
        if exc_data: ryaml.dump(exc_data, f)
        else: f.write("")

    # Zapisz snapshot do centralnego known_data.json
    if known_entities_ids is not None:
        data = _load_known_data() or {}
        data[mode] = {
            'entities': list(known_entities_ids),
            'event_types': list(event_types_ids) if event_types_ids is not None else []
        }
        _save_known_data(data)

def get_known_data(mode):
    """Zwraca slownik {entities: set, event_types: set} lub None gdy brak snapshotu."""
    data = _load_known_data()
    if data is None or mode not in data:
        return None
    mode_data = data[mode]
    return {
        'entities': set(mode_data.get('entities', [])),
        'event_types': set(mode_data.get('event_types', []))
    }

def check_files_exist(mode):
    inc_file, exc_file = get_paths(mode)
    return os.path.exists(inc_file) and os.path.exists(exc_file)