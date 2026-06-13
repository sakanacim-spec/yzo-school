// ============================================================
// SCAN PRÉSENCE — Pointage des élèves par QR Code / recherche
// ============================================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Presence } from '../types';
import { v4 as uuid } from '../utils/uuid';
import { createActivityLog } from '../utils/activityLogger';
import { getCycle } from '../data/classConfig';
// import { sendWhatsApp, messagePresenceArrivee } from '../utils/whatsappHelper'; // Non utilisé actuellement
import { Html5Qrcode } from "html5-qrcode";
import {
    Camera, Search, CheckCircle2, AlertTriangle, UserCheck,
    Clock, Users, X
} from 'lucide-react';

// import { sendDirectNotification } from '../services/whatsappService'; // Non utilisé actuellement
import { notificationService } from '../services/notificationService';
import { playSuccessSound, playErrorSound, playWarningBeep, unlockAudio } from '../utils/audio';

// ── Composant carte d'élève scanné (OVERLAY) ────────────────
const StudentScanned: React.FC<{
    nom: string; prenom: string; classe: string; heure: string; date: string;
    dejaPresent: boolean; telephone?: string; schoolName: string;
    statut?: 'present' | 'retard';
}> = ({ nom, prenom, classe, heure, date, dejaPresent, statut }) => {
    const isRetard = statut === 'retard';
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className={`w-full max-w-sm rounded-[2.5rem] border-4 p-8 text-center shadow-2xl transition-all ${dejaPresent
                ? 'border-amber-400 bg-white'
                : isRetard
                  ? 'border-orange-400 bg-white'
                  : 'border-emerald-400 bg-white'
                }`}>
                <div className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${dejaPresent ? 'bg-amber-100' : isRetard ? 'bg-orange-100' : 'bg-emerald-100'
                    }`}>
                    {dejaPresent ? (
                        <AlertTriangle className="w-12 h-12 text-amber-600" />
                    ) : (
                        <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                    )}
                </div>

                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 mx-auto mb-4 flex items-center justify-center text-white text-3xl font-black">
                    {prenom.charAt(0)}{nom.charAt(0)}
                </div>

                <h3 className="text-2xl font-black text-gray-900 mb-1">{prenom} {nom}</h3>
                <p className="text-lg text-gray-500 font-bold mb-6">{classe}</p>

                <div className={`py-3 px-6 rounded-2xl font-black text-lg ${dejaPresent ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {dejaPresent ? 'DÉJÀ POINTÉ' : `PRÉSENT LE ${date} À ${heure}`}
                </div>
            </div>
        </div>
    );
};

// import { playSuccessSound, playErrorSound } from '../utils/audio'; // Déplacé en haut

// ── Page principale ──────────────────────────────────────────
export const ScanPresence: React.FC = () => {
    const students = useStore((s) => s.students);
    const presences = useStore((s) => s.presences);
    const addPresence = useStore((s) => s.addPresence);
    const isAlreadyPresent = useStore((s) => s.isAlreadyPresent);
    const addActivityLog = useStore((s) => s.addActivityLog);
    const user = useStore((s) => s.user);
    const schoolName = useStore((s) => s.schoolName);
    const getHeureLimite = useStore((s) => s.getHeureLimite);

    const [searchQuery, setSearchQuery] = useState('');
    const [scannedStudent, setScannedStudent] = useState<{
        nom: string; prenom: string; classe: string; heure: string; date: string;
        dejaPresent: boolean; telephone?: string; statut?: 'present' | 'retard';
    } | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [flashError, setFlashError] = useState<string | null>(null);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const isScanningPaused = useRef(false);

    const today = new Date().toISOString().split('T')[0];
    const todayPresences = presences.filter(p => p.date === today);

    // ── Enregistrer la présence d'un élève ─────────────────────
    const registerPresence = useCallback(async (studentId: string) => {
        const student = students.find(s => s.id === studentId);
        const { links } = useStore.getState(); // Utilise les liens synchronisés

        // Un élève est "lié" s'il existe une entrée dans links correspondant à cet élève (casse insensible)
        const isLinked = links && links.some((l: any) =>
            l.student_id?.trim().toLowerCase() === studentId?.trim().toLowerCase()
        );

        // Cas : Élève inconnu ou non lié
        if (!student || !isLinked) {
            playErrorSound(); // Buzzer instantané
            setFlashError("PAS LIÉE");
            isScanningPaused.current = true;
            setTimeout(() => {
                setFlashError(null);
                isScanningPaused.current = false;
            }, 600); // Réduit de 1000ms à 600ms
            return;
        }

        const now = new Date();
        const heure = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const dateAffichage = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const already = isAlreadyPresent(studentId);

        if (!already) {
            // Déclenchement AUDIO et VIBRATION IMMÉDIAT (avant le reste de la logique)
            if (student.telephone) {
                playSuccessSound();
            } else {
                playWarningBeep();
            }
            if (navigator.vibrate) navigator.vibrate(80);

            const presence: Presence = {
                id: uuid(),
                eleveId: student.id,
                eleveNom: student.nom,
                elevePrenom: student.prenom,
                eleveClasse: student.classe,
                date: today,
                heure: now.toTimeString().split(' ')[0],
                statut: (() => {
                    // Déterminer si retard basé sur l'heure limite du cycle
                    const cycle = getCycle(student.classe);
                    const heureLimite = getHeureLimite(cycle);
                    const [lH, lM] = heureLimite.split(':').map(Number);
                    const limiteMinutes = lH * 60 + lM;
                    const scanMinutes = now.getHours() * 60 + now.getMinutes();
                    return scanMinutes > limiteMinutes ? 'retard' : 'present';
                })(),
            };
            addPresence(presence);

            // Log d'activité
            addActivityLog(createActivityLog(
                user?.nom || 'Système',
                user?.role || 'système',
                'presence',
                `Présence enregistrée : ${student.prenom} ${student.nom} (${student.classe}) le ${dateAffichage} à ${heure}`
            ));

            // Notification Push instantanée aux parents
            const msg = `✅ Présence validée : ${student.prenom} ${student.nom} est arrivé(e) à l'école le ${dateAffichage} à ${heure}.`;
            notificationService.notifyParents(student.id, msg);
        } else {
            // Son d'erreur (buzzer) si déjà présent
            playErrorSound();
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }

        // Affichage fiche avec auto-fermeture (Scan Séquentiel)
        setScannedStudent({
            nom: student.nom,
            prenom: student.prenom,
            classe: student.classe,
            heure,
            date: dateAffichage,
            dejaPresent: already,
            telephone: student.telephone,
            statut: already ? undefined : (() => {
                const cycle = getCycle(student.classe);
                const hl = getHeureLimite(cycle);
                const [lH, lM] = hl.split(':').map(Number);
                return (now.getHours() * 60 + now.getMinutes()) > (lH * 60 + lM) ? 'retard' as const : 'present' as const;
            })(),
        });
        isScanningPaused.current = true;

        // Reset automatique ULTRA RAPIDE après 0.6s pour enchaîner les scans
        setTimeout(() => {
            setScannedStudent(null);
            isScanningPaused.current = false;
        }, 600); // Réduit de 800ms à 600ms pour une sensation de vitesse maximale
    }, [students, today, isAlreadyPresent, addPresence, addActivityLog, user]);

    // ── Caméra QR avec HTML5-QRCode ────────────────────────────
    const startCamera = async () => {
        setCameraError('');
        setCameraActive(true);
        unlockAudio();

        // Petite attente pour que le DOM soit prêt
        await new Promise(resolve => setTimeout(resolve, 300));

        try {
            const html5QrCode = new Html5Qrcode("reader");
            html5QrCodeRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: { exact: "environment" } },
                {
                    fps: 25,
                    qrbox: { width: 250, height: 250 }
                },
                (decodedText) => {
                    if (!isScanningPaused.current) {
                        registerPresence(decodedText);
                    }
                },
                (errorMessage) => {
                    if (process.env.NODE_ENV === 'development' && !errorMessage.includes('No QR code found')) {
                        console.debug("Scan info:", errorMessage);
                    }
                }
            );
        } catch (err) {
            console.error("Camera Error:", err);
            setCameraError('Erreur matérielle ou permissions refusées.');
            setCameraActive(false);
        }
    };

    const stopCamera = () => {
        if (html5QrCodeRef.current) {
            html5QrCodeRef.current.stop().then(() => {
                html5QrCodeRef.current?.clear();
                html5QrCodeRef.current = null;
            }).catch(e => console.error("Erreur arrêt caméra:", e));
        }
        setCameraActive(false);
    };

    useEffect(() => {
        return () => {
            if (html5QrCodeRef.current) {
                html5QrCodeRef.current.stop().catch(() => { });
            }
        };
    }, []);

    // ── Recherche élève (alternative au scan) ──────────────────
    const filteredStudents = searchQuery.length >= 2
        ? students.filter(s =>
            `${s.prenom} ${s.nom} ${s.classe} ${s.id}`.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 10)
        : [];

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* En-tête */}
            <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Pointage des présences</h2>
                        <p className="text-cyan-100 text-sm">Scan QR ou recherche manuelle</p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className="bg-white/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold">{todayPresences.length}</p>
                        <p className="text-xs text-cyan-200">Présents</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold">{students.length}</p>
                        <p className="text-xs text-cyan-200">Total élèves</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold">
                            {students.length > 0 ? Math.round((todayPresences.length / students.length) * 100) : 0}%
                        </p>
                        <p className="text-xs text-cyan-200">Taux</p>
                    </div>
                </div>
            </div>

            {/* Zone caméra */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                        <Camera className="w-4 h-4 text-blue-600" />
                        Scanner un QR Code
                    </h3>
                    <button
                        onClick={cameraActive ? stopCamera : startCamera}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${cameraActive
                            ? 'bg-red-100 text-red-600 hover:bg-red-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                    >
                        {cameraActive ? <><X className="w-3.5 h-3.5" /> Arrêter</> : <><Camera className="w-3.5 h-3.5" /> Activer caméra</>}
                    </button>
                </div>

                {cameraActive && (
                    <div className="relative bg-black w-full" style={{ minHeight: '300px' }}>
                        {/* Conteneur pour Html5Qrcode */}
                        <div id="reader" className="w-full h-full"></div>

                        {/* Overlay Flash Erreur Link */}
                        {flashError && (
                            <div className="absolute inset-0 bg-red-600/90 flex flex-col items-center justify-center text-white z-50 animate-pulse">
                                <AlertTriangle className="w-20 h-20 mb-4" />
                                <h2 className="text-4xl font-extrabold tracking-taller">{flashError}</h2>
                            </div>
                        )}
                    </div>
                )}

                {cameraError && (
                    <div className="p-4 bg-red-50 text-red-600 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {cameraError}
                    </div>
                )}
            </div>

            {/* Recherche manuelle */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3 text-sm">
                    <Search className="w-4 h-4 text-blue-600" />
                    Recherche manuelle
                </h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Nom, prénom, classe ou matricule..."
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    />
                </div>

                {/* Résultats de recherche */}
                {filteredStudents.length > 0 && (
                    <div className="mt-3 space-y-1 max-h-[300px] overflow-y-auto">
                        {filteredStudents.map(student => {
                            const alreadyHere = isAlreadyPresent(student.id);
                            return (
                                <button
                                    key={student.id}
                                    onClick={() => registerPresence(student.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:shadow-sm ${alreadyHere ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 hover:bg-blue-50 border border-gray-100'
                                        }`}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                        {student.prenom.charAt(0)}{student.nom.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                            {student.prenom} {student.nom}
                                        </p>
                                        <p className="text-xs text-gray-500">{student.classe}</p>
                                    </div>
                                    {alreadyHere ? (
                                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Présent
                                        </span>
                                    ) : (
                                        <span className="text-xs font-bold text-blue-600">Pointer →</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Résultat du scan (Overlay Auto-fermant) */}
            {scannedStudent && (
                <StudentScanned
                    {...scannedStudent}
                    schoolName={schoolName}
                />
            )}

            {/* Liste des présents aujourd'hui */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-emerald-600" />
                        Présents aujourd'hui ({todayPresences.length})
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                </div>
                <div className="p-4 max-h-[400px] overflow-y-auto">
                    {todayPresences.length === 0 ? (
                        <p className="text-center text-gray-400 text-sm py-8">Aucune présence enregistrée aujourd'hui</p>
                    ) : (
                        <div className="space-y-1">
                            {todayPresences.map(p => (
                                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">
                                        {p.elevePrenom.charAt(0)}{p.eleveNom.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-gray-900 truncate">{p.elevePrenom} {p.eleveNom}</p>
                                        <p className="text-[10px] text-gray-500">{p.eleveClasse}</p>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-mono">{p.heure.slice(0, 5)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
