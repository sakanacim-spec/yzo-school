import React from 'react';
import { BulletinEleveResultat } from '../../utils/bulletinCalculations';

interface BulletinTogoPDFProps {
    data: BulletinEleveResultat;
    schoolName: string;
    schoolLogo: string | null;
    schoolStamp?: string | null;
    schoolYear: string;
    studentPhoto?: string | null;
}

// Formatte la date du jour en français
const getDateFr = (): string => {
    const d = new Date();
    const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    return `${d.getDate()} ${mois[d.getMonth()]} ${d.getFullYear()}`;
};

export const BulletinTogoPDF = React.forwardRef<HTMLDivElement, BulletinTogoPDFProps>(
    ({ data, schoolName, schoolLogo, schoolStamp, schoolYear, studentPhoto }, ref) => {
    return (
        <div
            ref={ref}
            className="bg-white text-black mx-auto relative z-0 flex flex-col justify-between"
            style={{
                width: '210mm',
                height: '297mm',
                padding: '3mm 6mm 4mm 6mm',
                boxSizing: 'border-box',
                fontFamily: '"Times New Roman", Times, serif'
            }}
        >
            {/* FILIGRANE LOGO */}
            {schoolLogo && (
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.18] pointer-events-none z-[-1]">
                    <img src={schoolLogo} alt="Watermark" className="w-[80%] max-w-3xl object-contain grayscale" />
                </div>
            )}

            <div className="flex-1 flex flex-col">
                {/* ───────────────────────────── EN-TÊTE SANS CADRES (4 COLONNES : SCEAU | MINISTÈRE | ÉCOLE | LOGO) ───────────────────────────── */}
                <div className="mb-2">
                    <div className="flex justify-between items-start py-1 gap-2 border-b border-black pb-2">

                        {/* 1. SCEAU (Extrême Gauche) */}
                        <div className="flex-shrink-0 flex justify-start" style={{ width: '26mm' }}>
                            {schoolStamp ? (
                                <img
                                    src={schoolStamp}
                                    alt="Sceau"
                                    style={{ width: '24mm', height: '24mm', objectFit: 'contain' }}
                                />
                            ) : (
                                <div className="w-[24mm] h-[24mm] flex flex-col items-center justify-center opacity-30 border border-dashed border-gray-300">
                                    <span className="text-[10px] font-bold">SCEAU</span>
                                </div>
                            )}
                        </div>

                        {/* CONTENEUR CENTRAL SATURÉ */}
                        <div className="flex-1 flex justify-center gap-8 items-start px-2">
                             {/* 2. BLOC MINISTÈRE (Centre-Gauche) */}
                            <div className="flex-1 flex flex-col items-center text-center space-y-1.5">
                                <p className="font-bold uppercase text-[11px] tracking-widest leading-none">République Togolaise</p>
                                <p className="italic text-[9px] leading-none">Travail – Liberté – Patrie</p>
                                <div className="w-12 border-t border-black my-1"></div>
                                <p className="font-black uppercase text-[11.5px] leading-tight">Ministère de l'Éducation Nationale</p>
                                <p className="font-bold uppercase text-[10px] leading-tight">Direction Régionale de l'Éducation</p>
                                <p className="font-bold uppercase text-[10px] leading-tight">Inspection de l'Enseignement Général</p>
                            </div>

                            {/* 3. BLOC ÉTABLISSEMENT (Centre-Droite) */}
                            <div className="flex-1 flex flex-col items-center text-center space-y-1 pt-1">
                                <h2 className="font-black uppercase tracking-tight text-[18px] leading-none mb-1">
                                    {schoolName}
                                </h2>
                                <p className="italic font-black text-[11px] uppercase tracking-wider mb-0.5">Travail-Rigueur-succès</p>
                                <div className="flex flex-col text-[10px] font-bold space-y-0.5">
                                    <p>Tél: +228 90 17 79 66 / 99 41 40 47</p>
                                    <p>BP: 80159 Apéssito - TOGO</p>
                                </div>
                            </div>
                        </div>

                        {/* 4. LOGO (Extrême Droite) */}
                        <div className="flex-shrink-0 flex justify-end" style={{ width: '26mm' }}>
                            {schoolLogo ? (
                                <img
                                    src={schoolLogo}
                                    alt="Logo"
                                    style={{ width: '24mm', height: '24mm', objectFit: 'contain' }}
                                />
                            ) : (
                                <div className="w-[24mm] h-[24mm] flex flex-col items-center justify-center opacity-30 border border-dashed border-gray-300">
                                    <span className="text-[10px] font-bold">LOGO</span>
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                {/* ──────────────── IDENTIFICATION ÉLÈVE (avec photo passeport) ──────────────── */}
                <div
                    className="border-[1.5px] border-black mb-1"
                    style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0 }}
                >
                    {/* Infos élève — lignes séparées par des bordures */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>

                        {/* Ligne 1 : Nom & Prénom  |  Matricule */}
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', borderBottom: '1px solid black' }}>
                            <div className="text-[9.5px]" style={{ padding: '3px 6px', borderRight: '1px solid black' }}>
                                <span className="font-bold uppercase">Nom &amp; Prénom(s) : </span>
                                <span>{data.eleve.nom} {data.eleve.prenom}</span>
                            </div>
                            <div className="text-[9.5px]" style={{ padding: '3px 6px' }}>
                                <span className="font-bold uppercase">Matricule : </span>
                                <span>{data.eleve.adsn || 'N/A'}</span>
                            </div>
                        </div>

                        {/* Ligne 2 : Date de naissance  |  Classe */}
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', borderBottom: '1px solid black' }}>
                            <div className="text-[9.5px]" style={{ padding: '3px 6px', borderRight: '1px solid black' }}>
                                <span className="font-bold uppercase">Date de naissance : </span>
                                <span>{data.eleve.dateNaissance || 'N/A'}</span>
                            </div>
                            <div className="text-[9.5px]" style={{ padding: '3px 6px' }}>
                                <span className="font-bold uppercase">Classe : </span>
                                <span className="font-bold">{data.eleve.classe}</span>
                            </div>
                        </div>

                        {/* Ligne 3 : Sexe  |  Effectif de la classe */}
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', borderBottom: '1px solid black' }}>
                            <div className="text-[9.5px]" style={{ padding: '3px 6px', borderRight: '1px solid black' }}>
                                <span className="font-bold uppercase">Sexe : </span>
                                <span>{data.eleve.sexe === 'F' ? 'Féminin (F)' : 'Masculin (M)'}</span>
                            </div>
                            <div className="text-[9.5px]" style={{ padding: '3px 6px' }}>
                                <span className="font-bold uppercase">Effectif : </span>
                                <span className="font-bold">{data.effectifClasse} élèves</span>
                            </div>
                        </div>

                        {/* Ligne 4 : TITRE BULLETIN — occupe l'espace vide en face de la photo */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f8', borderTop: 'none' }}>
                            <div className="text-center py-1.5 px-3">
                                <p className="font-black uppercase tracking-widest text-[16px] leading-tight text-black">
                                    Bulletin de Notes du {data.periode}
                                </p>
                                <p className="text-[12px] font-bold text-gray-700 mt-1">Année Scolaire : {schoolYear}</p>
                            </div>
                        </div>
                    </div>

                    {/* CADRE PHOTO PASSEPORT — agrandi */}
                    <div
                        className="border-l-[1.5px] border-black flex-shrink-0 relative bg-[#f8f8f8]"
                        style={{ width: '35mm', minHeight: '35mm' }}
                    >
                        {studentPhoto ? (
                            <img
                                src={studentPhoto}
                                alt="Photo élève"
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        ) : (
                            <div
                                className="absolute inset-0 flex flex-col items-center justify-center w-full h-full"
                            >
                                <svg viewBox="0 0 60 80" width="44" height="56" xmlns="http://www.w3.org/2000/svg" opacity={0.28}>
                                    <circle cx="30" cy="22" r="16" fill="#555" />
                                    <ellipse cx="30" cy="70" rx="25" ry="20" fill="#555" />
                                </svg>
                                <span className="text-[8px] text-gray-400 font-bold mt-1 uppercase tracking-widest">PHOTO</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ──────────────── TABLEAU DES NOTES ──────────────── */}
                <table className="w-full border-collapse border-[1.5px] border-black text-[9px]" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '5.5%' }} />
                        <col style={{ width: '5.5%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '5.5%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '4.5%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '12%' }} />
                    </colgroup>
                    <thead>
                        <tr className="bg-gray-200 font-bold text-center">
                            <th className="border-[1.5px] border-black p-0.5">MATIÈRES</th>
                            <th className="border-[1.5px] border-black p-0.5">CL.<br/>(/20)</th>
                            <th className="border-[1.5px] border-black p-0.5">DEV.<br/>(/20)</th>
                            <th className="border-[1.5px] border-black p-0.5" style={{ fontSize: '7px' }}>MOY.<br/>CL.</th>
                            <th className="border-[1.5px] border-black p-0.5">COMP.<br/>(/20)</th>
                            <th className="border-[1.5px] border-black p-0.5">MOY.<br/>(/20)</th>
                            <th className="border-[1.5px] border-black p-0.5">COEF</th>
                            <th className="border-[1.5px] border-black p-0.5">CxF</th>
                            <th className="border-[1.5px] border-black p-0.5">RANG</th>
                            <th className="border-[1.5px] border-black p-0.5">PROFESSEUR</th>
                            <th className="border-[1.5px] border-black p-0.5">APPRÉCIATION</th>
                            <th className="border-[1.5px] border-black p-0.5">SIGNATURE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.categories.map((cat) => (
                            <React.Fragment key={cat.categorie}>
                                <tr className="bg-gray-100 font-bold">
                                    <td colSpan={12} className="border-[1.5px] border-black p-0.5 pl-1.5 text-[8.5px] uppercase">
                                        {cat.categorie}
                                    </td>
                                </tr>
                                {cat.lignes.map((l, lIndex) => (
                                    <tr key={lIndex} className="text-center">
                                        <td className="border-[1.5px] border-black p-0.5 text-left uppercase font-bold text-[10px] leading-tight">{l.matiere.nom}</td>
                                        <td className="border-[1.5px] border-black p-0.5 font-bold text-[11px]">{l.noteClasse !== null ? l.noteClasse : '-'}</td>
                                        <td className="border-[1.5px] border-black p-0.5 font-bold text-[11px]">{l.noteDevoir !== null ? l.noteDevoir : '-'}</td>
                                        <td className="border-[1.5px] border-black p-0.5 font-black text-[11px] text-blue-900 bg-blue-50">{l.moyenneClasseMatiere !== null ? l.moyenneClasseMatiere : '-'}</td>
                                        <td className="border-[1.5px] border-black p-0.5 font-bold text-[11px]">{l.noteCompo !== null ? l.noteCompo : '-'}</td>
                                        <td className="border-[1.5px] border-black p-0.5 font-black text-[12px] bg-gray-50">{l.moyenneMatiere !== null ? l.moyenneMatiere : '-'}</td>
                                        <td className="border-[1.5px] border-black p-0.5 font-bold text-[11px]">{l.coef}</td>
                                        <td className="border-[1.5px] border-black p-0.5 font-bold text-[12px] bg-gray-50">{l.totalPoints !== null ? l.totalPoints : '-'}</td>
                                        <td className="border-[1.5px] border-black p-0.5 font-bold text-[11px]">{l.rangMatiere}</td>
                                        {/* Colonne PROF : wrapping autorisé, taille réduite pour les longs noms */}
                                        <td
                                            className="border-[1.5px] border-black p-0.5 text-[9.5px] leading-tight"
                                            style={{ wordBreak: 'break-word', whiteSpace: 'normal', hyphens: 'auto' }}
                                        >
                                            {l.professeur}
                                        </td>
                                        <td className="border-[1.5px] border-black p-0.5 italic font-semibold leading-tight text-[9px]">{l.appreciation}</td>
                                        <td className="border-[1.5px] border-black p-0.5"></td>
                                    </tr>
                                ))}
                                {/* SOUS TOTAL CATÉGORIE */}
                                <tr className="bg-gray-50 font-bold border-black border-t-[1.5px]">
                                    <td colSpan={6} className="border-[1.5px] border-black p-0.5 text-right italic text-[9.5px] font-semibold">
                                        Sous-Total {cat.categorie.split('-')[1]}
                                    </td>
                                    <td className="border-[1.5px] border-black p-0.5 text-center font-bold text-[11px]">{cat.totalCoefs}</td>
                                    <td className="border-[1.5px] border-black p-0.5 text-center font-bold text-[12px] text-rose-700 bg-rose-50">{cat.totalPoints.toFixed(2)}</td>
                                    <td colSpan={4} className="border-[1.5px] border-black p-0.5"></td>
                                </tr>
                            </React.Fragment>
                        ))}
                        {/* TOTAL GÉNÉRAL */}
                        <tr className="font-black bg-gray-200 border-t-[2px] border-black text-[11px]">
                            <td colSpan={6} className="border-[1.5px] border-black p-0.5 text-right uppercase tracking-wider">TOTAL GÉNÉRAL</td>
                            <td className="border-[1.5px] border-black p-0.5 text-center text-[12px] text-blue-900">{data.totalCoefsGeneral}</td>
                            <td className="border-[1.5px] border-black p-0.5 text-center text-[13px] text-rose-900 bg-rose-100">{data.totalPointsGeneral.toFixed(2)}</td>
                            <td colSpan={4} className="border-[1.5px] border-black p-0.5"></td>
                        </tr>
                    </tbody>
                </table>

                {/* ═══════════════ RÉSULTATS + APPRÉCIATIONS ═══════════════ */}
                <div className="border-[1.5px] border-black mt-1" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', minHeight: '30mm' }}>

                    {/* COLONNE GAUCHE : Résultats et Statistiques */}
                    <div style={{ borderRight: '1.5px solid black', display: 'flex', flexDirection: 'column', flex: 1 }}>

                        {/* 1. TABLEAU DES RÉSULTATS (HORIZONTAL 6 COLONNES - Demande USER) */}
                        <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1.5px solid black' }}>
                            {/* LIGNE 1 : EN-TÊTES (6 COLONNES) */}
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(6, 1fr)', 
                                background: '#e5e5e5', 
                                borderBottom: '1.5px solid black',
                                textAlign: 'center',
                                fontWeight: '900',
                                fontSize: '8px'
                            }}>
                                {(() => {
                                    const isTrim = data.periode.includes('TRIMESTRE');
                                    if (isTrim) {
                                        return (
                                            <>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>TRIM.1</div>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>RANG</div>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>TRIM.2</div>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>RANG</div>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>TRIM.3</div>
                                                <div style={{ padding: '2px' }}>RANG</div>
                                            </>
                                        );
                                    } else {
                                        return (
                                            <>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>SEM.1</div>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>RANG</div>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>SEM.2</div>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>RANG</div>
                                                <div style={{ padding: '2px', borderRight: '1px solid black' }}>MOY. ANN</div>
                                                <div style={{ padding: '2px' }}>RANG</div>
                                            </>
                                        );
                                    }
                                })()}
                            </div>

                            {/* LIGNE 2 : VALEURS (6 COLONNES) */}
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(6, 1fr)', 
                                textAlign: 'center',
                                fontWeight: '900',
                                fontSize: '10.5px'
                            }}>
                                {(() => {
                                    const isTrim = data.periode.includes('TRIMESTRE');
                                    const cycle = isTrim 
                                        ? ['TRIMESTRE 1', 'TRIMESTRE 2', 'TRIMESTRE 3'] 
                                        : ['SEMESTRE 1', 'SEMESTRE 2'];

                                    const nodes = [];
                                    cycle.forEach((pName, idx) => {
                                        const detail = data.periodesDetails?.find(d => d.periode === pName);
                                        const isCurrent = data.periode === pName;
                                        
                                        nodes.push(
                                            <div key={`${pName}-moy`} style={{ 
                                                padding: '4px 2px', borderRight: '1px solid black', 
                                                color: '#9f1239', background: isCurrent ? '#fff1f2' : 'transparent' 
                                            }}>
                                                {detail ? detail.moyenne.toFixed(2) : '-'}
                                            </div>
                                        );
                                        nodes.push(
                                            <div key={`${pName}-rang`} style={{ 
                                                padding: '4px 2px', borderRight: idx === 2 && isTrim ? 'none' : (idx === 1 && !isTrim ? '1px solid black' : '1px solid black'), 
                                                color: '#1e40af', background: isCurrent ? '#eff6ff' : 'transparent' 
                                            }}>
                                                {detail ? detail.rang : '-'}
                                            </div>
                                        );
                                    });

                                    // Si semestre, ajouter Moyenne Annuelle pour remplir les 6 colonnes
                                    if (!isTrim) {
                                        nodes.push(
                                            <div key="moy-ann" style={{ padding: '4px 2px', borderRight: '1px solid black', color: '#4338ca', background: '#f5f3ff' }}>
                                                {data.moyenneAnnuelle ? data.moyenneAnnuelle.toFixed(2) : '-'}
                                            </div>
                                        );
                                        nodes.push(
                                            <div key="rang-ann" style={{ padding: '4px 2px', color: '#4338ca', background: '#f5f3ff' }}>
                                                {data.rangAnnuel || '-'}
                                            </div>
                                        );
                                    }

                                    return nodes;
                                })()}
                            </div>
                        </div>

                        {/* 2. STATISTIQUES EXPLICITES DE LA CLASSE (Les informations importantes) */}
                        <div className="p-2 flex-col justify-center space-y-2 flex-1 bg-[#f8f9fa]">
                            <div className="flex justify-between items-end border-b border-gray-200 pb-0.5">
                                <span className="uppercase text-[11px] font-black text-black">Moyenne Générale :</span>
                                <span className="font-black text-[14px] text-rose-800 leading-none">{data.moyenneGenerale.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-end border-b border-gray-200 pb-0.5 mb-1">
                                <span className="uppercase text-[11px] font-black text-black">Rang :</span>
                                <span className="font-black text-[14px] text-blue-800 leading-none">{data.rangGeneral} <span className="text-[10px] font-normal text-gray-500">/ {data.effectifClasse}</span></span>
                            </div>
                            <div className="flex justify-between items-end border-b border-gray-200 pb-0.5">
                                <span className="text-[10px] font-bold text-gray-800">Plus forte moyenne :</span>
                                <span className="font-black text-[12.5px] text-emerald-700 leading-none">{data.moyenneMax.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-end border-b border-gray-200 pb-0.5">
                                <span className="text-[10px] font-bold text-gray-800">Plus faible moyenne :</span>
                                <span className="font-black text-[12.5px] text-red-700 leading-none">{data.moyenneMin.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-bold text-gray-800">Moyenne générale de la classe :</span>
                                <span className="font-black text-[12.5px] text-blue-700 leading-none">{data.moyenneClasse.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-end pt-1 border-t border-gray-300 mt-2">
                                <div className="flex gap-6">
                                    <span className="text-[10px] font-bold text-red-700 uppercase">Absences : <span className="text-[13px]">{data.absences ?? 0}</span></span>
                                    <span className="text-[10px] font-bold text-orange-700 uppercase">Retards : <span className="text-[13px]">{data.retards ?? 0}</span></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* COLONNE DROITE : Appréciation (Cases rondes) */}
                    <div style={{ width: '38mm', display: 'flex', flexDirection: 'column' }}>
                        <div className="text-[8px] font-black uppercase text-center" style={{ padding: '2px 4px', background: '#e5e5e5', borderBottom: '1.5px solid black' }}>
                            APPRÉCIATION
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', padding: '3px 6px' }}>
                            {[
                                { label: 'Très Bien',    min: 16 },
                                { label: 'Bien',         min: 14 },
                                { label: 'Assez Bien',   min: 12 },
                                { label: 'Passable',     min: 10 },
                                { label: 'Insuffisant',  min: 8 },
                                { label: 'Faible',       min: 5 },
                                { label: 'Médiocre',     min: 0 },
                            ].map(({ label, min }, i, arr) => {
                                const max = arr[i - 1]?.min ?? 21;
                                const checked = data.moyenneGenerale >= min && data.moyenneGenerale < max;
                                return (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <div style={{
                                            width: 9, height: 9, borderRadius: '50%',
                                            border: '1.5px solid black',
                                            background: checked ? '#1a1a1a' : 'white',
                                            flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {checked && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'white' }} />}
                                        </div>
                                        <span className={`text-[8px] ${checked ? 'font-black' : 'font-semibold text-gray-600'}`}>{label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* DÉCISION DU CONSEIL */}
                <div className="mt-1.5 mb-1 px-1 flex items-end overflow-hidden whitespace-nowrap">
                    <span className="text-[10px] font-bold mr-1 flex-shrink-0">Décision du conseil :</span>
                    <span className="text-[10px] tracking-widest text-black">...................................................................................................................................................................................</span>
                </div>

                {/* DÉCISIONS & SIGNATURES */}
                <div className="grid grid-cols-2 gap-4 mt-1" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="border-[1.5px] border-black relative" style={{ height: '15mm' }}>
                        <div className="text-[8px] font-black uppercase text-center border-b-[1.5px] border-black" style={{ padding: '2px' }}>LE TITULAIRE DE CLASSE</div>
                        <p className="italic text-gray-400 font-normal absolute bottom-1 w-full left-0 text-center text-[7.5px]">Cachet et signature</p>
                    </div>
                    <div className="border-[1.5px] border-black relative" style={{ height: '15mm' }}>
                        <div className="text-[8px] font-black uppercase text-center border-b-[1.5px] border-black" style={{ padding: '2px' }}>LE DIRECTEUR / PROVISEUR</div>
                        <p className="italic text-gray-400 font-normal absolute bottom-1 w-full left-0 text-center text-[7.5px]">Sceau et signature</p>
                    </div>
                </div>

                {/* ──────────── PIED DE PAGE ──────────── */}
                <div className="mt-2 flex justify-between items-end">
                    {/* Mention légale */}
                    <p className="text-[7.5px] italic text-gray-400 max-w-[55%]">
                        Ce bulletin est unique et aucune copie ne sera délivrée. À conserver précieusement par le parent ou tuteur.
                    </p>
                    {/* Date de création — plus grande, en bas de page */}
                    <p className="text-[11px] font-bold text-black text-right">
                        Fait à Apessito, le {getDateFr()}
                    </p>
                </div>
            </div>
        </div>
    );
});
