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

def get_snapshot_path(mode):
    return os.path.join(BASE_DIR, f".{mode}_known.json")

def load_yaml_config(mode):
    db = {'inc_e': [], 'exc_e': [], 'inc_g': [], 'exc_g': [], 'inc_d': [], 'exc_d': []}
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

def save_yaml_files(config, known_entities_ids, mode):
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
            
    if known_entities_ids is not None:
        try:
            with open(get_snapshot_path(mode), 'w', encoding='utf-8') as f:
                json.dump(known_entities_ids, f)
        except Exception: pass

def get_known_entities(mode):
    snap_path = get_snapshot_path(mode)
    if os.path.exists(snap_path):
        try:
            with open(snap_path, 'r', encoding='utf-8') as f:
                return set(json.load(f))
        except Exception: pass
    return None

def check_files_exist(mode):
    inc_file, exc_file = get_paths(mode)
    return os.path.exists(inc_file) and os.path.exists(exc_file)