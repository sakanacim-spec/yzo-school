import { Student, Note, ClasseMatiere, Matiere, PeriodeType, MatiereCategorie } from '../types';

export interface MatiereLigneResultat {
    matiere: Matiere;
    professeur: string;
    coef: number;
    noteClasse: number | null;
    noteDevoir: number | null;
    moyenneClasseMatiere: number | null;
    noteCompo: number | null;
    moyenneMatiere: number | null;
    totalPoints: number | null;
    appreciation: string;
    rangMatiere: string; // Ex: 1er, 2ème
}

export interface CategorieResultat {
    categorie: MatiereCategorie;
    lignes: MatiereLigneResultat[];
    totalCoefs: number;
    totalPoints: number;
    moyenneCategorie: number | null;
}

export interface BulletinEleveResultat {
    eleve: Student;
    periode: PeriodeType;
    categories: CategorieResultat[];
    totalCoefsGeneral: number;
    totalPointsGeneral: number;
    moyenneGenerale: number;
    rangGeneral: string;
    effectifClasse: number;
    moyenneClasse: number;
    moyenneMin: number;
    moyenneMax: number;
    // Cumul annuel (disponible à partir du 2ème trimestre/semestre)
    moyenneAnnuelle?: number | null;
    rangAnnuel?: string | null;
    moyenneAnnuelleClasse?: number | null;
    periodesIncluses?: string[]; // Ex: ['TRIMESTRE 1', 'TRIMESTRE 2']
    periodesDetails?: {
        periode: string;
        moyenne: number;
        rang: string;
        absences: number;
        retards: number;
        effectif: number;
    }[];
    absences?: number;
    retards?: number;
}

const formatRang = (rank: number): string => {
    if (rank === 1) return '1er';
    return `${rank}ème`;
};

const getAppreciation = (moy: number): string => {
    if (moy >= 16) return 'Très Bien';
    if (moy >= 14) return 'Bien';
    if (moy >= 12) return 'Assez Bien';
    if (moy >= 10) return 'Passable';
    if (moy >= 8) return 'Insuffisant';
    if (moy >= 5) return 'Faible';
    return 'Médiocre';
};

/**
 * Retourne les périodes précédentes à prendre en compte pour le cumul annuel.
 * T1 ⇒ [] (pas de cumul), T2 ⇒ [T1], T3 ⇒ [T1, T2]
 * S1 ⇒ [] (pas de cumul), S2 ⇒ [S1]
 */
const getPeriodesAntérieures = (periode: PeriodeType): PeriodeType[] => {
    switch (periode) {
        case 'TRIMESTRE 3': return ['TRIMESTRE 1', 'TRIMESTRE 2'];
        case 'SEMESTRE 2':  return ['SEMESTRE 1'];
        default:            return [];
    }
};

/**
 * Calcule tous les bulletins pour une classe et une période donnée.
 * Permet de déterminer les rangs (Matière & Général) et les moyennes annuelles cumulées.
 */
export const calculerBulletinsClasse = (
    classe: string, 
    periode: PeriodeType,
    students: Student[],
    matieres: Matiere[],
    classeMatieres: ClasseMatiere[],
    notes: Note[],
    presences: any[] = []
): BulletinEleveResultat[] => {
    
    const elevesDeLaClasse = students.filter(s => s.classe === classe);
    const configsMatiere = classeMatieres.filter(cm => cm.classe === classe);
    
    // 1. Calcul des moyennes par matière pour chaque élève
    // Structure: [eleveId][matiereId] = moyenne
    const matricesMoyennesMatieres: Record<string, Record<string, number>> = {};
    
    const bulletinsBruts: BulletinEleveResultat[] = elevesDeLaClasse.map(eleve => {
        matricesMoyennesMatieres[eleve.id] = {};
        
        let totalCoefsGen = 0;
        let totalPointsGen = 0;

        const categoriesMap = new Map<MatiereCategorie, CategorieResultat>();
        const categoriesOrder: MatiereCategorie[] = ['1-MATIERES LITTERAIRES', '2-MATIERES SCIENTIFIQUES', '3-AUTRES MATIERES'];
        
        categoriesOrder.forEach(cat => categoriesMap.set(cat, {
            categorie: cat,
            lignes: [],
            totalCoefs: 0,
            totalPoints: 0,
            moyenneCategorie: null
        }));

        configsMatiere.forEach(cm => {
            const mat = matieres.find(m => m.id === cm.matiereId);
            if (!mat) return;

            const n = notes.find(x => x.eleveId === eleve.id && x.matiereId === cm.matiereId && x.periode === periode);
            
            const nc = n?.noteClasse ?? null;
            const nd = n?.noteDevoir ?? null;
            const nc_compo = n?.noteCompo ?? null;

            let avgMatiere: number | null = null;
            let moyClasseMat: number | null = null;
            
            // Calculer "Moyenne de classe" : (cl. + dev.) / 2
            const notesEvaluations = [nc, nd].filter(x => x !== null) as number[];
            if (notesEvaluations.length > 0) {
                moyClasseMat = notesEvaluations.reduce((a,b) => a+b, 0) / notesEvaluations.length;
            }

            // Calculer "Moyenne Matière" : (moyClasseMat + compo) / 2
            const paramPourMoyenne = [moyClasseMat, nc_compo].filter(x => x !== null) as number[];
            if (paramPourMoyenne.length > 0) {
                avgMatiere = paramPourMoyenne.reduce((a,b) => a+b, 0) / paramPourMoyenne.length;
                matricesMoyennesMatieres[eleve.id][mat.id] = avgMatiere;
            }

            let pts: number | null = null;
            if (avgMatiere !== null) {
                pts = avgMatiere * cm.coefficient;
                totalCoefsGen += cm.coefficient;
                totalPointsGen += pts;
            }

            categoriesMap.get(mat.categorie)!.lignes.push({
                matiere: mat,
                professeur: cm.professeur || '',
                coef: cm.coefficient,
                noteClasse: nc,
                noteDevoir: nd,
                moyenneClasseMatiere: moyClasseMat ? parseFloat(moyClasseMat.toFixed(2)) : null,
                noteCompo: nc_compo,
                moyenneMatiere: avgMatiere ? parseFloat(avgMatiere.toFixed(2)) : null,
                totalPoints: pts ? parseFloat(pts.toFixed(2)) : null,
                appreciation: avgMatiere !== null ? getAppreciation(avgMatiere) : '',
                rangMatiere: '' // sera calculé après
            });
        });

        // Calcul des totaux par catégorie
        Array.from(categoriesMap.values()).forEach(cat => {
            cat.lignes.forEach(l => {
                if (l.totalPoints !== null && l.moyenneMatiere !== null) {
                    cat.totalCoefs += l.coef;
                    cat.totalPoints += l.totalPoints;
                }
            });
            if (cat.totalCoefs > 0) {
                cat.moyenneCategorie = parseFloat((cat.totalPoints / cat.totalCoefs).toFixed(2));
            }
        });

        const moyGen = totalCoefsGen > 0 ? (totalPointsGen / totalCoefsGen) : 0;

        return {
            eleve,
            periode,
            categories: Array.from(categoriesMap.values()).filter(c => c.lignes.length > 0),
            totalCoefsGeneral: totalCoefsGen,
            totalPointsGeneral: parseFloat(totalPointsGen.toFixed(2)),
            moyenneGenerale: parseFloat(moyGen.toFixed(2)),
            rangGeneral: '',
            effectifClasse: elevesDeLaClasse.length,
            moyenneClasse: 0,
            moyenneMin: 0,
            moyenneMax: 0,
            absences: presences.filter(p => p.eleveId === eleve.id && p.statut === 'absent').length,
            retards: presences.filter(p => p.eleveId === eleve.id && p.statut === 'retard').length
        };
    });

    // --- 2. Détermination des rangs ---
    
    // a. Rangs Généraux
    const sortedByMoyGen = [...bulletinsBruts].sort((a,b) => b.moyenneGenerale - a.moyenneGenerale);
    const moyennesClasses = sortedByMoyGen.map(b => b.moyenneGenerale);
    const moyenneClasseTotale = moyennesClasses.length > 0 ? moyennesClasses.reduce((a,b)=>a+b, 0) / moyennesClasses.length : 0;
    const moyMin = moyennesClasses.length > 0 ? Math.min(...moyennesClasses) : 0;
    const moyMax = moyennesClasses.length > 0 ? Math.max(...moyennesClasses) : 0;

    sortedByMoyGen.forEach((b, index) => {
        b.rangGeneral = formatRang(index + 1);
        b.moyenneClasse = parseFloat(moyenneClasseTotale.toFixed(2));
        b.moyenneMin = moyMin;
        b.moyenneMax = moyMax;
    });

    // --- 3. Calcul des moyennes annuelles cumulées et Historique ---
    const periodesAnterieures = getPeriodesAntérieures(periode);
    const toutesLesPeriodes = [...periodesAnterieures, periode];

    // Initialiser periodesDetails pour chaque bulletin
    bulletinsBruts.forEach(b => {
        b.periodesDetails = [];
    });

    if (periodesAnterieures.length > 0) {
        // Pour chaque période antérieure, on doit calculer les moyennes et rangs de TOUTE la classe
        // afin d'avoir le "Rang" de l'élève pour cette période passée.
        periodesAnterieures.forEach(p => {
            const moysElevesPeriod: { id: string, moy: number, abs: number, ret: number }[] = elevesDeLaClasse.map(e => {
                let totalPts = 0;
                let totalCoefs = 0;
                configsMatiere.forEach(cm => {
                    const n = notes.find(x => x.eleveId === e.id && x.matiereId === cm.matiereId && x.periode === p);
                    if (n) {
                        const nc = n.noteClasse ?? null;
                        const nd = n.noteDevoir ?? null;
                        const nc_compo = n.noteCompo ?? null;
                        
                        let moyClasseMat = null;
                        const evalNotes = [nc, nd].filter(x => x !== null) as number[];
                        if(evalNotes.length > 0) moyClasseMat = evalNotes.reduce((a,v) => a+v, 0) / evalNotes.length;

                        const finalNotes = [moyClasseMat, nc_compo].filter(x => x !== null) as number[];
                        if (finalNotes.length > 0) {
                            const avg = finalNotes.reduce((a, v) => a + v, 0) / finalNotes.length;
                            totalPts += avg * cm.coefficient;
                            totalCoefs += cm.coefficient;
                        }
                    }
                });
                
                const absences = presences.filter(pr => pr.eleveId === e.id && pr.statut === 'absent' && pr.periode === p).length;
                const retards = presences.filter(pr => pr.eleveId === e.id && pr.statut === 'retard' && pr.periode === p).length;

                return { 
                    id: e.id, 
                    moy: totalCoefs > 0 ? parseFloat((totalPts / totalCoefs).toFixed(2)) : 0,
                    abs: absences,
                    ret: retards
                };
            });

            // Trier pour avoir les rangs de la période p
            const sorted = [...moysElevesPeriod].sort((a,b) => b.moy - a.moy);
            
            bulletinsBruts.forEach(b => {
                const result = moysElevesPeriod.find(m => m.id === b.eleve.id);
                if (result) {
                    const rankIndex = sorted.findIndex(s => s.id === b.eleve.id);
                    b.periodesDetails?.push({
                        periode: p,
                        moyenne: result.moy,
                        rang: formatRang(rankIndex + 1),
                        absences: result.abs,
                        retards: result.ret,
                        effectif: elevesDeLaClasse.length
                    });
                }
            });
        });
    }

    // Ajouter la période actuelle dans les détails
    bulletinsBruts.forEach(b => {
        b.periodesDetails?.push({
            periode: b.periode,
            moyenne: b.moyenneGenerale,
            rang: b.rangGeneral,
            absences: b.absences ?? 0,
            retards: b.retards ?? 0,
            effectif: b.effectifClasse
        });

        // Calcul de la moyenne annuelle à partir des détails
        if (b.periodesDetails && b.periodesDetails.length > 1) {
            const sum = b.periodesDetails.reduce((acc, curr) => acc + curr.moyenne, 0);
            b.moyenneAnnuelle = parseFloat((sum / b.periodesDetails.length).toFixed(2));
            b.periodesIncluses = b.periodesDetails.map(d => d.periode);
        }
    });

    // Calculer les rangs annuels si on a plus d'une période
    if (periodesAnterieures.length > 0) {
        const sortedByAnn = [...bulletinsBruts]
            .filter(b => b.moyenneAnnuelle != null)
            .sort((a, b) => (b.moyenneAnnuelle ?? 0) - (a.moyenneAnnuelle ?? 0));

        const moysAnn = sortedByAnn.map(b => b.moyenneAnnuelle ?? 0);
        const moyAnnClasse = moysAnn.length > 0 ? moysAnn.reduce((a, v) => a + v, 0) / moysAnn.length : 0;

        sortedByAnn.forEach((b, idx) => {
            b.rangAnnuel = formatRang(idx + 1);
            b.moyenneAnnuelleClasse = parseFloat(moyAnnClasse.toFixed(2));
        });
    }

    // --- 4. Rangs par Matières ---
    configsMatiere.forEach(cm => {
        const matId = cm.matiereId;
        const eleveScores: { id: string, note: number }[] = [];
        
        Object.keys(matricesMoyennesMatieres).forEach(eId => {
            if (matricesMoyennesMatieres[eId][matId] !== undefined) {
                eleveScores.push({ id: eId, note: matricesMoyennesMatieres[eId][matId] });
            }
        });

        eleveScores.sort((a,b) => b.note - a.note); // décroissant

        eleveScores.forEach((score, rankIndex) => {
            // retrouver le bulletin et injecter le rang
            const b = bulletinsBruts.find(x => x.eleve.id === score.id);
            if (b) {
                b.categories.forEach(cat => {
                    const ligne = cat.lignes.find(l => l.matiere.id === matId);
                    if (ligne) ligne.rangMatiere = formatRang(rankIndex + 1);
                });
            }
        });
    });

    // Retourner les bulletins triés par ordre alphabétique ou mérite. Gardons alphabétique.
    return bulletinsBruts.sort((a,b) => a.eleve.nom.localeCompare(b.eleve.nom));
};
