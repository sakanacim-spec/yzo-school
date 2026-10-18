'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationSqlPath = path.resolve(__dirname, '../scripts/migration_p27_parent_pack_reconciliation_defense.sql');

/**
 * Simulation déterministe de l'arithmétique calendaire PostgreSQL :
 * date + make_interval(months => M) - INTERVAL '1 day'
 *
 * En PostgreSQL :
 * - '2027-01-31'::date + make_interval(months => 1) = '2027-02-28'
 * - '2027-01-31'::date + make_interval(months => 2) = '2027-03-31'
 * - '2027-01-31'::date + make_interval(months => 3) = '2027-04-30'
 * - '2027-01-31'::date + make_interval(months => 4) = '2027-05-31'
 * - '2028-01-31'::date + make_interval(months => 1) = '2028-02-29' (année bissextile)
 * - '2028-01-31'::date + make_interval(months => 2) = '2028-03-31'
 * - '2027-08-31'::date + make_interval(months => 1) = '2027-09-30'
 * - '2027-08-31'::date + make_interval(months => 2) = '2027-10-31'
 */
function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function daysInMonth(year, month) {
    // month est 1-indexé (1 = janvier, 12 = décembre)
    const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return days[month - 1];
}

function pgAddMonths(dateStr, monthsToAdd) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const totalMonths = (y * 12 + (m - 1)) + monthsToAdd;
    const newYear = Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    const maxDays = daysInMonth(newYear, newMonth);
    const newDay = Math.min(d, maxDays);
    return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
}

function calculateNextPeriod({ previousMaxEndDate, certifiedPaymentAtDate, durationMonths, subscriptionAnchorDate, subscriptionCumulativeMonths }) {
    let startDate;
    let anchorDate;
    let cumulativeMonths;

    // Condition continue : si le max_end_date précédent est contigu ou futur
    const nextDayAfterMax = previousMaxEndDate ? addDays(previousMaxEndDate, 1) : null;
    const isContinuous = previousMaxEndDate && (nextDayAfterMax >= certifiedPaymentAtDate);

    if (isContinuous) {
        startDate = nextDayAfterMax;
        anchorDate = subscriptionAnchorDate || startDate;
        cumulativeMonths = (subscriptionCumulativeMonths || 0) + durationMonths;
    } else {
        startDate = certifiedPaymentAtDate;
        anchorDate = startDate;
        cumulativeMonths = durationMonths;
    }

    // end_date := (anchorDate + make_interval(months => cumulativeMonths) - INTERVAL '1 day')
    const anniversaryRenewalDate = pgAddMonths(anchorDate, cumulativeMonths);
    const endDate = addDays(anniversaryRenewalDate, -1);

    return {
        startDate,
        endDate,
        anchorDate,
        cumulativeMonths,
        anniversaryRenewalDate
    };
}

test('Parent Pack - Logique de calcul des dates anniversaires et renouvellements', async (t) => {
    await t.test('1. Vérification statique de la migration P27 pour les dates anniversaires', () => {
        const sql = fs.readFileSync(migrationSqlPath, 'utf8');

        // Colonnes d'ancrage
        assert.match(sql, /ALTER TABLE public\.parent_subscriptions[\s\S]+?ADD COLUMN IF NOT EXISTS billing_anchor_date DATE/);
        assert.match(sql, /ADD COLUMN IF NOT EXISTS cumulative_months INTEGER NOT NULL DEFAULT 0/);

        // Variables et logique
        assert.match(sql, /v_anchor_date DATE;/);
        assert.match(sql, /v_cumulative_months INTEGER;/);
        assert.match(sql, /WITH RECURSIVE chain/);
        assert.match(sql, /make_interval\(months => v_cumulative_months\)/);
        assert.match(sql, /billing_anchor_date = v_anchor_date/);
        assert.match(sql, /cumulative_months = v_cumulative_months/);
    });

    await t.test('2. Achat le 15 février → renouvellement le 15 mars', () => {
        // Mois 1 : Achat 15 février 2027
        const p1 = calculateNextPeriod({
            previousMaxEndDate: null,
            certifiedPaymentAtDate: '2027-02-15',
            durationMonths: 1,
            subscriptionAnchorDate: null,
            subscriptionCumulativeMonths: 0
        });
        assert.strictEqual(p1.startDate, '2027-02-15');
        assert.strictEqual(p1.endDate, '2027-03-14');
        assert.strictEqual(p1.anniversaryRenewalDate, '2027-03-15', 'Renouvellement exact au 15 mars');
        assert.strictEqual(p1.anchorDate, '2027-02-15');
        assert.strictEqual(p1.cumulativeMonths, 1);

        // Mois 2 : Renouvellement à l'échéance le 15 mars 2027
        const p2 = calculateNextPeriod({
            previousMaxEndDate: p1.endDate,
            certifiedPaymentAtDate: '2027-03-15',
            durationMonths: 1,
            subscriptionAnchorDate: p1.anchorDate,
            subscriptionCumulativeMonths: p1.cumulativeMonths
        });
        assert.strictEqual(p2.startDate, '2027-03-15');
        assert.strictEqual(p2.endDate, '2027-04-14');
        assert.strictEqual(p2.anniversaryRenewalDate, '2027-04-15', 'Renouvellement suivant au 15 avril');
        assert.strictEqual(p2.anchorDate, '2027-02-15');
        assert.strictEqual(p2.cumulativeMonths, 2);
    });

    await t.test('3. Achat le 31 janvier 2027 → 28 février, puis 31 mars, 30 avril, 31 mai', () => {
        // Mois 1 : Achat 31 janvier 2027
        const m1 = calculateNextPeriod({
            previousMaxEndDate: null,
            certifiedPaymentAtDate: '2027-01-31',
            durationMonths: 1,
            subscriptionAnchorDate: null,
            subscriptionCumulativeMonths: 0
        });
        assert.strictEqual(m1.startDate, '2027-01-31');
        assert.strictEqual(m1.endDate, '2027-02-27');
        assert.strictEqual(m1.anniversaryRenewalDate, '2027-02-28', 'Échéance 1 : 28 février');
        assert.strictEqual(m1.anchorDate, '2027-01-31');
        assert.strictEqual(m1.cumulativeMonths, 1);

        // Mois 2 : Renouvellement le 28 février 2027
        const m2 = calculateNextPeriod({
            previousMaxEndDate: m1.endDate,
            certifiedPaymentAtDate: '2027-02-28',
            durationMonths: 1,
            subscriptionAnchorDate: m1.anchorDate,
            subscriptionCumulativeMonths: m1.cumulativeMonths
        });
        assert.strictEqual(m2.startDate, '2027-02-28');
        assert.strictEqual(m2.endDate, '2027-03-30');
        assert.strictEqual(m2.anniversaryRenewalDate, '2027-03-31', 'Échéance 2 : 31 mars (jour 31 restauré)');
        assert.strictEqual(m2.anchorDate, '2027-01-31');
        assert.strictEqual(m2.cumulativeMonths, 2);

        // Mois 3 : Renouvellement le 31 mars 2027
        const m3 = calculateNextPeriod({
            previousMaxEndDate: m2.endDate,
            certifiedPaymentAtDate: '2027-03-31',
            durationMonths: 1,
            subscriptionAnchorDate: m2.anchorDate,
            subscriptionCumulativeMonths: m2.cumulativeMonths
        });
        assert.strictEqual(m3.startDate, '2027-03-31');
        assert.strictEqual(m3.endDate, '2027-04-29');
        assert.strictEqual(m3.anniversaryRenewalDate, '2027-04-30', 'Échéance 3 : 30 avril');
        assert.strictEqual(m3.anchorDate, '2027-01-31');
        assert.strictEqual(m3.cumulativeMonths, 3);

        // Mois 4 : Renouvellement le 30 avril 2027
        const m4 = calculateNextPeriod({
            previousMaxEndDate: m3.endDate,
            certifiedPaymentAtDate: '2027-04-30',
            durationMonths: 1,
            subscriptionAnchorDate: m3.anchorDate,
            subscriptionCumulativeMonths: m3.cumulativeMonths
        });
        assert.strictEqual(m4.startDate, '2027-04-30');
        assert.strictEqual(m4.endDate, '2027-05-30');
        assert.strictEqual(m4.anniversaryRenewalDate, '2027-05-31', 'Échéance 4 : 31 mai (jour 31 restauré)');
        assert.strictEqual(m4.anchorDate, '2027-01-31');
        assert.strictEqual(m4.cumulativeMonths, 4);
    });

    await t.test('4. Achat le 31 janvier 2028 (bissextile) → 29 février, puis 31 mars', () => {
        // Mois 1 : Achat 31 janvier 2028
        const m1 = calculateNextPeriod({
            previousMaxEndDate: null,
            certifiedPaymentAtDate: '2028-01-31',
            durationMonths: 1,
            subscriptionAnchorDate: null,
            subscriptionCumulativeMonths: 0
        });
        assert.strictEqual(m1.startDate, '2028-01-31');
        assert.strictEqual(m1.endDate, '2028-02-28');
        assert.strictEqual(m1.anniversaryRenewalDate, '2028-02-29', 'Échéance 1 bissextile : 29 février');

        // Mois 2 : Renouvellement le 29 février 2028
        const m2 = calculateNextPeriod({
            previousMaxEndDate: m1.endDate,
            certifiedPaymentAtDate: '2028-02-29',
            durationMonths: 1,
            subscriptionAnchorDate: m1.anchorDate,
            subscriptionCumulativeMonths: m1.cumulativeMonths
        });
        assert.strictEqual(m2.startDate, '2028-02-29');
        assert.strictEqual(m2.endDate, '2028-03-30');
        assert.strictEqual(m2.anniversaryRenewalDate, '2028-03-31', 'Échéance 2 : 31 mars');
    });

    await t.test('5. Achat le 29 février 2028 (jour bissextile) → renouvellement le 29 mars', () => {
        const m1 = calculateNextPeriod({
            previousMaxEndDate: null,
            certifiedPaymentAtDate: '2028-02-29',
            durationMonths: 1,
            subscriptionAnchorDate: null,
            subscriptionCumulativeMonths: 0
        });
        assert.strictEqual(m1.startDate, '2028-02-29');
        assert.strictEqual(m1.endDate, '2028-03-28');
        assert.strictEqual(m1.anniversaryRenewalDate, '2028-03-29', 'Renouvellement exact au 29 mars');

        const m2 = calculateNextPeriod({
            previousMaxEndDate: m1.endDate,
            certifiedPaymentAtDate: '2028-03-29',
            durationMonths: 1,
            subscriptionAnchorDate: m1.anchorDate,
            subscriptionCumulativeMonths: m1.cumulativeMonths
        });
        assert.strictEqual(m2.startDate, '2028-03-29');
        assert.strictEqual(m2.endDate, '2028-04-28');
        assert.strictEqual(m2.anniversaryRenewalDate, '2028-04-29');
    });

    await t.test('6. Achat le 31 août 2027 → 30 septembre, puis 31 octobre', () => {
        const m1 = calculateNextPeriod({
            previousMaxEndDate: null,
            certifiedPaymentAtDate: '2027-08-31',
            durationMonths: 1,
            subscriptionAnchorDate: null,
            subscriptionCumulativeMonths: 0
        });
        assert.strictEqual(m1.startDate, '2027-08-31');
        assert.strictEqual(m1.endDate, '2027-09-29');
        assert.strictEqual(m1.anniversaryRenewalDate, '2027-09-30', 'Renouvellement au 30 septembre');

        const m2 = calculateNextPeriod({
            previousMaxEndDate: m1.endDate,
            certifiedPaymentAtDate: '2027-09-30',
            durationMonths: 1,
            subscriptionAnchorDate: m1.anchorDate,
            subscriptionCumulativeMonths: m1.cumulativeMonths
        });
        assert.strictEqual(m2.startDate, '2027-09-30');
        assert.strictEqual(m2.endDate, '2027-10-30');
        assert.strictEqual(m2.anniversaryRenewalDate, '2027-10-31', 'Jour 31 retrouvé au 31 octobre');
    });

    await t.test('7. Alternance 1 mois et 10 mois : cumul exact des mois calendaires', () => {
        // Achat 1 mois le 31 janvier 2027
        const p1 = calculateNextPeriod({
            previousMaxEndDate: null,
            certifiedPaymentAtDate: '2027-01-31',
            durationMonths: 1,
            subscriptionAnchorDate: null,
            subscriptionCumulativeMonths: 0
        });
        assert.strictEqual(p1.startDate, '2027-01-31');
        assert.strictEqual(p1.endDate, '2027-02-27');
        assert.strictEqual(p1.cumulativeMonths, 1);

        // Renouvellement 10 mois au 28 février 2027
        const p2 = calculateNextPeriod({
            previousMaxEndDate: p1.endDate,
            certifiedPaymentAtDate: '2027-02-28',
            durationMonths: 10,
            subscriptionAnchorDate: p1.anchorDate,
            subscriptionCumulativeMonths: p1.cumulativeMonths
        });
        assert.strictEqual(p2.startDate, '2027-02-28');
        assert.strictEqual(p2.endDate, '2027-12-30');
        assert.strictEqual(p2.anniversaryRenewalDate, '2027-12-31', '11 mois calendaires au total');
        assert.strictEqual(p2.cumulativeMonths, 11);

        // Renouvellement suivant d 1 mois au 31 décembre 2027
        const p3 = calculateNextPeriod({
            previousMaxEndDate: p2.endDate,
            certifiedPaymentAtDate: '2027-12-31',
            durationMonths: 1,
            subscriptionAnchorDate: p2.anchorDate,
            subscriptionCumulativeMonths: p2.cumulativeMonths
        });
        assert.strictEqual(p3.startDate, '2027-12-31');
        assert.strictEqual(p3.endDate, '2028-01-30');
        assert.strictEqual(p3.anniversaryRenewalDate, '2028-01-31', '12 mois calendaires au total');
        assert.strictEqual(p3.cumulativeMonths, 12);
    });

    await t.test('8. Interruption réelle de couverture : réancrage au paiement certifié sans perte de jours', () => {
        // Souscription initiale du 15 janvier au 14 février
        const cycle1 = calculateNextPeriod({
            previousMaxEndDate: null,
            certifiedPaymentAtDate: '2027-01-15',
            durationMonths: 1,
            subscriptionAnchorDate: null,
            subscriptionCumulativeMonths: 0
        });
        assert.strictEqual(cycle1.startDate, '2027-01-15');
        assert.strictEqual(cycle1.endDate, '2027-02-14');
        assert.strictEqual(cycle1.anchorDate, '2027-01-15');

        // Gap de 2 mois sans paiement. Reprise le 10 avril 2027
        const cycle2 = calculateNextPeriod({
            previousMaxEndDate: cycle1.endDate,
            certifiedPaymentAtDate: '2027-04-10', // Date > cycle1.endDate + 1 jour
            durationMonths: 1,
            subscriptionAnchorDate: cycle1.anchorDate,
            subscriptionCumulativeMonths: cycle1.cumulativeMonths
        });

        // Nouvel ancrage déclenché
        assert.strictEqual(cycle2.startDate, '2027-04-10', 'Démarrage à la date du paiement certifié');
        assert.strictEqual(cycle2.endDate, '2027-05-09', '1 mois plein');
        assert.strictEqual(cycle2.anchorDate, '2027-04-10', 'Nouvel ancrage au 10 avril');
        assert.strictEqual(cycle2.cumulativeMonths, 1, 'Cumul réinitialisé');

        // Renouvellement continu suivant le 10 mai 2027
        const cycle2Renew = calculateNextPeriod({
            previousMaxEndDate: cycle2.endDate,
            certifiedPaymentAtDate: '2027-05-10',
            durationMonths: 1,
            subscriptionAnchorDate: cycle2.anchorDate,
            subscriptionCumulativeMonths: cycle2.cumulativeMonths
        });
        assert.strictEqual(cycle2Renew.startDate, '2027-05-10');
        assert.strictEqual(cycle2Renew.endDate, '2027-06-09');
        assert.strictEqual(cycle2Renew.anchorDate, '2027-04-10', 'Ancrage du 10 avril préservé');
        assert.strictEqual(cycle2Renew.cumulativeMonths, 2);
    });

    await t.test('9. Renouvellement anticipé : conservation de la couverture en cours sans jour perdu', () => {
        // Période 1 : Achat le 15 février 2027 (couvre jusqu'au 14 mars inclus)
        const p1 = calculateNextPeriod({
            previousMaxEndDate: null,
            certifiedPaymentAtDate: '2027-02-15',
            durationMonths: 1,
            subscriptionAnchorDate: null,
            subscriptionCumulativeMonths: 0
        });
        assert.strictEqual(p1.startDate, '2027-02-15');
        assert.strictEqual(p1.endDate, '2027-03-14');
        assert.strictEqual(p1.anchorDate, '2027-02-15');
        assert.strictEqual(p1.cumulativeMonths, 1);

        // Paiement anticipé 9 jours avant terme le 5 mars 2027
        const p2 = calculateNextPeriod({
            previousMaxEndDate: p1.endDate,
            certifiedPaymentAtDate: '2027-03-05',
            durationMonths: 1,
            subscriptionAnchorDate: p1.anchorDate,
            subscriptionCumulativeMonths: p1.cumulativeMonths
        });
        // La nouvelle période doit débuter le 15 mars (lendemain de la fin de p1)
        assert.strictEqual(p2.startDate, '2027-03-15', 'Enchaînement sans perte des 9 jours restants');
        assert.strictEqual(p2.endDate, '2027-04-14');
        assert.strictEqual(p2.anchorDate, '2027-02-15', 'Ancrage originel au 15 février conservé');
        assert.strictEqual(p2.cumulativeMonths, 2);
    });
});

