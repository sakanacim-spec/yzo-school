import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { parentApi } from '../../services/parentApi';
import {
    CreditCard, Gift, Wallet, TrendingUp, Loader2, AlertCircle, UserPlus,
    Search, GraduationCap, X, Megaphone, AlertTriangle, Info, Bell,
    MessageSquare, Download, BookOpen, UserCheck, CheckCircle2,
    Clock, ChevronRight, Zap, Star, XCircle, ChevronDown, ChevronUp,
    Calendar
} from 'lucide-react';
import { generateStudentInvoice } from '../../utils/pdfUtils';
import { LinkStudentModal } from '../../components/LinkStudentModal';
import { SupportModal } from '../../components/SupportModal';
import { chatApi } from '../../services/chatApi';
import { isToday, isTomorrow, isPast, isValid } from 'date-fns';
import { t } from '../../i18n';
import type { Language } from '../../i18n';
import { DonationCampaign } from '../../types';
import { API_BASE_URL } from '../../config';
import { parseResponse } from '../../services/apiHelpers';
import { requestNotificationPermission } from '../../utils/capacitorNotifications';

// ── Types ────────────────────────────────────────────────────
interface Announcement {
    id: string;
    titre: string;
    message: string;
    cible: string;
    importance: 'info' | 'important' | 'urgent';
    createdBy: string;
    createdAt: string;
}

// ── Styles importance ────────────────────────────────────────
const IMP_STYLES = {
    info:      { dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700 border-blue-200',   label: 'Information', icon: <Info className="w-5 h-5" /> },
    important: { dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Important',   icon: <AlertCircle className="w-5 h-5" /> },
    urgent:    { dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200',       label: 'URGENT',      icon: <AlertTriangle className="w-5 h-5" /> },
};

// ── Avatar initiales ─────────────────────────────────────────
const Avatar: React.FC<{ name: string; size?: 'xs' | 'sm' | 'md' | 'lg' }> = ({ name, size = 'md' }) => {
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const sizes = { xs: 'w-7 h-7 text-[10px]', sm: 'w-9 h-9 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-16 h-16 text-xl' };
    const colors = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500', 'bg-rose-500', 'bg-cyan-500', 'bg-pink-500', 'bg-teal-500'];
    const color = colors[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % colors.length];
    return (
        <div className={`${sizes[size]} ${color} rounded-xl flex items-center justify-center font-black text-white shrink-0 shadow-md`}>
            {initials}
        </div>
    );
};

// ── Badge date devoir ────────────────────────────────────────
const DueDateBadge: React.FC<{ dateStr?: string }> = ({ dateStr }) => {
    const { language } = useStore();
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (!isValid(d)) return null;
    if (isPast(d) && !isToday(d)) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-lg text-[10px] font-black animate-pulse">{t(language as Language, 'parentDevoirs.late') || 'En retard'}</span>;
    if (isToday(d)) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-lg text-[10px] font-black animate-pulse">{t(language as Language, 'parentDevoirs.today') || "Aujourd'hui !"}</span>;
    if (isTomorrow(d)) return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black">{t(language as Language, 'parentDevoirs.tomorrow') || 'Demain'}</span>;
    return <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-semibold">{d.toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' })}</span>;
};

// ── Carte par enfant ─────────────────────────────────────────
interface ChildCardProps {
    child: any;
    devoirs: any[];
    presences: any[];
    currency: string;
    onPay: (childId: string, amount: number) => void;
    loadingPayment: string | null;
    paymentEnabled: boolean;
    onDownloadInvoice: (child: any) => void;
    onUnlink: (childId: string, name: string) => void;
    settings: any;
}

const ChildCard: React.FC<ChildCardProps> = ({
    child, devoirs, presences, currency, onPay, loadingPayment, paymentEnabled, onDownloadInvoice, onUnlink, settings
}) => {
    const { language } = useStore();
    const [expanded, setExpanded] = useState(true);

    const childDevoirs = useMemo(() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return devoirs
            .filter(d => d.classe === child.classe)
            .sort((a, b) => {
                const da = a.dateRendu ? new Date(a.dateRendu) : new Date(9e15);
                const db = b.dateRendu ? new Date(b.dateRendu) : new Date(9e15);
                return da.getTime() - db.getTime();
            });
    }, [devoirs, child.classe]);

    const childPresences = useMemo(() => {
        return presences
            .filter(p => p.eleveId === child.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [presences, child.id]);

    const devoirsUrgents = childDevoirs.filter(d => {
        if (!d.dateRendu) return false;
        const dObj = new Date(d.dateRendu);
        return isValid(dObj) && (isToday(dObj) || isTomorrow(dObj) || (isPast(dObj) && !isToday(dObj)));
    }).length;

    const dernierePresence = childPresences[0] || null;
    const presenceStats = {
        total: childPresences.length,
        present: childPresences.filter(p => p.statut === 'present').length,
        absent: childPresences.filter(p => p.statut === 'absent').length,
        retard: childPresences.filter(p => p.statut === 'retard').length,
    };
    const tauxPresence = presenceStats.total > 0 ? Math.round((presenceStats.present / presenceStats.total) * 100) : 100;

    const restant = Number(child.restant !== undefined ? child.restant : (Number(child.ecolage || 0) - Number(child.dejaPaye || 0)));
    const dejaPaye = Number(child.dejaPaye || 0);
    const pctPaye = child.ecolage > 0 ? Math.min(Math.round((dejaPaye / child.ecolage) * 100), 100) : 0;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden transition-all hover:shadow-lg">
            {/* ── En-tête enfant ── */}
            <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Avatar name={`${child.prenom} ${child.nom}`} size="md" />
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-black text-slate-900 dark:text-white text-lg">{child.prenom} {child.nom}</h3>
                            <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black ${child.status === 'Soldé' ? 'bg-emerald-100 text-emerald-700' : child.status === 'Partiel' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                {child.status}
                            </span>
                            {devoirsUrgents > 0 && (
                                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-rose-100 text-rose-700 animate-pulse">
                                    ⚡ {devoirsUrgents} devoir{devoirsUrgents > 1 ? 's' : ''} urgent{devoirsUrgents > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium">{child.classe} · {child.cycle}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onDownloadInvoice}
                        className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all"
                        title={t(language as Language, 'parentDashboard.downloadInvoice') || 'Télécharger la facture'}
                    >
                        <Download className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onUnlink(child.id, `${child.prenom} ${child.nom}`)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title={t(language as Language, 'parentDashboard.unlinkChild') || 'Retirer cet enfant'}
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all"
                    >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="px-5 pb-5 space-y-4 border-t border-slate-50 dark:border-slate-800 pt-4">
                    {/* ── 3 colonnes : Finance | Devoirs | Présence ── */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                        {/* 💰 Finance */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 space-y-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Wallet className="w-4 h-4 text-blue-600" />
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{t(language as Language, 'parentDashboard.tuition') || 'Scolarité'}</span>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">{t(language as Language, 'parentDashboard.annualTotal') || 'Total annuel'}</p>
                                <p className="font-black text-slate-800 dark:text-white">{Number(child.ecolage || 0).toLocaleString()} {currency}</p>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <p className="text-[10px] text-emerald-600 font-bold uppercase">{t(language as Language, 'parentDashboard.paid') || 'Payé'}</p>
                                    <p className="text-[10px] font-black text-emerald-600">{pctPaye}%</p>
                                </div>
                                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pctPaye}%` }} />
                                </div>
                                <p className="text-sm font-bold text-emerald-600 mt-1">{dejaPaye.toLocaleString()} {currency}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-rose-500 font-bold uppercase">{t(language as Language, 'parentDashboard.remaining') || 'Reste à payer'}</p>
                                <p className={`font-black text-lg ${restant > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {restant > 0 ? restant.toLocaleString() : '0'} {currency}
                                </p>
                            </div>
                            {restant > 0 && paymentEnabled && (
                                <button
                                    onClick={() => onPay(child.id, restant)}
                                    disabled={loadingPayment === child.id}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-sm disabled:opacity-50"
                                >
                                    <Zap className="w-3.5 h-3.5" />
                                    {loadingPayment === child.id ? (t(language as Language, 'common.loading') || 'Chargement...') : (t(language as Language, 'parentDashboard.payOnline') || 'Payer par Yziow Pay')}
                                </button>
                            )}
                            {restant > 0 && !paymentEnabled && (
                                <p className="text-[10px] text-slate-400 text-center italic">{t(language as Language, 'parentDashboard.payAtDesk') || 'Paiement à effectuer en caisse'}</p>
                            )}
                        </div>

                        {/* 📚 Devoirs */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <BookOpen className="w-4 h-4 text-indigo-600" />
                                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{t(language as Language, 'common.homeworks') || 'Devoirs'}</span>
                                </div>
                                <button
                                    onClick={() => useStore.getState().setCurrentPage('parent_devoirs_presence')}
                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                >
                                    {t(language as Language, 'common.seeAll') || 'Voir tout'} <ChevronRight className="w-3 h-3" />
                                </button>
                            </div>
                            {childDevoirs.length === 0 ? (
                                <div className="text-center py-4">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-1" />
                                    <p className="text-[11px] text-slate-400">{t(language as Language, 'parentDevoirs.noHomeworkTitle') || 'Aucun devoir en attente'}</p>
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {childDevoirs.slice(0, 3).map(d => (
                                        <div key={d.id} className="flex items-start gap-2">
                                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                                                d.dateRendu && (isToday(new Date(d.dateRendu)) || isTomorrow(new Date(d.dateRendu)) || isPast(new Date(d.dateRendu)))
                                                    ? 'bg-rose-500' : 'bg-indigo-400'
                                            }`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{d.matiere}</p>
                                                <p className="text-[10px] text-slate-400 line-clamp-1">{d.description}</p>
                                                <DueDateBadge dateStr={d.dateRendu} />
                                            </div>
                                        </div>
                                    ))}
                                    {childDevoirs.length > 3 && (
                                        <button
                                            onClick={() => useStore.getState().setCurrentPage('parent_devoirs_presence')}
                                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                                        >
                                            + {childDevoirs.length - 3} {(t(language as Language, 'common.others') || 'autre(s)...')}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ✅ Présence */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <UserCheck className="w-4 h-4 text-emerald-600" />
                                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{t(language as Language, 'common.attendance') || 'Présence'}</span>
                                </div>
                                <button
                                    onClick={() => useStore.getState().setCurrentPage('parent_devoirs_presence')}
                                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
                                >
                                    {t(language as Language, 'common.seeAll') || 'Voir tout'} <ChevronRight className="w-3 h-3" />
                                </button>
                            </div>

                            {/* Taux de présence */}
                            <div className="mb-3">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">{t(language as Language, 'parentDevoirs.attendanceRate') || 'Taux'}</span>
                                    <span className={`text-sm font-black ${tauxPresence >= 80 ? 'text-emerald-600' : tauxPresence >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                                        {tauxPresence}%
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${tauxPresence >= 80 ? 'bg-emerald-500' : tauxPresence >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${tauxPresence}%` }} />
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-1.5 mb-3">
                                {[
                                    { label: t(language as Language, 'parentDevoirs.present') || 'Présent', val: presenceStats.present, color: 'text-emerald-600 bg-emerald-50' },
                                    { label: t(language as Language, 'parentDevoirs.absent') || 'Absent', val: presenceStats.absent, color: 'text-rose-600 bg-rose-50' },
                                    { label: t(language as Language, 'parentDevoirs.lateStat') || 'Retard', val: presenceStats.retard, color: 'text-amber-600 bg-amber-50' },
                                ].map(s => (
                                    <div key={s.label} className={`rounded-xl p-2 text-center ${s.color}`}>
                                        <p className="text-base font-black">{s.val}</p>
                                        <p className="text-[9px] font-bold uppercase">{s.label}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Dernière présence */}
                            {dernierePresence ? (
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
                                    dernierePresence.statut === 'present' ? 'bg-emerald-100 text-emerald-700' :
                                    dernierePresence.statut === 'absent' ? 'bg-rose-100 text-rose-700' :
                                    'bg-amber-100 text-amber-700'
                                }`}>
                                    {dernierePresence.statut === 'present' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                                     dernierePresence.statut === 'absent' ? <XCircle className="w-3.5 h-3.5" /> :
                                     <Clock className="w-3.5 h-3.5" />}
                                    {t(language as Language, 'parentDashboard.lastScan') || 'Dernière'} : {dernierePresence.statut} — {new Date(dernierePresence.date).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' })}
                                </div>
                            ) : (
                                <p className="text-[11px] text-slate-400 text-center">{t(language as Language, 'parentDashboard.noScan') || 'Aucun scan enregistré'}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ══════════════════════════════════════════════════════════════
// Composant principal
// ══════════════════════════════════════════════════════════════
export const ParentDashboard: React.FC = () => {
    const { language } = useStore();
    const user = useStore((s) => s.user);
    const children = useStore((s) => s.students).slice().sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
    const settings = useStore((s) => s.settings);
    const devoirs = useStore(s => s.devoirs) || [];
    const presences = useStore(s => s.presences) || [];

    const [loading, setLoading] = useState(false);
    const [loadingPayment, setLoadingPayment] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [activeCampaigns, setActiveCampaigns] = useState<DonationCampaign[]>([]);
    const [showAnnouncementList, setShowAnnouncementList] = useState(false);

    const announcementReads = useStore(s => s.announcementReads);
    const markAnnouncementRead = useStore(s => s.markAnnouncementRead);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const currency = useStore.getState().currency;
    const paymentEnabled = !!(settings?.paymentGateway && settings.paymentGateway !== 'none');

    const fetchData = useCallback(async () => {
        if (children.length > 0) return;
        setLoading(true); setErrorMsg('');
        try {
            const data = await parentApi.getDashboard();
            useStore.setState({ students: data.students || [] });
        } catch (err: any) {
            setErrorMsg(err.message || "Erreur de chargement");
        } finally { setLoading(false); }
    }, [children.length]);

    useEffect(() => {
        fetchData();
        const fetchAnn = async () => {
            try {
                const data = await parentApi.getAnnouncements();
                setAnnouncements(data.announcements || []);
            } catch {}

            try {
                const schoolSlug = useStore.getState().user?.schoolSlug;
                if (schoolSlug) {
                    const campaignsData = await fetch(`${API_BASE_URL}/donations/public/campaigns/${schoolSlug}`).then(parseResponse);
                    setActiveCampaigns(campaignsData || []);
                }
            } catch (err) {
                console.error("Failed to fetch campaigns", err);
            }
        };
        fetchAnn();
        pollingRef.current = setInterval(fetchAnn, 10_000);
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [fetchData]);

    const isEnablingNotifsRef = useRef(false);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    const [notifStatus, setNotifStatus] = useState<string>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );
    const handleEnableNotifications = async () => {
        if (isEnablingNotifsRef.current) return;
        isEnablingNotifsRef.current = true;
        try {
            await requestNotificationPermission();
            if (isMountedRef.current && typeof Notification !== 'undefined') {
                setNotifStatus(Notification.permission);
            }
        } finally {
            isEnablingNotifsRef.current = false;
        }
    };

    const handlePayerEnLigne = async (studentId: string, amount: number) => {
        try {
            setLoadingPayment(studentId);
            const response = await parentApi.initPayment({ studentId, amount, parentName: user?.nom || 'Parent', parentPhone: user?.username || '' });
            if (response?.url) window.location.href = response.url;
            else alert("Impossible d'initialiser le paiement.");
        } catch (error: any) {
            alert("Erreur : " + (error.error || error.message || "Erreur inconnue"));
        } finally { setLoadingPayment(null); }
    };

    const handleUnlink = async (studentId: string, name: string) => {
        if (!window.confirm(`Retirer ${name} de votre compte ?`)) return;
        try {
            await parentApi.unlinkStudent(studentId);
            fetchData();
        } catch (err: any) {
            alert(err.error || "Erreur lors du retrait.");
        }
    };

    const handleDownloadInvoice = async (child: any) => {
        try {
            const res = await parentApi.getPayments(child.id);
            await generateStudentInvoice(child, res.payments || [], settings, language);
        } catch {
            await generateStudentInvoice(child, [], settings, language);
        }
    };

    const unseenCount = announcements.filter(a => {
        const read = announcementReads.find(r => r.announcementId === a.id && r.parentId === user?.id);
        return !read || !read.readAt;
    }).length;

    // ── Totaux globaux ───────────────────────────────────────
    const totalEcolage = children.reduce((acc, s) => acc + Number(s.ecolage || 0), 0);
    const totalDejaPaye = children.reduce((acc, s) => acc + Number(s.dejaPaye || 0), 0);
    const totalRestant = children.reduce((acc, s) => acc + Number(s.restant !== undefined ? s.restant : (Number(s.ecolage || 0) - Number(s.dejaPaye || 0))), 0);
    const totalPctPaye = totalEcolage > 0 ? Math.round((totalDejaPaye / totalEcolage) * 100) : 0;

    // ── Devoirs urgents tous enfants ─────────────────────────
    const allUrgentHomework = useMemo(() => {
        return children.flatMap(child => {
            return devoirs
                .filter(d => d.classe === child.classe && d.dateRendu)
                .filter(d => {
                    const dObj = new Date(d.dateRendu!);
                    return isValid(dObj) && (isToday(dObj) || isTomorrow(dObj) || (isPast(dObj) && !isToday(dObj)));
                })
                .map(d => ({ ...d, childName: `${child.prenom} ${child.nom}` }));
        });
    }, [children, devoirs]);

    // ── Absences non justifiées tous enfants ─────────────────
    const allUnjustifiedAbsences = useMemo(() => {
        return children.flatMap(child => {
            return presences
                .filter(p => p.eleveId === child.id && p.statut === 'absent' && !p.justifie)
                .map(p => ({ ...p, childName: `${child.prenom} ${child.nom}` }));
        });
    }, [children, presences]);

    if (loading && children.length === 0) return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
            <p>{t(language as Language, 'parentDashboard.loading') || 'Chargement de votre espace parent...'}</p>
        </div>
    );

    if (errorMsg && children.length === 0) return (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-red-900 mb-2">{t(language as Language, 'parentDashboard.connectionError') || 'Erreur de connexion'}</h3>
            <p className="text-red-700">{errorMsg}</p>
            <button onClick={fetchData} className="mt-4 px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition">{t(language as Language, 'common.retry') || 'Réessayer'}</button>
        </div>
    );

    return (
        <>
        <div className="space-y-6 pb-20">

            {/* ══ BANDEAU BIENVENUE ══ */}
            <div className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 rounded-[32px] p-7 text-white overflow-hidden shadow-2xl">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, #60a5fa 0%, transparent 50%), radial-gradient(circle at 80% 20%, #818cf8 0%, transparent 40%)" }} />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="flex items-center gap-4">
                        <Avatar name={user?.nom || 'P'} size="lg" />
                        <div>
                            <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-0.5">{t(language as Language, 'parentDashboard.parentSpace') || 'Espace Parent'}</p>
                            <h2 className="text-2xl font-black tracking-tight">{t(language as Language, 'parentDashboard.hello') || 'Bonjour'}, {user?.nom} 👋</h2>
                            <p className="text-blue-200/70 text-sm mt-0.5">
                                {children.length === 0 ? (t(language as Language, 'parentDashboard.linkChildrenToStart') || "Liez vos enfants pour commencer") : `${children.length} ${(t(language as Language, 'parentDashboard.childTracked') || 'enfant(s) suivi(s)').replace('enfant(s)', 'enfant' + (children.length > 1 ? 's' : '')).replace('suivi(s)', 'suivi' + (children.length > 1 ? 's' : ''))} · ${settings?.schoolName || ''}`}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {notifStatus !== 'granted' && (
                            <button onClick={handleEnableNotifications} className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold border border-white/20 transition-all">
                                <Bell className="w-4 h-4" /> {t(language as Language, 'parentDashboard.enableAlerts') || 'Activer alertes'}
                            </button>
                        )}
                        <button
                            id="btn-announcements"
                            onClick={() => { setShowAnnouncementList(v => !v); if (!showAnnouncementList && user?.id) announcements.forEach(a => markAnnouncementRead(a.id, user.id)); }}
                            className="relative flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-bold text-sm transition-all"
                        >
                            <Bell className="w-4 h-4" /> {t(language as Language, 'common.announcements') || 'Annonces'}
                            {unseenCount > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce">{unseenCount > 9 ? '9+' : unseenCount}</span>}
                        </button>
                        <button id="btn-link-child" onClick={() => setIsLinkModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-2xl font-bold text-sm transition-all">
                            <UserPlus className="w-4 h-4" /> {t(language as Language, 'parentDashboard.linkChildBtn') || 'Lier un enfant'}
                        </button>
                        <button onClick={() => setShowSupportModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold text-sm transition-all">
                            <MessageSquare className="w-4 h-4" /> {t(language as Language, 'common.help') || 'Aide'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ══ ANNONCES ══ */}
            {showAnnouncementList && (
                <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-blue-100 shadow-2xl overflow-hidden">
                    <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Megaphone className="w-5 h-5 text-white" />
                            <h3 className="font-black text-white">{t(language as Language, 'parentDashboard.schoolAnnouncements') || "Annonces de l'École"}</h3>
                            <span className="px-3 py-0.5 bg-white/20 text-white text-[10px] font-black rounded-full">{announcements.length} {t(language as Language, 'common.messages') || 'messages'}</span>
                        </div>
                        <button onClick={() => setShowAnnouncementList(false)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                        {announcements.length === 0 ? (
                            <div className="py-8 text-center text-slate-400 text-sm">{t(language as Language, 'parentDashboard.noAnnouncements') || 'Aucune annonce pour le moment.'}</div>
                        ) : announcements.map(a => {
                            const imp = IMP_STYLES[a.importance] || IMP_STYLES.info;
                            return (
                                <div key={a.id} className="px-6 py-3 hover:bg-slate-50 transition cursor-pointer flex items-start gap-3" onClick={() => { if (user?.id) markAnnouncementRead(a.id, user.id); setShowAnnouncementList(false); }}>
                                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${imp.dot}`} />
                                    <div>
                                        <div className="flex gap-2 items-center mb-0.5">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${imp.badge}`}>{imp.label}</span>
                                            <span className="text-[10px] text-slate-400">{new Date(a.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                                        </div>
                                        <p className="font-bold text-slate-800 text-sm">{a.titre}</p>
                                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{a.message}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 💛 CAMPAGNES DE DONS ACTIVES 💛 */}
            {activeCampaigns.length > 0 && (
                <div className="space-y-4">
                    {activeCampaigns.map(campaign => (
                        <div key={campaign.id} className="relative bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-900/40 rounded-[24px] p-5 overflow-hidden group cursor-pointer" onClick={() => window.location.href = `/d/${useStore.getState().user?.schoolSlug}/${campaign.id}`}>
                            <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-amber-200/40 to-transparent pointer-events-none" />
                            <div className="relative z-10 flex items-center justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30">
                                        <Gift className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-100 text-amber-700 border-amber-200 uppercase">
                                                Appel aux dons
                                            </span>
                                        </div>
                                        <h4 className="font-black text-amber-900 dark:text-amber-100 text-lg">{campaign.title}</h4>
                                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-1 line-clamp-2 max-w-2xl">{campaign.description}</p>
                                    </div>
                                </div>
                                <div className="hidden sm:flex items-center gap-2 shrink-0">
                                    <span className="text-sm font-bold text-amber-600">Soutenir le projet</span>
                                    <ChevronRight className="w-5 h-5 text-amber-500 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ══ ALERTE GLOBALE (tous enfants) ══ */}
            {(allUrgentHomework.length > 0 || allUnjustifiedAbsences.length > 0) && (
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-[24px] p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 bg-rose-500 rounded-xl flex items-center justify-center shrink-0 animate-pulse">
                            <AlertTriangle className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h4 className="font-black text-rose-800 dark:text-rose-300">Alertes importantes à traiter !</h4>
                            <p className="text-xs text-rose-600 dark:text-rose-400">
                                {allUrgentHomework.length > 0 && <span>{allUrgentHomework.length} devoir(s) urgent(s)</span>}
                                {allUrgentHomework.length > 0 && allUnjustifiedAbsences.length > 0 && <span> • </span>}
                                {allUnjustifiedAbsences.length > 0 && <span>{allUnjustifiedAbsences.length} absence(s) à justifier</span>}
                            </p>
                        </div>
                        <button onClick={() => useStore.getState().setCurrentPage('parent_devoirs_presence')} className="ml-auto flex items-center gap-1 text-rose-700 dark:text-rose-400 text-xs font-bold hover:underline shrink-0">
                            {t(language as Language, 'common.see') || 'Voir'} <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {allUrgentHomework.map((d, i) => (
                            <div key={`d-${i}`} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-rose-900/30 rounded-xl border border-rose-200 dark:border-rose-800">
                                <Avatar name={d.childName} size="xs" />
                                <div>
                                    <p className="text-[11px] font-black text-rose-800 dark:text-rose-200">{d.childName} — {d.matiere}</p>
                                    <DueDateBadge dateStr={d.dateRendu} />
                                </div>
                            </div>
                        ))}
                        {allUnjustifiedAbsences.map((p, i) => (
                            <div key={`p-${i}`} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-rose-900/30 rounded-xl border border-rose-200 dark:border-rose-800">
                                <Avatar name={p.childName} size="xs" />
                                <div>
                                    <p className="text-[11px] font-black text-rose-800 dark:text-rose-200">{p.childName} - Absence</p>
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-lg text-[10px] font-black">
                                        Le {new Date(p.date).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' })}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ══ TOTAUX GLOBAUX ══ */}
            {children.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: t(language as Language, 'parentDashboard.totalTuition') || 'Total Scolarité', val: totalEcolage.toLocaleString() + ' ' + currency, icon: <Wallet className="w-5 h-5" />, color: 'blue' },
                        { label: t(language as Language, 'parentDashboard.alreadyPaid') || 'Déjà Payé', val: totalDejaPaye.toLocaleString() + ' ' + currency, icon: <TrendingUp className="w-5 h-5" />, color: 'emerald', sub: `${totalPctPaye}% ${t(language as Language, 'parentDashboard.ofTotal') || 'du total'}` },
                        { label: t(language as Language, 'parentDashboard.remaining') || 'Reste à Payer', val: totalRestant.toLocaleString() + ' ' + currency, icon: <CreditCard className="w-5 h-5" />, color: 'rose' },
                        { label: t(language as Language, 'common.results') || 'Résultats', val: t(language as Language, 'parentDashboard.seeGrades') || 'Voir les notes', icon: <Star className="w-5 h-5" />, color: 'amber', clickable: 'parent_notes' },
                    ].map(item => (
                        <div
                            key={item.label}
                            onClick={item.clickable ? () => useStore.getState().setCurrentPage(item.clickable as any) : undefined}
                            className={`bg-white dark:bg-slate-900 rounded-[24px] p-5 border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:shadow-lg ${item.clickable ? 'cursor-pointer hover:border-amber-300' : ''}`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-${item.color}-100 dark:bg-${item.color}-500/10 text-${item.color}-600`}>
                                {item.icon}
                            </div>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{item.label}</p>
                            <p className={`font-black text-lg text-${item.color}-600`}>{item.val}</p>
                            {item.sub && <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>}
                        </div>
                    ))}
                </div>
            )}

            {/* ══ SECTION PAR ENFANT ══ */}
            {children.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-[32px] p-14 text-center border border-dashed border-slate-200 dark:border-slate-700">
                    <GraduationCap className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <h3 className="text-xl font-black text-slate-700 dark:text-slate-300 mb-2">{t(language as Language, 'parentDashboard.noLinkedChild') || 'Aucun enfant lié'}</h3>
                    <p className="text-slate-400 text-sm max-w-xs mx-auto mb-6">{t(language as Language, 'parentDashboard.noLinkedChildDesc') || "Liez vos enfants pour voir leur suivi scolaire, financier et d'assiduité."}</p>
                    <button onClick={() => setIsLinkModalOpen(true)} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg transition-all">
                        <UserPlus className="w-4 h-4 inline mr-2" /> {t(language as Language, 'parentDashboard.linkChildBtn') || 'Lier un enfant'}
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <GraduationCap className="w-5 h-5 text-slate-400" />
                        <h3 className="font-black text-slate-700 dark:text-slate-200 text-lg">{t(language as Language, 'parentDashboard.childTracking') || 'Suivi par enfant'}</h3>
                        <span className="px-3 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black rounded-full uppercase">{children.length} {t(language as Language, 'common.children') || 'enfant(s)'}</span>
                    </div>
                    {children.map(child => (
                        <ChildCard
                            key={child.id}
                            child={child}
                            devoirs={devoirs}
                            presences={presences}
                            currency={currency}
                            onPay={handlePayerEnLigne}
                            loadingPayment={loadingPayment}
                            paymentEnabled={paymentEnabled}
                            onDownloadInvoice={() => handleDownloadInvoice(child)}
                            onUnlink={handleUnlink}
                            settings={settings}
                        />
                    ))}
                </div>
            )}

        </div>

        <LinkStudentModal isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} onSuccess={fetchData} />
        <SupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} onSelect={async (role) => { try { await chatApi.initiateConversation(undefined, role); useStore.getState().setCurrentPage('chat'); } catch {} finally { setShowSupportModal(false); } }} />
        </>
    );
};