import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  Save, School, MessageSquare, Shield, Info,
  Upload, X, Image, Clock, Plus, Calendar, Trash2, Database, AlertCircle, Layers, Globe
} from 'lucide-react';
import { GestionPersonnel } from '../components/GestionPersonnel';
import { BACKEND_URL } from '../config';

export const Parametres: React.FC = () => {
  const schoolName = useStore((s) => s.schoolName);
  const schoolAddress = useStore((s) => s.schoolAddress);
  const schoolPhone = useStore((s) => s.schoolPhone);
  const schoolSlogan = useStore((s) => s.schoolSlogan);
  const schoolMinistry = useStore((s) => s.schoolMinistry);
  const schoolYear = useStore((s) => s.schoolYear);
  const messageRemerciement = useStore((s) => s.messageRemerciement);
  const messageRappel = useStore((s) => s.messageRappel);
  const schoolLogo = useStore((s) => s.schoolLogo);
  const schoolStamp = useStore((s) => s.schoolStamp);
  const user = useStore((s) => s.user);

  const bulletinTemplate = useStore((s) => s.settings?.bulletinTemplate ?? 'officiel');
  const bulletinShowPhoto = useStore((s) => s.settings?.bulletinShowPhoto ?? true);
  const bulletinShowRank = useStore((s) => s.settings?.bulletinShowRank ?? true);
  const bulletinShowClassAverage = useStore((s) => s.settings?.bulletinShowClassAverage ?? true);
  const bulletinShowAppreciation = useStore((s) => s.settings?.bulletinShowAppreciation ?? true);

  const [localSchool, setLocalSchool] = useState(schoolName || '');
  const [localAddress, setLocalAddress] = useState(schoolAddress || '');
  const [localPhone, setLocalPhone] = useState(schoolPhone || '');
  // Slogan/Ministry: lire depuis Zustand ou fallback sur localStorage direct
  const [localSlogan, setLocalSlogan] = useState(
    schoolSlogan || localStorage.getItem('school_identity_slogan') || ''
  );
  const [localMinistry, setLocalMinistry] = useState(
    schoolMinistry || localStorage.getItem('school_identity_ministry') || ''
  );
  const [localYear, setLocalYear] = useState(schoolYear || '');
  const [localRem, setLocalRem] = useState(messageRemerciement || '');
  const [localRap, setLocalRap] = useState(messageRappel || '');
  
  const [localBulletinTemplate, setLocalBulletinTemplate] = useState<'officiel'|'classique'>(bulletinTemplate);
  const [localBulletinShowPhoto, setLocalBulletinShowPhoto] = useState(bulletinShowPhoto);
  const [localBulletinShowRank, setLocalBulletinShowRank] = useState(bulletinShowRank);
  const [localBulletinShowClassAverage, setLocalBulletinShowClassAverage] = useState(bulletinShowClassAverage);
  const [localBulletinShowAppreciation, setLocalBulletinShowAppreciation] = useState(bulletinShowAppreciation);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalSchool(schoolName || '');
    setLocalAddress(schoolAddress || '');
    setLocalPhone(schoolPhone || '');
    // Pour slogan et ministry: si Zustand a une valeur, l'utiliser, sinon garder celle du localStorage direct
    if (schoolSlogan) setLocalSlogan(schoolSlogan);
    if (schoolMinistry) setLocalMinistry(schoolMinistry);
    setLocalYear(schoolYear || '');
    setLocalRem(messageRemerciement || '');
    setLocalRap(messageRappel || '');
    setLocalBulletinTemplate(bulletinTemplate);
    setLocalBulletinShowPhoto(bulletinShowPhoto);
    setLocalBulletinShowRank(bulletinShowRank);
    setLocalBulletinShowClassAverage(bulletinShowClassAverage);
    setLocalBulletinShowAppreciation(bulletinShowAppreciation);
  }, [schoolName, schoolAddress, schoolPhone, schoolSlogan, schoolMinistry, schoolYear, messageRemerciement, messageRappel, bulletinTemplate, bulletinShowPhoto, bulletinShowRank, bulletinShowClassAverage, bulletinShowAppreciation]);
  
  const [logoPreview, setLogoPreview] = useState<string | null>(schoolLogo);
  const [logoError, setLogoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [stampPreview, setStampPreview] = useState<string | null>(schoolStamp);
  const [stampError, setStampError] = useState('');
  const stampFileRef = useRef<HTMLInputElement>(null);

  // Cycles et classes — déclarés EN PREMIER car utilisés pour calculer les cycles actifs
  const classes = useStore((s) => s.classes) || [];
  const setClasses = useStore((s) => s.setClasses);

  const cycleSchedules = useStore((s) => s.cycleSchedules) || [];
  const setCycleSchedules = useStore((s) => s.setCycleSchedules);

  // Cycles réellement présents dans les classes de l'établissement
  const activeCycles = Array.from(new Set(classes.map(c => c.cycle)));

  // Construire localSchedules en ne gardant que les cycles actifs
  // Conserver l'heure déjà enregistrée si elle existe, sinon valeur par défaut
  const DEFAULT_TIMES: Record<string, string> = {
    'Maternelle': '07:30',
    'Primaire': '07:30',
    'Collège': '07:45',
    'Lycée': '08:00',
  };

  const buildSchedulesFromCycles = (activeCyc: string[]) =>
    activeCyc.map(cycle => ({
      cycle,
      heureLimite: cycleSchedules.find(s => s.cycle === cycle)?.heureLimite || DEFAULT_TIMES[cycle] || '08:00',
    }));

  const [localSchedules, setLocalSchedules] = useState(
    () => buildSchedulesFromCycles(activeCycles)
  );
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // Re-synchroniser quand les classes ou les horaires changés dans le store
  useEffect(() => {
    setLocalSchedules(buildSchedulesFromCycles(activeCycles));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, cycleSchedules]);

  const tranches = useStore((s) => s.tranches) || [];
  const setTranches = useStore((s) => s.setTranches);
  const [localTranches, setLocalTranches] = useState(tranches);
  const [tranchesSaved, setTranchesSaved] = useState(false);

  useEffect(() => {
    setLocalTranches(tranches);
  }, [tranches]);

  // Note: classes & setClasses already declared above
  const [localClasses, setLocalClasses] = useState(classes);
  const [classesSaved, setClassesSaved] = useState(false);

  useEffect(() => {
    setLocalClasses(classes);
  }, [classes]);

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
  const currency = useStore((s) => s.currency);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 💾 Sauvegarde directe dans localStorage comme filet de sécurité absolu
    try {
      localStorage.setItem('school_identity_slogan', localSlogan || '');
      localStorage.setItem('school_identity_ministry', localMinistry || '');
      localStorage.setItem('school_identity_address', localAddress || '');
      localStorage.setItem('school_identity_phone', localPhone || '');
    } catch (_) {}
    
    await updateAllSettings({
      schoolName: localSchool,
      schoolAddress: localAddress,
      schoolPhone: localPhone,
      schoolSlogan: localSlogan,
      schoolMinistry: localMinistry,
      schoolYear: localYear,
      messageRemerciement: localRem,
      messageRappel: localRap,
      schoolLogo: logoPreview,
      schoolStamp: stampPreview,
      bulletinTemplate: localBulletinTemplate,
      bulletinShowPhoto: localBulletinShowPhoto,
      bulletinShowRank: localBulletinShowRank,
      bulletinShowClassAverage: localBulletinShowClassAverage,
      bulletinShowAppreciation: localBulletinShowAppreciation
    });

    try {
      const { getAuthHeaders: authHeaders } = await import('../services/apiHelpers');
      const headers = authHeaders();
      if (headers.Authorization) {
        const response = await fetch(`${BACKEND_URL}/api/auth/profile`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            school_address: localAddress,
            school_phone: localPhone,
            school_slogan: localSlogan,
            school_ministry: localMinistry
          })
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.error('Erreur MAJ profil ecole:', errData);
        } else {
          console.log('✅ Identité établissement sauvegardée en base (table schools)');
        }
      } else {
        console.warn('⚠️ Aucun token trouvé - impossible de mettre à jour le profil école');
      }
    } catch (err) {
      console.error('Erreur MAJ profil ecole', err);
    }

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
                    {/* Plateforme — nom fixe, non modifiable */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                            Plateforme
                        </label>
                        <div className="w-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                            <span className="text-sm font-black text-indigo-700 dark:text-indigo-300 tracking-widest">YZIOW</span>
                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-100 dark:bg-indigo-500/20 px-2 py-1 rounded-lg">Nom fixe</span>
                        </div>
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
                            Ministère de tutelle
                        </label>
                        <input
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={localMinistry}
                            onChange={(e) => setLocalMinistry(e.target.value)}
                            placeholder="Ex : Ministère de l'Éducation Nationale"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                            Slogan de l'établissement
                        </label>
                        <input
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={localSlogan}
                            onChange={(e) => setLocalSlogan(e.target.value)}
                            placeholder="Ex : L'excellence pour tous"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                            Adresse de l'établissement
                        </label>
                        <input
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={localAddress}
                            onChange={(e) => setLocalAddress(e.target.value)}
                            placeholder="Ex : Quartier, Ville"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                            Téléphone de l'établissement
                        </label>
                        <input
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={localPhone}
                            onChange={(e) => setLocalPhone(e.target.value)}
                            placeholder="Ex : +228 90 00 00 00"
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
                            type="button"
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
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">%</span>
                                    </div>
                                    <button
                                        type="button"
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
                            type="button"
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

            {/* ── CONFIGURATION DES BULLETINS ────────────────────────────── */}
            {(user?.role === 'directeur' || user?.role === 'admin' || user?.role === 'directeur_general') && (
                <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800 mt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                                <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            Configuration des Bulletins
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                Ministère de tutelle
                            </label>
                            <textarea
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-y min-h-[100px]"
                                value={localMinistry}
                                onChange={(e) => setLocalMinistry(e.target.value)}
                                placeholder="Ex : Ministère de l'Éducation Nationale&#10;Direction Régionale&#10;Adresse..."
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                Modèle de Bulletin
                            </label>
                            <select
                                value={localBulletinTemplate}
                                onChange={(e) => setLocalBulletinTemplate(e.target.value as 'officiel'|'classique')}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            >
                                <option value="officiel">Modèle Officiel (Complet)</option>
                                <option value="classique">Modèle Classique (Simplifié)</option>
                            </select>
                            <p className="mt-2 text-xs text-slate-500">Le modèle classique masque l'historique complet des trimestres.</p>
                        </div>
                        
                        <div className="space-y-4 pt-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={localBulletinShowPhoto}
                                    onChange={(e) => setLocalBulletinShowPhoto(e.target.checked)}
                                    className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700" 
                                />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Afficher la photo de l'élève</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={localBulletinShowRank}
                                    onChange={(e) => setLocalBulletinShowRank(e.target.checked)}
                                    className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700" 
                                />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Afficher le rang de l'élève (matière et général)</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={localBulletinShowClassAverage}
                                    onChange={(e) => setLocalBulletinShowClassAverage(e.target.checked)}
                                    className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700" 
                                />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Afficher la moyenne de la classe par matière</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={localBulletinShowAppreciation}
                                    onChange={(e) => setLocalBulletinShowAppreciation(e.target.checked)}
                                    className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700" 
                                />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Afficher l'appréciation globale (cases rondes)</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end mt-6">
                        <button
                            onClick={handleSave}
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
                </div>
            )}


            {/* ── CLASSES ET FRAIS DE SCOLARITÉ ────────────────────────────── */}
            {(user?.role === 'directeur' || user?.role === 'comptable' || user?.role === 'admin' || user?.role === 'directeur_general') && (
                <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800 mt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                                <School className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            Classes & Frais de Scolarité
                        </h3>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                const updated = [...localClasses, { name: `Nouvelle Classe ${localClasses.length + 1}`, cycle: 'Primaire' as any, ecolage: 50000 }];
                                setLocalClasses(updated);
                            }}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-500 text-indigo-600 hover:text-white dark:bg-indigo-500/10 dark:hover:bg-indigo-500 dark:text-indigo-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                            <Plus className="w-3.5 h-3.5" /> Ajouter
                        </button>
                    </div>

                    <div className="space-y-3 mb-6">
                        {localClasses.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-sm font-bold text-slate-500">Aucune classe paramétrée</p>
                        </div>
                        ) : (
                        localClasses.map((c, idx) => (
                            <div key={idx} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <input
                                    type="text"
                                    value={c.name}
                                    onChange={(e) => {
                                        const updated = [...localClasses];
                                        updated[idx].name = e.target.value;
                                        setLocalClasses(updated);
                                    }}
                                    placeholder="Nom de la classe (ex: CP1)"
                                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full"
                                />
                                <input
                                    type="text"
                                    list="cycle-suggestions"
                                    value={c.cycle}
                                    onChange={(e) => {
                                        const updated = [...localClasses];
                                        updated[idx].cycle = e.target.value as any;
                                        setLocalClasses(updated);
                                    }}
                                    placeholder="Cycle (ex: Primaire, Université)"
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto"
                                />
                                <datalist id="cycle-suggestions">
                                    <option value="Maternelle" />
                                    <option value="Primaire" />
                                    <option value="Collège" />
                                    <option value="Lycée" />
                                    <option value="Licence" />
                                    <option value="Master" />
                                    <option value="Université" />
                                    <option value="Formation Professionnelle" />
                                </datalist>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <div className="relative flex-1">
                                        <input
                                            type="number"
                                            min="0"
                                            value={c.ecolage}
                                            onChange={(e) => {
                                                const updated = [...localClasses];
                                                updated[idx].ecolage = Number(e.target.value);
                                                setLocalClasses(updated);
                                            }}
                                            className="w-full sm:w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-4 pr-12 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-right"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">{currency}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const updated = localClasses.filter((_, i) => i !== idx);
                                            setLocalClasses(updated);
                                        }}
                                        className="p-2.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors ml-auto sm:ml-1 shrink-0"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                        )}
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => {
                                setClasses(localClasses);
                                updateAllSettings({ classes: localClasses });
                                setClassesSaved(true);
                                setTimeout(() => setClassesSaved(false), 3000);
                            }}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${
                            classesSaved
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                            }`}
                        >
                            <Save className="w-4 h-4" />
                            {classesSaved ? 'Enregistré' : 'Enregistrer'}
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
                        {activeCycles.length === 0 ? (
                          <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-sm font-bold text-slate-500">Configurez d'abord vos classes pour voir les cycles disponibles.</p>
                          </div>
                        ) : (
                          localSchedules.map((schedule, idx) => (
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
                          ))
                        )}
                    </div>
                    <button
                        onClick={() => {
                            setCycleSchedules(localSchedules);
                            // Persiste les horaires vers le backend via le sync
                            updateAllSettings({ cycleSchedules: localSchedules });
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

            {/* ── À PROPOS ────────────────────────────── */}
            <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-slate-600">
                <Info className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">YZIOW v1.0 — Nomade Corp</span>
            </div>

        </div>
      </div>
    </div>
  );
};
