// ============================================================
// WHATSAPP HELPER — Messages préremplis via wa.me
// ============================================================

/**
 * Ouvre WhatsApp Web/Mobile avec un message prérempli.
 * Mode manuel : le message est prérempli, l'utilisateur l'envoie manuellement.
 */
export const sendWhatsApp = (phone: string, message: string) => {
    // Nettoyer le numéro : garder uniquement les chiffres
    const cleanPhone = (phone || '').replace(/[^0-9+]/g, '').replace(/^\+/, '');
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
};

// ── Messages prédéfinis ──────────────────────────────────────

export const messagePresenceArrivee = (nomEleve: string, heure: string, ecole: string) =>
    `Bonjour,\n\nVotre enfant *${nomEleve}* est bien arrivé à l'école *${ecole}* ce matin à *${heure}*.\n\nCordialement,\nL'Administration`;

export const messageAbsence = (nomEleve: string, date: string, ecole: string) =>
    `Bonjour,\n\nNous vous informons que votre enfant *${nomEleve}* a été absent(e) le *${date}* à l'école *${ecole}*.\n\nVeuillez nous contacter pour justifier cette absence.\n\nCordialement,\nL'Administration`;

export const messagePaiement = (nomEleve: string, montant: number, soldeRestant: number, ecole: string) =>
    `Bonjour,\n\nNous confirmons la réception du paiement de *${montant.toLocaleString('fr-FR')} FCFA* pour votre enfant *${nomEleve}*.\n\nSolde restant : *${soldeRestant.toLocaleString('fr-FR')} FCFA*\n\nMerci pour votre confiance.\n\n${ecole}`;

export const messageRappelPaiement = (nomEleve: string, montantDu: number, ecole: string) =>
    `Bonjour,\n\nNous vous rappelons cordialement que le solde de scolarité de votre enfant *${nomEleve}* s'élève à *${montantDu.toLocaleString('fr-FR')} FCFA*.\n\nVeuillez régulariser votre situation dans les meilleurs délais.\n\nCordialement,\n${ecole}`;

export const messageEcole = (ecole: string, contenu: string) =>
    `📢 *${ecole}*\n\n${contenu}\n\nCordialement,\nL'Administration`;
