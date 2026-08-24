import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import {
  Save, School, MessageSquare, Shield, Info,
  Upload, X, Image, Clock, Plus, Calendar, Trash2, Database, AlertCircle, Layers, Globe, GraduationCap, ToggleLeft, ToggleRight, CheckCircle, ChevronUp, ChevronDown, Eye, EyeOff, Edit3, BookOpen, Search, Bell
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

  // ── État Notifications Push (Action explicite uniquement) ──
  const [pushStatus, setPushStatus] = useState<string>('default');
  const [isActivatingPush, setIsActivatingPush] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setPushStatus('unsupported');
      } else {
        setPushStatus(Notification.permission);
      }
    }
  }, []);

  const handleEnablePushNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported');
      return;
    }
    setIsActivatingPush(true);
    try {
      const perm = await Notification.requestPermission();
      setPushStatus(perm);
      if (perm === 'granted') {
        const { webPushService } = await import('../services/webPushService');
        await webPushService.init();
      }
    } catch (err) {
      console.error('Erreur activation notifications:', err);
    } finally {
      setIsActivatingPush(false);
    }
  };

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

  // ── GESTION DYNAMIQUE DES CYCLES ET CLASSES ─────────────
  const addClassStore = useStore((s) => s.addClass);
  const updateClassStore = useStore((s) => s.updateClass);
  const deleteClassStore = useStore((s) => s.deleteClass);
  const students = useStore((s) => s.students) || [];

  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<any | null>(null);
  const [classNameInput, setClassNameInput] = useState('');
  const [classCycleInput, setClassCycleInput] = useState('');
  const [classCustomCycle, setClassCustomCycle] = useState('');
  const [classBillingCategoryInput, setClassBillingCategoryInput] = useState<string>('maternelle_primaire');
  const [classEcolageInput, setClassEcolageInput] = useState(50000);
  const [classActiveInput, setClassActiveInput] = useState(true);
  const [classFormError, setClassFormError] = useState<string | null>(null);
  const [classActionSuccess, setClassActionSuccess] = useState<string | null>(null);
  const [classActionError, setClassActionError] = useState<string | null>(null);
  const [classFilterCycle, setClassFilterCycle] = useState<string>('all');
  const [classSearch, setClassSearch] = useState<string>('');

  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [identityFeedback, setIdentityFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const openAddClassModal = (defaultCycle?: string) => {
    setEditingClass(null);
    setClassNameInput('');
    setClassCycleInput(defaultCycle || (activeCycles[0] || 'Primaire'));
    setClassCustomCycle('');
    setClassBillingCategoryInput('maternelle_primaire');
    setClassEcolageInput(50000);
    setClassActiveInput(true);
    setClassFormError(null);
    setClassModalOpen(true);
  };

  const openEditClassModal = (cls: any) => {
    setEditingClass(cls);
    setClassNameInput(cls.name);
    setClassCycleInput(cls.cycle);
    setClassCustomCycle('');
    const inferredCategory = cls.billingCategory || (
      cls.cycle?.toLowerCase().includes('maternelle') || cls.cycle?.toLowerCase().includes('primaire') || cls.cycle?.toLowerCase().includes('kindergarten') || cls.cycle?.toLowerCase().includes('primary')
        ? 'maternelle_primaire'
        : cls.cycle?.toLowerCase().includes('collège') || cls.cycle?.toLowerCase().includes('secondaire') || cls.cycle?.toLowerCase().includes('lycée') || cls.cycle?.toLowerCase().includes('middle') || cls.cycle?.toLowerCase().includes('high')
        ? 'college_secondaire'
        : cls.cycle?.toLowerCase().includes('supérieur') || cls.cycle?.toLowerCase().includes('université') || cls.cycle?.toLowerCase().includes('formation')
        ? 'superieur_formation'
        : ''
    );
    setClassBillingCategoryInput(inferredCategory);
    setClassEcolageInput(cls.ecolage || 0);
    setClassActiveInput(cls.active !== false);
    setClassFormError(null);
    setClassModalOpen(true);
  };

  const handleSaveClassForm = (e: React.FormEvent) => {
    e.preventDefault();
    setClassFormError(null);
    const finalName = classNameInput.trim();
    const finalCycle = (classCycleInput === '__custom__' ? classCustomCycle : classCycleInput).trim();

    if (!finalName) {
      setClassFormError('Le nom de la classe est obligatoire.');
      return;
    }
    if (!finalCycle) {
      setClassFormError('Le nom du cycle est obligatoire.');
      return;
    }
    if (!classBillingCategoryInput) {
      setClassFormError('La catégorie de facturation Yziow est obligatoire.');
      return;
    }

    if (editingClass) {
      const res = updateClassStore(editingClass.id || editingClass.name, {
        name: finalName,
        cycle: finalCycle,
        billingCategory: classBillingCategoryInput as any,
        ecolage: Number(classEcolageInput) || 0,
        active: classActiveInput
      });
      if (!res.success) {
        setClassFormError(res.error || 'Erreur lors de la mise à jour.');
        return;
      }
      setClassActionSuccess(`Classe « ${finalName} » mise à jour avec succès.`);
    } else {
      const res = addClassStore({
        name: finalName,
        cycle: finalCycle,
        billingCategory: classBillingCategoryInput as any,
        ecolage: Number(classEcolageInput) || 0,
        active: classActiveInput
      });
      if (!res.success) {
        setClassFormError(res.error || "Erreur lors de l'ajout.");
        return;
      }
      setClassActionSuccess(`Classe « ${finalName} » créée avec succès.`);
    }

    setTimeout(() => setClassActionSuccess(null), 3500);
    setClassModalOpen(false);
  };

  const handleToggleClassActive = (cls: any) => {
    const nextState = cls.active === false;
    updateClassStore(cls.id || cls.name, { active: nextState });
    setClassActionSuccess(`Classe « ${cls.name} » ${nextState ? 'activée' : 'désactivée'}.`);
    setTimeout(() => setClassActionSuccess(null), 3000);
  };

  const handleDeleteClass = (cls: any) => {
    setClassActionError(null);
    setClassActionSuccess(null);
    const res = deleteClassStore(cls.id || cls.name);
    if (!res.success) {
      setClassActionError(res.error || 'Impossible de supprimer cette classe.');
      setTimeout(() => setClassActionError(null), 6000);
      return;
    }
    setClassActionSuccess(`Classe « ${cls.name} » supprimée.`);
    setTimeout(() => setClassActionSuccess(null), 3000);
  };

  const isIdentityDirty = useMemo(() => {
    return (
      localSchool !== (schoolName || '') ||
      localMinistry !== (schoolMinistry || '') ||
      localSlogan !== (schoolSlogan || '') ||
      localAddress !== (schoolAddress || '') ||
      localPhone !== (schoolPhone || '') ||
      localYear !== (schoolYear || '') ||
      localRem !== (messageRemerciement || '') ||
      localRap !== (messageRappel || '') ||
      logoPreview !== (schoolLogo || null) ||
      stampPreview !== (schoolStamp || null)
    );
  }, [localSchool, localMinistry, localSlogan, localAddress, localPhone, localYear, localRem, localRap, logoPreview, stampPreview, schoolName, schoolMinistry, schoolSlogan, schoolAddress, schoolPhone, schoolYear, messageRemerciement, messageRappel, schoolLogo, schoolStamp]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isIdentityDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isIdentityDirty]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingIdentity) return;
    setIsSavingIdentity(true);
    setIdentityFeedback(null);
    
    const yearTrimmed = localYear.trim();
    const saveRes = await updateAllSettings({
      schoolName: localSchool.trim(),
      schoolAddress: localAddress.trim(),
      schoolPhone: localPhone.trim(),
      schoolSlogan: localSlogan.trim(),
      schoolMinistry: localMinistry.trim(),
      schoolYear: yearTrimmed,
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
            school_address: localAddress.trim(),
            school_phone: localPhone.trim(),
            school_slogan: localSlogan.trim(),
            school_ministry: localMinistry.trim()
          })
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.error('Erreur MAJ profil ecole:', errData);
        } else {
          console.log('✅ Identité établissement sauvegardée en base (table schools)');
        }
      }
    } catch (err) {
      console.error('Erreur MAJ profil ecole', err);
    }

    setIsSavingIdentity(false);
    if (saveRes && saveRes.success !== false) {
      setSaved(true);
      setIdentityFeedback({ type: 'success', text: "Paramètres enregistrés avec succès." });
      setTimeout(() => setSaved(false), 3000);
      setTimeout(() => setIdentityFeedback(null), 4000);
    } else {
      setIdentityFeedback({ type: 'error', text: saveRes?.error || "Erreur lors de l'enregistrement." });
    }
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

                {identityFeedback && (
                  <div className={`p-4 rounded-xl flex items-center gap-3 text-xs font-bold ${
                    identityFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}>
                    {identityFeedback.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
                    {identityFeedback.text}
                  </div>
                )}

                {(user?.role === 'directeur' || user?.role === 'comptable' || user?.role === 'admin' || user?.role === 'directeur_general') && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                        <div>
                          {isIdentityDirty && !saved && !isSavingIdentity && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                              Modifications non enregistrées
                            </span>
                          )}
                        </div>
                        <button
                          type="submit"
                          disabled={isSavingIdentity}
                          className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${
                              saved
                              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                              : isSavingIdentity
                              ? 'bg-indigo-400 text-white cursor-not-allowed opacity-75'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                          }`}
                        >
                          <Save className="w-4 h-4" />
                          {isSavingIdentity ? 'Enregistrement…' : saved ? (t(language as Language, 'common.saved') || 'Enregistré') : (t(language as Language, 'common.save') || 'Enregistrer')}
                        </button>
                    </div>
                )}
                </form>
            </div>

            {/* ── CYCLES ET CLASSES DE L'ÉTABLISSEMENT ───────────── */}
            {(user?.role === 'directeur' || user?.role === 'admin' || user?.role === 'directeur_general' || user?.role === 'superadmin') && (
              <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                        <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      Cycles et classes de l'établissement
                    </h3>
                    <p className="text-xs text-slate-500 font-bold mt-1">
                      Définissez librement les cycles (Maternelle, Primaire, Collège, Lycée, etc.) et les classes personnalisées de votre établissement.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openAddClassModal()}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-600/20"
                    >
                      <Plus className="w-4 h-4" /> Ajouter une classe
                    </button>
                  </div>
                </div>

                {/* Notifications d'action */}
                {classActionSuccess && (
                  <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
                    {classActionSuccess}
                  </div>
                )}
                {classActionError && (
                  <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                    {classActionError}
                  </div>
                )}

                {/* Filtres et recherche */}
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                  <div className="relative flex-1 w-full">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      placeholder="Rechercher une classe ou un cycle..."
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <select
                      value={classFilterCycle}
                      onChange={(e) => setClassFilterCycle(e.target.value)}
                      className="w-full sm:w-auto bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="all">Tous les cycles ({classes.length})</option>
                      {activeCycles.map(cyc => (
                        <option key={cyc} value={cyc}>{cyc} ({classes.filter(c => c.cycle === cyc).length})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Liste des classes par cycle */}
                {classes.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <GraduationCap className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Aucune classe configurée</p>
                    <p className="text-xs text-slate-500 mt-1 mb-4">Ajoutez les classes enseignées dans votre établissement.</p>
                    <button
                      type="button"
                      onClick={() => openAddClassModal()}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl"
                    >
                      <Plus className="w-4 h-4" /> Créer la première classe
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {activeCycles
                      .filter(cyc => classFilterCycle === 'all' || classFilterCycle === cyc)
                      .map(cycleName => {
                        const cycleClasses = classes.filter(c => {
                          if (c.cycle !== cycleName) return false;
                          if (!classSearch.trim()) return true;
                          const q = classSearch.toLowerCase();
                          return c.name.toLowerCase().includes(q) || c.cycle.toLowerCase().includes(q);
                        });

                        if (cycleClasses.length === 0 && classSearch.trim()) return null;

                        return (
                          <div key={cycleName} className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/50 dark:border-slate-700/50">
                              <div className="flex items-center gap-2.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                                <span className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider">{cycleName}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                                  {cycleClasses.length} classe{cycleClasses.length > 1 ? 's' : ''}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => openAddClassModal(cycleName)}
                                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Ajouter dans {cycleName}
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {cycleClasses.map(cls => {
                                const enrolledCount = students.filter(s => s.classe.toLowerCase() === cls.name.toLowerCase()).length;
                                const isActive = cls.active !== false;

                                return (
                                  <div
                                    key={cls.id || cls.name}
                                    className={`p-3.5 rounded-xl border transition-all ${
                                      isActive
                                        ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm'
                                        : 'bg-slate-100/60 dark:bg-slate-800/20 border-slate-200/50 dark:border-slate-800 opacity-60'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <div>
                                        <h4 className="font-black text-sm text-slate-900 dark:text-white tracking-tight">{cls.name}</h4>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{cls.cycle}</p>
                                      </div>
                                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                        isActive
                                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                      }`}>
                                        {isActive ? 'Active' : 'Inactive'}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between text-xs mb-1.5 text-slate-600 dark:text-slate-400">
                                      <span className="font-bold">Écolage :</span>
                                      <span className="font-black text-slate-900 dark:text-white">{cls.ecolage?.toLocaleString() || 0} {currency}</span>
                                    </div>

                                    <div className="flex items-center justify-between text-xs mb-3 text-slate-600 dark:text-slate-400">
                                       <span className="font-bold text-[10px] uppercase tracking-wider">Tarif Yziow :</span>
                                       <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                                         cls.billingCategory === 'maternelle_primaire'
                                           ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                           : cls.billingCategory === 'college_secondaire'
                                           ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                                           : cls.billingCategory === 'superieur_formation'
                                           ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                           : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                       }`}>
                                         {cls.billingCategory === 'maternelle_primaire' ? 'Primaire (100 F/m)' :
                                          cls.billingCategory === 'college_secondaire' ? 'Secondaire (150 F/m)' :
                                          cls.billingCategory === 'superieur_formation' ? 'Supérieur (200 F/m)' :
                                          '⚠️ Catégorie à définir'}
                                       </span>
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 dark:border-slate-800">
                                      <span className="text-slate-500 font-bold">
                                        {enrolledCount} élève{enrolledCount > 1 ? 's' : ''} inscrit{enrolledCount > 1 ? 's' : ''}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleToggleClassActive(cls)}
                                          title={isActive ? 'Désactiver (ne plus proposer aux inscriptions)' : 'Activer'}
                                          className={`p-1.5 rounded-lg transition-colors ${
                                            isActive
                                              ? 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                              : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                          }`}
                                        >
                                          {isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openEditClassModal(cls)}
                                          title="Modifier"
                                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteClass(cls)}
                                          title={enrolledCount > 0 ? 'Des élèves sont inscrits (désactivation conseillée)' : 'Supprimer'}
                                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* ── MODALE CRÉATION / ÉDITION DE CLASSE ─────────────── */}
            {classModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl animate-scaleUp">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl text-indigo-600 dark:text-indigo-400">
                        <GraduationCap className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-black text-lg text-slate-900 dark:text-white">
                          {editingClass ? 'Modifier la classe' : 'Nouvelle classe'}
                        </h3>
                        <p className="text-xs text-slate-500 font-bold">
                          {editingClass ? `Édition de « ${editingClass.name} »` : 'Ajout d\'une classe personnalisée'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setClassModalOpen(false)}
                      className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {classFormError && (
                    <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                      {classFormError}
                    </div>
                  )}

                  <form onSubmit={handleSaveClassForm} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-widest">
                        Nom de la classe <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={50}
                        value={classNameInput}
                        onChange={(e) => setClassNameInput(e.target.value)}
                        placeholder="Ex: CI, CM2, 6ème A, Grade 1, Year 7..."
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-widest">
                        Cycle de rattachement <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={classCycleInput}
                        onChange={(e) => setClassCycleInput(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none mb-2"
                      >
                        {activeCycles.map(cyc => (
                          <option key={cyc} value={cyc}>{cyc}</option>
                        ))}
                        <option value="__custom__">+ Autre cycle (personnalisé)...</option>
                      </select>

                      {classCycleInput === '__custom__' && (
                        <input
                          type="text"
                          required
                          maxLength={50}
                          value={classCustomCycle}
                          onChange={(e) => setClassCustomCycle(e.target.value)}
                          placeholder="Nom du nouveau cycle (ex: Secondaire, Kindergarten, Université...)"
                          className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-widest">
                        Catégorie de facturation Yziow <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={classBillingCategoryInput}
                        onChange={(e) => setClassBillingCategoryInput(e.target.value)}
                        required
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none mb-1.5"
                      >
                        <option value="maternelle_primaire">Maternelle / Primaire — 100 FCFA par élève / mois</option>
                        <option value="college_secondaire">Collège / Secondaire — 150 FCFA par élève / mois</option>
                        <option value="superieur_formation">Supérieur / Formation — 200 FCFA par étudiant / mois</option>
                      </select>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold leading-tight">
                        ⚠️ Cette modification affectera les prochains devis, jamais les paiements déjà initiés ou confirmés.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-widest">
                        Écolage annuel par défaut ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="500"
                        value={classEcolageInput}
                        onChange={(e) => setClassEcolageInput(Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    <div className="pt-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={classActiveInput}
                          onChange={(e) => setClassActiveInput(e.target.checked)}
                          className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700"
                        />
                        <div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Classe active pour les nouvelles inscriptions</span>
                          <span className="text-[10px] text-slate-500 block">Si décochée, la classe reste visible dans les historiques mais n'est plus proposée aux inscriptions.</span>
                        </div>
                      </label>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setClassModalOpen(false)}
                        className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md shadow-indigo-600/20"
                      >
                        {editingClass ? 'Enregistrer les modifications' : 'Créer la classe'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

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
                          <div key={schedule.cycle} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 gap-2">
                              <div>
                                <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest block">
                                    {schedule.cycle}
                                </span>
                                <span className="text-[11px] text-slate-500 font-bold">
                                  Heure limite d’arrivée
                                </span>
                              </div>
                              <input
                                  type="time"
                                  value={schedule.heureLimite}
                                  onChange={(e) => {
                                      const updated = [...localSchedules];
                                      updated[idx] = { ...schedule, heureLimite: e.target.value };
                                      setLocalSchedules(updated);
                                  }}
                                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm font-bold font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-36 text-center"
                              />
                          </div>
                          ))
                        )}
                    </div>
                    <button
                        onClick={async () => {
                            setCycleSchedules(localSchedules);
                            const res = await updateAllSettings({ cycleSchedules: localSchedules });
                            if (res && res.success !== false) {
                              setScheduleSaved(true);
                              setTimeout(() => setScheduleSaved(false), 3000);
                            }
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

            {/* ── NOTIFICATIONS PUSH ─────────────────────────── */}
            <div className="pro-card p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800">
              <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                  <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                Notifications push
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Recevez des alertes instantanées pour les annonces, messages et événements importants de votre établissement.
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest block">
                    État des notifications
                  </span>
                  <span className="text-[11px] text-slate-500 font-bold">
                    {pushStatus === 'granted' && '✅ Notifications activées'}
                    {pushStatus === 'denied' && '❌ Notifications refusées dans le navigateur'}
                    {pushStatus === 'unsupported' && '⚠️ Notifications non prises en charge sur cet appareil'}
                    {pushStatus === 'default' && 'Notifications non configurées'}
                  </span>
                </div>

                {pushStatus !== 'unsupported' && pushStatus !== 'granted' && (
                  <button
                    type="button"
                    onClick={handleEnablePushNotifications}
                    disabled={isActivatingPush}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-2"
                  >
                    <Bell className="w-4 h-4" />
                    {isActivatingPush ? 'Activation en cours…' : 'Activer les notifications'}
                  </button>
                )}
              </div>
            </div>

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
