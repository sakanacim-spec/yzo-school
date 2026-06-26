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
                studentId: studentId,
                schoolSlug: schoolSlug,
                parentId: req.user.id
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

        const { studentId, schoolSlug, parentId } = metadata;
        const amountPaid = transaction.amount;

        try {
            // 1. Récupérer l'élève
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
