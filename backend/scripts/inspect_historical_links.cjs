/**
 * Script d'Inventaire en Lecture Seule des Rattachements Historiques (P26-B Lot 1)
 * 
 * RÈGLES DE SÉCURITÉ :
 * 1. Strictement en LECTURE SEULE (aucune mutation SQL).
 * 2. Aucune donnée à caractère personnel (nom, prénom, numéro de téléphone clair) n'est affichée dans les logs.
 * 3. Seuls des agrégats, pourcentages et métriques anonymisées sont produits.
 */
'use strict';

const { supabase } = require('../utils/supabase');

async function inspectHistoricalLinks() {
    console.log('================================================================');
    console.log('🔍 YZIOW P26-B — INVENTAIRE EN LECTURE SEULE DES LIENS PARENT-ÉLÈVE');
    console.log('================================================================\n');

    try {
        // 1. Lister les écoles actives
        const { data: schools, error: schoolErr } = await supabase
            .from('schools')
            .select('slug, name')
            .order('slug');

        if (schoolErr) {
            console.error('❌ Erreur lors de la récupération des établissements :', schoolErr.message);
            process.exit(1);
        }

        console.log(`📊 Nombre d'établissements recensés : ${schools?.length || 0}\n`);

        let globalStats = {
            totalLinks: 0,
            schoolsWithLinks: 0,
            phoneExactMatches: 0,
            phoneMismatches: 0,
            linksWithPriorPayments: 0,
            linksWithoutPayments: 0
        };

        for (const school of schools || []) {
            const slug = school.slug;
            const tableName = `parent_student_${slug}`;

            // Récupérer les liens de cette école
            const { data: links, error: lErr } = await supabase
                .from(tableName)
                .select('parent_id, student_id');

            if (lErr) {
                // Table non existante ou vide
                continue;
            }

            if (!links || links.length === 0) {
                continue;
            }

            globalStats.schoolsWithLinks++;
            globalStats.totalLinks += links.length;

            let schoolPhoneMatches = 0;
            let schoolPhoneMismatches = 0;
            let schoolPaymentsCount = 0;

            // Charger les profils parents et élèves pour comparaison anonymisée
            const parentIds = [...new Set(links.map(l => l.parent_id))];
            const studentIds = [...new Set(links.map(l => l.student_id))];

            const { data: profiles } = await supabase
                .from(`profiles_${slug}`)
                .select('id, phone_normalized')
                .in('id', parentIds);

            const { data: students } = await supabase
                .from(`students_${slug}`)
                .select('id, telephone_parent_normalized')
                .in('id', studentIds);

            const { data: payments } = await supabase
                .from(`payments_${slug}`)
                .select('student_id')
                .in('student_id', studentIds);

            const profilesMap = new Map((profiles || []).map(p => [p.id, p.phone_normalized]));
            const studentsMap = new Map((students || []).map(s => [s.id, s.telephone_parent_normalized]));
            const paidStudentIds = new Set((payments || []).map(p => p.student_id));

            for (const link of links) {
                const parentPhone = profilesMap.get(link.parent_id);
                const studentParentPhone = studentsMap.get(link.student_id);

                if (parentPhone && studentParentPhone && parentPhone === studentParentPhone) {
                    schoolPhoneMatches++;
                    globalStats.phoneExactMatches++;
                } else {
                    schoolPhoneMismatches++;
                    globalStats.phoneMismatches++;
                }

                if (paidStudentIds.has(link.student_id)) {
                    schoolPaymentsCount++;
                    globalStats.linksWithPriorPayments++;
                } else {
                    globalStats.linksWithoutPayments++;
                }
            }

            console.log(`🏫 Établissement [${slug}] :`);
            console.log(`   - Liens existants               : ${links.length}`);
            console.log(`   - Concordance E.164 exacte      : ${schoolPhoneMatches} (${Math.round((schoolPhoneMatches / links.length) * 100)}%)`);
            console.log(`   - Discordance téléphonique      : ${schoolPhoneMismatches} (${Math.round((schoolPhoneMismatches / links.length) * 100)}%)`);
            console.log(`   - Avec antécédent de paiement   : ${schoolPaymentsCount} (${Math.round((schoolPaymentsCount / links.length) * 100)}%)\n`);
        }

        console.log('================================================================');
        console.log('📈 SYNTHÈSE GLOBALE EN LECTURE SEULE :');
        console.log(`- Total de liens recensés          : ${globalStats.totalLinks}`);
        console.log(`- Établissements avec des liens    : ${globalStats.schoolsWithLinks}`);
        console.log(`- Taux de concordance téléphonique : ${globalStats.totalLinks > 0 ? Math.round((globalStats.phoneExactMatches / globalStats.totalLinks) * 100) : 0}% (${globalStats.phoneExactMatches}/${globalStats.totalLinks})`);
        console.log(`- Taux avec paiement antérieur     : ${globalStats.totalLinks > 0 ? Math.round((globalStats.linksWithPriorPayments / globalStats.totalLinks) * 100) : 0}% (${globalStats.linksWithPriorPayments}/${globalStats.totalLinks})`);
        console.log('================================================================\n');

        return globalStats;

    } catch (err) {
        console.error('❌ Erreur générale lors de l\'inventaire :', err.message);
        process.exit(1);
    }
}

if (require.main === module) {
    inspectHistoricalLinks().then(() => process.exit(0));
}

module.exports = { inspectHistoricalLinks };
