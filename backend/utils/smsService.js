const twilio = require('twilio');

// Configuration (A remplir dans le fichier .env)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Initialiser le client Twilio seulement si les variables sont présentes
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

/**
 * Envoie un SMS à un numéro donné
 * @param {string} to - Le numéro de téléphone (ex: +22899999999)
 * @param {string} message - Le contenu du message
 * @param {string} schoolName - Le nom de l'école (pour le préfixe du message)
 */
async function sendSMS(to, message, schoolName = 'École') {
    try {
        const fullMessage = `[${schoolName}] ${message}`;

        // Si Twilio n'est pas configuré, on simule l'envoi pour le développement
        if (!twilioClient) {
            console.log(`\n======================================================`);
            console.log(`[SIMULATION SMS] - (Twilio non configuré dans .env)`);
            console.log(`Destinataire : ${to}`);
            console.log(`Message      : ${fullMessage}`);
            console.log(`======================================================\n`);
            return true;
        }

        // Nettoyage basique du numéro (suppression des espaces)
        const cleanPhone = to.replace(/\s+/g, '');

        const response = await twilioClient.messages.create({
            body: fullMessage,
            from: TWILIO_PHONE_NUMBER,
            to: cleanPhone
        });

        console.log(`[SMS Envoyé] SID: ${response.sid}`);
        return true;
    } catch (error) {
        console.error(`[Erreur d'envoi SMS] à ${to}:`, error.message);
        return false;
    }
}

/**
 * Envoie le SMS de bienvenue à un parent
 */
async function sendWelcomeSMS(to, schoolName) {
    const message = `Bienvenue sur le portail Parent ! Vous pouvez désormais suivre la scolarité de vos enfants et payer en ligne.`;
    return sendSMS(to, message, schoolName);
}

/**
 * Envoie un SMS de rappel de paiement
 */
async function sendPaymentReminderSMS(to, amount, studentName, schoolName) {
    const message = `Rappel : Le paiement de ${amount} FCFA pour la scolarité de ${studentName} est attendu. Payez facilement depuis votre portail en ligne.`;
    return sendSMS(to, message, schoolName);
}

/**
 * Envoie un SMS pour signaler une absence
 */
async function sendAbsenceSMS(to, studentName, date, schoolName) {
    const message = `Nous vous informons de l'absence de ${studentName} ce ${date}. Veuillez contacter l'administration.`;
    return sendSMS(to, message, schoolName);
}

module.exports = {
    sendSMS,
    sendWelcomeSMS,
    sendPaymentReminderSMS,
    sendAbsenceSMS
};
