const { FedaPay, Transaction } = require('fedapay');
const { supabase } = require('../utils/supabase');
const { sendPaymentReminderSMS } = require('../utils/smsService');

// Configuration FedaPay
FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY || 'sk_sandbox_default');
FedaPay.setEnvironment(process.env.FEDAPAY_ENVIRONMENT || 'sandbox'); // 'live' or 'sandbox'

/**
 * Initialise une transaction FedaPay
 * POST /api/payment/create-transaction
 */
async function createTransaction(req, res) {
    const { studentId, amount, parentPhone, parentName } = req.body;
    const schoolSlug = req.user.schoolSlug;

    if (!amount || !studentId) {
        return res.status(400).json({ error: "L'élève et le montant sont requis." });
    }

    try {
        // 1. Récupérer les infos de l'élève
        const { data: student } = await supabase
            .from(`students_${schoolSlug}`)
            .select('*')
            .eq('id', studentId)
            .single();

        if (!student) return res.status(404).json({ error: "Élève introuvable." });

        // --- MODE YZIOW PAY CENTRALISÉ ---
        // On force TOUJOURS l'utilisation de la clé FedaPay du SuperAdmin
        let secretKey = process.env.FEDAPAY_SECRET_KEY || 'sk_sandbox_default';
        let isLive = process.env.FEDAPAY_ENVIRONMENT === 'live';
        
        // Si le SuperAdmin a configuré ses clés dans les Paramètres SaaS globaux, on les utilise en priorité
        const { data: globalSettings } = await supabase.from('global_settings').select('*');
        if (globalSettings) {
            const platformGateway = globalSettings.find(s => s.key === 'payment_gateway')?.value;
            const platformSecret = globalSettings.find(s => s.key === 'payment_secret_key')?.value;
            if (platformGateway === 'fedapay' && platformSecret) {
                secretKey = platformSecret;
                isLive = secretKey.startsWith('sk_live');
            }
        }

        FedaPay.setApiKey(secretKey);
        FedaPay.setEnvironment(isLive ? 'live' : 'sandbox');

        // 2. Créer la transaction sur FedaPay
        const transaction = await Transaction.create({
            description: `Paiement scolarité pour ${student.nom} ${student.prenom}`,
            amount: parseInt(amount, 10),
            currency: { iso: "XOF" },
            // Mettre l'URL de redirection (frontend)
            callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/parent/dashboard?payment=success`,
            customer: {
                lastname: parentName || 'Parent',
                firstname: '',
                phone_number: {
                    number: parentPhone || '00000000',
                    country: 'TG' // Togo par défaut, peut être ajusté
                }
            },
            // Stocker des métadonnées pour le Webhook
            custom_metadata: {
                studentId,
                schoolSlug,
                parentId: req.user.id,
                collected_by_platform: true // FORCÉ à TRUE pour le modèle centralisé Yziow Pay
            }
        });

        // 3. Générer le token de paiement
        const token = await transaction.generateToken();

        return res.status(200).json({ 
            transactionId: transaction.id, 
            token: token.token,
            url: token.url 
        });

    } catch (error) {
        console.error("Erreur création transaction FedaPay:", error);
        return res.status(500).json({ error: "Erreur lors de l'initialisation du paiement." });
    }
}

/**
 * Webhook appelé par FedaPay lorsque le statut change (succès/échec)
 * POST /api/payment/webhook
 */
async function fedapayWebhook(req, res) {
    // Dans la réalité, il faut vérifier la signature FedaPay (X-FedaPay-Signature)
    const event = req.body;

    if (event && event.name === 'transaction.approved') {
        const transaction = event.entity;
        
        const metadata = transaction.custom_metadata;
        if (!metadata) return res.status(200).send("No metadata");

        const { studentId, schoolSlug, parentId, type } = metadata;
        const amountPaid = transaction.amount;

        try {
            if (type === 'saas_subscription') {
                // Gestion du paiement d'abonnement SaaS par le directeur
                const { data: school } = await supabase
                    .from('schools')
                    .select('id, total_revenue_paid, affiliate_id, subscription_plan, paid_tranches_count')
                    .eq('slug', schoolSlug)
                    .single();

                if (school) {
                    const newTotal = (Number(school.total_revenue_paid) || 0) + Number(amountPaid);
                    const planType = metadata.planType || 'tranche';
                    
                    const updateData = { 
                        total_revenue_paid: newTotal,
                        subscription_plan: school.subscription_plan || planType // Verrouillage du premier choix
                    };

                    if (planType === 'tranche') {
                        updateData.paid_tranches_count = (school.paid_tranches_count || 0) + 1;
                    } else if (planType === 'annual') {
                        // Annuel = 3 tranches (pour tout bloquer)
                        updateData.paid_tranches_count = 3;
                    }

                    await supabase
                        .from('schools')
                        .update(updateData)
                        .eq('slug', schoolSlug);
                    
                    console.log(`✅ Abonnement SaaS payé pour l'école ${schoolSlug} : ${amountPaid} FCFA`);

                    // --- LOGIQUE D'AFFILIATION ---
                    if (school.affiliate_id) {
                        const { data: affiliate } = await supabase
                            .from('affiliates')
                            .select('id, wallet_balance, total_earned, commission_rate')
                            .eq('id', school.affiliate_id)
                            .single();
                        
                        if (affiliate) {
                            const rate = affiliate.commission_rate || 20;
                            const commission = (Number(amountPaid) * Number(rate)) / 100;

                            const newWallet = (Number(affiliate.wallet_balance) || 0) + commission;
                            const newEarned = (Number(affiliate.total_earned) || 0) + commission;

                            // 1. Mettre à jour le solde
                            await supabase
                                .from('affiliates')
                                .update({ wallet_balance: newWallet, total_earned: newEarned })
                                .eq('id', affiliate.id);

                            // 2. Historique
                            await supabase
                                .from('affiliate_transactions')
                                .insert({
                                    affiliate_id: affiliate.id,
                                    school_id: school.id,
                                    type: 'commission',
                                    amount: commission,
                                    description: `Commission (${rate}%) sur l'abonnement de ${schoolSlug}`
                                });
                            
                            console.log(`🤝 Commission versée à l'ambassadeur ${affiliate.id}: ${commission} FCFA`);
                        }
                    }
                }
            } else {
                // 1. Récupérer l'élève (Paiement classique des parents)
                const { data: student } = await supabase
                    .from(`students_${schoolSlug}`)
                    .select('*')
                    .eq('id', studentId)
                    .single();

                if (student) {
                    // 2. Mettre à jour le montant déjà payé
                    const nouveauDejaPaye = (student.dejaPaye || 0) + amountPaid;
                    const newStatus = nouveauDejaPaye >= student.ecolage ? 'Soldé' : 'Partiel';

                    await supabase
                        .from(`students_${schoolSlug}`)
                        .update({ 
                            dejaPaye: nouveauDejaPaye,
                            status: newStatus 
                        })
                        .eq('id', studentId);

                    // 3. Ajouter l'historique du paiement
                    await supabase
                        .from(`paiements_${schoolSlug}`)
                        .insert({
                            student_id: studentId,
                            montant: amountPaid,
                            date: new Date().toISOString(),
                            type: 'Mobile Money',
                            statut: 'validé',
                            reference: `FEDAPAY_${transaction.id}`
                        });

                    // 4. Si collecté par la plateforme, mettre à jour le solde de l'école
                    if (metadata.collected_by_platform === true || metadata.collected_by_platform === 'true') {
                        const { data: school } = await supabase
                            .from('schools')
                            .select('id, platform_collected_amount')
                            .eq('slug', schoolSlug)
                            .single();
                        
                        if (school) {
                            const newCollected = (Number(school.platform_collected_amount) || 0) + Number(amountPaid);
                            await supabase
                                .from('schools')
                                .update({ platform_collected_amount: newCollected })
                                .eq('slug', schoolSlug);
                            console.log(`✅ Fonds collectés par la plateforme pour ${schoolSlug}: +${amountPaid}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Erreur lors du traitement Webhook:", error);
        }
    }

    // FedaPay attend toujours un 200 OK
    res.status(200).send('OK');
}

module.exports = {
    createTransaction,
    fedapayWebhook
};
