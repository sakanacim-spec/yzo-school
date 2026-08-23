import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  Save, School, MessageSquare, Shield, Info,
  Upload, X, Image, Clock, Plus, Calendar, Trash2, Database, AlertCircle, Layers, Globe, GraduationCap, ToggleLeft, ToggleRight, CheckCircle, ChevronUp, ChevronDown, Eye, EyeOff
} from 'lucide-react';
import { GestionPersonnel } from '../components/GestionPersonnel';
import { BACKEND_URL } from '../config';
import { EvalConfig, DEFAULT_EVAL_CONFIGS } from '../types';
import { t } from '../i18n';
import type { Language } from '../i18n';

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
  const language = useStore((s) => s.language);

  const bulletinTemplate = useStore((s) => s.settings?.bulletinTemplate ?? 'officiel');
  const bulletinShowPhoto = useStore((s) => s.settings?.bulletinShowPhoto ?? true);
  const bulletinShowRank = useStore((s) => s.settings?.bulletinShowRank ?? true);
  const bulletinShowClassAverage = useStore((s) => s.settings?.bulletinShowClassAverage ?? true);
  const bulletinShowAppreciation = useStore((s) => s.settings?.bulletinShowAppreciation ?? true);

  const paymentGateway = useStore((s) => s.settings?.paymentGateway);
  const paymentPublicKey = useStore((s) => s.settings?.paymentPublicKey);
  const paymentSecretKey = useStore((s) => s.settings?.paymentSecretKey);
  const payoutMomoNumber = useStore((s) => s.settings?.payoutMomoNumber);
  const payoutMethod = useStore((s) => s.settings?.payoutMethod);

  const [localSchool, setLocalSchool] = useState(schoolName || '');
  const [localAddress, setLocalAddress] = useState(schoolAddress || '');
  const [localPhone, setLocalPhone] = useState(schoolPhone || '');
  const [localSlogan, setLocalSlogan] = useState(schoolSlogan || '');
  const [localMinistry, setLocalMinistry] = useState(schoolMinistry || '');
  const [localYear, setLocalYear] = useState(schoolYear || '');
  const [localRem, setLocalRem] = useState(messageRemerciement || '');
  const [localRap, setLocalRap] = useState(messageRappel || '');
  
  const [localBulletinTemplate, setLocalBulletinTemplate] = useState<'officiel'|'classique'>(bulletinTemplate);
  const [localBulletinShowPhoto, setLocalBulletinShowPhoto] = useState(bulletinShowPhoto);
  const [localBulletinShowRank, setLocalBulletinShowRank] = useState(bulletinShowRank);
  const [localBulletinShowClassAverage, setLocalBulletinShowClassAverage] = useState(bulletinShowClassAverage);
  const [localBulletinShowAppreciation, setLocalBulletinShowAppreciation] = useState(bulletinShowAppreciation);

  const [localPaymentGateway, setLocalPaymentGateway] = useState<'fedapay'|'paystack'|'stripe'|'none'>('fedapay'); // Toujours fedapay pour Yziow Pay
  const [localPaymentPublicKey, setLocalPaymentPublicKey] = useState(paymentPublicKey || '');
  const [localPaymentSecretKey, setLocalPaymentSecretKey] = useState(paymentSecretKey || '');
  const [localPayoutMomoNumber, setLocalPayoutMomoNumber] = useState(payoutMomoNumber || '');
  const [localPayoutMethod, setLocalPayoutMethod] = useState<'momo' | 'rib'>(payoutMethod || 'momo');

  const [saved, setSaved] = useState(false);

  // ── Config évaluations ────────────────────────────────
  const storedEvalConfigs = useStore((s) => s.settings?.evalConfigs);
  const [localEvalConfigs, setLocalEvalConfigs] = useState<EvalConfig[]>(
    storedEvalConfigs && storedEvalConfigs.length > 0 ? storedEvalConfigs : DEFAULT_EVAL_CONFIGS
  );

  useEffect(() => {
    if (storedEvalConfigs && storedEvalConfigs.length > 0) {
      setLocalEvalConfigs(storedEvalConfigs);
    }
  }, [storedEvalConfigs]);

  const updateEvalConfig = (id: EvalConfig['id'], field: keyof EvalConfig, value: any) => {
    setLocalEvalConfigs(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

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
    setLocalPaymentGateway('fedapay');
    setLocalPaymentPublicKey(paymentPublicKey || '');
    setLocalPaymentSecretKey(paymentSecretKey || '');
    setLocalPayoutMomoNumber(payoutMomoNumber || '');
    setLocalPayoutMethod(payoutMethod || 'momo');
  }, [schoolName, schoolAddress, schoolPhone, schoolSlogan, schoolMinistry, schoolYear, messageRemerciement, messageRappel, bulletinTemplate, bulletinShowPhoto, bulletinShowRank, bulletinShowClassAverage, bulletinShowAppreciation, paymentGateway, paymentPublicKey, paymentSecretKey, payoutMomoNumber, payoutMethod]);
  
  const [logoPreview, setLogoPreview] = useState<string | null>(schoolLogo);
  const [logoError, setLogoError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [stampPreview, setStampPreview] = useState<string | null>(schoolStamp);
  const [stampError, setStampError] = useState('');
  const stampFileRef = useRef<HTMLInputElement>(null);

  // Cycles et classes — déclarés EN PREMIER car utilisés pour calculer les cycles actifs
  const storeClassesRaw = useStore((s) => s.classes);
  const classesRef = useRef<any[]>([]).current;
  const classes = storeClassesRaw || classesRef;
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
      setLogoError(t(language as Language, 'settings.fileMustBeImage') || 'Le fichier doit être une image (PNG, JPG, SVG).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError(t(language as Language, 'settings.imageSizeLimit') || 'L\'image ne doit pas dépasser 2 Mo.');
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
      setStampError(t(language as Language, 'settings.fileMustBeImage') || 'Le fichier doit être une image (PNG, JPG, SVG).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setStampError(t(language as Language, 'settings.imageSizeLimit') || 'L\'image ne doit pas dépasser 2 Mo.');
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
      bulletinShowAppreciation: localBulletinShowAppreciation,
      paymentGateway: 'fedapay',
      paymentPublicKey: localPaymentPublicKey,
      paymentSecretKey: localPaymentSecretKey,
      payoutMomoNumber: localPayoutMomoNumber,
      payoutMethod: localPayoutMethod,
      evalConfigs: localEvalConfigs
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
                <Shield className="w-3.5 h-3.5" /> {t(language as Language, 'settings.system') || 'Système'}
            </div>
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2">
              {t(language as Language, 'settings.systemSettings') || 'Paramètres du'} <span className="text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-indigo-600">{t(language as Language, 'settings.system') || 'Système'}</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
              {t(language as Language, 'settings.systemDesc') || 'Gérez les informations de l\'établissement, les configurations système et les équipes.'}
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
                {t(language as Language, 'settings.schoolIdentity') || 'Identité de l\'Établissement'}
                </h3>
                
                <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Plateforme — nom fixe, non modifiable */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                            {t(language as Language, 'settings.platform') || 'Plateforme'}
                        </label>
                        <div className="w-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                            <span className="text-sm font-black text-indigo-700 dark:text-indigo-300 tracking-widest">YZIOW</span>
                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-100 dark:bg-indigo-500/20 px-2 py-1 rounded-lg">{t(language as Language, 'settings.fixedName') || 'Nom fixe'}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                            {t(language as Language, 'settings.schoolName') || 'Nom de l\'établissement'}
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
                            {t(language as Language, 'settings.ministry') || 'Ministère de tutelle'}
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
                            {t(language as Language, 'settings.schoolSlogan') || 'Slogan de l\'établissement'}
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
                            {t(language as Language, 'settings.schoolAddress') || 'Adresse de l\'établissement'}
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
                            {t(language as Language, 'settings.schoolPhone') || 'Téléphone de l\'établissement'}
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
                            {t(language as Language, 'settings.schoolYear') || 'Année scolaire'}
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
                            {t(language as Language, 'settings.schoolLogo') || 'Logo de l\'établissement'}
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
                                <Upload className="w-3.5 h-3.5" /> {t(language as Language, 'settings.modifyLogo') || 'Modifier Logo'}
                                </label>
                                {logoError && <p className="mt-2 text-[10px] font-bold text-rose-500">{logoError}</p>}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">
                            {t(language as Language, 'settings.stampSeal') || 'Sceau / Cachet'}
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
                                <Upload className="w-3.5 h-3.5" /> {t(language as Language, 'settings.modifyStamp') || 'Modifier Sceau'}
                                </label>
                                {stampError && <p className="mt-2 text-[10px] font-bold text-rose-500">{stampError}</p>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800/60">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-500" /> {t(language as Language, 'settings.customizableMessages') || 'Messages Personnalisables'}
                    </h4>
                    <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">{t(language as Language, 'settings.thankYouMessage') || 'Message de remerciement (Soldé)'}</label>
                        <textarea
                            rows={2}
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                            value={localRem}
                            onChange={(e) => setLocalRem(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">{t(language as Language, 'settings.reminderMessage') || 'Message de rappel (Non soldé)'}</label>
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
                        {saved ? (t(language as Language, 'common.saved') || 'Enregistré') : (t(language as Language, 'common.save') || 'Enregistrer')}
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
                            {t(language as Language, 'settings.paymentInstallments') || 'Tranches de Paiement'}
                        </h3>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                const currentTranches = Array.isArray(localTranches) ? localTranches : [];
                                const updated = [...currentTranches, { 
                                    name: `${t(language as Language, 'settings.newTranche') || 'Nouvelle Tranche'} ${currentTranches.length + 1}`, 
                                    percentage: 0, 
                                    dueDate: new Date().toISOString().split('T')[0] 
                                }];
                                setLocalTranches(updated);
                            }}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-500 text-indigo-600 hover:text-white dark:bg-indigo-500/10 dark:hover:bg-indigo-500 dark:text-indigo-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                            <Plus className="w-3.5 h-3.5" /> {t(language as Language, 'common.add') || 'Ajouter'}
                        </button>
                    </div>

                    <div className="space-y-3 mb-6">
                        {localTranches.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-sm font-bold text-slate-500">{t(language as Language, 'settings.noInstallmentConfigured') || 'Aucune tranche paramétrée'}</p>
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
                                    placeholder={t(language as Language, 'settings.installmentNamePlaceholder') || 'Nom (ex: Tranche 1)'}
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
                                {t(language as Language, 'settings.total') || 'Total :'}
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
                            {tranchesSaved ? (t(language as Language, 'common.saved') || 'Enregistré') : (t(language as Language, 'common.save') || 'Enregistrer')}
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
                            {t(language as Language, 'settings.reportCardConfig') || 'Configuration des Bulletins'}
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                {t(language as Language, 'settings.ministry') || 'Ministère de tutelle'}
                            </label>
                            <textarea
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-y min-h-[100px]"
                                value={localMinistry}
                                onChange={(e) => setLocalMinistry(e.target.value)}
                                placeholder={t(language as Language, 'settings.ministryPlaceholder') || 'Ex : Ministère de l\'Éducation Nationale\nDirection Régionale\nAdresse...'}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                                {t(language as Language, 'settings.reportCardTemplate') || 'Modèle de Bulletin'}
                            </label>
                            <select
                                value={localBulletinTemplate}
                                onChange={(e) => setLocalBulletinTemplate(e.target.value as 'officiel'|'classique')}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            >
                                <option value="officiel">{t(language as Language, 'settings.officialTemplate') || 'Modèle Officiel (Complet)'}</option>
                                <option value="classique">{t(language as Language, 'settings.classicTemplate') || 'Modèle Classique (Simplifié)'}</option>
                            </select>
                            <p className="mt-2 text-xs text-slate-500">{t(language as Language, 'settings.classicTemplateDesc') || 'Le modèle classique masque l\'historique complet des trimestres.'}</p>
                        </div>
                        
                        <div className="space-y-4 pt-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={localBulletinShowPhoto}
                                    onChange={(e) => setLocalBulletinShowPhoto(e.target.checked)}
                                    className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700" 
                                />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t(language as Language, 'settings.showStudentPhoto') || 'Afficher la photo de l\'élève'}</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={localBulletinShowRank}
                                    onChange={(e) => setLocalBulletinShowRank(e.target.checked)}
                                    className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700" 
                                />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t(language as Language, 'settings.showStudentRank') || 'Afficher le rang de l\'élève (matière et général)'}</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={localBulletinShowClassAverage}
                                    onChange={(e) => setLocalBulletinShowClassAverage(e.target.checked)}
                                    className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700" 
                                />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t(language as Language, 'settings.showClassAverage') || 'Afficher la moyenne de la classe par matière'}</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={localBulletinShowAppreciation}
                                    onChange={(e) => setLocalBulletinShowAppreciation(e.target.checked)}
                                    className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700" 
                                />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t(language as Language, 'settings.showGlobalAppreciation') || 'Afficher l\'appréciation globale (cases rondes)'}</span>
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
                            {saved ? (t(language as Language, 'common.saved') || 'Enregistré') : (t(language as Language, 'common.save') || 'Enregistrer')}
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
                            {t(language as Language, 'settings.classesAndTuition') || 'Classes & Frais de Scolarité'}
                        </h3>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                const currentClasses = Array.isArray(localClasses) ? localClasses : [];
                                const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cls-${Date.now()}`;
                                const updated = [...currentClasses, {
                                    id: newId,
                                    name: `${t(language as Language, 'settings.newClass') || 'Nouvelle Classe'} ${currentClasses.length + 1}`,
                                    cycle: 'Primaire' as any,
                                    ecolage: 50000,
                                    order: currentClasses.length + 1,
                                    active: true
                                }];
                                setLocalClasses(updated);
                            }}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-500 text-indigo-600 hover:text-white dark:bg-indigo-500/10 dark:hover:bg-indigo-500 dark:text-indigo-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                            <Plus className="w-3.5 h-3.5" /> {t(language as Language, 'common.add') || 'Ajouter'}
                        </button>
                    </div>

                    <div className="space-y-3 mb-6">
                        {(!Array.isArray(localClasses) || localClasses.length === 0) ? (
                        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-sm font-bold text-slate-500">{t(language as Language, 'settings.noClassConfigured') || 'Aucune classe paramétrée'}</p>
                            <p className="text-xs text-slate-400 mt-1">Créez vos classes personnalisées sans contrainte de nomenclature.</p>
                        </div>
                        ) : (
                        localClasses.map((c, idx) => {
                            const isActive = c.active !== false;
                            return (
                            <div key={c.id || idx} className={`flex flex-col lg:flex-row items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                                isActive
                                    ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                                    : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800 opacity-60'
                            }`}>
                                <div className="flex items-center gap-1.5 shrink-0 self-start lg:self-center">
                                    <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={() => {
                                            if (idx === 0) return;
                                            const updated = [...localClasses];
                                            const temp = updated[idx - 1];
                                            updated[idx - 1] = updated[idx];
                                            updated[idx] = temp;
                                            setLocalClasses(updated);
                                        }}
                                        className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20 transition-colors"
                                        title="Monter"
                                    >
                                        <ChevronUp className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={idx === localClasses.length - 1}
                                        onClick={() => {
                                            if (idx === localClasses.length - 1) return;
                                            const updated = [...localClasses];
                                            const temp = updated[idx + 1];
                                            updated[idx + 1] = updated[idx];
                                            updated[idx] = temp;
                                            setLocalClasses(updated);
                                        }}
                                        className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-20 transition-colors"
                                        title="Descendre"
                                    >
                                        <ChevronDown className="w-4 h-4" />
                                    </button>
                                    <span className="text-[10px] font-black text-slate-400 w-5 text-center">{idx + 1}</span>
                                </div>

                                <input
                                    type="text"
                                    value={c.name}
                                    onChange={(e) => {
                                        const updated = [...localClasses];
                                        updated[idx] = { ...updated[idx], name: e.target.value };
                                        setLocalClasses(updated);
                                    }}
                                    placeholder={t(language as Language, 'settings.classNamePlaceholder') || 'Nom de la classe (ex: CP1, Grade 10, 6e)'}
                                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full"
                                />

                                <input
                                    type="text"
                                    list="cycle-suggestions"
                                    value={c.cycle}
                                    onChange={(e) => {
                                        const updated = [...localClasses];
                                        updated[idx] = { ...updated[idx], cycle: e.target.value as any };
                                        setLocalClasses(updated);
                                    }}
                                    placeholder={t(language as Language, 'settings.cyclePlaceholder') || 'Cycle (ex: Primaire, High School)'}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full lg:w-48"
                                />
                                <datalist id="cycle-suggestions">
                                    <option value="Maternelle" />
                                    <option value="Primaire" />
                                    <option value="Collège" />
                                    <option value="Lycée" />
                                    <option value="Technique" />
                                    <option value="Professionnel" />
                                    <option value="Supérieur" />
                                    <option value="Université" />
                                    <option value="Autre" />
                                </datalist>

                                <div className="flex items-center gap-2 w-full lg:w-auto">
                                    <div className="relative flex-1 lg:w-32">
                                        <input
                                            type="number"
                                            min="0"
                                            value={c.ecolage}
                                            onChange={(e) => {
                                                const updated = [...localClasses];
                                                updated[idx] = { ...updated[idx], ecolage: Number(e.target.value) };
                                                setLocalClasses(updated);
                                            }}
                                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-3 pr-10 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-right"
                                        />
                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">{currency}</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            const updated = [...localClasses];
                                            updated[idx] = { ...updated[idx], active: !isActive };
                                            setLocalClasses(updated);
                                        }}
                                        className={`p-2.5 rounded-xl transition-colors shrink-0 flex items-center gap-1 text-xs font-bold ${
                                            isActive
                                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100'
                                                : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-300'
                                        }`}
                                        title={isActive ? "Classe active (visible aux inscriptions)" : "Classe archivée/désactivée"}
                                    >
                                        {isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            const updated = localClasses.filter((_, i) => i !== idx);
                                            setLocalClasses(updated);
                                        }}
                                        className="p-2.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors shrink-0"
                                        title="Supprimer la classe"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            );
                        })
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
                            {classesSaved ? (t(language as Language, 'common.saved') || 'Enregistré') : (t(language as Language, 'common.save') || 'Enregistrer')}
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
            
            {/* 💳 YZIOW PAY (Réservé Directeur Général / Admin) */}
            {(user?.role === 'directeur_general' || user?.role === 'directeur' || user?.role === 'admin') && (
              <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-6">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                    <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  {t(language as Language, 'settings.yziowPayConfig') || 'Configuration Yziow Pay (Reversements)'}
                </h3>
                
                <form onSubmit={handleSave} className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-900 p-4 rounded-xl flex gap-3">
                      <AlertCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-500 shrink-0 mt-0.5" />
                      <div className="text-xs text-indigo-800 dark:text-indigo-400 leading-relaxed font-medium">
                        <strong className="block mb-1 text-sm">{t(language as Language, 'settings.receivePayments') || 'Recevez vos paiements avec Yziow Pay'}</strong>
                        {t(language as Language, 'settings.yziowPayDescription') || 'Vos parents peuvent payer en ligne en toute sécurité via notre infrastructure centralisée Yziow Pay. Renseignez ici le Numéro Mobile Money ou le RIB sur lequel vous souhaitez recevoir les versements de vos fonds collectés. (Sécurisé par Global Marketing and Technology).'}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                        {t(language as Language, 'settings.receptionMethod') || 'Méthode de réception'}
                      </label>
                      <div className="flex gap-4 mb-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="payoutMethod" value="momo" checked={localPayoutMethod === 'momo'} onChange={() => setLocalPayoutMethod('momo')} className="text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t(language as Language, 'settings.mobileMoney') || 'Mobile Money'}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="payoutMethod" value="rib" checked={localPayoutMethod === 'rib'} onChange={() => setLocalPayoutMethod('rib')} className="text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t(language as Language, 'settings.bankTransfer') || 'Virement Bancaire (RIB)'}</span>
                        </label>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">
                        {localPayoutMethod === 'momo' ? (t(language as Language, 'settings.momoNumber') || 'Numéro Mobile Money Yziow Pay') : (t(language as Language, 'settings.ribIban') || 'RIB / IBAN Yziow Pay')}
                      </label>
                      <input
                        type="text"
                        value={localPayoutMomoNumber}
                        onChange={(e) => setLocalPayoutMomoNumber(e.target.value)}
                        placeholder={localPayoutMethod === 'momo' ? "Ex: +33 6 00 00 00 00" : "Ex: BJ061 01001 001234567890 12"}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono"
                      />
                      {localPayoutMethod === 'momo' && (
                        <p className="text-[10px] text-slate-500 mt-2 font-medium">
                          Exemple neutre/international : <span className="text-emerald-600 dark:text-emerald-400 font-black tracking-widest bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded">+33 6 00 00 00 00</span>
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-end border-t border-slate-200 dark:border-slate-700 pt-6">
                    <button
                      type="submit"
                      className={`px-6 py-2.5 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] flex items-center gap-2 transform hover:-translate-y-0.5 ${saved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                      {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      {saved ? (t(language as Language, 'common.savedExclamation') || 'Enregistré !') : (t(language as Language, 'common.save') || 'Sauvegarder')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── HORAIRES SCOLAIRES ────────────────────── */}
            {(user?.role === 'directeur' || user?.role === 'comptable' || user?.role === 'admin' || user?.role === 'directeur_general') && (
                <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                    <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        {t(language as Language, 'settings.schedulesAndDelays') || 'Horaires & Retards'}
                    </h3>
                    <div className="space-y-3 mb-6">
                        {activeCycles.length === 0 ? (
                          <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <p className="text-sm font-bold text-slate-500">{t(language as Language, 'settings.configureClassesFirst') || 'Configurez d\'abord vos classes pour voir les cycles disponibles.'}</p>
                          </div>
                        ) : (
                          (Array.isArray(localSchedules) ? localSchedules : []).map((schedule, idx) => (
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
                        {scheduleSaved ? (t(language as Language, 'common.saved') || 'Enregistré') : (t(language as Language, 'common.save') || 'Enregistrer')}
                    </button>
                </div>
            )}

            {/* ── CONFIG DES ÉVALUATIONS ────────────────────────────── */}
            {(user?.role === 'directeur' || user?.role === 'directeur_general' || user?.role === 'admin') && (
              <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-2">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl">
                    <GraduationCap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  {t(language as Language, 'settings.evalConfig') || 'Configuration des Évaluations'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                  {t(language as Language, 'settings.evalConfigDesc') || 'Définissez les noms et le nombre de sous-notes pour chaque type d\'évaluation. Ces libellés s\'afficheront dans la saisie des notes et sur les PDF.'}
                </p>

                <div className="space-y-4">
                  {localEvalConfigs.map((cfg, idx) => (
                    <div key={cfg.id} className={`p-4 rounded-2xl border transition-all ${
                      cfg.enabled
                        ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        : 'bg-slate-50 dark:bg-slate-900/50 border-dashed border-slate-200 dark:border-slate-700 opacity-60'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {t(language as Language, 'settings.evaluation') || 'Évaluation'} {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateEvalConfig(cfg.id, 'enabled', !cfg.enabled)}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                            cfg.enabled
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {cfg.enabled
                            ? <><ToggleRight className="w-3.5 h-3.5" /> {t(language as Language, 'settings.enabled') || 'Activée'}</>
                            : <><ToggleLeft className="w-3.5 h-3.5" /> {t(language as Language, 'settings.disabled') || 'Désactivée'}</>}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-widest">
                            {t(language as Language, 'settings.evalName') || 'Nom de l\'évaluation'}
                          </label>
                          <input
                            type="text"
                            value={cfg.label}
                            onChange={(e) => updateEvalConfig(cfg.id, 'label', e.target.value)}
                            disabled={!cfg.enabled}
                            placeholder={t(language as Language, 'settings.evalNamePlaceholder') || 'Ex: CC1, Test, Composition...'}
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-widest">
                            {t(language as Language, 'settings.nbSubNotes') || 'Nombre de sous-notes (1 à 5)'}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={1} max={5} step={1}
                              value={cfg.nbNotes}
                              disabled={!cfg.enabled}
                              onChange={(e) => updateEvalConfig(cfg.id, 'nbNotes', parseInt(e.target.value))}
                              className="flex-1 accent-emerald-500 disabled:opacity-50"
                            />
                            <span className="w-8 h-8 flex items-center justify-center bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-xl font-black text-sm shrink-0">
                              {cfg.nbNotes}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {cfg.nbNotes === 1
                              ? (t(language as Language, 'settings.singleNote') || 'Une seule note saisie directement')
                              : `${cfg.nbNotes} ${t(language as Language, 'settings.notesAverage') || 'notes saisies → leur moyenne = note finale'}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-100 dark:border-amber-500/20">
                  <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                    {t(language as Language, 'settings.evalConfigWarning') || '⚠️ Modifier ces réglages affecte l\'affichage de la saisie et des PDF. Les notes déjà enregistrées ne sont pas perdues.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSave as any}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all active:scale-95"
                >
                  <Save className="w-4 h-4" /> {t(language as Language, 'settings.saveConfig') || 'Enregistrer la configuration'}
                </button>
              </div>
            )}

            {/* ── COMPTE UTILISATEUR ────────────────────────────── */}
            <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                        <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    {t(language as Language, 'settings.myAccount') || 'Mon Compte'}
                </h3>
                <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t(language as Language, 'settings.user') || 'Utilisateur'}</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{user?.nom}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t(language as Language, 'settings.identifier') || 'Identifiant'}</span>
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">{user?.username}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t(language as Language, 'settings.role') || 'Rôle'}</span>
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
                        {t(language as Language, 'settings.maintenance') || 'Maintenance'}
                    </h3>
                    <div className="space-y-3">
                        <button
                            onClick={async () => {
                                if (window.confirm(t(language as Language, 'settings.confirmClearPresences') || "Voulez-vous vraiment VIDER tout l'historique des scans de présence ? Cette action est irréversible.")) {
                                    const success = await useStore.getState().clearCloudPresences();
                                    if (success) alert(t(language as Language, 'settings.presencesCleared') || "Historique des présences vidé.");
                                }
                            }}
                            className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-500/20 rounded-2xl hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors group"
                        >
                            <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest group-hover:text-rose-700 dark:group-hover:text-rose-300">{t(language as Language, 'settings.purgePresences') || 'Purger Présences'}</span>
                            <Trash2 className="w-4 h-4 text-rose-400" />
                        </button>
                        <button
                            onClick={async () => {
                                if (window.confirm(t(language as Language, 'settings.confirmClearLogs') || "Voulez-vous vraiment VIDER tous les logs d'activité ?")) {
                                    const success = await useStore.getState().clearCloudActivityLogs();
                                    if (success) alert(t(language as Language, 'settings.logsCleared') || "Logs d'activité vidés.");
                                }
                            }}
                            className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-500/20 rounded-2xl hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors group"
                        >
                            <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest group-hover:text-rose-700 dark:group-hover:text-rose-300">{t(language as Language, 'settings.purgeLogs') || 'Purger Logs'}</span>
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
      
      {/* ── CONGRATULATORY SUCCESS POPUP ── */}
      {saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] transition-opacity duration-300"></div>
            <div className="relative bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-500/30 rounded-3xl p-8 shadow-2xl shadow-emerald-500/20 max-w-sm w-full transform transition-all duration-500 scale-100 animate-in fade-in zoom-in-50 slide-in-from-bottom-10 pointer-events-auto">
                <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                    <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40 animate-bounce">
                        <CheckCircle className="w-10 h-10 text-white" />
                    </div>
                </div>
                <div className="mt-8 text-center">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Félicitations ! 🎉</h3>
                    <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
                        Vos modifications ont été enregistrées avec succès.
                    </p>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};
