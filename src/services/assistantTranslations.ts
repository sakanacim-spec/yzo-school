import type { AssistantLanguage } from './assistantLocale.ts';
import { normalizeAssistantLanguage } from './assistantLocale.ts';

export interface AssistantTranslations {
    // Header & Global
    botName: string;
    botSubtitlePublic: string;
    botSubtitlePrivate: string;
    needHelpPrompt: string;
    thinking: string;
    inputPlaceholder: string;
    close: string;
    backToMenu: string;

    // Welcome public
    welcomeTitle: string;
    welcomeProfileSelect: string;

    // Public Roles & Suggestions
    roleDirector: string;
    roleParent: string;
    roleTeacher: string;
    roleInfo: string;

    directorResponse: string;
    directorActionRegister: string;
    directorActionLogin: string;

    parentResponse: string;
    parentActionRegister: string;
    parentActionLogin: string;

    teacherResponse: string;
    teacherActionLogin: string;

    infoResponse: string;
    infoActionRegisterSchool: string;
    infoActionRegisterParent: string;

    // Welcome Private by Role
    privateWelcomeDefault: string;
    privateWelcomeSuperadmin: string;
    privateWelcomeDirector: string;
    privateWelcomeParent: string;
    privateWelcomeTeacher: string;

    // Errors
    error400: string;
    error401: string;
    error429WithMinutes: (minutes: number) => string;
    error429Generic: string;
    error503: string;
    error500: string;
    errorConnection: string;
}

export const ASSISTANT_DICTIONARY: Record<AssistantLanguage, AssistantTranslations> = {
    fr: {
        botName: 'Assistant Yziow',
        botSubtitlePublic: 'Guide interactif',
        botSubtitlePrivate: 'Assistant sécurisé',
        needHelpPrompt: "Besoin d'aide pour commencer ?",
        thinking: "L'assistant réfléchit...",
        inputPlaceholder: 'Posez une question...',
        close: 'Fermer',
        backToMenu: '⬅️ Retour au menu principal',

        welcomeTitle: 'Bonjour ! 👋 Bienvenue sur Yziow. Je suis votre assistant virtuel.',
        welcomeProfileSelect: 'Pour bien vous orienter, dites-moi quel est votre profil :',

        roleDirector: '🏫 Je suis Directeur / Établissement',
        roleParent: "👨‍👩‍👧 Je suis un Parent d'élève",
        roleTeacher: '👨‍🏫 Je suis Enseignant ou Élève',
        roleInfo: '❓ Découvrir les fonctionnalités & Tarifs',

        directorResponse: "Excellente démarche ! Avec Yziow, vous pouvez gérer votre école de A à Z (bulletins PDF officiels, gestion des frais, présences QR code).\n\nVous bénéficiez de 14 jours d'essai gratuit sans engagement !",
        directorActionRegister: '🚀 Créer mon école (14j gratuits)',
        directorActionLogin: '🔑 Se connecter à mon espace',

        parentResponse: "Bienvenue ! En tant que parent, Yziow vous permet de suivre en temps réel les notes de votre enfant, ses présences et de recevoir ses bulletins sur votre téléphone.",
        parentActionRegister: "✍️ S'inscrire en tant que Parent",
        parentActionLogin: '🔑 Se connecter à mon compte Parent',

        teacherResponse: "Votre compte est créé directement par l'administration de votre établissement. Vous pouvez utiliser vos identifiants pour accéder à vos cours et notes.",
        teacherActionLogin: '🔑 Accéder à la page de connexion',

        infoResponse: "Yziow propose :\n• Bulletins PDF certifiés & Calcul de moyennes\n• Scanner QR Code pour la présence des élèves\n• Gestion des reçus de scolarité & Comptabilité\n• Application multi-langue (FR, EN, ES, AR...)\n\nSouhaitez-vous commencer dès maintenant ?",
        infoActionRegisterSchool: '🏫 Inscrire mon école',
        infoActionRegisterParent: '👨‍👩‍👧 Créer un compte Parent',

        privateWelcomeDefault: 'Bonjour {name} ! Je suis votre assistant virtuel.',
        privateWelcomeSuperadmin: 'Bonjour SuperAdmin {name} ! Que puis-je faire pour vous aider à analyser nos plateformes ?',
        privateWelcomeDirector: 'Bonjour {name} ! Comment puis-je vous aider dans la gestion de votre école aujourd’hui ?',
        privateWelcomeParent: 'Bonjour {name} ! Comment puis-je vous aider avec la scolarité de vos enfants ?',
        privateWelcomeTeacher: 'Bonjour {name} ! Comment puis-je vous aider dans vos activités pédagogiques aujourd’hui ?',

        error400: 'Votre message ou l’historique de la conversation n’est pas valide. Veuillez recommencer.',
        error401: 'Votre session n’est plus valide. Veuillez vous reconnecter.',
        error429WithMinutes: (min: number) => `Vous avez atteint votre limite de questions. Veuillez réessayer dans ${min} minute(s).`,
        error429Generic: 'Vous avez atteint votre limite de questions. Veuillez réessayer plus tard.',
        error503: 'L’assistant est temporairement indisponible. Veuillez réessayer plus tard.',
        error500: 'Une erreur est survenue. Veuillez réessayer plus tard.',
        errorConnection: 'Erreur de connexion à l’assistant. Veuillez réessayer plus tard.'
    },
    en: {
        botName: 'Yziow Assistant',
        botSubtitlePublic: 'Interactive guide',
        botSubtitlePrivate: 'Secure assistant',
        needHelpPrompt: 'Need help getting started?',
        thinking: 'Assistant is thinking...',
        inputPlaceholder: 'Ask a question...',
        close: 'Close',
        backToMenu: '⬅️ Back to main menu',

        welcomeTitle: 'Hello! 👋 Welcome to Yziow. I am your virtual assistant.',
        welcomeProfileSelect: 'To guide you properly, please tell me your profile:',

        roleDirector: '🏫 I am a School Director / Admin',
        roleParent: '👨‍👩‍👧 I am a Parent',
        roleTeacher: '👨‍🏫 I am a Teacher or Student',
        roleInfo: '❓ Features & Pricing',

        directorResponse: 'Excellent! With Yziow, you can manage your school from A to Z (certified PDF report cards, tuition tracking, QR code attendance).\n\nYou get a 14-day free trial without commitment!',
        directorActionRegister: '🚀 Create my school (14d free)',
        directorActionLogin: '🔑 Log in to my portal',

        parentResponse: "Welcome! As a parent, Yziow allows you to track your child's grades, attendance in real time, and receive report cards directly on your phone.",
        parentActionRegister: '✍️ Register as a Parent',
        parentActionLogin: '🔑 Log in to Parent account',

        teacherResponse: 'Your account is created directly by your school administration. You can use your credentials to access your courses and grades.',
        teacherActionLogin: '🔑 Go to login page',

        infoResponse: 'Yziow provides:\n• Certified PDF report cards & automated grade calculation\n• QR code scanner for student attendance\n• Tuition fee management & accounting receipts\n• Multilingual application (FR, EN, ES, AR...)\n\nWould you like to start now?',
        infoActionRegisterSchool: '🏫 Register my school',
        infoActionRegisterParent: '👨‍👩‍👧 Create a Parent account',

        privateWelcomeDefault: 'Hello {name}! I am your virtual assistant.',
        privateWelcomeSuperadmin: 'Hello SuperAdmin {name}! How can I help you analyze platform metrics today?',
        privateWelcomeDirector: 'Hello {name}! How can I assist you with managing your school today?',
        privateWelcomeParent: "Hello {name}! How can I help you with your children's education today?",
        privateWelcomeTeacher: 'Hello {name}! How can I help you with your teaching activities today?',

        error400: 'Your message or conversation history is invalid. Please try again.',
        error401: 'Your session has expired. Please log in again.',
        error429WithMinutes: (min: number) => `You have reached your question limit. Please try again in ${min} minute(s).`,
        error429Generic: 'You have reached your question limit. Please try again later.',
        error503: 'The assistant is temporarily unavailable. Please try again later.',
        error500: 'An error occurred. Please try again later.',
        errorConnection: 'Connection error with the assistant. Please try again later.'
    },
    es: {
        botName: 'Asistente Yziow',
        botSubtitlePublic: 'Guía interactiva',
        botSubtitlePrivate: 'Asistente seguro',
        needHelpPrompt: '¿Necesitas ayuda para empezar?',
        thinking: 'El asistente está pensando...',
        inputPlaceholder: 'Haz una pregunta...',
        close: 'Cerrar',
        backToMenu: '⬅️ Volver al menú principal',

        welcomeTitle: '¡Hola! 👋 Bienvenido a Yziow. Soy tu asistente virtual.',
        welcomeProfileSelect: 'Para orientarte adecuadamente, indícame tu perfil:',

        roleDirector: '🏫 Soy Director / Administrador',
        roleParent: '👨‍👩‍👧 Soy Padre / Madre de familia',
        roleTeacher: '👨‍🏫 Soy Profesor o Estudiante',
        roleInfo: '❓ Funcionalidades y Tarifas',

        directorResponse: '¡Excelente iniciativa! Con Yziow, puedes gestionar tu colegio de la A a la Z (boletines oficiales en PDF, pagos, asistencias por código QR).\n\n¡Disfruta de 14 días de prueba gratuita sin compromiso!',
        directorActionRegister: '🚀 Crear mi colegio (14d gratis)',
        directorActionLogin: '🔑 Iniciar sesión en mi espacio',

        parentResponse: '¡Bienvenido! Como padre, Yziow te permite seguir las calificaciones de tus hijos en tiempo real, sus asistencias y recibir boletines en tu teléfono.',
        parentActionRegister: '✍️ Registrarse como Padre',
        parentActionLogin: '🔑 Iniciar sesión como Padre',

        teacherResponse: 'Tu cuenta es creada directamente por la administración de tu centro educativo. Puedes usar tus credenciales para acceder a tus cursos y notas.',
        teacherActionLogin: '🔑 Ir a la página de acceso',

        infoResponse: 'Yziow ofrece:\n• Boletines certificados en PDF y cálculo de promedios\n• Escáner de código QR para asistencia escolar\n• Gestión de pagos de colegiatura y contabilidad\n• Plataforma multilingüe\n\n¿Deseas comenzar ahora?',
        infoActionRegisterSchool: '🏫 Inscribir mi colegio',
        infoActionRegisterParent: '👨‍👩‍👧 Crear cuenta de Padre',

        privateWelcomeDefault: '¡Hola {name}! Soy tu asistente virtual.',
        privateWelcomeSuperadmin: '¡Hola SuperAdmin {name}! ¿Cómo puedo ayudarte a analizar la plataforma hoy?',
        privateWelcomeDirector: '¡Hola {name}! ¿En qué puedo ayudarte en la gestión de tu colegio hoy?',
        privateWelcomeParent: '¡Hola {name}! ¿Cómo puedo ayudarte con la educación de tus hijos hoy?',
        privateWelcomeTeacher: '¡Hola {name}! ¿En qué puedo ayudarte en tus actividades pedagógicas hoy?',

        error400: 'Su mensaje o el historial de conversación no es válido. Por favor, inténtelo de nuevo.',
        error401: 'Su sesión ha caducado. Por favor, inicie sesión de nuevo.',
        error429WithMinutes: (min: number) => `Ha alcanzado su límite de preguntas. Inténtelo de nuevo en ${min} minuto(s).`,
        error429Generic: 'Ha alcanzado su límite de preguntas. Por favor, inténtelo más tarde.',
        error503: 'El asistente no está disponible temporalmente. Por favor, inténtelo más tarde.',
        error500: 'Ha ocurrido un error. Por favor, inténtelo más tarde.',
        errorConnection: 'Error de conexión con el asistente. Por favor, inténtelo más tarde.'
    },
    de: {
        botName: 'Yziow Assistent',
        botSubtitlePublic: 'Interaktiver Leitfaden',
        botSubtitlePrivate: 'Sicherer Assistent',
        needHelpPrompt: 'Brauchen Sie Hilfe beim Einstieg?',
        thinking: 'Assistent denkt nach...',
        inputPlaceholder: 'Stellen Sie eine Frage...',
        close: 'Schließen',
        backToMenu: '⬅️ Zurück zum Hauptmenü',

        welcomeTitle: 'Hallo! 👋 Willkommen bei Yziow. Ich bin Ihr virtueller Assistent.',
        welcomeProfileSelect: 'Um Sie bestmöglich zu unterstützen, wählen Sie bitte Ihr Profil:',

        roleDirector: '🏫 Ich bin Schulleiter / Verwaltung',
        roleParent: '👨‍👩‍👧 Ich bin ein Elternteil',
        roleTeacher: '👨‍🏫 Ich bin Lehrkraft oder Schüler',
        roleInfo: '❓ Funktionen & Preise',

        directorResponse: 'Ausgezeichnet! Mit Yziow verwalten Sie Ihre Schule von A bis Z (zertifizierte PDF-Zeugnisse, Schulgeld, QR-Code-Anwesenheit).\n\nNutzen Sie Ihre kostenlose 14-tägige Testphase unverbindlich!',
        directorActionRegister: '🚀 Meine Schule erstellen (14 Tage gratis)',
        directorActionLogin: '🔑 Im Portal anmelden',

        parentResponse: 'Herzlich willkommen! Als Elternteil verfolgen Sie Noten und Anwesenheit Ihres Kindes in Echtzeit und erhalten Zeugnisse direkt auf Ihr Smartphone.',
        parentActionRegister: '✍️ Als Elternteil registrieren',
        parentActionLogin: '🔑 Als Elternteil anmelden',

        teacherResponse: 'Ihr Konto wird direkt von Ihrer Schulleitung eingerichtet. Nutzen Sie Ihre Anmeldedaten für Kurse und Noten.',
        teacherActionLogin: '🔑 Zur Anmeldeseite',

        infoResponse: 'Yziow bietet:\n• Zertifizierte PDF-Zeugnisse & Notendurchschnitte\n• QR-Code-Scanner für Anwesenheit\n• Schulgeldverwaltung & Buchhaltungsbelege\n• Mehrsprachige App\n\nMöchten Sie jetzt starten?',
        infoActionRegisterSchool: '🏫 Schule registrieren',
        infoActionRegisterParent: '👨‍👩‍👧 Elternkonto erstellen',

        privateWelcomeDefault: 'Hallo {name}! Ich bin Ihr virtueller Assistent.',
        privateWelcomeSuperadmin: 'Hallo SuperAdmin {name}! Wie kann ich Ihnen heute bei der Plattformanalyse helfen?',
        privateWelcomeDirector: 'Hallo {name}! Wie kann ich Ihnen heute bei der Schulverwaltung helfen?',
        privateWelcomeParent: 'Hallo {name}! Wie kann ich Ihnen bei schulischen Fragen Ihrer Kinder helfen?',
        privateWelcomeTeacher: 'Hallo {name}! Wie kann ich Sie heute bei Ihren Lehraktivitäten unterstützen?',

        error400: 'Ihre Nachricht oder der Gesprächsverlauf ist ungültig. Bitte versuchen Sie es erneut.',
        error401: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
        error429WithMinutes: (min: number) => `Sie haben Ihr Fragenlimit erreicht. Bitte versuchen Sie es in ${min} Minute(n) erneut.`,
        error429Generic: 'Sie haben Ihr Fragenlimit erreicht. Bitte versuchen Sie es später erneut.',
        error503: 'Der Assistent ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',
        error500: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
        errorConnection: 'Verbindungsfehler zum Assistenten. Bitte versuchen Sie es später erneut.'
    },
    it: {
        botName: 'Assistente Yziow',
        botSubtitlePublic: 'Guida interattiva',
        botSubtitlePrivate: 'Assistente sicuro',
        needHelpPrompt: 'Hai bisogno di aiuto per iniziare?',
        thinking: 'L’assistente sta elaborando...',
        inputPlaceholder: 'Fai una domanda...',
        close: 'Chiudi',
        backToMenu: '⬅️ Torna al menu principale',

        welcomeTitle: 'Ciao! 👋 Benvenuto su Yziow. Sono il tuo assistente virtuale.',
        welcomeProfileSelect: 'Per orientarti al meglio, indicami il tuo profilo:',

        roleDirector: '🏫 Sono un Dirigente Scolastico / Amministrazione',
        roleParent: '👨‍👩‍👧 Sono un Genitore',
        roleTeacher: '👨‍🏫 Sono un Insegnante o Studente',
        roleInfo: '❓ Funzionalità & Tariffe',

        directorResponse: 'Ottima scelta! Con Yziow gestisci la tua scuola da A a Z (pagelle ufficiali in PDF, rette scolastiche, presenze con codice QR).\n\nHai a disposizione 14 giorni di prova gratuita!',
        directorActionRegister: '🚀 Crea la mia scuola (14g gratis)',
        directorActionLogin: '🔑 Accedi al mio spazio',

        parentResponse: 'Benvenuto! Come genitore, Yziow ti consente di seguire i voti e le presenze di tuo figlio in tempo reale e ricevere le pagelle sul telefono.',
        parentActionRegister: '✍️ Registrati come Genitore',
        parentActionLogin: '🔑 Accedi all’account Genitore',

        teacherResponse: 'Il tuo account viene creato direttamente dall’amministrazione scolastica. Usa le tue credenziali per accedere.',
        teacherActionLogin: '🔑 Vai alla pagina di accesso',

        infoResponse: 'Yziow offre:\n• Pagelle certificate in PDF e calcolo medie\n• Scanner codice QR per presenze\n• Gestione rette e ricevute contabili\n• Applicazione multilingue\n\nVuoi iniziare subito?',
        infoActionRegisterSchool: '🏫 Iscrivi la mia scuola',
        infoActionRegisterParent: '👨‍👩‍👧 Crea account Genitore',

        privateWelcomeDefault: 'Ciao {name}! Sono il tuo assistente virtuale.',
        privateWelcomeSuperadmin: 'Ciao SuperAdmin {name}! Come posso aiutarti ad analizzare la piattaforma oggi?',
        privateWelcomeDirector: 'Ciao {name}! Come posso aiutarti nella gestione della tua scuola oggi?',
        privateWelcomeParent: 'Ciao {name}! Come posso aiutarti per il percorso scolastico dei tuoi figli oggi?',
        privateWelcomeTeacher: 'Ciao {name}! Come posso aiutarti nelle tue attività didattiche oggi?',

        error400: 'Il messaggio o la cronologia della conversazione non è valida. Riprova.',
        error401: 'La sessione è scaduta. Effettua nuovamente l’accesso.',
        error429WithMinutes: (min: number) => `Hai raggiunto il limite di domande. Riprova tra ${min} minuto/i.`,
        error429Generic: 'Hai raggiunto il limite di domande. Riprova più tardi.',
        error503: 'L’assistente è temporaneamente non disponibile. Riprova più tardi.',
        error500: 'Si è verificato un errore. Riprova più tardi.',
        errorConnection: 'Errore di connessione con l’assistente. Riprova più tardi.'
    },
    pt: {
        botName: 'Assistente Yziow',
        botSubtitlePublic: 'Guia interativo',
        botSubtitlePrivate: 'Assistente seguro',
        needHelpPrompt: 'Precisa de ajuda para começar?',
        thinking: 'O assistente está pensando...',
        inputPlaceholder: 'Faça uma pergunta...',
        close: 'Fechar',
        backToMenu: '⬅️ Voltar ao menu principal',

        welcomeTitle: 'Olá! 👋 Bem-vindo ao Yziow. Sou seu assistente virtual.',
        welcomeProfileSelect: 'Para orientá-lo da melhor forma, indique seu perfil:',

        roleDirector: '🏫 Sou Diretor / Gestor Escolar',
        roleParent: '👨‍👩‍👧 Sou Responsável / Pai / Mãe',
        roleTeacher: '👨‍🏫 Sou Professor ou Aluno',
        roleInfo: '❓ Recursos e Preços',

        directorResponse: 'Excelente iniciativa! Com o Yziow, você gerencia sua escola de ponta a ponta (boletins em PDF certificados, mensalidades, presença com QR Code).\n\nAproveite 14 dias de teste gratuito sem compromisso!',
        directorActionRegister: '🚀 Criar minha escola (14d grátis)',
        directorActionLogin: '🔑 Entrar no meu painel',

        parentResponse: 'Bem-vindo! Como responsável, o Yziow permite acompanhar notas e frequências em tempo real e receber boletins no seu celular.',
        parentActionRegister: '✍️ Cadastrar-se como Responsável',
        parentActionLogin: '🔑 Entrar na conta de Responsável',

        teacherResponse: 'Sua conta é criada diretamente pela administração da sua escola. Use suas credenciais para acessar.',
        teacherActionLogin: '🔑 Ir para a página de login',

        infoResponse: 'O Yziow oferece:\n• Boletins em PDF certificados e cálculo de médias\n• Leitor de QR Code para presença\n• Gestão de mensalidades e recibos contábeis\n• Aplicativo multilíngue\n\nDeseja começar agora?',
        infoActionRegisterSchool: '🏫 Cadastrar minha escola',
        infoActionRegisterParent: '👨‍👩‍👧 Criar conta de Responsável',

        privateWelcomeDefault: 'Olá {name}! Sou seu assistente virtual.',
        privateWelcomeSuperadmin: 'Olá SuperAdmin {name}! Como posso ajudar a analisar a plataforma hoje?',
        privateWelcomeDirector: 'Olá {name}! Como posso ajudar na gestão da sua escola hoje?',
        privateWelcomeParent: 'Olá {name}! Como posso ajudar com a vida escolar dos seus filhos hoje?',
        privateWelcomeTeacher: 'Olá {name}! Como posso ajudar em suas atividades pedagógicas hoje?',

        error400: 'Sua mensagem ou o histórico da conversa não é válido. Tente novamente.',
        error401: 'Sua sessão expirou. Faça login novamente.',
        error429WithMinutes: (min: number) => `Você atingiu o limite de perguntas. Tente novamente em ${min} minuto(s).`,
        error429Generic: 'Você atingiu o limite de perguntas. Tente novamente mais tarde.',
        error503: 'O assistente está temporariamente indisponível. Tente novamente mais tarde.',
        error500: 'Ocorreu um erro. Tente novamente mais tarde.',
        errorConnection: 'Erro de conexão com o assistente. Tente novamente mais tarde.'
    },
    ru: {
        botName: 'Ассистент Yziow',
        botSubtitlePublic: 'Интерактивный гид',
        botSubtitlePrivate: 'Безопасный ассистент',
        needHelpPrompt: 'Нужна помощь для начала работы?',
        thinking: 'Ассистент думает...',
        inputPlaceholder: 'Задайте вопрос...',
        close: 'Закрыть',
        backToMenu: '⬅️ Вернуться в главное меню',

        welcomeTitle: 'Здравствуйте! 👋 Добро пожаловать в Yziow. Я ваш виртуальный ассистент.',
        welcomeProfileSelect: 'Чтобы помочь вам наилучшим образом, выберите ваш профиль:',

        roleDirector: '🏫 Я Директор / Администрация школы',
        roleParent: '👨‍👩‍👧 Я Родитель ученика',
        roleTeacher: '👨‍🏫 Я Преподаватель или Ученик',
        roleInfo: '❓ Возможности и Тарифы',

        directorResponse: 'Отличный выбор! С Yziow вы можете управлять школой от А до Я (официальные табели в PDF, оплата обучения, учет посещаемости по QR-коду).\n\nВам доступен 14-дневный бесплатный пробный период!',
        directorActionRegister: '🚀 Создать школу (14 дней бесплатно)',
        directorActionLogin: '🔑 Войти в личный кабинет',

        parentResponse: 'Добро пожаловать! Как родитель, в Yziow вы можете в реальном времени отслеживать оценки и посещаемость вашего ребенка, а также получать табели на телефон.',
        parentActionRegister: '✍️ Зарегистрироваться как Родитель',
        parentActionLogin: '🔑 Войти в кабинет Родителя',

        teacherResponse: 'Ваш аккаунт создается напрямую администрацией школы. Используйте свои данные для входа.',
        teacherActionLogin: '🔑 Перейти на страницу входа',

        infoResponse: 'Yziow предлагает:\n• Сертифицированные табели в PDF и расчет средних баллов\n• QR-сканер посещаемости учеников\n• Учет платежей и квитанций\n• Многоязычная платформа\n\nХотите начать прямо сейчас?',
        infoActionRegisterSchool: '🏫 Зарегистрировать школу',
        infoActionRegisterParent: '👨‍👩‍👧 Создать аккаунт Родителя',

        privateWelcomeDefault: 'Здравствуйте, {name}! Я ваш виртуальный ассистент.',
        privateWelcomeSuperadmin: 'Здравствуйте, SuperAdmin {name}! Чем я могу помочь в анализе платформы сегодня?',
        privateWelcomeDirector: 'Здравствуйте, {name}! Чем я могу помочь в управлении школой сегодня?',
        privateWelcomeParent: 'Здравствуйте, {name}! Чем я могу помочь в вопросах обучения ваших детей?',
        privateWelcomeTeacher: 'Здравствуйте, {name}! Чем я могу помочь в вашей педагогической работе?',

        error400: 'Ваше сообщение или история переписки некорректны. Пожалуйста, попробуйте снова.',
        error401: 'Срок действия сессии истек. Пожалуйста, войдите снова.',
        error429WithMinutes: (min: number) => `Вы достигли лимита вопросов. Пожалуйста, повторите попытку через ${min} мин.`,
        error429Generic: 'Вы достигли лимита вопросов. Пожалуйста, повторите попытку позже.',
        error503: 'Ассистент временно недоступен. Пожалуйста, повторите попытку позже.',
        error500: 'Произошла ошибка. Пожалуйста, повторите попытку позже.',
        errorConnection: 'Ошибка подключения к ассистенту. Пожалуйста, повторите попытку позже.'
    },
    ar: {
        botName: 'مساعد Yziow',
        botSubtitlePublic: 'دليل تفاعلي',
        botSubtitlePrivate: 'مساعد آمن',
        needHelpPrompt: 'هل تحتاج إلى مساعدة للبدء؟',
        thinking: 'المساعد يفكر...',
        inputPlaceholder: 'اطرح سؤالاً...',
        close: 'إغلاق',
        backToMenu: '⬅️ العودة إلى القائمة الرئيسية',

        welcomeTitle: 'مرحباً بك! 👋 أهلاً بك في منصة Yziow. أنا مساعدك الذكي الافتراضي.',
        welcomeProfileSelect: 'لتوجيهك بالشكل الأمثل، يرجى تحديد صفك أو دورك :',

        roleDirector: '🏫 أنا مدير مدرسة / إدارة تعليمية',
        roleParent: '👨‍👩‍👧 أنا ولي أمر طالب',
        roleTeacher: '👨‍🏫 أنا أستاذ أو طالب',
        roleInfo: '❓ استكشاف الميزات والأسعار',

        directorResponse: 'خطوة ممتازة! مع Yziow، يمكنك إدارة مؤسستك التعليمية بالكامل من الألف إلى الياء (كشوف درجات PDF معتمدة، تحصيل الرسوم، تسجيل الحضور برمز QR).\n\nاستفد من فترة تجريبية مجانية لمدة 14 يوماً بدون أي التزام!',
        directorActionRegister: '🚀 إنشاء مدرستي (14 يوماً مجاناً)',
        directorActionLogin: '🔑 تسجيل الدخول إلى حسابي',

        parentResponse: 'أهلاً بك! بصفتك ولي أمر، يتيح لك Yziow متابعة درجات طفلك وحضوره في الوقت الفعلي واستلام كشوف الدرجات مباشرة على هاتفك.',
        parentActionRegister: '✍️ التسجيل كولي أمر',
        parentActionLogin: '🔑 تسجيل الدخول كولي أمر',

        teacherResponse: 'يتم إنشاء حسابك مباشرة من قِبل إدارة مؤسستك التعليمية. يمكنك استخدام بيانات الدخول الخاصة بك للوصول إلى الدروس والدرجات.',
        teacherActionLogin: '🔑 الانتقال لصفحة تسجيل الدخول',

        infoResponse: 'تقدم منصة Yziow:\n• كشوف درجات PDF معتمدة وحساب المعدلات\n• ماسح رمز QR لتسجيل حضور الطلاب\n• إدارة رسوم الدراسة وإيصالات المحاسبة\n• تطبيق متعدد اللغات (عربي، فرنسي، إنجليزي...)\n\nهل ترغب في البدء الآن؟',
        infoActionRegisterSchool: '🏫 تسجيل مدرستي',
        infoActionRegisterParent: '👨‍👩‍👧 إنشاء حساب ولي أمر',

        privateWelcomeDefault: 'مرحباً {name}! أنا مساعدك الافتراضي الخاص.',
        privateWelcomeSuperadmin: 'مرحباً SuperAdmin {name}! كيف يمكنني مساعدتك في تحليل بيانات المنصة اليوم؟',
        privateWelcomeDirector: 'مرحباً {name}! كيف يمكنني مساعدتك في إدارة مدرستك اليوم؟',
        privateWelcomeParent: 'مرحباً {name}! كيف يمكنني مساعدتك في متابعة دراسة أبنائك اليوم؟',
        privateWelcomeTeacher: 'مرحباً {name}! كيف يمكنني مساعدتك في أنشطتك التعليمية اليوم؟',

        error400: 'الرسالة أو سجل المحادثة غير صالح. يرجى المحاولة مرة أخرى.',
        error401: 'انتهت صلاحية جلستك. يرجى تسجيل الدخول مجدداً.',
        error429WithMinutes: (min: number) => `لقد بلغت الحد الأقصى للأسئلة المسموح بها. يرجى المحاولة بعد ${min} دقيقة/دقائق.`,
        error429Generic: 'لقد بلغت الحد الأقصى للأسئلة المسموح بها. يرجى المحاولة لاحقاً.',
        error503: 'المساعد الذكي غير متاح مؤقتاً. يرجى المحاولة لاحقاً.',
        error500: 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.',
        errorConnection: 'تعذر الاتصال بالمساعد الذكي. يرجى المحاولة لاحقاً.'
    },
    zh: {
        botName: 'Yziow 智能助手',
        botSubtitlePublic: '互动向导',
        botSubtitlePrivate: '安全助手',
        needHelpPrompt: '需要帮助开始使用吗？',
        thinking: '助手正在思考...',
        inputPlaceholder: '请输入您的问题...',
        close: '关闭',
        backToMenu: '⬅️ 返回主菜单',

        welcomeTitle: '您好！👋 欢迎来到 Yziow。我是您的虚拟智能助手。',
        welcomeProfileSelect: '为了更好地为您提供指引，请选择您的身份：',

        roleDirector: '🏫 我是校长 / 学校管理人员',
        roleParent: '👨‍👩‍👧 我是学生家长',
        roleTeacher: '👨‍🏫 我是教师或学生',
        roleInfo: '❓ 了解平台功能与收费方案',

        directorResponse: '非常欢迎！通过 Yziow，您可以全方位管理学校（官方权威 PDF 成绩单、学费管理、二维码考勤签到）。\n\n立即享受 14 天免费试用，无需任何约束！',
        directorActionRegister: '🚀 立即注册学校（14天免费）',
        directorActionLogin: '🔑 登录学校管理后台',

        parentResponse: '您好！作为家长，Yziow 支持您实时查看孩子的成绩、考勤动态，并在手机上直接接收成绩报告单。',
        parentActionRegister: '✍️ 注册家长账号',
        parentActionLogin: '🔑 登录家长账户',

        teacherResponse: '您的账号由学校管理处统一创建。请使用学校分配的账号密码登录系统。',
        teacherActionLogin: '🔑 前往登录页面',

        infoResponse: 'Yziow 平台特色：\n• 权威认证 PDF 成绩单与自动均分计算\n• 二维码学生快速出勤考勤\n• 学费收据与财务台账\n• 多语言支持（中、英、法、阿等）\n\n您想现在立即体验吗？',
        infoActionRegisterSchool: '🏫 注册我的学校',
        infoActionRegisterParent: '👨‍👩‍👧 创建家长账号',

        privateWelcomeDefault: '您好 {name}！我是您的虚拟助手。',
        privateWelcomeSuperadmin: '您好超级管理员 {name}！今天有什么可以协助您分析全平台运营数据的吗？',
        privateWelcomeDirector: '您好 {name} 校长！今天在学校管理方面有什么可以协助您的？',
        privateWelcomeParent: '您好 {name} 家长！今天在孩子学业跟踪方面有什么可以协助您的？',
        privateWelcomeTeacher: '您好 {name} 老师！今天在教学教务活动中有什么可以协助您的？',

        error400: '您的消息内容或对话历史记录无效。请重新输入。',
        error401: '您的登录会话已过期。请重新登录系统。',
        error429WithMinutes: (min: number) => `您已达到当前提问额度上限。请在 ${min} 分钟后重试。`,
        error429Generic: '您已达到提问额度上限。请稍后再试。',
        error503: '智能助手暂时不可用。请稍后再试。',
        error500: '系统发生错误。请稍后重试。',
        errorConnection: '连接助手失败。请检查网络后重试。'
    }
};

/**
 * Récupère le dictionnaire de traduction pour la langue demandée avec fallback 'fr'.
 */
export function getAssistantTranslations(rawLang?: string | null): AssistantTranslations {
    const lang = normalizeAssistantLanguage(rawLang);
    return ASSISTANT_DICTIONARY[lang] || ASSISTANT_DICTIONARY.fr;
}
