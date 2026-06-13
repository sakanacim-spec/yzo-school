// SCAN SORTIE — Pointage des élèves par QR Code à la sortie
// ============================================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Presence } from '../types';
import { v4 as uuid } from '../utils/uuid';
import { createActivityLog } from '../utils/activityLogger';

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
    dejaSorti: boolean; telephone?: string; schoolName: string;
}> = ({ nom, prenom, classe, heure, date, dejaSorti }) => {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className={`w-full max-w-sm rounded-[2.5rem] border-4 p-8 text-center shadow-2xl transition-all ${dejaSorti
                ? 'border-amber-400 bg-white'
                : 'border-emerald-400 bg-white'
                }`}>
                <div className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${dejaSorti ? 'bg-amber-100' : 'bg-emerald-100'
                    }`}>
                    {dejaSorti ? (
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

                <div className={`py-3 px-6 rounded-2xl font-black text-lg ${dejaSorti ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {dejaSorti ? 'DÉJÀ SORTI' : `SORTI LE ${date} À ${heure}`}
                </div>
            </div>
        </div>
    );
};

// ── Page principale ──────────────────────────────────────────
export const ScanSortie: React.FC = () => {
    const students = useStore((s) => s.students);

    const addPresence = useStore((s) => s.addPresence);
    const hasAlreadyExited = useStore((s) => s.hasAlreadyExited);
    const addActivityLog = useStore((s) => s.addActivityLog);
    const user = useStore((s) => s.user);
    const schoolName = useStore((s) => s.schoolName);

    const [searchQuery, setSearchQuery] = useState('');
    const [scannedStudent, setScannedStudent] = useState<{
        nom: string; prenom: string; classe: string; heure: string; date: string;
        dejaSorti: boolean; telephone?: string;
    } | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [flashError, setFlashError] = useState<string | null>(null);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const isScanningPaused = useRef(false);

    const getSortiesToday = useStore((s) => s.getSortiesToday);
    const today = new Date().toISOString().split('T')[0];
    const todayPresences = getSortiesToday();

    // ── Enregistrer la sortie d'un élève ─────────────────────
    const registerSortie = useCallback(async (studentId: string) => {
        const student = students.find(s => s.id === studentId);
        const { links } = useStore.getState();

        const isLinked = links && links.some((l: any) =>
            l.student_id?.trim().toLowerCase() === studentId?.trim().toLowerCase()
        );

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
        const already = hasAlreadyExited(studentId);

        if (!already) {
            // Déclenchement AUDIO et VIBRATION IMMÉDIAT
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
                statut: 'present',
                type: 'SORTIE'
            };
            addPresence(presence);

            addActivityLog(createActivityLog(
                user?.nom || 'Système',
                user?.role || 'système',
                'presence',
                `Sortie enregistrée : ${student.prenom} ${student.nom} (${student.classe}) le ${dateAffichage} à ${heure}`
            ));

            const msg = `🏫 Sortie validée : ${student.prenom} ${student.nom} a quitté l'établissement le ${dateAffichage} à ${heure}.`;
            notificationService.notifyParents(student.id, msg);
        } else {
            playErrorSound();
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }

        setScannedStudent({
            nom: student.nom,
            prenom: student.prenom,
            classe: student.classe,
            heure,
            date: dateAffichage,
            dejaSorti: already,
            telephone: student.telephone,
        });
        isScanningPaused.current = true;

        // Reset automatique ULTRA RAPIDE après 0.6s
        setTimeout(() => {
            setScannedStudent(null);
            isScanningPaused.current = false;
        }, 600); // Réduit de 800ms à 600ms
    }, [students, today, hasAlreadyExited, addPresence, addActivityLog, user]);

    // ── Caméra QR avec HTML5-QRCode ────────────────────────────
    const startCamera = async () => {
        setCameraError('');
        setCameraActive(true);
        unlockAudio();

        await new Promise(resolve => setTimeout(resolve, 300));

        try {
            const html5QrCode = new Html5Qrcode("reader");
            html5QrCodeRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: { exact: "environment" } },
                {
                    fps: 25,
                    qrbox: { width: 280, height: 280 }
                },
                (decodedText) => {
                    if (!isScanningPaused.current) {
                        registerSortie(decodedText);
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
                        <h2 className="text-xl font-bold">Pointage des sorties</h2>
                        <p className="text-cyan-100 text-sm">Scan QR ou recherche manuelle</p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className="bg-white/10 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold">{todayPresences.length}</p>
                        <p className="text-xs text-cyan-200">Sortis aujourd'hui</p>
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
                            const alreadyHere = hasAlreadyExited(student.id);
                            return (
                                <button
                                    key={student.id}
                                    onClick={() => registerSortie(student.id)}
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

            {/* Liste des sortis aujourd'hui */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-emerald-600" />
                        Sortis aujourd'hui ({todayPresences.length})
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
