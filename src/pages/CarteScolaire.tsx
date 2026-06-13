// ============================================================
// CARTE SCOLAIRE — Génération PDF + affichage écran
// QR Code haute résolution, format ISO 85×54mm, 8 cartes/A4
// ============================================================
import React, { useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { QRCodeCanvas } from 'qrcode.react';
import jsPDF from 'jspdf';
import QRCodeLib from 'qrcode'; // import statique — fiable dans le navigateur
import {
    CreditCard, Search, Download, Printer, X, Filter,
    CheckCircle, Loader2, ChevronDown, AlertCircle, User,
    Users, Info
} from 'lucide-react';

// ============================================================
// COMPOSANT CARTE — Affichage écran
// QR Canvas rendu en haute résolution puis réduit via CSS
// ============================================================
interface CarteProps {
    nom: string;
    prenom: string;
    classe: string;
    id: string;
    telephone: string;
    schoolName: string;
    schoolYear: string;
    schoolLogo: string | null;
    photoUrl?: string | null;
}

const CarteEleve: React.FC<CarteProps> = ({
    nom, prenom, classe, id, telephone, schoolName, schoolYear, schoolLogo, photoUrl,
}) => {
    const nomComplet = `${prenom} ${nom}`.toUpperCase();

    return (
        <div style={{
            width: 320, height: 204, // Proportions 85x54mm (approx)
            background: 'white',
            borderRadius: 0, overflow: 'hidden',
            position: 'relative', fontFamily: '"Inter", sans-serif',
            boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
            userSelect: 'none',
            border: '1px solid #000000'
        }}>
            {/* Guilloche effect minimalist dots */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'radial-gradient(#0F172A 1px, transparent 0)', backgroundSize: '10px 10px' }} />
            
            {/* Logo en filigrane (Watermark) */}
            {schoolLogo && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    width: 140, height: 140, opacity: 0.22, zIndex: 2, pointerEvents: 'none'
                }}>
                    <img src={schoolLogo} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'grayscale(1)' }} />
                </div>
            )}
            {/* Header (Bannière économe en encre) */}
            <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: 49,
                background: 'white', borderBottom: '2.5px solid #EAB308', 
                display: 'flex', alignItems: 'center', padding: '0 15px', zIndex: 10
            }}>
            <div style={{ width: 44, height: 38, background: '#0F172A', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 3 }}>
                   {schoolLogo ? <img src={schoolLogo} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} /> : <span style={{ color:'white', fontWeight:900, fontSize:10 }}>ID</span>}
                </div>
                <div style={{ marginLeft: 12 }}>
                    <h2 style={{ color: '#0F172A', margin: 0, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1 }}>{schoolName}</h2>
                    <p style={{ color: '#EAB308', margin: '2px 0 0 0', fontSize: 7, fontWeight: 700 }}>
                        OFFICIEL {schoolYear} <span style={{ color: '#64748B', fontWeight: 600 }}>· CARTES Scolaire</span>
                    </p>
                </div>
            </div>

            {/* 3. Photo Passeport (Position fixée au mm près) */}
            <div style={{
                position: 'absolute', top: 64, left: 48, // PhotoX=13mm -> 48px
                width: 68, height: 82, // 18x22mm
                borderRadius: 0, overflow: 'hidden',
                border: '1.5px solid #0F172A',
                background: '#F1F5F9', zIndex: 10
            }}>
                {photoUrl ? (
                    <img src={photoUrl} alt="Photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                         <User size={24} />
                    </div>
                )}
                {/* Sceau de sécurité photo */}
                <div style={{ position: 'absolute', bottom: 4, right: 4, width: 10, height: 10, background: '#EAB308', borderRadius: '50%', border: '1.5px solid white' }} />
            </div>

            {/* 4. Texte (Identité) */}
            <div style={{
                position: 'absolute', top: 64, left: 126, width: 95, // infoStartX=34mm -> 126px
                display: 'flex', flexDirection: 'column', zIndex: 10
            }}>
                <p style={{ fontSize: 6, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 2 }}>Nom & Prénoms</p>
                <h3 style={{
                    color: '#0F172A', margin: 0, marginBottom: 12, fontWeight: 900, 
                    fontSize: nomComplet.length > 20 ? 11 : 13,
                    lineHeight: 1.1, textTransform: 'uppercase'
                }}>
                    {nomComplet}
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                        <p style={{ fontSize: 6, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 1 }}>Classe</p>
                        <span style={{
                            background: '#0F172A', color: 'white', fontSize: 11, fontWeight: 900, 
                            padding: '3px 12px', borderRadius: 0, display: 'inline-block'
                        }}>
                            {classe}
                        </span>
                    </div>
                    <div>
                        <p style={{ fontSize: 6, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 1 }}>Contact</p>
                        <span style={{ fontSize: 9, fontWeight: 900, color: '#0F172A' }}>{telephone || '71517633'}</span>
                    </div>
                </div>
            </div>

            {/* 5. QR Code (Position fixée) */}
            <div style={{
                position: 'absolute', top: 68, left: 226, // qrX=60mm -> 222px
                width: 79, height: 79, background: 'white', borderRadius: 0, padding: 5,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: '1px solid #E2E8F0', zIndex: 10
            }}>
                <QRCodeCanvas value={id} size={60} level="H" bgColor="#FFFFFF" fgColor="#0F172A" />
                <p style={{ fontSize: 5, color: '#94A3B8', marginTop: 4, fontWeight: 900, textTransform: 'uppercase' }}>Scan Sécurisé</p>
            </div>

            {/* Footer (Pied de page économe) */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, width: '100%', height: 26,
                background: '#000000', borderTop: '1.5px solid #EAB308', zIndex: 11, 
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <p style={{ color: '#FFFFFF', fontSize: 7.5, fontWeight: 700, margin: 0, textAlign: 'center', padding: '0 10px' }}>
                    Si cette carte ne vous appartient pas, veuillez la retourner à l'administration.
                </p>
            </div>
        </div>
    );
};

// ============================================================
// GÉNÉRATION QR HAUTE RÉSOLUTION POUR PDF
// Via QRCodeLib (import statique, fiable navigateur)
// ============================================================
const buildQRDataURL = async (studentId: string): Promise<string> => {
    // toDataURL retourne directement un data:image/png;base64,...
    // Paramètres optimisés impression :
    //   - errorCorrectionLevel H = 30% de correction
    //   - margin 4 = quiet zone 4 modules (norme ISO 18004)
    //   - width 400px @ 300dpi ≈ 34mm dans le PDF — ultra net
    //   - couleurs : noir absolu sur blanc absolu
    return QRCodeLib.toDataURL(studentId, {
        type: 'image/png',
        width: 400,
        margin: 1, // Marge ISO réduite pour une plus grande zone de scan
        errorCorrectionLevel: 'H',
        color: { dark: '#000000', light: '#ffffff' },
    });
};

/**
 * Charge une URL d'image et la convertit en Base64 (utile pour jsPDF avec URLs distantes)
 */
const imageUrlToBase64 = async (url: string): Promise<string> => {
    if (url.startsWith('data:image')) return url;
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('Erreur conversion image:', e);
        return '';
    }
};

// ============================================================
// REDIMENSIONNEMENT LOGO POUR PDF
// ============================================================
const resizeLogoForPDF = (src: string, size: number): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            const ratio = Math.min(size / img.width, size / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
            resolve(canvas.toDataURL('image/png', 1.0));
        };
        img.onerror = () => resolve('');
        img.src = src;
    });
};

// ============================================================
// GÉNÉRATION PDF — 8 cartes par page A4 (2 colonnes × 4 lignes)
// ============================================================
const generateCartesPDF = async (
    students: Array<{ id: string; nom: string; prenom: string; classe: string; telephone: string; photoUrl?: string }>,
    schoolName: string,
    schoolYear: string,
    schoolLogo: string | null,
    onProgress: (n: number) => void,
): Promise<void> => {
    if (!students.length) {
        throw new Error('Aucun élève sélectionné');
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const bannerH = 13;

    // ── Mise en page ────────────────────────────────────────
    const cardW   = 85;   // mm (ISO 7810 ID-1)
    const cardH   = 54;   // mm (ISO 7810 ID-1)
    const cols    = 2;
    const rowsMax = 4;
    const pageW   = 210;
    const pageH   = 297;
    const gapX    = 6;    // 6mm entre colonnes
    const gapY    = 8;    // 8mm entre lignes
    const marginX = (pageW - cols * cardW - (cols - 1) * gapX) / 2;  // centrage horizontal
    const marginY = (pageH - rowsMax * cardH - (rowsMax - 1) * gapY) / 2; // centrage vertical

    // ── Logo pré-traité ─────────────────────────────────────
    let logoData = '';
    if (schoolLogo && schoolLogo.startsWith('data:image')) {
        // 120px ≈ 10mm à 300dpi — assez grand pour être net
        logoData = await resizeLogoForPDF(schoolLogo, 120);
    }

    const total = students.length;
    let cardIndex = 0;

    for (const student of students) {
        const posOnPage = cardIndex % (cols * rowsMax);
        if (posOnPage === 0 && cardIndex > 0) {
            doc.addPage();
        }

        const col  = posOnPage % cols;
        const row  = Math.floor(posOnPage / cols);
        const x    = marginX + col * (cardW + gapX);
        const y    = marginY + row * (cardH + gapY);

        // ── Fond de la carte (Économe en encre - Bords 90°) ─────
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, cardW, cardH, 'F');
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.rect(x, y, cardW, cardH, 'S');

        // Guilloche subtile (Lignes en zigzag légères)
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.05);
        for(let i=0; i<cardH; i+=4) {
            doc.line(x, y+i, x+cardW, y+i+2);
        }

        // Ligne de bannière d'en-tête (Or)
        doc.setDrawColor(234, 179, 8);
        doc.setLineWidth(0.6);
        doc.line(x, y + bannerH, x + cardW, y + bannerH);

        // ── Logo filigrane (Watermark) ────────────────────────
        if (logoData) {
            const wmSize = 45;
            doc.saveGraphicsState();
            // @ts-ignore
            doc.setGState(new doc.GState({ opacity: 0.22 }));
            doc.addImage(logoData, 'PNG', x + (cardW - wmSize)/2, y + (cardH - wmSize)/2, wmSize, wmSize);
            doc.restoreGraphicsState();
        }

        // ── Logo Frame ────────────────────────────────────
        const logoMM_W = 12;
        const logoMM_H = 10;
        const logoX   = x + 4;
        const logoY   = y + (bannerH - logoMM_H) / 2;

        doc.setFillColor(255, 255, 255);
        doc.roundedRect(logoX - 0.5, logoY - 0.5, logoMM_W + 1, logoMM_H + 1, 1, 1, 'F');
        doc.setDrawColor(234, 179, 8);
        doc.setLineWidth(0.2);
        doc.roundedRect(logoX - 0.5, logoY - 0.5, logoMM_W + 1, logoMM_H + 1, 1, 1, 'S');

        if (logoData) {
            doc.addImage(logoData, 'PNG', logoX, logoY, logoMM_W, logoMM_H);
        } else {
            doc.setFillColor(15, 23, 42);
            doc.roundedRect(logoX, logoY, logoMM_W, logoMM_H, 1, 1, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(4);
            doc.setFont('helvetica', 'bold');
            doc.text('ID', logoX + logoMM_W / 2, logoY + 6, { align: 'center' });
        }

        // ── Titre établissement (Texte sombre pour fond blanc) ─────────────
        const txtX      = logoX + logoMM_W + 4;
        const maxNameW  = cardW - logoMM_W - 10;
        doc.setTextColor(15, 23, 42); // Bleu nuit (clair)
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        const schoolLine = (schoolName || 'ÉCOLE').toUpperCase();
        doc.text(schoolLine, txtX, y + 5);
        
        doc.setFontSize(4.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(234, 179, 8);
        doc.text(`OFFICIEL ${schoolYear}`, txtX, y + 8.5);
        
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.text(' • IDENTITÉ SCOLAIRE', txtX + doc.getTextWidth(`OFFICIEL ${schoolYear}`) + 1, y + 8.5);

        // ── QR Code Frame ─────────────────────────────────
        const qrMM    = 21;
        const qrX     = x + cardW - qrMM - 4;
        const qrY     = y + bannerH + 5;
        const qrPad   = 1.5;

        // Conteneur blanc
        doc.setFillColor(255, 255, 255);
        doc.rect(qrX - qrPad, qrY - qrPad, qrMM + qrPad * 2, qrMM + qrPad * 2, 'F');
        
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.rect(qrX - qrPad, qrY - qrPad, qrMM + qrPad * 2, qrMM + qrPad * 2, 'S');

        const qrDataURL = await buildQRDataURL(student.id);
        doc.addImage(qrDataURL, 'PNG', qrX, qrY, qrMM, qrMM, undefined, 'NONE');

        doc.setTextColor(148, 163, 184);
        doc.setFontSize(3.5);
        doc.setFont('helvetica', 'bold');
        doc.text("SCAN SÉCURISÉ", qrX + qrMM / 2, qrY + qrMM + 3, { align: 'center' });

        // ── Photo passeport ──────────────────────────────
        const photoOffsetX = 13; 
        const photoW = 18;
        const photoH = 22;
        const photoY = y + bannerH + 4;

        // Cadre photo (90°)
        doc.setFillColor(241, 245, 249);
        doc.rect(x + photoOffsetX, photoY, photoW, photoH, 'F');
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.4);
        doc.rect(x + photoOffsetX, photoY, photoW, photoH, 'S');

        if (student.photoUrl) {
            try {
                const b64 = await imageUrlToBase64(student.photoUrl);
                if (b64) {
                    doc.addImage(b64, 'JPEG', x + photoOffsetX + 0.2, photoY + 0.2, photoW - 0.4, photoH - 0.4);
                }
            } catch (err) {
                console.warn('Erreur chargement photo PDF:', err);
            }
        }

        // ── Sceau de sécurité photo
        doc.setFillColor(234, 179, 8);
        doc.circle(x + photoOffsetX + photoW - 2, photoY + photoH - 2, 1.5, 'F');
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.1);
        doc.circle(x + photoOffsetX + photoW - 2, photoY + photoH - 2, 1.5, 'S');

        // ── Infos Élève : Nom ────────────────────────────
        const infoStartX = x + photoOffsetX + photoW + 4;
        const nameMaxW   = cardW - qrMM - photoW - 19;
        const fullName   = `${student.prenom} ${student.nom}`.toUpperCase();
        
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(4);
        doc.setFont('helvetica', 'bold');
        doc.text("NOM & PRÉNOMS", infoStartX, photoY + 1);

        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fullName.length > 20 ? 8 : 9);
        const nameLines = doc.splitTextToSize(fullName, nameMaxW);
        doc.text(nameLines, infoStartX, photoY + 5);

        // ── Tags (Classe & Contact) ─────────────────────────────────
        const tagY = photoY + 13;
        
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(3.5);
        doc.text("CLASSE", infoStartX, tagY);
        
        doc.setFillColor(15, 23, 42);
        doc.rect(infoStartX, tagY + 1, 22, 5.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(student.classe, infoStartX + 11, tagY + 5.1, { align: 'center' });

        const phoneY = tagY + 10;
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(3.5);
        doc.text("CONTACT", infoStartX, phoneY);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(5);
        doc.text(student.telephone || '71517633', infoStartX, phoneY + 4);

        // ── Pied de page ──────────────────────────
        const footerH = 7;
        doc.setFillColor(0, 0, 0);
        doc.rect(x, y + cardH - footerH, cardW, footerH, 'F');
        doc.setDrawColor(234, 179, 8);
        doc.setLineWidth(0.4);
        doc.line(x, y + cardH - footerH, x + cardW, y + cardH - footerH);

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(4.5);
        doc.setFont('helvetica', 'bold');
        const disclaimer = "Si cette carte ne vous appartient pas, veuillez la retourner à l'administration.";
        doc.text(disclaimer, x + cardW / 2, y + cardH - 2.5, { align: 'center' });

        // Progression
        cardIndex++;
        onProgress(Math.round((cardIndex / total) * 100));
    }

    // ── Pied de page (toutes les pages) ───────────────────
    const nbPages = doc.getNumberOfPages();
    for (let p = 1; p <= nbPages; p++) {
        doc.setPage(p);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(160, 160, 160);
        doc.text(
            `Cartes scolaires ${schoolYear} — ${schoolName} — Page ${p}/${nbPages}`,
            105, 293, { align: 'center' }
        );
    }

    doc.save(`cartes_scolaires_${schoolYear.replace(/\//g, '-')}.pdf`);
};

// ============================================================
// PAGE PRINCIPALE
// ============================================================
export const CarteScolaire: React.FC = () => {
    const students   = useStore(s => s.students);
    const schoolName = useStore(s => s.schoolName);
    const schoolYear = useStore(s => s.schoolYear);
    const schoolLogo = useStore(s => s.schoolLogo);

    const [search,          setSearch]          = useState('');
    const [selectedClasse,  setSelectedClasse]  = useState('');
    const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
    const [generating,      setGenerating]      = useState(false);
    const [progress,        setProgress]        = useState(0);
    const [error,           setError]           = useState<string | null>(null);

    const classes = [...new Set(students.map(s => s.classe))].sort();

    const filtered = students.filter(s => {
        const matchSearch  = !search || `${s.prenom} ${s.nom} ${s.id} ${s.classe}`.toLowerCase().includes(search.toLowerCase());
        const matchClasse  = !selectedClasse || s.classe === selectedClasse;
        return matchSearch && matchClasse;
    });

    // ── Lancer la génération PDF ─────────────────────────────
    const startGeneration = useCallback(async (list: typeof students) => {
        if (generating || !list.length) return;
        setGenerating(true);
        setProgress(0);
        setError(null);
        try {
            await generateCartesPDF(list, schoolName, schoolYear, schoolLogo, setProgress);
        } catch (err) {
            console.error('[CarteScolaire] Erreur génération PDF:', err);
            setError(err instanceof Error ? err.message : 'Erreur lors de la génération du PDF');
        } finally {
            setGenerating(false);
        }
    }, [generating, schoolName, schoolYear, schoolLogo]);

    const handleGenerateAll    = () => startGeneration(filtered);
    const handleGenerateClasse = (c: string) => startGeneration(students.filter(s => s.classe === c));
    const handleGenerateOne    = (id: string) => {
        const s = students.find(st => st.id === id);
        if (s) startGeneration([s]);
    };

    // ── Rendu ────────────────────────────────────────────────
    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn pb-24">

            {/* ── Header Ultra-Premium (Toss Pattern) ─────────────────────────────────── */}
            <div className="rounded-[24px] p-6 md:p-8 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 text-white relative overflow-hidden shadow-[0_8px_30px_rgba(49,46,129,0.2)]">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/10 backdrop-blur-xl rounded-[20px] flex items-center justify-center shadow-inner">
                            <CreditCard className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">Cartes Scolaires</h2>
                            <p className="text-indigo-200 text-sm mt-1 font-medium max-w-md">
                                Format ISO 85×54 mm · QR Code niveau H
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 relative z-10">
                    {[
                        { v: students.length,               l: 'Total élèves',      color: 'bg-white/10' },
                        { v: classes.length,                l: 'Classes',           color: 'bg-purple-500/20' },
                        { v: Math.ceil(students.length / 8), l: 'Pages PDF', color: 'bg-emerald-500/20' },
                    ].map(({ v, l, color }) => (
                        <div key={l} className={`${color} backdrop-blur-md rounded-[20px] p-4 transition-colors`}>
                            <p className="text-3xl font-black text-white drop-shadow-md mb-1">{v}</p>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-wider">{l}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Filtres + bouton principal (Toss Layout) ───────────────── */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-6">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex-1 w-full space-y-4">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Rechercher un élève par nom, matricule..."
                                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-[16px] text-sm focus:ring-2 focus:ring-indigo-100 focus:bg-white outline-none font-medium transition-all"
                                />
                            </div>
                            <div className="relative sm:w-64">
                                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <select
                                    value={selectedClasse}
                                    onChange={e => setSelectedClasse(e.target.value)}
                                    className="w-full pl-11 pr-10 py-3 bg-slate-50 border-none rounded-[16px] text-sm focus:bg-white appearance-none focus:ring-2 focus:ring-indigo-100 outline-none font-medium transition-all cursor-pointer"
                                >
                                    <option value="">Toutes les classes</option>
                                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <select
                            value={selectedClasse}
                            onChange={e => setSelectedClasse(e.target.value)}
                            className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm bg-white appearance-none focus:ring-2 focus:ring-indigo-500 outline-none sm:w-44"
                        >
                            <option value="">Toutes les classes</option>
                            {classes.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <button
                        onClick={handleGenerateAll}
                        disabled={generating || filtered.length === 0}
                        className="flex items-center justify-center gap-2 px-8 py-3 bg-slate-900 hover:bg-black active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-[16px] text-sm font-bold transition-all shadow-md w-full md:w-auto h-full"
                    >
                        {generating
                            ? <><Loader2 className="w-5 h-5 animate-spin" /> {progress}%</>
                            : <><Download className="w-5 h-5" /> Générer lot PDF ({filtered.length})</>
                        }
                    </button>
                </div>

                {/* Barre de progression */}
                {generating && (
                    <div className="pt-4 mt-4 border-t border-slate-100 animate-fadeIn">
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                            <span>Construction du document PDF en cours…</span>
                            <span className="text-slate-900">{progress}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-slate-900 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Erreur */}
                {error && (
                    <div className="flex items-center gap-3 p-4 mt-4 bg-rose-50 rounded-[16px] text-sm font-bold text-rose-700 animate-fadeIn">
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                        {error}
                    </div>
                )}
            </div>

            {/* ── Génération par classe ────────────────────── */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wider">
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
                        <Filter className="w-4 h-4 text-slate-600" />
                    </div>
                    Générer rapidement par classe
                </h3>
                <div className="flex flex-wrap gap-2">
                    {classes.map(c => {
                        const count = students.filter(s => s.classe === c).length;
                        return (
                            <button
                                key={c}
                                onClick={() => handleGenerateClasse(c)}
                                disabled={generating}
                                className="group flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50 text-slate-700 rounded-[14px] text-sm font-bold transition-all"
                            >
                                <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                                {c}
                                <span className="bg-white text-slate-500 group-hover:text-slate-700 px-2 py-0.5 rounded-lg text-xs font-black shadow-sm transition-colors">{count}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="mt-5 p-4 bg-slate-50 rounded-[16px] flex items-start gap-3">
                    <Info className="w-5 h-5 text-slate-400 shrink-0" />
                    <p className="text-sm font-medium text-slate-600 leading-relaxed">
                        Le format PDF respecte les normes ISO 7810 (85×54 mm). Le QR code est encodé avec un niveau H (30% de correction d'erreurs) garantissant une lecture fiable. Rendement de 8 cartes par page A4.
                    </p>
                </div>
            </div>

            {/* ── Prévisualisation d'une carte ─────────────── */}
            {selectedStudent ? (() => {
                const s = students.find(st => st.id === selectedStudent);
                if (!s) return null;
                return (
                    <div className="bg-white rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] p-6 md:p-8 animate-fadeIn">
                        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center">
                                    <Search className="w-5 h-5 text-slate-600" />
                                </div>
                                Prévisualisation HD
                            </h3>
                            <button
                                onClick={() => setSelectedStudent(null)}
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all hover:rotate-90 duration-300"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex flex-col lg:flex-row gap-10 items-start">
                            {/* Carte */}
                            <div className="flex-shrink-0">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Aperçu ISO (85×54 mm)</p>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-[24px]">
                                    <div style={{ boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)', borderRadius:0, display:'inline-block' }} className="transition-transform hover:scale-[1.02] duration-500">
                                        <CarteEleve
                                            nom={s.nom} prenom={s.prenom} classe={s.classe} id={s.id}
                                            telephone={s.telephone}
                                            schoolName={schoolName} schoolYear={schoolYear} schoolLogo={schoolLogo}
                                            photoUrl={s.photoUrl}
                                        />
                                    </div>
                                </div>
                            </div>
                            {/* Actions */}
                            <div className="flex-1 space-y-4 min-w-[250px] w-full">
                                <div className="text-sm text-slate-700 bg-slate-50 rounded-[20px] p-5 flex items-start gap-4">
                                    <CheckCircle className="w-6 h-6 shrink-0 text-emerald-500" />
                                    <p className="font-medium leading-relaxed">
                                        <strong className="block mb-1 text-slate-900">Validation technique réussie</strong>
                                        Le QR Code généré utilise une matrice haute densité (Niveau H) offrant une résilience de 30% aux dommages.
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleGenerateOne(s.id)}
                                    disabled={generating}
                                    className="flex items-center justify-center gap-3 w-full px-6 py-4 bg-slate-900 hover:bg-black active:scale-[0.98] disabled:opacity-50 text-white rounded-[16px] text-sm font-bold transition-all shadow-[0_10px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_15px_25px_rgba(0,0,0,0.15)]"
                                >
                                    {generating
                                        ? <><Loader2 className="w-5 h-5 animate-spin" /> Rendu PDF en cours…</>
                                        : <><Printer className="w-5 h-5" /> Télécharger la carte seule (PDF)</>
                                    }
                                </button>
                                <button
                                    onClick={() => setSelectedStudent(null)}
                                    className="flex items-center justify-center w-full px-6 py-4 bg-white hover:bg-slate-50 text-slate-700 rounded-[16px] text-sm font-bold transition-all active:scale-[0.98]"
                                >
                                    Fermer
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })() : (
                /* Liste des élèves (Toss List) */
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-6">
                    <div className="flex items-center justify-between mb-6">
                        <p className="text-lg text-slate-800 font-bold flex items-center gap-3">
                            <Users className="w-5 h-5 text-slate-400" />
                            Répertoire des élèves
                        </p>
                        <span className="bg-slate-50 text-slate-600 px-4 py-1.5 rounded-full text-xs font-black">
                            {filtered.length} résultats
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[520px] overflow-y-auto pr-2 custom-scrollbar">
                        {filtered.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setSelectedStudent(s.id)}
                                className="group flex items-center gap-4 p-4 rounded-[20px] bg-slate-50 hover:bg-white hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all text-left"
                            >
                                <div className="w-12 h-12 rounded-[16px] bg-white shadow-sm flex items-center justify-center text-slate-800 text-sm font-black shrink-0 transition-transform">
                                    {s.prenom.charAt(0)}{s.nom.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[15px] font-bold text-slate-900 truncate group-hover:text-slate-700 transition-colors">{s.prenom} {s.nom}</p>
                                    <p className="text-xs font-bold text-slate-400 mt-1">{s.classe}</p>
                                </div>
                                <div className="w-10 h-10 rounded-[14px] flex items-center justify-center bg-white group-hover:bg-slate-50 shadow-sm transition-colors shrink-0">
                                    <CreditCard className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                                </div>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <div className="col-span-full text-center py-16">
                                <div className="w-20 h-20 rounded-[24px] bg-slate-50 flex items-center justify-center mx-auto mb-5">
                                    <Search className="w-10 h-10 text-slate-300" />
                                </div>
                                <p className="text-lg text-slate-600 font-bold">Aucun élève trouvé</p>
                                <p className="text-sm text-slate-400 mt-1">Modifiez vos critères de recherche</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
