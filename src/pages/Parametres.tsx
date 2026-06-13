import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import {
  Save, School, MessageSquare, Shield, Info,
  Upload, X, Image, Clock, Plus, Calendar, Trash2, Database, AlertCircle, Layers
} from 'lucide-react';
import { GestionPersonnel } from '../components/GestionPersonnel';

export const Parametres: React.FC = () => {
  const schoolName = useStore((s) => s.schoolName);
  const schoolYear = useStore((s) => s.schoolYear);
  const messageRemerciement = useStore((s) => s.messageRemerciement);
  const messageRappel = useStore((s) => s.messageRappel);
  const appName = useStore((s) => s.appName);
  const schoolLogo = useStore((s) => s.schoolLogo);
  const schoolStamp = useStore((s) => s.schoolStamp);
  const user = useStore((s) => s.user);

  const [localSchool, setLocalSchool] = useState(schoolName);
  const [localYear, setLocalYear] = useState(schoolYear);
  const [localRem, setLocalRem] = useState(messageRemerciement);
  const [localRap, setLocalRap] = useState(messageRappel);
  const [localAppName, setLocalAppName] = useState(appName);
  const [saved, setSaved] = useState(false);
  
  const [logoPreview, setLogoPreview] = useState<string | null>(schoolLogo);
  const [logoError, setLogoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [stampPreview, setStampPreview] = useState<string | null>(schoolStamp);
  const [stampError, setStampError] = useState('');
  const stampFileRef = useRef<HTMLInputElement>(null);

  const cycleSchedules = useStore((s) => s.cycleSchedules);
  const setCycleSchedules = useStore((s) => s.setCycleSchedules);
  const [localSchedules, setLocalSchedules] = useState(cycleSchedules);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const tranches = useStore((s) => s.tranches);
  const setTranches = useStore((s) => s.setTranches);
  const [localTranches, setLocalTranches] = useState(tranches || []);
  const [tranchesSaved, setTranchesSaved] = useState(false);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setLogoError('Le fichier doit être une image (PNG, JPG, SVG).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('L\'image ne doit pas dépasser 2 Mo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 200;
        let w = img.width;
        let h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        const resized = canvas.toDataURL('image/png', 0.9);
        setLogoPreview(resized);
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStampError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStampError('Le fichier doit être une image (PNG, JPG, SVG).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setStampError('L\'image ne doit pas dépasser 2 Mo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 200;
        let w = img.width;
        let h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        const resized = canvas.toDataURL('image/png', 0.9);
        setStampPreview(resized);
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
  };

  const removeStamp = () => {
    setStampPreview(null);
    if (stampFileRef.current) stampFileRef.current.value = '';
  };

  const updateAllSettings = useStore((s) => s.updateAllSettings);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateAllSettings({
      schoolName: localSchool,
      schoolYear: localYear,
      messageRemerciement: localRem,
      messageRappel: localRap,
      appName: localAppName,
      schoolLogo: logoPreview,
      schoolStamp: stampPreview
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 pb-20 max-w-[1200px] mx-auto animate-slideUp">
      
      {/* ── HEADER ── */}
      <div className="relative pro-card p-8 overflow-hidden group bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl border border-indigo-100 dark:border-indigo-900/30">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <Layers className="w-64 h-64 text-indigo-500" />
        </div>
        <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500 text-[10px] font-black text-white uppercase tracking-[0.2em] mb-4 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                <Shield className="w-3.5 h-3.5" /> Système
            </div>
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">
              Paramètres du <span className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-indigo-600">Système</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
              Gérez les informations de l'établissement, les configurations système et les équipes.
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* COLONNE GAUCHE (Principale) */}
        <div className="xl:col-span-2 space-y-6">
            {/* ── IDENTITÉ DE L'APPLICATION ─────────────────────── */}
            <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                    <School className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                Identité de l'Établissement
                </h3>
                
                <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                            Nom de l'application
                        </label>
                        <input
                            disabled={user?.role !== 'directeur' && user?.role !== 'comptable'}
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-60"
                            value={localAppName}
                            onChange={(e) => setLocalAppName(e.target.value)}
                            placeholder="Ex : EduFinance"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                            Nom de l'établissement
                        </label>
                        <input
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={localSchool}
                            onChange={(e) => setLocalSchool(e.target.value)}
                            placeholder="Ex : Groupe Scolaire Excellence"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                            Année scolaire
                        </label>
                        <input
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={localYear}
                            onChange={(e) => setLocalYear(e.target.value)}
                            placeholder="Ex : 2024-2025"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800/60">
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">
                            Logo de l'établissement
                        </label>
                        <div className="flex items-center gap-4">
                            <div className="shrink-0 w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative group">
                                {logoPreview ? (
                                <>
                                    <img src={logoPreview} alt="Logo aperçu" className="w-full h-full object-contain p-2" />
                                    <button type="button" onClick={removeLogo} className="absolute inset-0 bg-rose-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                    <X className="w-5 h-5" />
                                    </button>
                                </>
                                ) : (
                                <Image className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                                )}
                            </div>
                            <div className="flex-1">
                                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" id="logo-upload" onChange={handleLogoUpload} />
                                <label htmlFor="logo-upload" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-500/10 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-colors border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30">
                                <Upload className="w-3.5 h-3.5" /> Modifier Logo
                                </label>
                                {logoError && <p className="mt-2 text-[10px] font-bold text-rose-500">{logoError}</p>}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">
                            Sceau / Cachet
                        </label>
                        <div className="flex items-center gap-4">
                            <div className="shrink-0 w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative group">
                                {stampPreview ? (
                                <>
                                    <img src={stampPreview} alt="Sceau aperçu" className="w-full h-full object-contain p-2" />
                                    <button type="button" onClick={removeStamp} className="absolute inset-0 bg-rose-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                    <X className="w-5 h-5" />
                                    </button>
                                </>
                                ) : (
                                <Image className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                                )}
                            </div>
                            <div className="flex-1">
                                <input ref={stampFileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" id="stamp-upload" onChange={handleStampUpload} />
                                <label htmlFor="stamp-upload" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-500/10 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-colors border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30">
                                <Upload className="w-3.5 h-3.5" /> Modifier Sceau
                                </label>
                                {stampError && <p className="mt-2 text-[10px] font-bold text-rose-500">{stampError}</p>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800/60">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-500" /> Messages Personnalisables
                    </h4>
                    <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Message de remerciement (Soldé)</label>
                        <textarea
                            rows={2}
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                            value={localRem}
                            onChange={(e) => setLocalRem(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Message de rappel (Non soldé)</label>
                        <textarea
                            rows={2}
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                            value={localRap}
                            onChange={(e) => setLocalRap(e.target.value)}
                        />
                    </div>
                    </div>
                </div>

                {(user?.role === 'directeur' || user?.role === 'comptable') && (
                    <div className="flex justify-end pt-4">
                        <button
                        type="submit"
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${
                            saved
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                        }`}
                        >
                        <Save className="w-4 h-4" />
                        {saved ? 'Enregistré' : 'Enregistrer'}
                        </button>
                    </div>
                )}
                </form>
            </div>

            {/* ── TRANCHES DE PAIEMENT ────────────────────────────── */}
            {(user?.role === 'directeur' || user?.role === 'comptable' || user?.role === 'admin' || user?.role === 'directeur_general') && (
                <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                                <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            Tranches de Paiement
                        </h3>
                        <button
                            onClick={() => {
                                const updated = [...localTranches, { id: crypto.randomUUID?.() || Date.now().toString(), nom: `Tranche ${localTranches.length + 1}`, dateLimite: '', pourcentage: 0 }];
                                setLocalTranches(updated);
                            }}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-500 text-indigo-600 hover:text-white dark:bg-indigo-500/10 dark:hover:bg-indigo-500 dark:text-indigo-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                            <Plus className="w-3.5 h-3.5" /> Ajouter
                        </button>
                    </div>

                    <div className="space-y-3 mb-6">
                        {localTranches.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-sm font-bold text-slate-500">Aucune tranche paramétrée</p>
                        </div>
                        ) : (
                        localTranches.map((t, idx) => (
                            <div key={t.id} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <input
                                    type="text"
                                    value={t.nom}
                                    onChange={(e) => {
                                        const updated = [...localTranches];
                                        updated[idx].nom = e.target.value;
                                        setLocalTranches(updated);
                                    }}
                                    placeholder="Nom (ex: Tranche 1)"
                                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full"
                                />
                                <input
                                    type="date"
                                    value={t.dateLimite}
                                    onChange={(e) => {
                                        const updated = [...localTranches];
                                        updated[idx].dateLimite = e.target.value;
                                        setLocalTranches(updated);
                                    }}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto"
                                />
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={t.pourcentage}
                                            onChange={(e) => {
                                                const updated = [...localTranches];
                                                updated[idx].pourcentage = Number(e.target.value);
                                                setLocalTranches(updated);
                                            }}
                                            className="w-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-4 pr-8 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-right"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">%</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const updated = localTranches.filter((_, i) => i !== idx);
                                            setLocalTranches(updated);
                                        }}
                                        className="p-2.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors ml-auto sm:ml-1"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                        )}
                        {localTranches.length > 0 && (
                        <div className="flex justify-end pt-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Total : 
                                <span className={`ml-2 text-sm ${localTranches.reduce((sum, t) => sum + (t.pourcentage || 0), 0) === 100 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {localTranches.reduce((sum, t) => sum + (t.pourcentage || 0), 0)}%
                                </span>
                            </span>
                        </div>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={() => {
                                setTranches(localTranches);
                                updateAllSettings({ tranches: localTranches });
                                setTranchesSaved(true);
                                setTimeout(() => setTranchesSaved(false), 3000);
                            }}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${
                            tranchesSaved
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                            }`}
                        >
                            <Save className="w-4 h-4" />
                            {tranchesSaved ? 'Enregistré' : 'Enregistrer'}
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* COLONNE DROITE (Secondaire) */}
        <div className="space-y-6">
            
            {/* ── GESTION DU PERSONNEL ────────────────────────────── */}
            {(user?.role === 'directeur' || user?.role === 'directeur_general') && (
                <div className="pro-card p-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800 overflow-hidden">
                    <GestionPersonnel />
                </div>
            )}

            {/* ── HORAIRES SCOLAIRES ────────────────────── */}
            {(user?.role === 'directeur' || user?.role === 'comptable' || user?.role === 'admin' || user?.role === 'directeur_general') && (
                <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                    <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        Horaires & Retards
                    </h3>
                    <div className="space-y-3 mb-6">
                        {localSchedules.map((schedule, idx) => (
                        <div key={schedule.cycle} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                                {schedule.cycle}
                            </span>
                            <input
                                type="time"
                                value={schedule.heureLimite}
                                onChange={(e) => {
                                    const updated = [...localSchedules];
                                    updated[idx] = { ...schedule, heureLimite: e.target.value };
                                    setLocalSchedules(updated);
                                }}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm font-bold font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        ))}
                    </div>
                    <button
                        onClick={() => {
                            setCycleSchedules(localSchedules);
                            setScheduleSaved(true);
                            setTimeout(() => setScheduleSaved(false), 3000);
                        }}
                        className={`w-full flex justify-center items-center gap-2 px-6 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${
                            scheduleSaved
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                        }`}
                    >
                        <Save className="w-4 h-4" />
                        {scheduleSaved ? 'Enregistré' : 'Enregistrer'}
                    </button>
                </div>
            )}

            {/* ── COMPTE UTILISATEUR ────────────────────────────── */}
            <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                        <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    Mon Compte
                </h3>
                <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Utilisateur</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{user?.nom}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identifiant</span>
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{user?.username}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rôle</span>
                        <span className="px-3 py-1 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded-lg text-[10px] font-black uppercase tracking-widest">
                            {user?.role}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── DANGER ZONE ────────────────────────────── */}
            {(user?.role === 'admin' || user?.role === 'directeur' || user?.role === 'directeur_general') && (
                <div className="pro-card p-6 bg-rose-50/50 dark:bg-rose-500/5 backdrop-blur-xl border border-rose-200/50 dark:border-rose-500/20">
                    <h3 className="font-black text-lg text-rose-700 dark:text-rose-400 flex items-center gap-3 mb-4">
                        <div className="p-2 bg-rose-100 dark:bg-rose-500/20 rounded-xl">
                            <Database className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                        </div>
                        Maintenance
                    </h3>
                    <div className="space-y-3">
                        <button
                            onClick={async () => {
                                if (window.confirm("Voulez-vous vraiment VIDER tout l'historique des scans de présence ? Cette action est irréversible.")) {
                                    const success = await useStore.getState().clearCloudPresences();
                                    if (success) alert("Historique des présences vidé.");
                                }
                            }}
                            className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-500/20 rounded-2xl hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors group"
                        >
                            <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest group-hover:text-rose-700 dark:group-hover:text-rose-300">Purger Présences</span>
                            <Trash2 className="w-4 h-4 text-rose-400" />
                        </button>
                        <button
                            onClick={async () => {
                                if (window.confirm("Voulez-vous vraiment VIDER tous les logs d'activité ?")) {
                                    const success = await useStore.getState().clearCloudActivityLogs();
                                    if (success) alert("Logs d'activité vidés.");
                                }
                            }}
                            className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-500/20 rounded-2xl hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors group"
                        >
                            <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest group-hover:text-rose-700 dark:group-hover:text-rose-300">Purger Logs</span>
                            <Trash2 className="w-4 h-4 text-rose-400" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── À PROPOS ──────────────────────────────────────── */}
            <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-slate-600">
                <Info className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{appName} v1.0 — Nomade Corp</span>
            </div>

        </div>
      </div>
    </div>
  );
};
