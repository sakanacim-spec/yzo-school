'use strict';

const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'ru', 'ar', 'zh'];

/**
 * Normalise une chaîne de langue vers l'une des 9 langues supportées.
 * Fallback déterministe vers 'fr'.
 */
function normalizeLanguage(rawLang) {
    if (!rawLang || typeof rawLang !== 'string') {
        return 'fr';
    }
    const clean = rawLang.trim().toLowerCase().split(/[-_]/)[0];
    if (SUPPORTED_LANGUAGES.includes(clean)) {
        return clean;
    }
    return 'fr';
}

/**
 * Détermine si la langue est RTL (arabe).
 */
function isRtlLanguage(lang) {
    return normalizeLanguage(lang) === 'ar';
}

const ERROR_MESSAGES = {
    fr: {
        400: 'Votre message ou l’historique de la conversation n’est pas valide. Veuillez recommencer.',
        401: 'Votre session n’est plus valide. Veuillez vous reconnecter.',
        '429_min': (m) => `Vous avez atteint votre limite de questions. Veuillez réessayer dans ${m} minute(s).`,
        '429_gen': 'Vous avez atteint votre limite de questions. Veuillez réessayer plus tard.',
        503: 'L’assistant est temporairement indisponible. Veuillez réessayer plus tard.',
        500: 'Une erreur est survenue. Veuillez réessayer plus tard.'
    },
    en: {
        400: 'Your message or conversation history is invalid. Please try again.',
        401: 'Your session has expired. Please log in again.',
        '429_min': (m) => `You have reached your question limit. Please try again in ${m} minute(s).`,
        '429_gen': 'You have reached your question limit. Please try again later.',
        503: 'The assistant is temporarily unavailable. Please try again later.',
        500: 'An error occurred. Please try again later.'
    },
    es: {
        400: 'Su mensaje o el historial de conversación no es válido. Por favor, inténtelo de nuevo.',
        401: 'Su sesión ha caducado. Por favor, inicie sesión de nuevo.',
        '429_min': (m) => `Ha alcanzado su límite de questions. Inténtelo de nuevo en ${m} minuto(s).`,
        '429_gen': 'Ha alcanzado su límite de preguntas. Por favor, inténtelo más tarde.',
        503: 'El asistente no está disponible temporalmente. Por favor, inténtelo más tarde.',
        500: 'Ha ocurrido un error. Por favor, inténtelo más tarde.'
    },
    de: {
        400: 'Ihre Nachricht oder der Gesprächsverlauf ist ungültig. Bitte versuchen Sie es erneut.',
        401: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
        '429_min': (m) => `Sie haben Ihr Fragenlimit erreicht. Bitte versuchen Sie es in ${m} Minute(n) erneut.`,
        '429_gen': 'Sie haben Ihr Fragenlimit erreicht. Bitte versuchen Sie es später erneut.',
        503: 'Der Assistent ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',
        500: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
    },
    it: {
        400: 'Il messaggio o la cronologia della conversazione non è valida. Riprova.',
        401: 'La sessione è scaduta. Effettua nuovamente l’accesso.',
        '429_min': (m) => `Hai raggiunto il limite di domande. Riprova tra ${m} minuto/i.`,
        '429_gen': 'Hai raggiunto il limite di domande. Riprova più tardi.',
        503: 'L’assistente è temporaneamente non disponibile. Riprova più tardi.',
        500: 'Si è verificato un errore. Riprova più tardi.'
    },
    pt: {
        400: 'Sua mensagem ou o histórico da conversa não é válido. Tente novamente.',
        401: 'Sua sessão expirou. Faça login novamente.',
        '429_min': (m) => `Você atingiu o limite de perguntas. Tente novamente em ${min} minuto(s).`,
        '429_gen': 'Você atingiu o limite de perguntas. Tente novamente mais tarde.',
        503: 'O assistente está temporariamente indisponível. Tente novamente mais tarde.',
        500: 'Ocorreu um erro. Tente novamente mais tarde.'
    },
    ru: {
        400: 'Ваше сообщение или история переписки некорректны. Пожалуйста, попробуйте снова.',
        401: 'Срок действия сессии истек. Пожалуйста, войдите снова.',
        '429_min': (m) => `Вы достигли лимита вопросов. Пожалуйста, повторите попытку через ${m} мин.`,
        '429_gen': 'Вы достигли лимита вопросов. Пожалуйста, повторите попытку позже.',
        503: 'Ассистент временно недоступен. Пожалуйста, повторите попытку позже.',
        500: 'Произошла ошибка. Пожалуйста, повторите попытку позже.'
    },
    ar: {
        400: 'الرسالة أو سجل المحادثة غير صالح. يرجى المحاولة مرة أخرى.',
        401: 'انتهت صلاحية جلستك. يرجى تسجيل الدخول مجدداً.',
        '429_min': (m) => `لقد بلغت الحد الأقصى للأسئلة المسموح بها. يرجى المحاولة بعد ${m} دقيقة/دقائق.`,
        '429_gen': 'لقد بلغت الحد الأقصى للأسئلة المسموح بها. يرجى المحاولة لاحقاً.',
        503: 'المساعد الذكي غير متاح مؤقتاً. يرجى المحاولة لاحقاً.',
        500: 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.'
    },
    zh: {
        400: '您的消息内容或对话历史记录无效。请重新输入。',
        401: '您的登录会话已过期。请重新登录系统。',
        '429_min': (m) => `您已达到当前提问额度上限。请在 ${m} 分钟后重试。`,
        '429_gen': '您已达到提问额度上限。请稍后再试。',
        503: '智能助手暂时不可用。请稍后再试。',
        500: '系统发生错误。请稍后重试。'
    }
};

/**
 * Retourne le message d'erreur localisé selon le code HTTP et le délai de relance éventuel.
 */
function getLocalizedErrorMessage(status, retryAfter, rawLang) {
    const lang = normalizeLanguage(rawLang);
    const dict = ERROR_MESSAGES[lang] || ERROR_MESSAGES.fr;

    if (status === 429) {
        if (retryAfter !== undefined && retryAfter !== null && retryAfter !== '') {
            const sec = typeof retryAfter === 'number' ? retryAfter : Number(String(retryAfter).trim());
            if (Number.isFinite(sec) && sec > 0) {
                const minutes = Math.max(1, Math.ceil(sec / 60));
                return dict['429_min'](minutes);
            }
        }
        return dict['429_gen'];
    }

    return dict[status] || dict[500];
}

module.exports = {
    SUPPORTED_LANGUAGES,
    normalizeLanguage,
    isRtlLanguage,
    getLocalizedErrorMessage
};
