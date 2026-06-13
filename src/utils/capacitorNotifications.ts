// ============================================================
// NOTIFICATIONS SERVICE — Web Push API
// ============================================================

/**
 * Demande l'autorisation d'envoyer des notifications sur le navigateur.
 */
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        console.warn("⚠️ Ce navigateur ne supporte pas les notifications.");
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('🌐 Notifications Web : Autorisation accordée.');
            // Initialiser l'abonnement push web et l'enregistrement du Service Worker
            try {
                const { webPushService } = await import('../services/webPushService');
                await webPushService.init();
            } catch (initErr) {
                console.error("Erreur lors de l'initialisation du service Web Push:", initErr);
            }
            return true;
        }
        console.warn('⚠️ Notifications Web : Permission refusée.');
        return false;
    } catch (err) {
        console.error('❌ Erreur initialisation Notifications Web:', err);
        return false;
    }
};

/**
 * Affiche une bannière ou demande l'activation des notifications lors de la connexion.
 */
export const checkAndAskNotifications = async () => {
    const hasAskedStatus = localStorage.getItem('notifications_asked');
    if (hasAskedStatus) return;

    const confirmed = window.confirm("Souhaitez-vous activer les notifications sur votre navigateur pour suivre les scans en temps réel ?");
    if (confirmed) {
        await requestNotificationPermission();
    }
    localStorage.setItem('notifications_asked', 'true');
};

/**
 * Envoie une notification locale (si autorisée).
 */
export const sendLocalNotification = (title: string, options?: NotificationOptions) => {
    if (Notification.permission === 'granted') {
        new Notification(title, options);
    }
};
