// ============================================================
// SCAN INFORMATION — Consultation rapide des données élève
// ============================================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Html5Qrcode } from "html5-qrcode";
import {
    Camera, Search, AlertTriangle, UserCircle,
    X, Wallet, Info, ShieldCheck, ChevronRight, Scan, CreditCard
} from 'lucide-react';
import { playSuccessSound, playErrorSound, unlockAudio } from '../utils/audio';

// ── Composant carte d'élève scanné (OVERLAY PREMIUM) ────────────────
const InfoStudentScanned: React.FC<{
    nom: string;
    prenom: string;
    classe: string;
    photoUrl?: string;
    solde: number;
    statut: string;
    onClose: () => void;
}> = ({ nom, prenom, classe, photoUrl, solde, statut, onClose }) => {
    const isSolvable = solde <= 0;
    
    // Mount animation effect
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        // Small delay to ensure CSS transition triggers after mount
        const timer = setTimeout(() => setMounted(true), 10);
        return () => clearTimeout(timer);
    }, []);

    const handleClose = () => {
        setMounted(false);
        setTimeout(onClose, 300); // Wait for exit animation
    };

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'bg-black/60 backdrop-blur-md opacity-100' : 'bg-transparent backdrop-blur-none opacity-0'}`}>
            {/* Overlay click to close */}
            <div className="absolute inset-0" onClick={handleClose}></div>

            {/* Modal Card */}
            <div 
                className={`relative w-full max-w-sm sm:max-w-md bg-white dark:bg-gray-900 border border-white/40 dark:border-white/10 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden transition-all duration-500 transform ease-[cubic-bezier(0.34,1.56,0.64,1)] ${mounted ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-10 opacity-0'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Glow behind the card header */}
                <div className={`absolute top-0 left-0 right-0 h-40 opacity-40 blur-3xl rounded-full -translate-y-1/2 ${isSolvable ? 'bg-emerald-400' : 'bg-red-500'}`} />

                {/* Header Banner */}
                <div className="relative h-28 sm:h-32">
                    <div className="absolute top-4 right-4 z-20">
                        <button onClick={handleClose} className="p-2 bg-black/10 hover:bg-black/20 text-white rounded-full backdrop-blur-md transition-all active:scale-95 hover:rotate-90">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    {/* Abstract Shapes in banner */}
                    <div className={`w-full h-full bg-gradient-to-br ${isSolvable ? 'from-emerald-500 via-teal-500 to-emerald-700' : 'from-orange-500 via-red-500 to-rose-700'} relative overflow-hidden`}>
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
                        <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
                        <div className="absolute -top-10 -left-10 w-32 h-32 bg-black/10 rounded-full blur-xl"></div>
                    </div>
                </div>

                {/* Avatar Profile */}
                <div className="relative -mt-16 mb-4 flex justify-center z-10">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-white dark:bg-gray-800 rounded-[2rem] blur-xl opacity-40 group-hover:opacity-75 transition-opacity duration-500"></div>
                        <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-[2rem] border-4 border-white dark:border-gray-900 shadow-xl overflow-hidden bg-gray-50 dark:bg-gray-800 transform transition-transform duration-500 group-hover:scale-105 group-hover:-translate-y-1">
                            {photoUrl ? (
                                <img src={photoUrl} alt="Profil" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 text-gray-400">
                                    <UserCircle className="w-16 h-16 sm:w-20 sm:h-20" />
                                </div>
                            )}
                        </div>
                        {/* Status badge pinned to avatar */}
                        <div className={`absolute -bottom-2 -right-2 p-2.5 rounded-2xl border-4 border-white dark:border-gray-900 shadow-lg ${isSolvable ? 'bg-emerald-500' : 'bg-red-500'} text-white transform transition-transform duration-500 hover:scale-110 hover:rotate-12`}>
                            {isSolvable ? <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" /> : <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />}
                        </div>
                    </div>
                </div>

                {/* Student Info Details */}
                <div className="px-6 sm:px-8 pb-8 text-center relative z-10">
                    <h3 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mb-1">
                        {prenom} <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-400">{nom}</span>
                    </h3>
                    <p className="text-sm sm:text-base text-blue-600 dark:text-blue-400 font-bold tracking-widest uppercase mb-8 opacity-90">
                        {classe}
                    </p>

                    <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
                        <div className="relative overflow-hidden bg-gray-50 dark:bg-gray-800/50 rounded-[1.5rem] p-4 sm:p-5 border border-gray-100 dark:border-gray-700/50 shadow-sm transition-all duration-300 hover:shadow-md hover:border-gray-200 dark:hover:border-gray-600 hover:-translate-y-0.5 group">
                            <div className="absolute -top-4 -right-4 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:rotate-12 group-hover:scale-110">
                                <Wallet className="w-16 h-16" />
                            </div>
                            <div className="flex flex-col items-start text-left relative z-10">
                                <span className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <Wallet className="w-3 h-3" /> Solde
                                </span>
                                <div className={`text-lg sm:text-xl font-black tracking-tight ${solde > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {solde.toLocaleString()} <span className="text-xs sm:text-sm font-bold opacity-60">FCFA</span>
                                </div>
                            </div>
                        </div>

                        <div className="relative overflow-hidden bg-gray-50 dark:bg-gray-800/50 rounded-[1.5rem] p-4 sm:p-5 border border-gray-100 dark:border-gray-700/50 shadow-sm transition-all duration-300 hover:shadow-md hover:border-gray-200 dark:hover:border-gray-600 hover:-translate-y-0.5 group">
                            <div className="absolute -top-4 -right-4 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:rotate-12 group-hover:scale-110">
                                <CreditCard className="w-16 h-16" />
                            </div>
                            <div className="flex flex-col items-start text-left relative z-10">
                                <span className="text-[10px] sm:text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <ShieldCheck className="w-3 h-3" /> Statut
                                </span>
                                <div className={`text-xs sm:text-sm font-black px-2.5 py-1.5 rounded-xl inline-flex items-center gap-1.5 shadow-sm border
                                    ${statut === 'Soldé' ? 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400' : 
                                    statut === 'Partiel' ? 'bg-orange-50 border-orange-100 text-orange-700 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400' : 
                                    'bg-red-50 border-red-100 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'}
                                `}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]"></span>
                                    {statut.toUpperCase()}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleClose}
                        className="w-full relative overflow-hidden group py-4 sm:py-4.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-[1.25rem] font-black text-sm sm:text-base transition-all active:scale-95 shadow-[0_8px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_12px_25px_rgba(0,0,0,0.15)]"
                    >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                            Terminer la consultation <ChevronRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform duration-300" />
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-black dark:from-gray-100 dark:to-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Page principale ──────────────────────────────────────────
export const ScanInformation: React.FC = () => {
    const students = useStore((s) => s.students);
    const [searchQuery, setSearchQuery] = useState('');
    const [scannedStudent, setScannedStudent] = useState<any | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [flashError, setFlashError] = useState<string | null>(null);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const isScanningPaused = useRef(false);

    // Initial page mount animation
    const [pageMounted, setPageMounted] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setPageMounted(true), 50);
        return () => clearTimeout(timer);
    }, []);

    const handleInfoScan = useCallback((studentId: string) => {
        const student = students.find(s => s.id === studentId);
        const { links } = useStore.getState();

        const isLinked = links && links.some((l: any) =>
            l.student_id?.trim().toLowerCase() === studentId?.trim().toLowerCase()
        );

        if (!student || !isLinked) {
            playErrorSound();
            setFlashError("PAS LIÉE");
            isScanningPaused.current = true;
            setTimeout(() => {
                setFlashError(null);
                isScanningPaused.current = false;
            }, 1000);
            return;
        }

        // Succès
        playSuccessSound();
        if (navigator.vibrate) navigator.vibrate(80);

        setScannedStudent(student);
        isScanningPaused.current = true;
    }, [students]);

    const startCamera = async () => {
        setCameraError('');
        setCameraActive(true);
        unlockAudio();

        // Petite attente pour que le DOM soit prêt
        await new Promise(resolve => setTimeout(resolve, 400));

        try {
            const html5QrCode = new Html5Qrcode("reader-info");
            html5QrCodeRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: { exact: "environment" } },
                {
                    fps: 25,
                    qrbox: { width: 250, height: 250 }
                },
                (decodedText) => {
                    if (!isScanningPaused.current) {
                        handleInfoScan(decodedText);
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

    const filteredStudents = searchQuery.length >= 2
        ? students.filter(s =>
            `${s.prenom} ${s.nom} ${s.classe} ${s.id}`.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 10)
        : [];

    return (
        <div className={`max-w-[1200px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 transition-all duration-700 ease-out ${pageMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            
            <style>{`
                @keyframes scan-line {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>

            {/* PREMIUM HERO SECTION */}
            <div className="relative w-full bg-gradient-to-br from-indigo-900 via-blue-900 to-indigo-950 rounded-[2rem] sm:rounded-[2.5rem] p-8 sm:p-10 text-white shadow-2xl shadow-indigo-900/20 overflow-hidden group">
                {/* Abstract Background Effects */}
                <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-blue-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 group-hover:bg-blue-400/20 transition-colors duration-1000"></div>
                <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-indigo-500/20 rounded-full blur-[60px] translate-y-1/3 -translate-x-1/4"></div>
                
                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs sm:text-sm font-bold text-blue-200 mb-4 sm:mb-6 shadow-sm">
                            <Scan className="w-4 h-4" /> Mode Scanner Express
                        </div>
                        <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight mb-3">
                            Vérification <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-indigo-200">Instantanée</span>
                        </h1>
                        <p className="text-indigo-200 text-sm sm:text-base font-medium max-w-lg leading-relaxed">
                            Identifiez rapidement un élève avec son QR Code pour accéder à son statut financier et ses informations de base en un clin d'œil.
                        </p>
                    </div>
                    
                    {/* Hero Icon Decoration */}
                    <div className="hidden sm:flex relative items-center justify-center w-32 h-32 bg-white/5 backdrop-blur-2xl rounded-[2rem] border border-white/10 shadow-2xl transform rotate-3 group-hover:rotate-6 group-hover:scale-105 transition-all duration-500">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-600 opacity-20 rounded-[2rem]"></div>
                        <Scan className="w-16 h-16 text-blue-200 drop-shadow-lg" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8">
                {/* LEFT COL: CAMERA SCANNER */}
                <div className="lg:col-span-3 space-y-6">
                    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2rem] shadow-xl shadow-gray-200/40 dark:shadow-none overflow-hidden transition-all duration-500 hover:shadow-2xl">
                        <div className="p-5 sm:p-6 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                            <div className="flex items-center gap-3.5">
                                <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-[1rem] shadow-sm">
                                    <Camera className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg">Caméra Intelligente</h3>
                                    <p className="text-xs font-medium text-gray-500">Alignez le QR code dans le cadre</p>
                                </div>
                            </div>
                            <button
                                onClick={cameraActive ? stopCamera : startCamera}
                                className={`relative px-5 py-2.5 sm:px-6 sm:py-3 rounded-[1rem] text-sm font-bold flex items-center gap-2 overflow-hidden transition-all duration-300 transform active:scale-95 shadow-sm ${
                                    cameraActive
                                    ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20'
                                    : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:shadow-lg hover:-translate-y-0.5'
                                }`}
                            >
                                {cameraActive ? (
                                    <><X className="w-4 h-4" /> <span className="hidden sm:inline">Arrêter la caméra</span></>
                                ) : (
                                    <><Scan className="w-4 h-4" /> <span className="hidden sm:inline">Activer le lecteur</span></>
                                )}
                            </button>
                        </div>

                        <div className="p-4 sm:p-6 bg-white dark:bg-gray-900">
                            <div className={`relative w-full rounded-[1.5rem] overflow-hidden bg-gray-100 dark:bg-gray-800 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${cameraActive ? 'h-[350px] sm:h-[450px]' : 'h-40 sm:h-48'}`}>
                                {cameraActive ? (
                                    <>
                                        <div id="reader-info" className="w-full h-full object-cover absolute inset-0 bg-black"></div>
                                        
                                        {/* Ultra-Premium Viewfinder Overlay */}
                                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                                            <div className="relative w-56 h-56 sm:w-72 sm:h-72">
                                                {/* Corners */}
                                                <div className="absolute top-0 left-0 w-8 h-8 sm:w-12 sm:h-12 border-t-[5px] border-l-[5px] border-blue-500 rounded-tl-2xl shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                                <div className="absolute top-0 right-0 w-8 h-8 sm:w-12 sm:h-12 border-t-[5px] border-r-[5px] border-blue-500 rounded-tr-2xl shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                                <div className="absolute bottom-0 left-0 w-8 h-8 sm:w-12 sm:h-12 border-b-[5px] border-l-[5px] border-blue-500 rounded-bl-2xl shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                                <div className="absolute bottom-0 right-0 w-8 h-8 sm:w-12 sm:h-12 border-b-[5px] border-r-[5px] border-blue-500 rounded-br-2xl shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                                
                                                {/* Scanning Line Animation */}
                                                <div className="absolute top-0 left-0 w-full h-[3px] bg-blue-400 shadow-[0_0_12px_#3b82f6] animate-[scan-line_2s_ease-in-out_infinite]"></div>
                                            </div>
                                        </div>

                                        {flashError && (
                                            <div className="absolute inset-0 bg-red-600/90 backdrop-blur-sm flex flex-col items-center justify-center text-white z-50 transition-all duration-300">
                                                <div className="p-6 bg-white/10 rounded-full mb-6">
                                                    <AlertTriangle className="w-16 h-16 sm:w-20 sm:h-20 opacity-100 animate-[bounce_1s_infinite]" />
                                                </div>
                                                <h2 className="text-3xl sm:text-5xl font-black tracking-widest">{flashError}</h2>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 group cursor-pointer" onClick={startCamera}>
                                        <div className="w-16 h-16 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center shadow-md mb-3 group-hover:scale-110 group-hover:text-blue-500 transition-all duration-300">
                                            <Camera className="w-8 h-8" />
                                        </div>
                                        <p className="font-bold text-sm tracking-wide">Appuyez pour activer la caméra</p>
                                    </div>
                                )}
                            </div>

                            {cameraError && (
                                <div className="mt-4 p-4 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-2xl text-sm font-bold flex items-center gap-3 animate-pulse">
                                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                    <p>{cameraError}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COL: MANUAL SEARCH */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2rem] shadow-xl shadow-gray-200/40 dark:shadow-none overflow-hidden p-5 sm:p-6 transition-all duration-500 hover:shadow-2xl flex flex-col h-full">
                        <div className="mb-5 sm:mb-6 flex-shrink-0">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg shadow-sm">
                                    <Search className="w-4 h-4" />
                                </div>
                                <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg">Recherche manuelle</h3>
                            </div>
                            <p className="text-sm text-gray-500 font-medium">Saisissez le nom de l'élève</p>
                        </div>

                        <div className="relative group flex-shrink-0">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Nom, prénom, classe..."
                                className="block w-full pl-11 pr-10 py-3.5 sm:py-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500/30 focus:bg-white dark:focus:bg-gray-900 rounded-[1.25rem] text-sm sm:text-base font-bold text-gray-900 dark:text-white placeholder-gray-400 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all duration-300 shadow-inner"
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            )}
                        </div>

                        <div className="mt-4 sm:mt-5 flex-1 overflow-hidden flex flex-col">
                            {filteredStudents.length > 0 ? (
                                <div className="space-y-2.5 sm:space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
                                    {filteredStudents.map((student, idx) => (
                                        <button
                                            key={student.id}
                                            onClick={() => handleInfoScan(student.id)}
                                            className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-[1.25rem] bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all duration-300 text-left shadow-sm group transform hover:-translate-y-1 hover:shadow-md"
                                            style={{ animationDelay: `${idx * 50}ms` }}
                                        >
                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-[1rem] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 overflow-hidden shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                                                {student.photoUrl ? (
                                                    <img src={student.photoUrl} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="font-black text-xs sm:text-sm tracking-wider">
                                                        {student.prenom.charAt(0)}{student.nom.charAt(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                    {student.prenom} {student.nom}
                                                </p>
                                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-bold opacity-80 truncate">{student.classe}</p>
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-700 flex items-center justify-center text-gray-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 dark:group-hover:bg-indigo-500/30 dark:group-hover:text-indigo-300 transition-colors shrink-0">
                                                <ChevronRight className="w-4 h-4" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : searchQuery.length >= 2 ? (
                                <div className="text-center p-6 bg-gray-50 dark:bg-gray-800/50 rounded-[1.5rem] border border-dashed border-gray-200 dark:border-gray-700 flex-1 flex flex-col items-center justify-center">
                                    <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                                    <p className="text-sm font-bold text-gray-500">Aucun élève trouvé pour "{searchQuery}"</p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            {/* Overlay Résultat */}
            {scannedStudent && (
                <InfoStudentScanned
                    nom={scannedStudent.nom}
                    prenom={scannedStudent.prenom}
                    classe={scannedStudent.classe}
                    photoUrl={scannedStudent.photoUrl}
                    solde={scannedStudent.restant}
                    statut={scannedStudent.status}
                    onClose={() => {
                        setScannedStudent(null);
                        isScanningPaused.current = false;
                    }}
                />
            )}
        </div>
    );
};

export default ScanInformation;

