const { useState, useEffect, useMemo, useCallback } = React;

const makeRegex = (glob) => {
    if (!glob || !glob.trim()) return null;
    let escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.?') + '$');
};

const REASONS_KEYS = {
    'E_INC': { key: 'e_inc', color: 'text-green-400', rec: true },
    'E_EXC': { key: 'e_exc', color: 'text-red-400', rec: false },
    'G_INC': { key: 'g_inc', color: 'text-green-500', rec: true },
    'G_EXC': { key: 'g_exc', color: 'text-red-500', rec: false },
    'D_INC': { key: 'd_inc', color: 'text-green-600', rec: true },
    'D_EXC': { key: 'd_exc', color: 'text-red-600', rec: false },
    'DEF_EXC': { key: 'def_exc', color: 'text-gray-600', rec: false },
    'DEF_INC': { key: 'def_inc', color: 'text-gray-400', rec: true }
};

function App() {
    const [lang, setLang] = useState(localStorage.getItem('appLang') || 'en');
    const [availableLangs, setAvailableLangs] = useState(['en']);
    const [translations, setTranslations] = useState({});

    useEffect(() => {
        fetch('./api/langs').then(r => r.json()).then(d => {
            if(d.langs) setAvailableLangs(d.langs);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        fetch(`./lang/${lang}.json?v=${new Date().getTime()}`)
            .then(r => r.json())
            .then(data => { setTranslations(data); localStorage.setItem('appLang', lang); })
            .catch(() => console.error("Lang file missing:", lang));
    }, [lang]);

    const t = useCallback((key) => translations[key] || key, [translations]);

    const [appMode, setAppMode] = useState('recorder');
    const [entities, setEntities] = useState([]);
    const [config, setConfig] = useState({inc_e: [], exc_e: [], inc_g: [], exc_g: [], inc_d: [], exc_d: []});
    const [backups, setBackups] = useState([]);
    const [search, setSearch] = useState('');
    const [expandedGroups, setExpandedGroups] = useState({});
    const [sidebarOpen, setSidebarOpen] = useState(false);
    
    const [filterStatus, setFilterStatus] = useState('ALL'); 
    const [activeGlobFilter, setActiveGlobFilter] = useState('');
    
    const [showReasonMenu, setShowReasonMenu] = useState(false);
    const [reasonFilters, setReasonFilters] = useState([]);
    const [showUomMenu, setShowUomMenu] = useState(false);
    const [uomFilters, setUomFilters] = useState([]);
    
    const [previewModal, setPreviewModal] = useState({ show: false, loading: false, data: null, saving: false });
    const [showGhostModal, setShowGhostModal] = useState(false);
    const [showBackupModal, setShowBackupModal] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const loadBackups = useCallback(async (currentMode) => {
        try {
            const res = await fetch(`./api/backups?mode=${currentMode}`);
            const data = await res.json();
            if(data.backups) setBackups(data.backups);
        } catch(e) {}
    }, []);

    const loadData = useCallback(async (currentMode) => {
        setIsSyncing(true);
        try {
            const res = await fetch(`./api/data?mode=${currentMode}`);
            const data = await res.json();
            if(data.entities) { 
                setEntities(data.entities); 
                setConfig(data.config); 
            }
        } catch(e) { alert(t('err_read') || 'Read error'); }
        setIsSyncing(false);
    }, [t]);

    useEffect(() => {
        setSearch(''); setFilterStatus('ALL'); setActiveGlobFilter('');
        setReasonFilters([]); setUomFilters([]); setExpandedGroups({});
        loadData(appMode);
        loadBackups(appMode);
    }, [appMode, loadData, loadBackups]);

    const openPreview = async () => {
        setPreviewModal({ show: true, loading: true, data: null, saving: false });
        try {
            const res = await fetch('./api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, mode: appMode }) });
            const data = await res.json();
            setPreviewModal({ show: true, loading: false, data, saving: false });
        } catch(e) {
            alert(t('err_preview') || 'Preview error');
            setPreviewModal({ show: false, loading: false, data: null, saving: false });
        }
    };

    const confirmSave = async (force = false) => {
        setPreviewModal(prev => ({ ...prev, saving: true }));
        try {
            const payload = { config, force_create: force, known_entities: entities.map(e => e.entity_id), mode: appMode };
            const res = await fetch('./api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            
            if (data.status === 'confirm') {
                setPreviewModal(prev => ({ ...prev, saving: false }));
                if (window.confirm(data.message)) confirmSave(true);
            } else if (data.status === 'success') {
                alert(`${t('success_save') || 'Saved'} ${appMode.toUpperCase()}!`);
                setPreviewModal({ show: false, loading: false, data: null, saving: false });
                loadData(appMode);
                loadBackups(appMode);
            } else {
                alert(`${t('err_save') || 'Error'} ` + data.message);
                setPreviewModal(prev => ({ ...prev, saving: false }));
            }
        } catch(e) { alert(`${t('err_network') || 'Network Error'} ` + e.message); setPreviewModal(prev => ({ ...prev, saving: false })); }
    };

    const handleCreateBackup = async () => {
        setIsSyncing(true);
        await fetch('./api/backup/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: appMode }) });
        await loadBackups(appMode);
        setIsSyncing(false);
    };

    const handleRestoreBackup = async (id) => {
        if(!window.confirm(t('confirm_restore') || 'Restore this backup? Unsaved changes will be lost.')) return;
        setIsSyncing(true);
        await fetch('./api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: appMode, backup_id: id }) });
        await loadData(appMode);
        setShowBackupModal(false);
        setIsSyncing(false);
    };

    const handleDeleteBackup = async (id) => {
        await fetch('./api/backup/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backup_id: id }) });
        await loadBackups(appMode);
    };

    const globCounts = useMemo(() => {
        const counts = { inc_g: {}, exc_g: {} };
        config.inc_g.forEach(g => counts.inc_g[g] = 0);
        config.exc_g.forEach(g => counts.exc_g[g] = 0);
        const incRegexes = config.inc_g.map(g => ({ raw: g, re: makeRegex(g) })).filter(g => g.re);
        const excRegexes = config.exc_g.map(g => ({ raw: g, re: makeRegex(g) })).filter(g => g.re);
        entities.forEach(e => {
            incRegexes.forEach(r => { if(r.re.test(e.entity_id)) counts.inc_g[r.raw]++; });
            excRegexes.forEach(r => { if(r.re.test(e.entity_id)) counts.exc_g[r.raw]++; });
        });
        return counts;
    }, [entities, config.inc_g, config.exc_g]);

    const entityStatuses = useMemo(() => {
        const statuses = {};
        const incRegexes = config.inc_g.map(g => ({ raw: g, re: makeRegex(g) })).filter(g => g.re);
        const excRegexes = config.exc_g.map(g => ({ raw: g, re: makeRegex(g) })).filter(g => g.re);
        const hasIncludes = config.inc_e.length > 0 || incRegexes.length > 0 || config.inc_d.length > 0;

        entities.forEach(e => {
            const eid = e.entity_id;
            const domain = e.domain;
            let code = ''; let matchedGlob = '';

            if (config.inc_e.includes(eid)) code = 'E_INC';
            else if (config.exc_e.includes(eid)) code = 'E_EXC';
            else {
                const matchInc = incRegexes.find(g => g.re.test(eid));
                if (matchInc) { code = 'G_INC'; matchedGlob = matchInc.raw; }
                else {
                    const matchExc = excRegexes.find(g => g.re.test(eid));
                    if (matchExc) { code = 'G_EXC'; matchedGlob = matchExc.raw; }
                    else if (config.inc_d.includes(domain)) code = 'D_INC';
                    else if (config.exc_d.includes(domain)) code = 'D_EXC';
                    else code = hasIncludes ? 'DEF_EXC' : 'DEF_INC';
                }
            }
            const r = REASONS_KEYS[code];
            const translatedLabel = t(r.key) || r.key;
            statuses[eid] = { code, rec: r.rec, color: r.color, text: matchedGlob ? `${translatedLabel} (${matchedGlob})` : translatedLabel, matchedGlob };
        });
        return statuses;
    }, [entities, config, t]);

    const passesBaseFilters = useCallback((e, sInfo) => {
        if (!sInfo) return false;
        if (search && !e.entity_id.toLowerCase().includes(search.toLowerCase()) && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterStatus === 'RECORDED' && !sInfo.rec) return false;
        if (filterStatus === 'EXCLUDED' && sInfo.rec) return false;
        if (filterStatus === 'NEW' && !e.is_new) return false;
        if (activeGlobFilter && sInfo.matchedGlob !== activeGlobFilter) return false;
        return true;
    }, [search, filterStatus, activeGlobFilter]);

    const filteredForUoM = useMemo(() => entities.filter(e => passesBaseFilters(e, entityStatuses[e.entity_id]) && (reasonFilters.length === 0 || reasonFilters.includes(entityStatuses[e.entity_id].code))), [entities, passesBaseFilters, reasonFilters, entityStatuses]);
    const filteredForReason = useMemo(() => entities.filter(e => passesBaseFilters(e, entityStatuses[e.entity_id]) && (appMode !== 'recorder' || uomFilters.length === 0 || uomFilters.includes(e.uom || '---'))), [entities, passesBaseFilters, uomFilters, entityStatuses, appMode]);

    const uomCounts = useMemo(() => {
        const counts = {};
        filteredForUoM.forEach(e => { const u = e.uom || '---'; counts[u] = (counts[u] || 0) + 1; });
        return counts;
    }, [filteredForUoM]);

    const reasonCounts = useMemo(() => {
        const counts = {};
        filteredForReason.forEach(e => {
            const sInfo = entityStatuses[e.entity_id];
            if (sInfo) counts[sInfo.code] = (counts[sInfo.code] || 0) + 1;
        });
        return counts;
    }, [filteredForReason, entityStatuses]);

    const dynamicUoms = Object.keys(uomCounts).filter(u => uomCounts[u] > 0).sort();
    const dynamicReasons = Object.entries(REASONS_KEYS).filter(([code]) => reasonCounts[code] > 0);

    const stats = useMemo(() => {
        let rec = 0; let newCount = 0;
        entities.forEach(e => { 
            if(entityStatuses[e.entity_id]?.rec) rec++; 
            if(e.is_new) newCount++;
        });
        return { recorded: rec, excluded: entities.length - rec, newCount };
    }, [entities, entityStatuses]);

    const ghostEntities = useMemo(() => {
        if (entities.length === 0 && isSyncing) return { inc: [], exc: [], inc_g: [], exc_g: [], total: 0 };
        const haEntityIds = new Set(entities.map(e => e.entity_id));
        
        const incGhosts = config.inc_e.filter(id => !haEntityIds.has(id));
        const excGhosts = config.exc_e.filter(id => !haEntityIds.has(id));
        
        const incGlobGhosts = config.inc_g.filter(g => {
            const re = makeRegex(g);
            return re ? !entities.some(e => re.test(e.entity_id)) : false;
        });
        const excGlobGhosts = config.exc_g.filter(g => {
            const re = makeRegex(g);
            return re ? !entities.some(e => re.test(e.entity_id)) : false;
        });

        return { 
            inc: incGhosts, 
            exc: excGhosts, 
            inc_g: incGlobGhosts, 
            exc_g: excGlobGhosts, 
            total: incGhosts.length + excGhosts.length + incGlobGhosts.length + excGlobGhosts.length 
        };
    }, [entities, config.inc_e, config.exc_e, config.inc_g, config.exc_g, isSyncing]);

    const combinedIncGhosts = useMemo(() => [...ghostEntities.inc, ...ghostEntities.inc_g], [ghostEntities]);
    const combinedExcGhosts = useMemo(() => [...ghostEntities.exc, ...ghostEntities.exc_g], [ghostEntities]);

    const handleRemoveGhosts = () => {
        setConfig(prev => ({
            ...prev,
            inc_e: prev.inc_e.filter(id => !ghostEntities.inc.includes(id)),
            exc_e: prev.exc_e.filter(id => !ghostEntities.exc.includes(id)),
            inc_g: prev.inc_g.filter(g => !ghostEntities.inc_g.includes(g)),
            exc_g: prev.exc_g.filter(g => !ghostEntities.exc_g.includes(g))
        }));
        setShowGhostModal(false);
    };

    const hasIncludesPolicy = config.inc_e.length > 0 || config.inc_g.filter(g => g.trim()).length > 0 || config.inc_d.length > 0;

    const toggleEntity = (eid, type) => {
        setConfig(prev => {
            const nc = { ...prev };
            nc.inc_e = nc.inc_e.filter(e => e !== eid); nc.exc_e = nc.exc_e.filter(e => e !== eid);
            if (type === 'I') nc.inc_e.push(eid); if (type === 'E') nc.exc_e.push(eid);
            return nc;
        });
    };
    
    const toggleDomain = (domain, type, e) => {
        e.stopPropagation();
        setConfig(prev => {
            const nc = { ...prev };
            nc.inc_d = nc.inc_d.filter(d => d !== domain); nc.exc_d = nc.exc_d.filter(d => d !== domain);
            if (type === 'I') nc.inc_d.push(domain); if (type === 'E') nc.exc_d.push(domain);
            return nc;
        });
    };

    const handleGlobChange = (type, index, value) => setConfig(prev => { const n = [...prev[type]]; n[index] = value; return {...prev, [type]: n}; });
    const addGlob = (type) => setConfig(prev => ({...prev, [type]: [...prev[type], '']}));
    const removeGlob = (type, index) => setConfig(prev => { const n = [...prev[type]]; const r = n.splice(index, 1)[0]; if(activeGlobFilter===r) setActiveGlobFilter(''); return {...prev, [type]: n}; });
    const toggleReasonFilter = (code) => setReasonFilters(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    const toggleUomFilter = (uom) => setUomFilters(prev => prev.includes(uom) ? prev.filter(u => u !== uom) : [...prev, uom]);

    const groupedEntities = useMemo(() => {
        const filtered = entities.filter(e => {
            const sInfo = entityStatuses[e.entity_id];
            if (!passesBaseFilters(e, sInfo)) return false;
            if (reasonFilters.length > 0 && !reasonFilters.includes(sInfo.code)) return false;
            if (appMode === 'recorder' && uomFilters.length > 0 && !uomFilters.includes(e.uom || '---')) return false;
            return true;
        });
        const groups = {};
        filtered.forEach(e => { if (!groups[e.domain]) groups[e.domain] = []; groups[e.domain].push(e); });
        if (search || filterStatus !== 'ALL' || activeGlobFilter || reasonFilters.length > 0 || uomFilters.length > 0) { 
            const newExpanded = {}; Object.keys(groups).forEach(k => newExpanded[k] = true); 
            setExpandedGroups(newExpanded); 
        }
        return groups;
    }, [entities, search, filterStatus, activeGlobFilter, reasonFilters, uomFilters, entityStatuses, appMode, passesBaseFilters]);

    return (
        <div className="flex h-screen w-full relative">

            {showBackupModal && (
                <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-6">
                    <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl h-[70vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-blue-400 flex items-center gap-2">
                                <span className="material-icons">history</span> {t('backups_title') || 'Backups'} - {appMode.toUpperCase()}
                            </h2>
                            <button onClick={() => setShowBackupModal(false)} className="text-gray-400 hover:text-white"><span className="material-icons">close</span></button>
                        </div>
                        <div className="p-6 flex-grow overflow-y-auto">
                            {backups.length === 0 ? (
                                <div className="text-center text-gray-500 py-10">{t('no_backups_found') || 'No backups found for this mode.'}</div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {backups.map(b => (
                                        <div key={b.id} className="bg-[#222] border border-gray-700 rounded p-3 flex justify-between items-center hover:border-blue-500 transition-colors">
                                            <div className="font-mono text-gray-300">{b.display}</div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleRestoreBackup(b.id)} className="px-3 py-1 bg-blue-600/20 text-blue-400 border border-blue-600 rounded text-xs font-bold hover:bg-blue-600 hover:text-white transition-colors">{t('restore') || 'RESTORE'}</button>
                                                <button onClick={() => handleDeleteBackup(b.id)} className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600 rounded text-xs font-bold hover:bg-red-600 hover:text-white transition-colors">{t('delete') || 'DELETE'}</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-700 flex justify-between items-center bg-[#222] rounded-b-lg">
                            <div className="text-xs text-gray-400">Auto-backup on Save</div>
                            <button onClick={handleCreateBackup} disabled={isSyncing} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition shadow-lg flex items-center gap-2">
                                <span className={`material-icons text-sm ${isSyncing ? 'animate-spin' : ''}`}>add_circle</span> 
                                {t('create_backup') || 'CREATE BACKUP'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showGhostModal && (
                <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-6">
                    <div className="bg-[#1a1a1a] border border-red-900/50 rounded-lg shadow-2xl w-full max-w-4xl h-[70vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-red-950/30">
                            <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
                                <span className="material-icons">warning</span> 
                                {t('ghosts_modal_title') || 'Ghosts'}
                            </h2>
                            <button onClick={() => setShowGhostModal(false)} className="text-gray-400 hover:text-white"><span className="material-icons">close</span></button>
                        </div>
                        <div className="p-6 flex-grow overflow-hidden flex gap-4">
                            <div className="w-1/2 flex flex-col">
                                <div className="text-xs text-green-400 mb-2 font-mono flex justify-between">
                                    <span>{t('ghosts_inc') || 'Ghosts Include (Entities & Globs)'}</span>
                                    <span className="bg-green-900/30 px-1.5 rounded">{combinedIncGhosts.length}</span>
                                </div>
                                <textarea readOnly className="w-full flex-grow bg-[#111] border border-gray-700 rounded p-4 text-sm font-mono text-gray-500 outline-none resize-none whitespace-pre custom-scrollbar" value={combinedIncGhosts.join('\n') || 'None'}></textarea>
                            </div>
                            <div className="w-1/2 flex flex-col">
                                <div className="text-xs text-red-400 mb-2 font-mono flex justify-between">
                                    <span>{t('ghosts_exc') || 'Ghosts Exclude (Entities & Globs)'}</span>
                                    <span className="bg-red-900/30 px-1.5 rounded">{combinedExcGhosts.length}</span>
                                </div>
                                <textarea readOnly className="w-full flex-grow bg-[#111] border border-gray-700 rounded p-4 text-sm font-mono text-gray-500 outline-none resize-none whitespace-pre custom-scrollbar" value={combinedExcGhosts.join('\n') || 'None'}></textarea>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-700 flex justify-between items-center bg-[#222] rounded-b-lg">
                            <div className="text-xs text-gray-400 max-w-[50%] leading-relaxed">{t('ghosts_desc') || 'Not found in HA.'}</div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowGhostModal(false)} className="px-6 py-2 rounded font-bold text-gray-300 hover:bg-gray-800 transition">{t('cancel') || 'CANCEL'}</button>
                                <button onClick={handleRemoveGhosts} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold transition shadow-lg flex items-center gap-2">
                                    <span className="material-icons text-sm">delete_sweep</span> 
                                    {t('btn_remove_ghosts') || 'REMOVE'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {previewModal.show && (
                <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-6">
                    <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-blue-400">{t('preview_title') || 'Preview'} {appMode.toUpperCase()} {t('yaml_before') || 'YAML'}</h2>
                            <button onClick={() => setPreviewModal({show: false})} disabled={previewModal.saving} className="text-gray-400 hover:text-white"><span className="material-icons">close</span></button>
                        </div>
                        <div className="p-6 flex-grow overflow-hidden flex gap-4">
                            {previewModal.loading ? (
                                <div className="w-full flex justify-center items-center text-gray-400">{t('generating') || 'Generating...'}</div>
                            ) : previewModal.data && (
                                <>
                                    <div className="w-1/2 flex flex-col">
                                        <div className="text-xs text-green-400 mb-2 font-mono truncate">{previewModal.data.inc_path}</div>
                                        <textarea readOnly className="w-full flex-grow bg-[#111] border border-gray-700 rounded p-4 text-sm font-mono text-green-300 outline-none resize-none whitespace-pre custom-scrollbar" value={previewModal.data.inc_yaml}></textarea>
                                    </div>
                                    <div className="w-1/2 flex flex-col">
                                        <div className="text-xs text-red-400 mb-2 font-mono truncate">{previewModal.data.exc_path}</div>
                                        <textarea readOnly className="w-full flex-grow bg-[#111] border border-gray-700 rounded p-4 text-sm font-mono text-red-300 outline-none resize-none whitespace-pre custom-scrollbar" value={previewModal.data.exc_yaml}></textarea>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3 bg-[#222] rounded-b-lg">
                            <button onClick={() => setPreviewModal({show: false})} disabled={previewModal.saving} className="px-6 py-2 rounded font-bold text-gray-300 hover:bg-gray-800 transition">{t('cancel') || 'CANCEL'}</button>
                            <button onClick={() => confirmSave(false)} disabled={previewModal.loading || previewModal.saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded font-bold transition shadow-lg flex items-center gap-2">
                                {previewModal.saving ? <span className="material-icons text-sm animate-spin">sync</span> : <span className="material-icons text-sm">save</span>} 
                                {previewModal.saving ? (t('saving') || 'SAVING...') : (t('save_disk') || 'SAVE')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="w-10 bg-[#181818] border-r border-[#383838] flex flex-col items-center py-4 cursor-pointer hover:bg-[#222] transition-colors z-[70] shrink-0" onClick={() => setSidebarOpen(!sidebarOpen)} title={t('entity_globs') || 'Globs'}>
                <span className="material-icons text-gray-500 mb-8 transition-transform duration-300" style={{ transform: sidebarOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>menu_open</span>
                <div className="text-gray-500 font-bold text-[11px] tracking-[0.2em] uppercase whitespace-nowrap select-none" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{t('entity_globs') || 'Globs'}</div>
            </div>

            <div className={`ha-sidebar flex flex-col ${sidebarOpen ? 'w-[320px]' : 'w-0'} overflow-hidden shrink-0 z-[65] relative border-r border-[#383838]`}>
                <div className="px-5 h-[60px] border-b border-[#383838] flex items-center whitespace-nowrap shrink-0 bg-[#1c1c1c]">
                    <span className="font-bold text-lg text-gray-200">{t('group_rules') || 'Rules'}</span>
                </div>
                <div className="p-4 flex flex-col gap-6 overflow-y-auto w-[320px] pb-20 custom-scrollbar">
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs text-green-500 font-bold">🟩 {t('inc_globs') || 'Include Globs'}</label>
                            <button onClick={() => addGlob('inc_g')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center"><span className="material-icons text-xs mr-1">add</span>{t('add') || 'Add'}</button>
                        </div>
                        {config.inc_g.map((glob, i) => (
                            <div key={i} className="flex items-center gap-1 mb-1">
                                <input value={glob} onChange={(e) => handleGlobChange('inc_g', i, e.target.value)} placeholder={t('ph_inc') || 'e.g. sensor.*'} className="flex-grow bg-[#222] border border-gray-700 text-xs font-mono p-1.5 rounded focus:outline-none focus:border-green-500" />
                                <button onClick={() => removeGlob('inc_g', i)} className="text-gray-500 hover:text-red-500 material-icons text-sm">close</button>
                                <button onClick={() => setActiveGlobFilter(activeGlobFilter === glob ? '' : glob)} className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${activeGlobFilter === glob ? 'bg-blue-600 text-white' : 'bg-green-900/20 text-green-400 border-gray-700'}`}>[{globCounts.inc_g[glob] || 0}]</button>
                            </div>
                        ))}
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs text-red-500 font-bold">🟥 {t('exc_globs') || 'Exclude Globs'}</label>
                            <button onClick={() => addGlob('exc_g')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center"><span className="material-icons text-xs mr-1">add</span>{t('add') || 'Add'}</button>
                        </div>
                        {config.exc_g.map((glob, i) => (
                            <div key={i} className="flex items-center gap-1 mb-1">
                                <input value={glob} onChange={(e) => handleGlobChange('exc_g', i, e.target.value)} placeholder={t('ph_exc') || 'e.g. sensor.*'} className="flex-grow bg-[#222] border border-gray-700 text-xs font-mono p-1.5 rounded focus:outline-none focus:border-red-500" />
                                <button onClick={() => removeGlob('exc_g', i)} className="text-gray-500 hover:text-red-500 material-icons text-sm">close</button>
                                <button onClick={() => setActiveGlobFilter(activeGlobFilter === glob ? '' : glob)} className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${activeGlobFilter === glob ? 'bg-blue-600 text-white' : 'bg-red-900/20 text-red-400 border-gray-700'}`}>[{globCounts.exc_g[glob] || 0}]</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-col flex-grow overflow-hidden relative z-0">
                <div className={`px-4 h-[60px] flex items-center shrink-0 justify-between relative z-[60] overflow-x-auto gap-4 border-b border-black/30 transition-colors duration-500 [&::-webkit-scrollbar]:hidden ${appMode === 'recorder' ? 'bg-[#121c2d]' : 'bg-[#1d122d]'}`}>
                    <div className="inline-flex items-center bg-[#000000]/40 border border-white/10 rounded-lg p-1 shadow-inner shrink-0">
                        <button onClick={() => setAppMode('recorder')} className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${appMode === 'recorder' ? 'bg-[#2a3852] text-blue-400 shadow-sm border border-blue-900/30' : 'text-gray-400 hover:text-gray-200'}`}>
                            <span className="material-icons text-[15px] w-[15px] max-w-[15px] leading-none overflow-hidden shrink-0 text-center">database</span> {t('recorder') || 'RECORDER'}
                        </button>
                        <button onClick={() => setAppMode('logbook')} className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${appMode === 'logbook' ? 'bg-[#3b2a52] text-purple-400 shadow-sm border border-purple-900/30' : 'text-gray-400 hover:text-gray-200'}`}>
                            <span className="material-icons text-[15px] w-[15px] max-w-[15px] leading-none overflow-hidden shrink-0 text-center">menu_book</span> {t('logbook') || 'LOGBOOK'}
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-4 shrink-0">
                        <div className="flex font-mono text-[11px] border border-white/10 bg-[#000000]/30 rounded shadow-inner divide-x divide-white/10 whitespace-nowrap h-9 items-center">
                            <div className="px-3 flex items-center text-gray-400">{t('all') || 'All:'} <span className="text-gray-200 font-bold ml-1.5">{entities.length}</span></div>
                            <div className="px-3 flex items-center text-gray-400">{t('in_db') || 'IN DB:'} <span className="text-green-500 font-bold ml-1.5">{stats.recorded}</span></div>
                            <div className="px-3 flex items-center text-gray-400">{t('rejected') || 'REJECTED:'} <span className="text-red-500 font-bold ml-1.5">{stats.excluded}</span></div>
                            <div className="px-3 flex items-center text-gray-400">{t('new') || 'NEW:'} <span className="text-amber-500 font-bold ml-1.5">{stats.newCount}</span></div>
                        </div>

                        <div className="flex items-center gap-2 h-9">
                            <button onClick={() => loadData(appMode)} disabled={isSyncing} className="h-full px-3 font-bold rounded-md border border-white/20 hover:border-blue-400 text-gray-300 hover:text-blue-400 flex items-center gap-1.5 transition-colors text-[10px] whitespace-nowrap bg-black/20 shadow-sm">
                                <span className={`material-icons text-[14px] ${isSyncing ? 'animate-spin' : ''}`}>sync</span> {t('load') || 'LOAD'}
                            </button>
                            <button onClick={openPreview} className="h-full px-3 font-bold rounded-md shadow-lg transition-colors bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 text-[10px] whitespace-nowrap border border-blue-500">
                                <span className="material-icons text-[14px]">save</span> {t('preview_save') || 'PREVIEW/SAVE'}
                            </button>
                            <select value={lang} onChange={(e) => setLang(e.target.value)} className="h-full bg-black/20 border border-white/20 text-gray-300 text-[10px] font-bold rounded-md px-2 focus:outline-none hover:border-blue-400 transition-colors uppercase cursor-pointer ml-2">
                                {availableLangs.map(l => <option key={l} value={l} className="bg-[#222]">{l}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className={`text-xs px-6 py-2 flex items-center justify-between font-bold border-b border-[#282828] shrink-0 ${hasIncludesPolicy ? 'bg-orange-950/40 text-orange-300' : 'bg-green-950/40 text-green-400'}`}>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center">
                            <span className="material-icons text-[16px] mr-2">info</span>
                            {t('policy_title') || 'POLICY:'} {hasIncludesPolicy ? (t('policy_reject') || 'REJECT') : (t('policy_accept') || 'ACCEPT')}
                        </div>
                        {ghostEntities.total > 0 && (
                            <div className="flex items-center text-red-400 hover:text-red-300 cursor-pointer underline decoration-red-500/50 underline-offset-2 transition-colors" onClick={() => setShowGhostModal(true)}>
                                <span className="material-icons text-[16px] mr-1">warning</span>
                                {t('ghosts_found') || 'Found'} {ghostEntities.total} {t('ghosts') || 'ghosts'} <span className="ml-1 opacity-70 font-normal">{t('click_to_manage') || '(Manage)'}</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center text-gray-400 hover:text-blue-400 cursor-pointer transition-colors" onClick={() => setShowBackupModal(true)}>
                        <span className="material-icons text-[16px] mr-1.5">history</span>
                        {backups.length > 0 ? `${t('last_backup') || 'Last backup'}: ${backups[0].display}` : (t('no_backup') || 'No backup')}
                    </div>
                </div>

                <div className="px-6 py-2 ha-header flex gap-4 shrink-0 border-b border-[#282828] items-center">
                    <div className="relative flex-grow">
                        <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                        <input className="w-full bg-[#111] border border-[#383838] rounded-md py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:border-blue-500" placeholder={t('search_ph') || 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="flex bg-[#111] border border-gray-700 rounded-md overflow-hidden text-xs">
                        <button onClick={() => setFilterStatus('ALL')} className={`px-4 py-1.5 font-bold ${filterStatus === 'ALL' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>{t('btn_all') || 'All'}</button>
                        <button onClick={() => setFilterStatus('RECORDED')} className={`px-4 py-1.5 font-bold border-l border-gray-700 ${filterStatus === 'RECORDED' ? 'bg-green-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>{t('btn_in_db') || 'In DB'}</button>
                        <button onClick={() => setFilterStatus('EXCLUDED')} className={`px-4 py-1.5 font-bold border-l border-gray-700 ${filterStatus === 'EXCLUDED' ? 'bg-red-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>{t('btn_rejected') || 'Rejected'}</button>
                        <button onClick={() => setFilterStatus('NEW')} className={`px-4 py-1.5 font-bold border-l border-gray-700 ${filterStatus === 'NEW' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>{t('btn_new') || 'New'}</button>
                    </div>
                </div>

                <div className="px-6 py-2 flex text-xs font-medium text-gray-400 border-b border-[#383838] bg-[#1a1a1a] shrink-0 relative z-[70]">
                    <div className="w-10 shrink-0"></div>
                    <div className="flex-grow min-w-[200px]">{t('entity') || 'Entity'}</div>
                    <div className="w-32 shrink-0 pl-2">{t('state') || 'State'}</div>
                    
                    {appMode === 'recorder' && (
                        <div className="w-48 shrink-0 relative pl-2">
                            <div className="cursor-pointer hover:text-white flex items-center select-none w-max" onClick={() => {setShowUomMenu(!showUomMenu); setShowReasonMenu(false);}}>
                                {t('uom') || 'UoM'} 
                                <span className={`material-icons text-[15px] ml-1 ${uomFilters.length > 0 ? 'text-blue-400' : 'text-gray-500'}`}>filter_alt</span>
                                {uomFilters.length > 0 && (
                                    <span className="material-icons text-[15px] ml-1 text-red-500 hover:text-red-400" title={t('clear_filter') || 'Clear'} onClick={(e) => { e.stopPropagation(); setUomFilters([]); }}>cancel</span>
                                )}
                            </div>
                            
                            {showUomMenu && (
                                <>
                                    <div className="fixed inset-0 z-[80]" onClick={(e) => { e.stopPropagation(); setShowUomMenu(false); }}></div>
                                    <div className="absolute top-full left-0 mt-2 bg-[#222] border border-gray-600 rounded-md shadow-2xl w-48 text-sm z-[90] max-h-[200px] overflow-y-auto p-1 custom-scrollbar">
                                        {dynamicUoms.length === 0 ? (
                                            <div className="p-2 text-gray-500 text-xs text-center">Brak opcji</div>
                                        ) : (
                                            dynamicUoms.map(uom => (
                                                <div 
                                                    key={uom} 
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleUomFilter(uom); }} 
                                                    className="flex items-center justify-between cursor-pointer hover:bg-[#333] px-2 py-1.5 rounded mb-0.5"
                                                >
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <input type="checkbox" className="accent-blue-500 shrink-0 pointer-events-none" checked={uomFilters.includes(uom)} readOnly />
                                                        <span className="text-gray-300 text-xs font-mono truncate leading-none mt-0.5">{uom}</span>
                                                    </div>
                                                    <span className="text-gray-500 text-[10px] shrink-0 leading-none">{uomCounts[uom] || 0}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div className="w-56 shrink-0 relative pl-2">
                        <div className="cursor-pointer hover:text-white flex items-center select-none w-max" onClick={() => {setShowReasonMenu(!showReasonMenu); setShowUomMenu(false);}}>
                            {t('reason') || 'Status'} 
                            <span className={`material-icons text-[15px] ml-1 ${reasonFilters.length > 0 ? 'text-blue-400' : 'text-gray-500'}`}>filter_alt</span>
                            {reasonFilters.length > 0 && (
                                <span className="material-icons text-[15px] ml-1 text-red-500 hover:text-red-400" title={t('clear_filter') || 'Clear'} onClick={(e) => { e.stopPropagation(); setReasonFilters([]); }}>cancel</span>
                            )}
                        </div>
                        
                        {showReasonMenu && (
                            <>
                                <div className="fixed inset-0 z-[80]" onClick={(e) => { e.stopPropagation(); setShowReasonMenu(false); }}></div>
                                <div className="absolute top-full left-0 mt-2 bg-[#222] border border-gray-600 rounded-md shadow-2xl w-52 text-sm z-[90] max-h-[200px] overflow-y-auto p-1 custom-scrollbar">
                                    {dynamicReasons.length === 0 ? (
                                        <div className="p-2 text-gray-500 text-xs text-center">Brak opcji</div>
                                    ) : (
                                        dynamicReasons.map(([code, r]) => (
                                            <div 
                                                key={code} 
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleReasonFilter(code); }} 
                                                className="flex items-center justify-between cursor-pointer hover:bg-[#333] px-2 py-1.5 rounded mb-0.5"
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <input type="checkbox" className="accent-blue-500 shrink-0 pointer-events-none" checked={reasonFilters.includes(code)} readOnly />
                                                    <span className={`${r.color} text-[11px] font-mono font-bold truncate leading-none mt-0.5`}>{t(r.key).split('(')[0]}</span>
                                                </div>
                                                <span className="text-gray-500 text-[10px] shrink-0 leading-none">{reasonCounts[code] || 0}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    <div className="w-40 shrink-0 text-center">{t('force') || 'Force'}</div>
                </div>

                <div className="flex-grow overflow-y-auto pb-10 z-0 relative">
                    {Object.keys(groupedEntities).sort().map(domain => {
                        const isDomInc = config.inc_d.includes(domain);
                        const isDomExc = config.exc_d.includes(domain);
                        return (
                            <div key={domain}>
                                <div className="ha-group bg-[#1c1c1c] px-6 py-2 flex items-center justify-between font-medium text-sm sticky top-0 z-30 shadow-md border-b border-gray-800" onClick={() => {if(!search && !activeGlobFilter && reasonFilters.length===0 && uomFilters.length===0 && filterStatus!=='NEW') setExpandedGroups(prev => ({...prev, [domain]: !prev[domain]}))}}>
                                    <div className="flex items-center"><span className="material-icons mr-4 text-gray-400 text-lg">{expandedGroups[domain] ? 'expand_more' : 'chevron_right'}</span><span className="capitalize text-blue-100">{domain}</span> <span className="text-gray-500 ml-2">({groupedEntities[domain].length})</span></div>
                                    <div className="flex gap-1">
                                        <button onClick={(e) => toggleDomain(domain, 'I', e)} className={`px-3 py-1 rounded text-xs border ${isDomInc ? 'bg-green-600/30 text-green-400 border-green-500' : 'text-gray-400 border-gray-600 hover:border-green-800'}`}>+ INC</button>
                                        <button onClick={(e) => toggleDomain(domain, 'E', e)} className={`px-3 py-1 rounded text-xs border ${isDomExc ? 'bg-red-600/30 text-red-400 border-red-500' : 'text-gray-400 border-gray-600 hover:border-red-800'}`}>- EXC</button>
                                        <button onClick={(e) => toggleDomain(domain, 'O', e)} className={`px-2 py-1 rounded text-xs border ${!isDomInc && !isDomExc ? 'bg-blue-600/20 text-blue-400 border-blue-500' : 'text-gray-400 border-gray-600 hover:border-gray-400'}`}>∅</button>
                                    </div>
                                </div>
                                {expandedGroups[domain] && (
                                    <div className="relative z-10">
                                        {groupedEntities[domain].map(e => {
                                            const isInc = config.inc_e.includes(e.entity_id);
                                            const isExc = config.exc_e.includes(e.entity_id);
                                            const sInfo = entityStatuses[e.entity_id];
                                            
                                            return (
                                                <div key={e.entity_id} className={`ha-row px-6 py-2 flex items-center text-sm ${sInfo.rec ? '' : 'opacity-60'}`}>
                                                    <div className="w-10 shrink-0 flex justify-center text-gray-600"><span className="material-icons text-sm">{sInfo.rec ? 'database' : 'block'}</span></div>
                                                    <div className="flex-grow min-w-[200px] pr-4 overflow-hidden flex items-center gap-2">
                                                        <div className="overflow-hidden">
                                                            <div className={`text-gray-200 truncate ${sInfo.rec ? 'font-medium' : 'line-through'}`}>{e.name}</div>
                                                            <div className="text-[11px] text-gray-500 font-mono truncate">{e.entity_id}</div>
                                                        </div>
                                                        {e.is_new && <span className="bg-amber-600/20 text-amber-500 border border-amber-600 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 mt-0.5">{t('badge_new') || 'NEW'}</span>}
                                                    </div>
                                                    
                                                    <div className="w-32 shrink-0 text-left text-xs text-gray-300 font-mono truncate pl-2" title={e.state}>{e.state || '---'}</div>
                                                    
                                                    {appMode === 'recorder' && (
                                                        <div className="w-48 shrink-0 text-left text-xs text-gray-400 font-mono truncate pl-2">{e.uom || '---'}</div>
                                                    )}
                                                    
                                                    <div className={`w-56 shrink-0 text-[11px] font-mono font-bold ${sInfo.color} truncate pr-4 pl-2`} title={sInfo.text}>{sInfo.text}</div>
                                                    <div className="w-40 shrink-0 flex justify-center gap-1">
                                                        <button onClick={() => toggleEntity(e.entity_id, 'I')} className={`px-4 py-1 rounded text-xs font-bold border ${isInc ? 'bg-green-600/20 text-green-400 border-green-600' : 'text-gray-500 border-gray-700 hover:border-green-800'}`}>I</button>
                                                        <button onClick={() => toggleEntity(e.entity_id, 'E')} className={`px-4 py-1 rounded text-xs font-bold border ${isExc ? 'bg-red-600/20 text-red-400 border-red-600' : 'text-gray-500 border-gray-700 hover:border-red-800'}`}>E</button>
                                                        <button onClick={() => toggleEntity(e.entity_id, 'O')} className={`px-3 py-1 rounded text-xs border ${!isInc && !isExc ? 'bg-gray-700 text-gray-300 border-gray-500' : 'text-gray-600 border-gray-800 hover:border-gray-500'}`}>∅</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {Object.keys(groupedEntities).length === 0 && <div className="text-center p-10 text-gray-500">{t('no_entities') || 'No entities'}</div>}
                </div>
            </div>
        </div>
    );
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);