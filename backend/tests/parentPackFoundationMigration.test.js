const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

test('Lot 1: Vérification statique complète de P19 v7', (t) => {
    const p19Path = path.join(__dirname, '../scripts/migration_p19_parent_pack_foundation.sql');
    assert.ok(fs.existsSync(p19Path));
    const rawContent = fs.readFileSync(p19Path, 'utf8');

    // Normalisation basique des espaces
    const content = rawContent.replace(/\s+/g, ' ');

    // 1. Paiements
    assert.ok(content.includes("CHECK (payment_type IN ('saas_subscription', 'donation', 'tuition', 'parent_pack'))"), "Types de paiement ok");
    assert.ok(!content.includes("grace_"), "Aucune logique de grâce");
    assert.ok(content.includes("payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE RESTRICT"), "FK vers payment_intents");
    assert.ok(content.includes("UNIQUE (payment_intent_id)"), "Unicité intention de paiement");
    assert.ok(content.includes("parent_pack_validate_period_payment_intent()"), "Trigger validation type de paiement existe");
    assert.ok(content.includes("pi_type IS DISTINCT FROM 'parent_pack'"), "Rejet strict des types différents");

    // 2. Invitations
    assert.ok(content.includes("student_ref TEXT"), "student_ref TEXT");
    assert.ok(content.includes("parent_ref TEXT"), "parent_ref TEXT");
    assert.ok(content.includes("registration_deadline_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days')"), "Délai de 7 jours respecté");
    assert.ok(rawContent.includes("CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_parent_pack_invitations") && rawContent.includes("WHERE status = 'pending'"), "Index partiel pending sur invitations");

    // 3. Tarifs Pack Parent V1
    assert.ok(content.includes("CHECK (pricing_version > 0)"), "Version tarif positive");
    assert.ok(content.includes("CHECK (effective_until IS NULL OR effective_until > effective_from)"), "Cohérence des dates d'effet");
    assert.ok(content.includes("UNIQUE (cycle_name, currency, pricing_version)"), "Contrainte unique de versionnement");
    assert.ok(rawContent.includes("CREATE UNIQUE INDEX IF NOT EXISTS uq_active_parent_pack_pricing") && rawContent.includes("WHERE active = true"), "Index partiel pour tarif actif unique");
    assert.ok(rawContent.includes("100, 1000") && rawContent.includes("150, 1500") && rawContent.includes("200, 2000"), "Tarifs V1 XOF exacts");
    assert.ok(!rawContent.includes("UNIQUE (cycle_name, currency, active)"), "Pas d'ancienne contrainte active binaire");

    // 4. Ledger financier
    assert.ok(content.includes("TABLE IF NOT EXISTS public.school_commission_ledger"), "Nom du ledger exact");
    assert.ok(content.includes("CHECK (type IN ('credit', 'cancellation'))"), "Types credit et cancellation");
    assert.ok(content.includes("CHECK (gross_amount_minor = fedapay_fee_minor + school_share_minor + ambassador_share_minor + yziow_share_minor)"), "Identité comptable respectée");
    assert.ok(content.includes("CHECK ((ambassador_ref IS NULL AND ambassador_share_minor = 0) OR (ambassador_ref IS NOT NULL))"), "Zéro si pas d'ambassadeur");
    assert.ok(content.includes("IF NEW.gross_amount_minor <= 0 OR"), "Crédit avec brut > 0 imposé");
    assert.ok(content.includes("IF NEW.gross_amount_minor != -orig.gross_amount_minor OR"), "Annulation avec montants opposés");
    assert.ok(content.includes("CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_ledger_credit"), "Unicité par période pour crédit");
    assert.ok(content.includes("CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_ledger_cancellation"), "Unicité d'annulation par crédit");
    assert.ok(rawContent.includes("SELECT * INTO orig FROM public.school_commission_ledger WHERE id = NEW.original_ledger_id AND type = 'credit' FOR UPDATE;"), "Verrou FOR UPDATE sur crédit annulé");
    assert.ok(rawContent.includes("EXISTS (SELECT 1 FROM public.school_payout_items WHERE ledger_id = NEW.original_ledger_id)"), "Rejet d'annulation si crédit réservé dans items");
    assert.ok(rawContent.includes("SELECT * INTO ledg FROM public.school_commission_ledger WHERE id = NEW.ledger_id FOR UPDATE;"), "Verrou FOR UPDATE sur crédit via item");
    assert.ok(rawContent.includes("EXISTS (SELECT 1 FROM public.school_commission_ledger WHERE original_ledger_id = ledg.id AND type = 'cancellation')"), "Rejet d'item si crédit annulé");

    // 5. Reversements
    assert.ok(content.includes("currency TEXT NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF')"), "Reversements en XOF strictement");
    assert.ok(!content.includes(">= 2000"), "Aucun seuil arbitraire de reversement");
    assert.ok(!rawContent.match(/CREATE TABLE IF NOT EXISTS public\.school_payout_items[^;]+status TEXT/g), "Pas de colonne status dans les items");
    assert.ok(content.includes("IF ledg.type = 'cancellation' THEN"), "Item refuse d'attacher une annulation");
    assert.ok(content.includes("IF pay.school_slug != ledg.school_slug THEN"), "Item vérifie que l'école concorde");
    assert.ok(content.includes("IF NEW.amount_minor > ledg.school_share_minor THEN"), "Item plafonné par part établissement");
    assert.ok(content.includes("IF sum_items + NEW.amount_minor > pay.amount_minor THEN"), "Item vérifie le cumul");
    assert.ok(content.includes("IF pay.status NOT IN ('draft', 'approved') THEN"), "Item exige statut de reversement valide");

    // Transition reversement
    assert.ok(content.includes("IF NEW.status IN ('sending', 'sent') THEN IF sum_items = 0 THEN"), "Envoi refusé si vide");
    assert.ok(content.includes("IF sum_items != NEW.amount_minor THEN"), "Envoi exige couverture parfaite");
    assert.ok(content.includes("IF NEW.status = 'canceled' THEN IF sum_items > 0 THEN"), "Annulation de reversement refusée si garni");

    // Événements
    assert.ok(content.includes("old_status TEXT") && content.includes("new_status TEXT NOT NULL") && content.includes("metadata JSONB"), "Structure events");
    assert.ok(content.includes("actor_ref TEXT NOT NULL DEFAULT current_user"), "Acteur technique tracé");
    assert.ok(content.includes("parent_pack_log_payout_creation()"), "Trigger création de reversement tracé");
    assert.ok(content.includes("parent_pack_log_payout_status_change()"), "Trigger changement statut de reversement tracé");

    // 6. Sécurité et immuabilité
    assert.ok(!content.includes("ON DELETE CASCADE"), "Aucun ON DELETE CASCADE");
    assert.ok(!content.includes("GRANT SELECT, INSERT, UPDATE, DELETE"), "Aucun GRANT DELETE de masse");
    assert.ok(content.includes("GRANT SELECT, INSERT ON public.%I TO service_role") && content.includes("tbl IN ('school_commission_ledger', 'school_payout_items', 'school_payout_events')"), "Tables financières limitées à SELECT, INSERT");
    assert.ok(content.includes("GRANT SELECT, INSERT, UPDATE ON public.%I TO service_role"), "Autres tables limitées à SELECT, INSERT, UPDATE");
    assert.ok(content.includes("BEFORE UPDATE OR DELETE ON public.school_commission_ledger"), "Triggers d'immuabilité (ledger)");
    assert.ok(content.includes("BEFORE UPDATE OR DELETE ON public.school_payout_items"), "Triggers d'immuabilité (items)");
    assert.ok(content.includes("BEFORE UPDATE OR DELETE ON public.school_payout_events"), "Triggers d'immuabilité (events)");

    // RLS dynamique sécurisée
    assert.ok(content.includes("ENABLE ROW LEVEL SECURITY"), "RLS toujours ON");
    assert.ok(content.includes("policy_name := tbl || '_service_role_policy';"), "Assignation dynamique du nom policy");
    assert.ok(content.includes("EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', policy_name, tbl);"), "Création de politique 100% sécurisée");
    assert.ok(!content.includes("%I_service_role_policy"), "Aucun usage direct %I_service_role_policy");
    assert.ok(!content.includes("EXCEPTION WHEN"), "Aucun silence d'exception RLS");

    // 7. Isolation
    assert.ok(!content.includes("process_fedapay_webhook_event"), "Pas d'interaction Webhook hors périmètre");
    assert.ok(!content.includes("migration_p17") && !content.includes("migration_p18"), "Pas d'interaction P17/P18");
});
