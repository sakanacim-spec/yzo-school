// ============================================================
// PUBLIC I18N — Dictionnaire complet pour les 9 langues
// (fr, en, es, ar, it, de, pt, zh, ru)
// ============================================================

export interface PublicTranslations {
  nav: {
    features: string;
    partners: string;
    login: string;
    loginMobile: string;
  };
  hero: {
    badge: string;
    title1: string;
    title2: string;
    desc: string;
    ctaRegister: string;
    ctaFeatures: string;
    boxTitle: string;
    boxDesc: string;
    benefit1_title: string;
    benefit1_desc: string;
    benefit2_title: string;
    benefit2_desc: string;
  };
  sponsors: {
    subtitle: string;
    title: string;
    desc: string;
    c1_title: string;
    c1_desc: string;
    c2_title: string;
    c2_desc: string;
    c3_title: string;
    c3_desc: string;
    c4_title: string;
    c4_desc: string;
    partnerCta: string;
  };
  features: {
    subtitle: string;
    title: string;
    f1_title: string;
    f1_desc: string;
    f2_title: string;
    f2_desc: string;
    f3_title: string;
    f3_desc: string;
  };
  footer: {
    desc: string;
    company: string;
    about: string;
    contact: string;
    careers: string;
    ambassador: string;
    resources: string;
    guide: string;
    legal: string;
    cgu: string;
    privacy: string;
    mentions: string;
    partner_title: string;
    partner_desc: string;
    partner_discover: string;
    partner_btn: string;
    rights: string;
    madeIn: string;
  };
  guide: {
    backToHome: string;
    registerCta: string;
    badge: string;
    title: string;
    desc: string;
    notice: string;
    sec1_role: string;
    sec1_desc: string;
    sec1_s1_title: string;
    sec1_s1_desc: string;
    sec1_s2_title: string;
    sec1_s2_desc: string;
    sec1_s3_title: string;
    sec1_s3_desc: string;
    sec2_role: string;
    sec2_desc: string;
    sec2_s1_title: string;
    sec2_s1_desc: string;
    sec2_s2_title: string;
    sec2_s2_desc: string;
    sec2_s3_title: string;
    sec2_s3_desc: string;
    sec3_role: string;
    sec3_desc: string;
    sec3_s1_title: string;
    sec3_s1_desc: string;
    sec3_s2_title: string;
    sec3_s2_desc: string;
    sec3_s3_title: string;
    sec3_s3_desc: string;
    bottom_title: string;
    bottom_desc: string;
    bottom_cta: string;
  };
  contact: {
    partnershipSubject: string;
    partnershipMessage: string;
  };
}

export const PUBLIC_I18N: Record<string, PublicTranslations> = {
  // ── FRANÇAIS ──
  fr: {
    nav: {
      features: "Nos Solutions",
      partners: "Partenaires",
      login: "ACCÉDER À MON ESPACE",
      loginMobile: "CONNEXION"
    },
    hero: {
      badge: "LA PLATEFORME ÉDUCATIVE DE RÉFÉRENCE",
      title1: "L'excellence",
      title2: "au cœur de l'école.",
      desc: "Une solution complète pour la gestion scolaire, connectant directeurs, enseignants, parents et élèves dans un environnement moderne et intuitif.",
      ctaRegister: "Inscrire mon établissement",
      ctaFeatures: "Découvrir les fonctionnalités",
      boxTitle: "Une gestion scolaire structurée et sécurisée",
      boxDesc: "Centralisez les opérations de votre établissement et attribuez à chaque utilisateur un accès adapté à son rôle. Les communications avec la plateforme sont protégées via HTTPS.",
      benefit1_title: "Gestion centralisée",
      benefit1_desc: "Administration, scolarité et finances",
      benefit2_title: "Accès selon les rôles",
      benefit2_desc: "Directeurs, enseignants et parents"
    },
    sponsors: {
      subtitle: "ÉCOSYSTÈME DE PARTENAIRES",
      title: "Ensemble, développons des services utiles à l'éducation",
      desc: "YZIOW prépare des collaborations avec des acteurs financiers, technologiques et éducatifs afin de proposer des services adaptés aux établissements, au personnel et aux familles.",
      c1_title: "Banques & Institutions financières",
      c1_desc: "Services de règlement des frais et solutions financières adaptées au monde éducatif.",
      c2_title: "Télécoms & Services numériques",
      c2_desc: "Infrastructures de connectivité, messagerie SMS et services digitaux pour les écoles.",
      c3_title: "Fournitures & Équipements scolaires",
      c3_desc: "Réseau de fournisseurs de manuels, papeterie et matériel pédagogique de qualité.",
      c4_title: "Transport, Assurance & Services",
      c4_desc: "Solutions de mobilité scolaire, couverture d'assurance et accompagnement périscolaire.",
      partnerCta: "Devenir partenaire"
    },
    features: {
      subtitle: "Nos Solutions",
      title: "Tout le suivi scolaire regroupé sur une plateforme unique",
      f1_title: "Bulletins & Notes",
      f1_desc: "Visualisez les notes dès leur saisie. Téléchargez et vérifiez les bulletins officiels en format PDF sécurisé.",
      f2_title: "Présences & Absences",
      f2_desc: "Suivez en temps réel l'assiduité. Soyez immédiatement notifié en cas d'absence ou de retard.",
      f3_title: "Espaces Établissements",
      f3_desc: "Interface complète pour directeurs et secrétaires : gestion des inscriptions, scolarité et facturation."
    },
    footer: {
      desc: "La plateforme moderne qui connecte l'école, les parents et les élèves pour une réussite scolaire assurée.",
      company: "Entreprise",
      about: "Qui sommes-nous",
      contact: "Contact & Assistance",
      careers: "Carrières",
      ambassador: "Programme Ambassadeur",
      resources: "Ressources",
      guide: "Guide de prise en main",
      legal: "Légal",
      cgu: "Conditions générales d'utilisation",
      privacy: "Politique de confidentialité",
      mentions: "Mentions légales",
      partner_title: "Devenir Partenaire",
      partner_desc: "Rejoignez l'écosystème YZIOW et développons ensemble des services utiles aux établissements, au personnel et aux familles.",
      partner_discover: "Découvrir les partenaires",
      partner_btn: "Devenir partenaire",
      rights: "© 2026 Yziow. Tous droits réservés.",
      madeIn: "Fait avec passion au Bénin 🇧🇯"
    },
    guide: {
      backToHome: "Retour à l'accueil",
      registerCta: "Inscrire mon établissement",
      badge: "Guide de Prise en Main",
      title: "Bien démarrer sur YZIOW",
      desc: "Découvrez pas à pas les fonctionnalités disponibles selon votre profil d'accès.",
      notice: "Ce guide constitue un aperçu public des fonctionnalités disponibles sur la plateforme YZIOW.",
      sec1_role: "Établissements & Directeurs",
      sec1_desc: "Déploiement et gestion administrative globale de votre école.",
      sec1_s1_title: "1. Configuration de l'établissement",
      sec1_s1_desc: "Créez votre compte directeur, définissez vos cycles d'enseignement et configurez les classes, matières et coefficients académiques.",
      sec1_s2_title: "2. Inscription des élèves & Personnel",
      sec1_s2_desc: "Enregistrez vos élèves, affectez les enseignants à leurs matières et gérez les cartes scolaires avec QR code.",
      sec1_s3_title: "3. Gestion financière & Bulletins",
      sec1_s3_desc: "Suivez les règlements de scolarité, générez des reçus de paiement et éditez les bulletins de notes trimestriels ou semestriels au format PDF.",
      sec2_role: "Enseignants & Personnel pédagogique",
      sec2_desc: "Outils quotidiens pour la gestion de classe et le suivi des élèves.",
      sec2_s1_title: "1. Appel & Présences",
      sec2_s1_desc: "Enregistrez les présences et les absences depuis votre espace enseignant.",
      sec2_s2_title: "2. Saisie des évaluations",
      sec2_s2_desc: "Saisissez les notes de devoirs et d'examens avec calcul des moyennes pondérées selon le barème configuré.",
      sec2_s3_title: "3. Cahier de textes & Devoirs",
      sec2_s3_desc: "Partagez les leçons étudiées, les devoirs à faire et les ressources pédagogiques.",
      sec3_role: "Parents & Familles",
      sec3_desc: "Accompagnement et suivi de la scolarité de vos enfants.",
      sec3_s1_title: "1. Connexion à votre espace parent",
      sec3_s1_desc: "Accédez à votre espace sécurisé avec votre numéro de téléphone pour retrouver les enfants associés à votre compte.",
      sec3_s2_title: "2. Suivi des notes et présences",
      sec3_s2_desc: "Consultez les notes publiées, les relevés d'absences et téléchargez les bulletins scolaires publiés par l'établissement.",
      sec3_s3_title: "3. Paiements & Reçus",
      sec3_s3_desc: "Consultez l'état de vos règlements de scolarité et accédez à l'historique de vos reçus de paiement.",
      bottom_title: "Prêt à digitaliser votre établissement ?",
      bottom_desc: "Créez l'espace de votre établissement et configurez progressivement ses informations.",
      bottom_cta: "Inscrire mon établissement"
    },
    contact: {
      partnershipSubject: "Demande de partenariat",
      partnershipMessage: "[Demande de partenariat] Bonjour, notre organisation souhaite devenir partenaire d'YZIOW."
    }
  },

  // ── ANGLAIS ──
  en: {
    nav: {
      features: "Our Solutions",
      partners: "Partners",
      login: "GO TO MY SPACE",
      loginMobile: "LOGIN"
    },
    hero: {
      badge: "THE LEADING EDUCATIONAL PLATFORM",
      title1: "Excellence",
      title2: "at the heart of the school.",
      desc: "A complete school management solution connecting principals, teachers, parents, and students in a modern, intuitive environment.",
      ctaRegister: "Register my school",
      ctaFeatures: "Explore features",
      boxTitle: "Structured and secure school management",
      boxDesc: "Centralize your school operations and assign role-tailored access to each user. Communications with the platform are protected via HTTPS.",
      benefit1_title: "Centralized management",
      benefit1_desc: "Administration, academics, and finances",
      benefit2_title: "Role-based access",
      benefit2_desc: "Principals, teachers, and parents"
    },
    sponsors: {
      subtitle: "PARTNER ECOSYSTEM",
      title: "Together, let's build useful services for education",
      desc: "YZIOW is building collaborations with financial, technological, and educational partners to deliver tailored services to schools, staff, and families.",
      c1_title: "Banks & Financial Institutions",
      c1_desc: "Fee payment services and financial solutions tailored to the education sector.",
      c2_title: "Telecom & Digital Services",
      c2_desc: "Connectivity infrastructure, SMS notifications, and digital tools for schools.",
      c3_title: "School Supplies & Equipment",
      c3_desc: "Network of verified suppliers for textbooks, stationery, and educational material.",
      c4_title: "Transport, Insurance & Services",
      c4_desc: "School mobility solutions, insurance coverage, and extracurricular support.",
      partnerCta: "Become a partner"
    },
    features: {
      subtitle: "Our Solutions",
      title: "All school tracking gathered on a single platform",
      f1_title: "Report Cards & Grades",
      f1_desc: "View grades as soon as they are entered. Download and verify official report cards in a secure PDF format.",
      f2_title: "Attendance & Absences",
      f2_desc: "Track attendance in real-time. Get instantly notified in case of an absence or delay.",
      f3_title: "School Workspaces",
      f3_desc: "Complete interface for principals and secretaries: manage enrollments, academics, and billing."
    },
    footer: {
      desc: "The modern platform connecting the school, parents, and students for guaranteed academic success.",
      company: "Company",
      about: "About us",
      contact: "Contact & Support",
      careers: "Careers",
      ambassador: "Ambassador Program",
      resources: "Resources",
      guide: "User Guide",
      legal: "Legal",
      cgu: "Terms of Service",
      privacy: "Privacy Policy",
      mentions: "Legal Mentions",
      partner_title: "Become a Partner",
      partner_desc: "Join the YZIOW ecosystem and let's develop valuable services for schools, staff, and families.",
      partner_discover: "Explore partners",
      partner_btn: "Become a partner",
      rights: "© 2026 Yziow. All rights reserved.",
      madeIn: "Made with passion in Benin 🇧🇯"
    },
    guide: {
      backToHome: "Back to home",
      registerCta: "Register my school",
      badge: "User Guide",
      title: "Getting Started with YZIOW",
      desc: "Discover step-by-step features available according to your user role.",
      notice: "This guide provides a public overview of the features available on the YZIOW platform.",
      sec1_role: "Schools & Principals",
      sec1_desc: "Global administrative deployment and management of your school.",
      sec1_s1_title: "1. School Setup",
      sec1_s1_desc: "Create your principal account, set up educational cycles, and configure classes, subjects, and grading weights.",
      sec1_s2_title: "2. Student & Staff Enrollment",
      sec1_s2_desc: "Register students, assign teachers to subjects, and manage QR code student ID cards.",
      sec1_s3_title: "3. Financial & Academic Tracking",
      sec1_s3_desc: "Track tuition payments, generate payment receipts, and issue term report cards in PDF format.",
      sec2_role: "Teachers & Educational Staff",
      sec2_desc: "Daily tools for classroom management and student progress.",
      sec2_s1_title: "1. Roll Call & Attendance",
      sec2_s1_desc: "Record attendance and absences directly from your teacher dashboard.",
      sec2_s2_title: "2. Grade Entry",
      sec2_s2_desc: "Enter evaluation scores with automated average calculations based on configured scales.",
      sec2_s3_title: "3. Lesson Log & Homework",
      sec2_s3_desc: "Share daily lessons, assignments, and learning resources.",
      sec3_role: "Parents & Families",
      sec3_desc: "Support and monitoring of your children's schooling.",
      sec3_s1_title: "1. Parent Space Login",
      sec3_s1_desc: "Sign in securely with your phone number to access children associated with your account.",
      sec3_s2_title: "2. Grades & Attendance Tracking",
      sec3_s2_desc: "View published grades, attendance summaries, and download term report cards published by the school.",
      sec3_s3_title: "3. Payments & Receipts",
      sec3_s3_desc: "View your tuition fee status and download your payment receipts history.",
      bottom_title: "Ready to digitize your school?",
      bottom_desc: "Create your school space and configure its settings at your own pace.",
      bottom_cta: "Register my school"
    },
    contact: {
      partnershipSubject: "Partnership Request",
      partnershipMessage: "[Partnership Request] Hello, our organization is interested in becoming an YZIOW partner."
    }
  },

  // ── ESPAGNOL ──
  es: {
    nav: {
      features: "Nuestras Soluciones",
      partners: "Socios",
      login: "ACCEDER A MI ESPACIO",
      loginMobile: "ACCEDER"
    },
    hero: {
      badge: "LA PLATAFORMA EDUCATIVA DE REFERENCIA",
      title1: "La excelencia",
      title2: "en el corazón de la escuela.",
      desc: "Una solución integral de gestión escolar que conecta directores, profesores, familias y estudiantes en un entorno moderno e intuitivo.",
      ctaRegister: "Inscribir mi colegio",
      ctaFeatures: "Descubrir funcionalidades",
      boxTitle: "Gestión escolar estructurada y segura",
      boxDesc: "Centralice las operaciones de su colegio y asigne a cada usuario un acceso según su rol. Las comunicaciones con la plataforma están protegidas mediante HTTPS.",
      benefit1_title: "Gestión centralizada",
      benefit1_desc: "Administración, secretaría y finanzas",
      benefit2_title: "Acceso según roles",
      benefit2_desc: "Directores, profesores y familias"
    },
    sponsors: {
      subtitle: "ECOSISTEMA DE SOCIOS",
      title: "Juntos, desarrollemos servicios útiles para la educación",
      desc: "YZIOW prepara colaboraciones con actores financieros, tecnológicos y educativos para ofrecer servicios adaptados a colegios, personal y familias.",
      c1_title: "Bancos e Instituciones Financieras",
      c1_desc: "Servicios de pago de matrículas y soluciones financieras adaptadas al ámbito educativo.",
      c2_title: "Telecomunicaciones y Servicios Digitales",
      c2_desc: "Infraestructura de conectividad, notificaciones SMS y herramientas digitales escolares.",
      c3_title: "Suministros y Equipamiento Escolar",
      c3_desc: "Red de distribuidores verificados de libros de texto, papelería y material pedagógico.",
      c4_title: "Transporte, Seguros y Servicios",
      c4_desc: "Soluciones de transporte escolar, coberturas de seguros y actividades complementarias.",
      partnerCta: "Convertirse en socio"
    },
    features: {
      subtitle: "Nuestras Soluciones",
      title: "Todo el seguimiento escolar en una plataforma única",
      f1_title: "Boletines y Notas",
      f1_desc: "Visualice las notas apenas se ingresan. Descargue y verifique los boletines oficiales en PDF seguro.",
      f2_title: "Asistencias y Ausencias",
      f2_desc: "Haga seguimiento de la asistencia en tiempo real. Sea notificado de inmediato en caso de ausencia.",
      f3_title: "Espacios para Escuelas",
      f3_desc: "Interfaz completa para directores y secretarias: gestión de inscripciones y facturación."
    },
    footer: {
      desc: "La plataforma moderna que conecta a la escuela, padres y estudiantes para un éxito escolar asegurado.",
      company: "Empresa",
      about: "Quiénes somos",
      contact: "Contacto y Soporte",
      careers: "Carreras",
      ambassador: "Programa de Embajadores",
      resources: "Recursos",
      guide: "Guía de inicio",
      legal: "Legal",
      cgu: "Términos de Servicio",
      privacy: "Política de Privacidad",
      mentions: "Avisos legales",
      partner_title: "Convertirse en Socio",
      partner_desc: "Únase al ecosistema YZIOW y desarrollemos juntos servicios útiles para los colegios, el personal y las familias.",
      partner_discover: "Descubrir socios",
      partner_btn: "Convertirse en socio",
      rights: "© 2026 Yziow. Todos los derechos reservados.",
      madeIn: "Hecho con pasión en Benín 🇧🇯"
    },
    guide: {
      backToHome: "Volver al inicio",
      registerCta: "Inscribir mi colegio",
      badge: "Guía de Inicio",
      title: "Comenzar con YZIOW",
      desc: "Descubra paso a paso las funcionalidades disponibles según su perfil de usuario.",
      notice: "Esta guía es una descripción pública de las funciones disponibles en la plataforma YZIOW.",
      sec1_role: "Colegios y Directores",
      sec1_desc: "Configuración y gestión administrativa general de su centro educativo.",
      sec1_s1_title: "1. Configuración del centro",
      sec1_s1_desc: "Cree su cuenta directiva, configure los ciclos educativos y defina clases, asignaturas y ponderaciones.",
      sec1_s2_title: "2. Registro de alumnado y personal",
      sec1_s2_desc: "Registre a los estudiantes, asigne el profesorado y gestione carnés escolares con código QR.",
      sec1_s3_title: "3. Gestión de cobros y boletines",
      sec1_s3_desc: "Consulte el estado de cuotas escolares, genere recibos de pago y emita boletines en formato PDF.",
      sec2_role: "Profesorado y Personal docente",
      sec2_desc: "Herramientas de uso diario para la gestión de clases y el progreso del alumnado.",
      sec2_s1_title: "1. Control de asistencia",
      sec2_s1_desc: "Registre las asistencias y faltas directamente desde su panel docente.",
      sec2_s2_title: "2. Calificación de exámenes",
      sec2_s2_desc: "Introduzca notas de tareas y exámenes con cálculo automático de promedios según la escala establecida.",
      sec2_s3_title: "3. Cuaderno de clase y deberes",
      sec2_s3_desc: "Comparta lecciones, tareas para casa y material complementario.",
      sec3_role: "Familias y Tutores",
      sec3_desc: "Acompañamiento y seguimiento académico de sus hijos.",
      sec3_s1_title: "1. Acceso a su espacio familiar",
      sec3_s1_desc: "Inicie sesión con su número de teléfono para consultar a los estudiantes vinculados a su cuenta.",
      sec3_s2_title: "2. Seguimiento de notas y faltas",
      sec3_s2_desc: "Consulte calificaciones, registros de asistencia y descargue los boletines emitidos por el colegio.",
      sec3_s3_title: "3. Pagos y recibos",
      sec3_s3_desc: "Verifique el estado de las mensualidades y acceda al historial completo de recibos de pago.",
      bottom_title: "¿Listo para digitalizar su colegio?",
      bottom_desc: "Cree el espacio de su colegio y configure sus datos paso a paso.",
      bottom_cta: "Inscribir mi colegio"
    },
    contact: {
      partnershipSubject: "Solicitud de asociación",
      partnershipMessage: "[Solicitud de asociación] Hola, nuestra organización desea ser socia de YZIOW."
    }
  },

  // ── ARABE (RTL) ──
  ar: {
    nav: {
      features: "حلولنا",
      partners: "الشركاء",
      login: "تسجيل الدخول",
      loginMobile: "دخول"
    },
    hero: {
      badge: "المنصة التعليمية الرائدة",
      title1: "التميز",
      title2: "في قلب المدرسة.",
      desc: "حل متكامل للإدارة المدرسية يربط بين المديرين والمعلمين وأولياء الأمور والطلاب في بيئة حديثة وسلسة.",
      ctaRegister: "تسجيل مؤسستي",
      ctaFeatures: "استكشاف المميزات",
      boxTitle: "إدارة مدرسية منظمة وآمنة",
      boxDesc: "مركزية عمليات مؤسستك وتخصيص الصلاحيات لكل مستخدم حسب دوره. الاتصالات مع المنصة محمية عبر بروتوكول HTTPS.",
      benefit1_title: "إدارة مركزية",
      benefit1_desc: "الشؤون الإدارية والأكاديمية والمالية",
      benefit2_title: "صلاحيات حسب الدور",
      benefit2_desc: "المديرون والمعلمون وأولياء الأمور"
    },
    sponsors: {
      subtitle: "منظومة الشركاء",
      title: "معاً، نطور خدمات مفيدة للتعليم",
      desc: "تعمل YZIOW على بناء شراكات مع جهات مالية وتقنية وتعليمية لتقديم خدمات مخصصة للمؤسسات التعليمية والكوادر والأسر.",
      c1_title: "البنوك والمؤسسات المالية",
      c1_desc: "خدمات سداد الرسوم المدرسية وحلول مالية مخصصة للقطاع التعليمي.",
      c2_title: "الاتصالات والخدمات الرقمية",
      c2_desc: "بنية تحتية للاتصال، رسائل نصية قصيرة وخدمات رقمية للمدارس.",
      c3_title: "المستلزمات والمعدات المدرسية",
      c3_desc: "شبكة معتمدة لتوفير الكتب المدرسية والقرطاسية والوسائل التعليمية.",
      c4_title: "النقل والتأمين والخدمات",
      c4_desc: "حلول النقل المدرسي والتغطية التأمينية والأنشطة الإضافية.",
      partnerCta: "كن شريكاً"
    },
    features: {
      subtitle: "حلولنا",
      title: "كل التتبع المدرسي مجموع في منصة واحدة",
      f1_title: "النتائج والدرجات",
      f1_desc: "شاهد الدرجات بمجرد إدخالها. قم بتنزيل والتحقق من النتائج الرسمية بصيغة PDF آمنة.",
      f2_title: "الحضور والغياب",
      f2_desc: "تتبع الحضور في الوقت الفعلي. احصل على إشعار فوري في حالة الغياب أو التأخير.",
      f3_title: "مساحات المؤسسات",
      f3_desc: "واجهة كاملة للمديرين والسكرتارية: إدارة التسجيل والفوترة."
    },
    footer: {
      desc: "المنصة الحديثة التي تربط بين المدرسة والآباء والطلاب لنجاح دراسي مضمون.",
      company: "الشركة",
      about: "من نحن",
      contact: "الاتصال والدعم",
      careers: "وظائف",
      ambassador: "برنامج السفراء",
      resources: "الموارد",
      guide: "دليل البدء",
      legal: "قانوني",
      cgu: "شروط الاستخدام",
      privacy: "سياسة الخصوصية",
      mentions: "ملاحظات قانونية",
      partner_title: "كن شريكاً",
      partner_desc: "انضم إلى منظومة YZIOW ولنعمل معاً على تطوير خدمات مفيدة للمدارس والكوادر والأسر.",
      partner_discover: "استكشف الشركاء",
      partner_btn: "كن شريكاً",
      rights: "© 2026 Yziow. جميع الحقوق محفوظة.",
      madeIn: "صنع بشغف في بنين 🇧🇯"
    },
    guide: {
      backToHome: "العودة للرئيسية",
      registerCta: "تسجيل مؤسستي",
      badge: "دليل البدء والاستخدام",
      title: "دليل البدء على منصة YZIOW",
      desc: "تعرف خطوة بخطوة على الميزات المتاحة بحسب نوع حسابك.",
      notice: "يقدم هذا الدليل نظرة عامة عامة حول الوظائف المتاحة في منصة YZIOW.",
      sec1_role: "المؤسسات والمديرون",
      sec1_desc: "التهيئة العامة والإدارة الشاملة للمدرسة.",
      sec1_s1_title: "1. إعداد المؤسسة",
      sec1_s1_desc: "أنشئ حساب الإدارة، وحدد المراحل التعليمية واضبط الفصول والمواد والمعاملات الدراسية.",
      sec1_s2_title: "2. تسجيل الطلاب والكوادر",
      sec1_s2_desc: "سجل بيانات الطلاب، ووزع المواد على المعلمين وقم بإدارة البطاقات المدرسية برمز QR.",
      sec1_s3_title: "3. إدارة المصاريف والشهادات",
      sec1_s3_desc: "تابع تسديد المصاريف المدرسية، واستخرج إيصالات الدفع والشهادات الفصلية بصيغة PDF.",
      sec2_role: "المعلمون والكوادر التربوية",
      sec2_desc: "أدوات يومية لإدارة الصف ومتابعة تقدم الطلاب.",
      sec2_s1_title: "1. تسجيل الحضور والغياب",
      sec2_s1_desc: "سجل الحضور والغياب للطلاب مباشرة من لوحة تحكم المعلم.",
      sec2_s2_title: "2. إدخال التقييمات",
      sec2_s2_desc: "أدخل درجات الفروض والاختبارات مع حساب تلقائي للمعدلات وفق المعايير المحددة.",
      sec2_s3_title: "3. كراس الدروس والواجبات",
      sec2_s3_desc: "شارك الدروس المنجزة والواجبات المنزلية والموارد التعليمية.",
      sec3_role: "أولياء الأمور والأسر",
      sec3_desc: "متابعة مستمرة وشفافة للمسار الدراسي لأبنائكم.",
      sec3_s1_title: "1. الدخول لحساب ولي الأمر",
      sec3_s1_desc: "سجل الدخول بأمان برقم هاتفك للوصول إلى بيانات الأبناء المرتبطين بحسابك.",
      sec3_s2_title: "2. متابعة الدرجات والغياب",
      sec3_s2_desc: "اطلع على النتائج المعلنة وسجل الحضور وحمل كشوف الدرجات الصادرة من المدرسة.",
      sec3_s3_title: "3. المدفوعات والإيصالات",
      sec3_s3_desc: "تحقق من وضع الرسوم المدرسية واطلع على سجل إيصالات السداد.",
      bottom_title: "مستعد لرقمنة مؤسستك التعليمية؟",
      bottom_desc: "أنشئ حساب مؤسستك واضبط بياناتها تدريجياً وبكل سهولة.",
      bottom_cta: "تسجيل مؤسستي"
    },
    contact: {
      partnershipSubject: "طلب شراكة",
      partnershipMessage: "[طلب شراكة] مرحباً، ترغب مؤسستنا في بناء شراكة مع YZIOW."
    }
  },

  // ── ITALIEN ──
  it: {
    nav: {
      features: "Le Nostre Soluzioni",
      partners: "Partner",
      login: "ACCEDI AL MIO SPAZIO",
      loginMobile: "ACCEDI"
    },
    hero: {
      badge: "LA PIATTAFORMA EDUCATIVA DI RIFERIMENTO",
      title1: "L'eccellenza",
      title2: "al cuore della scuola.",
      desc: "Una soluzione completa di gestione scolastica che connette dirigenti, insegnanti, genitori e studenti in un ambiente moderno e intuitivo.",
      ctaRegister: "Registra la mia scuola",
      ctaFeatures: "Scopri le funzionalità",
      boxTitle: "Gestione scolastica strutturata e sicura",
      boxDesc: "Centralizza le operazioni del tuo istituto e assegna a ciascun utente un accesso su misura per il suo ruolo. Le comunicazioni con la piattaforma sono protette tramite HTTPS.",
      benefit1_title: "Gestione centralizzata",
      benefit1_desc: "Amministrazione, didattica e contabilità",
      benefit2_title: "Accesso basato sui ruoli",
      benefit2_desc: "Dirigenti, docenti e famiglie"
    },
    sponsors: {
      subtitle: "ECOSISTEMA DEI PARTNER",
      title: "Insieme, sviluppiamo servizi utili all'istruzione",
      desc: "YZIOW prepara collaborazioni con attori finanziari, tecnologici ed educativi per offrire servizi su misura per scuole, personale e famiglie.",
      c1_title: "Banche e Istituti Finanziari",
      c1_desc: "Servizi di pagamento delle rette e soluzioni finanziarie per il settore scolastico.",
      c2_title: "Telecomunicazioni e Servizi Digitali",
      c2_desc: "Infrastrutture di connettività, notifiche SMS e strumenti digitali per gli istituti.",
      c3_title: "Forniture e Attrezzature Scolastiche",
      c3_desc: "Rete di fornitori per libri di testo, cancelleria e materiale didattico.",
      c4_title: "Trasporti, Assicurazioni e Servizi",
      c4_desc: "Soluzioni per la mobilità scolastica, coperture assicurative e attività extrascolastiche.",
      partnerCta: "Diventa partner"
    },
    features: {
      subtitle: "Le Nostre Soluzioni",
      title: "Tutto il monitoraggio scolastico in un'unica piattaforma",
      f1_title: "Pagelle e Voti",
      f1_desc: "Visualizza i voti appena inseriti. Scarica e verifica le pagelle ufficiali in formato PDF sicuro.",
      f2_title: "Presenze e Assenze",
      f2_desc: "Segui le presenze in tempo reale. Ricevi notifiche istantanee in caso di assenza o ritardo.",
      f3_title: "Spazi Istituti",
      f3_desc: "Interfaccia completa per dirigenti e segreteria: gestione iscrizioni e fatturazione."
    },
    footer: {
      desc: "La piattaforma moderna che unisce scuola, famiglie e studenti per il successo educativo.",
      company: "Azienda",
      about: "Chi siamo",
      contact: "Contatto e Supporto",
      careers: "Lavora con noi",
      ambassador: "Programma Ambasciatori",
      resources: "Risorse",
      guide: "Guida Introduttiva",
      legal: "Legale",
      cgu: "Condizioni di Servizio",
      privacy: "Informativa sulla Privacy",
      mentions: "Note Legali",
      partner_title: "Diventa Partner",
      partner_desc: "Unisciti all'ecosistema YZIOW e sviluppiamo insieme servizi utili a scuole, personale e famiglie.",
      partner_discover: "Scopri i partner",
      partner_btn: "Diventa partner",
      rights: "© 2026 Yziow. Tutti i diritti riservati.",
      madeIn: "Fatto con passione in Benin 🇧🇯"
    },
    guide: {
      backToHome: "Torna alla home",
      registerCta: "Registra la mia scuola",
      badge: "Guida Introduttiva",
      title: "Iniziare con YZIOW",
      desc: "Scopri passo dopo passo le funzionalità disponibili in base al tuo profilo utente.",
      notice: "Questa guida offre una panoramica pubblica delle funzionalità disponibili sulla piattaforma YZIOW.",
      sec1_role: "Istituti e Dirigenti",
      sec1_desc: "Configurazione e gestione amministrativa generale della scuola.",
      sec1_s1_title: "1. Configurazione della scuola",
      sec1_s1_desc: "Crea l'account dirigente, imposta i cicli di studio e configura classi, materie e coefficienti di valutazione.",
      sec1_s2_title: "2. Iscrizione alunni e personale",
      sec1_s2_desc: "Registra gli studenti, assegna i docenti alle materie e gestisci i tesserini scolastici con codice QR.",
      sec1_s3_title: "3. Gestione rette e pagelle",
      sec1_s3_desc: "Monitora i pagamenti scolastici, genera ricevute e pubblica le pagelle periodiche in formato PDF.",
      sec2_role: "Docenti e Personale educativo",
      sec2_desc: "Strumenti quotidiani per la gestione della classe e il monitoraggio degli studenti.",
      sec2_s1_title: "1. Registro presenze",
      sec2_s1_desc: "Registra presenze e assenze direttamente dalla tua area docente.",
      sec2_s2_title: "2. Inserimento valutazioni",
      sec2_s2_desc: "Inserisci i voti di compiti ed esami con calcolo automatico delle medie ponderate.",
      sec2_s3_title: "3. Registro delle lezioni e compiti",
      sec2_s3_desc: "Condividi argomenti trattati, compiti a casa e materiale didattico.",
      sec3_role: "Genitori e Famiglie",
      sec3_desc: "Accompagnamento e monitoraggio del percorso scolastico dei figli.",
      sec3_s1_title: "1. Accesso all'area genitori",
      sec3_s1_desc: "Accedi in modo sicuro con il tuo numero di telefono per consultare i figli associati al tuo account.",
      sec3_s2_title: "2. Monitoraggio voti e assenze",
      sec3_s2_desc: "Consulta i voti pubblicati, il riepilogo delle assenze e scarica le pagelle emesse dall'istituto.",
      sec3_s3_title: "3. Pagamenti e ricevute",
      sec3_s3_desc: "Verifica lo stato delle rette scolastiche e consulta lo storico delle ricevute di pagamento.",
      bottom_title: "Pronto a digitalizzare il tuo istituto?",
      bottom_desc: "Crea lo spazio del tuo istituto e configura gradualmente le sue informazioni.",
      bottom_cta: "Registra la mia scuola"
    },
    contact: {
      partnershipSubject: "Richiesta di partnership",
      partnershipMessage: "[Richiesta di partnership] Salve, la nostra organizzazione desidera diventare partner di YZIOW."
    }
  },

  // ── ALLEMAND ──
  de: {
    nav: {
      features: "Unsere Lösungen",
      partners: "Partner",
      login: "MEIN BEREICH",
      loginMobile: "LOGIN"
    },
    hero: {
      badge: "DIE FÜHRENDE BILDUNGSPLATTFORM",
      title1: "Exzellenz",
      title2: "im Herzen der Schule.",
      desc: "Eine ganzheitliche Schulverwaltungslösung, die Schulleitung, Lehrkräfte, Eltern und Schüler in einer modernen, intuitiven Umgebung verbindet.",
      ctaRegister: "Schule registrieren",
      ctaFeatures: "Funktionen entdecken",
      boxTitle: "Strukturierte und sichere Schulverwaltung",
      boxDesc: "Zentralisieren Sie die Abläufe Ihrer Schule und weisen Sie jedem Nutzer rollenspezifische Zugriffsrechte zu. Die Kommunikation ist per HTTPS geschützt.",
      benefit1_title: "Zentrale Verwaltung",
      benefit1_desc: "Administration, Unterricht und Finanzen",
      benefit2_title: "Rollenbasierter Zugriff",
      benefit2_desc: "Schulleitung, Lehrkräfte und Eltern"
    },
    sponsors: {
      subtitle: "PARTNER-ÖKOSYSTEM",
      title: "Gemeinsam schaffen wir Mehrwert für die Bildung",
      desc: "YZIOW kooperiert mit Partnern aus Finanzen, Technologie und Bildung, um maßgeschneiderte Dienste für Schulen, Lehrkräfte und Familien bereitzustellen.",
      c1_title: "Banken & Finanzinstitute",
      c1_desc: "Schulgeldzahlung und finanzielle Lösungen für den Bildungsbereich.",
      c2_title: "Telekom & Digitale Dienste",
      c2_desc: "Konnektivität, SMS-Benachrichtigungen und digitale Werkzeuge für Schulen.",
      c3_title: "Schulbedarf & Ausstattung",
      c3_desc: "Netzwerk verifizierter Anbieter für Schulbücher, Schreibwaren und Lehrmaterial.",
      c4_title: "Transport, Versicherung & Services",
      c4_desc: "Schülertransport, Versicherungsschutz und schulbegleitende Angebote.",
      partnerCta: "Partner werden"
    },
    features: {
      subtitle: "Unsere Lösungen",
      title: "Gesamte Schulverwaltung auf einer Plattform",
      f1_title: "Zeugnisse & Noten",
      f1_desc: "Noten direkt nach Eingabe einsehen. Offizielle Zeugnisse als geschützte PDF herunterladen.",
      f2_title: "Anwesenheit & Fehlzeiten",
      f2_desc: "Echtzeit-Anwesenheitskontrolle mit sofortiger Benachrichtigung bei Verspätungen.",
      f3_title: "Schulverwaltung",
      f3_desc: "Komplette Schnittstelle für Leitung und Sekretariat: Einschreibungen und Abrechnung."
    },
    footer: {
      desc: "Die moderne Plattform für erfolgreiche Schul- und Bildungsverwaltung.",
      company: "Unternehmen",
      about: "Über uns",
      contact: "Kontakt & Hilfe",
      careers: "Karriere",
      ambassador: "Botschafter-Programm",
      resources: "Ressourcen",
      guide: "Benutzerhandbuch",
      legal: "Rechtliches",
      cgu: "Nutzungsbedingungen",
      privacy: "Datenschutzerklärung",
      mentions: "Impressum",
      partner_title: "Partner werden",
      partner_desc: "Werden Sie Teil des YZIOW-Ökosystems und entwickeln Sie nützliche Dienste für Schulen und Familien.",
      partner_discover: "Partner entdecken",
      partner_btn: "Partner werden",
      rights: "© 2026 Yziow. Alle Rechte vorbehalten.",
      madeIn: "Mit Leidenschaft in Benin entwickelt 🇧🇯"
    },
    guide: {
      backToHome: "Zurück zur Startseite",
      registerCta: "Schule registrieren",
      badge: "Benutzerhandbuch",
      title: "Erste Schritte mit YZIOW",
      desc: "Entdecken Sie die verfügbaren Funktionen Schritt für Schritt je nach Nutzerrolle.",
      notice: "Dieses Handbuch bietet einen öffentlichen Überblick über die Funktionen der YZIOW-Plattform.",
      sec1_role: "Schulen & Schulleitung",
      sec1_desc: "Allgemeine administrative Einrichtung und Steuerung Ihrer Schule.",
      sec1_s1_title: "1. Schuleinrichtung",
      sec1_s1_desc: "Erstellen Sie das Schulleitungskonto, definieren Sie Bildungsstufen und konfigurieren Sie Klassen, Fächer und Notengewichtungen.",
      sec1_s2_title: "2. Schüler- & Personalverwaltung",
      sec1_s2_desc: "Schüler erfassen, Lehrkräfte zuweisen und Schülerausweise mit QR-Code verwalten.",
      sec1_s3_title: "3. Finanzen & Zeugnisse",
      sec1_s3_desc: "Schulgeldzahlungen nachverfolgen, Zahlungsbelege erstellen und Zeugnisse als PDF generieren.",
      sec2_role: "Lehrkräfte & Pädagogisches Personal",
      sec2_desc: "Tägliche Arbeitsmittel für Unterricht und Schülerbegleitung.",
      sec2_s1_title: "1. Anwesenheitserfassung",
      sec2_s1_desc: "Erfassen Sie Anwesenheiten und Fehlzeiten direkt in Ihrem Lehrerbereich.",
      sec2_s2_title: "2. Noteneingabe",
      sec2_s2_desc: "Noten für Tests und Arbeiten erfassen mit automatischer Notendurchschnittsberechnung.",
      sec2_s3_title: "3. Klassenbuch & Hausaufgaben",
      sec2_s3_desc: "Unterrichtsinhalte, Hausaufgaben und Lernmaterialien teilen.",
      sec3_role: "Eltern & Erziehungsberechtigte",
      sec3_desc: "Transparente Begleitung des schulischen Werdegangs Ihrer Kinder.",
      sec3_s1_title: "1. Anmeldung im Elternbereich",
      sec3_s1_desc: "Sicher mit Ihrer Telefonnummer anmelden, um die Ihrem Konto zugeordneten Kinder einzusehen.",
      sec3_s2_title: "2. Noten & Fehlzeiten einsehen",
      sec3_s2_desc: "Veröffentlichte Noten und Anwesenheitsberichte einsehen sowie Schulzeugnisse herunterladen.",
      sec3_s3_title: "3. Zahlungen & Belege",
      sec3_s3_desc: "Status der Schulgebühren prüfen und den vollständigen Belegverlauf einsehen.",
      bottom_title: "Bereit, Ihre Schule zu digitalisieren?",
      bottom_desc: "Erstellen Sie Ihren Schulbereich und richten Sie die Stammdaten schrittweise ein.",
      bottom_cta: "Schule registrieren"
    },
    contact: {
      partnershipSubject: "Partnerschaftsanfrage",
      partnershipMessage: "[Partnerschaftsanfrage] Guten Tag, unsere Organisation möchte Partner von YZIOW werden."
    }
  },

  // ── PORTUGAIS ──
  pt: {
    nav: {
      features: "Nossas Soluções",
      partners: "Parceiros",
      login: "ACESSAR MEU ESPAÇO",
      loginMobile: "ENTRAR"
    },
    hero: {
      badge: "A PLATAFORMA EDUCACIONAL DE REFERÊNCIA",
      title1: "A excelência",
      title2: "no coração da escola.",
      desc: "Uma solução abrangente de gestão escolar que conecta diretores, professores, pais e alunos em um ambiente moderno e intuitivo.",
      ctaRegister: "Inscrever minha escola",
      ctaFeatures: "Descobrir recursos",
      boxTitle: "Gestão escolar estruturada e segura",
      boxDesc: "Centralize as operações da sua instituição e atribua a cada usuário um acesso adequado à sua função. As comunicações são protegidas via HTTPS.",
      benefit1_title: "Gestão centralizada",
      benefit1_desc: "Administração, vida acadêmica e finanças",
      benefit2_title: "Acesso baseado em funções",
      benefit2_desc: "Diretores, professores e famílias"
    },
    sponsors: {
      subtitle: "ECOSSISTEMA DE PARCEIROS",
      title: "Juntos, desenvolvemos serviços úteis para a educação",
      desc: "A YZIOW estabelece parcerias com agentes financeiros, tecnológicos e educacionais para oferecer soluções adaptadas a escolas, funcionários e famílias.",
      c1_title: "Bancos e Instituições Financeiras",
      c1_desc: "Serviços de pagamento de mensalidades e soluções financeiras educacionais.",
      c2_title: "Telecomunicações e Serviços Digitais",
      c2_desc: "Infraestrutura de conectividade, SMS e ferramentas digitais escolares.",
      c3_title: "Materiais e Equipamentos Escolares",
      c3_desc: "Rede de fornecedores certificados de livros, papelaria e material didático.",
      c4_title: "Transporte, Seguros e Serviços",
      c4_desc: "Transporte escolar, cobertura de seguro e atividades extracurriculares.",
      partnerCta: "Tornar-se parceiro"
    },
    features: {
      subtitle: "Nossas Soluções",
      title: "Todo o acompanhamento escolar em uma única plataforma",
      f1_title: "Boletins e Notas",
      f1_desc: "Visualize notas assim que forem lançadas. Baixe e valide boletins oficiais em PDF seguro.",
      f2_title: "Presenças e Faltas",
      f2_desc: "Acompanhe a frequência em tempo real. Receba alertas imediatos em caso de ausência.",
      f3_title: "Espaço Instituições",
      f3_desc: "Interface completa para diretores e secretários: matrículas e faturamento."
    },
    footer: {
      desc: "A plataforma moderna que conecta a escola, famílias e alunos para o sucesso acadêmico.",
      company: "Empresa",
      about: "Quem somos",
      contact: "Contato e Suporte",
      careers: "Carreiras",
      ambassador: "Programa de Embaixadores",
      resources: "Recursos",
      guide: "Guia de Introdução",
      legal: "Legal",
      cgu: "Termos de Uso",
      privacy: "Política de Privacidade",
      mentions: "Avisos Legais",
      partner_title: "Tornar-se Parceiro",
      partner_desc: "Junte-se ao ecossistema YZIOW e desenvolva conosco serviços valiosos para escolas e famílias.",
      partner_discover: "Descobrir parceiros",
      partner_btn: "Tornar-se parceiro",
      rights: "© 2026 Yziow. Todos os direitos reservados.",
      madeIn: "Feito com paixão no Benim 🇧🇯"
    },
    guide: {
      backToHome: "Voltar ao início",
      registerCta: "Inscrever minha escola",
      badge: "Guia de Introdução",
      title: "Começar a usar o YZIOW",
      desc: "Conheça passo a passo os recursos disponíveis conforme o seu perfil de usuário.",
      notice: "Este guia oferece uma visão geral pública dos recursos disponíveis na plataforma YZIOW.",
      sec1_role: "Escolas e Diretores",
      sec1_desc: "Configuração e gestão administrativa global da sua escola.",
      sec1_s1_title: "1. Configuração da escola",
      sec1_s1_desc: "Crie a conta de diretor, defina os ciclos de ensino e configure turmas, disciplinas e pesos das avaliações.",
      sec1_s2_title: "2. Cadastro de alunos e equipe",
      sec1_s2_desc: "Cadastre alunos, atribua professores às matérias e gerencie carteirinhas de estudante com QR code.",
      sec1_s3_title: "3. Gestão financeira e boletins",
      sec1_s3_desc: "Acompanhe as mensalidades escolares, gere recibos de pagamento e emita boletins em formato PDF.",
      sec2_role: "Professores e Equipe pedagógica",
      sec2_desc: "Ferramentas práticas para gestão de sala de aula e acompanhamento dos alunos.",
      sec2_s1_title: "1. Chamada e Frequência",
      sec2_s1_desc: "Lance presenças e faltas diretamente no seu painel de professor.",
      sec2_s2_title: "2. Lançamento de notas",
      sec2_s2_desc: "Insira notas de tarefas e provas com cálculo automático de médias ponderadas.",
      sec2_s3_title: "3. Diário de classe e tarefas",
      sec2_s3_desc: "Compartilhe o conteúdo das aulas, lições de casa e recursos educativos.",
      sec3_role: "Pais e Famílias",
      sec3_desc: "Acompanhamento transparente da vida escolar dos seus filhos.",
      sec3_s1_title: "1. Acesso à área dos pais",
      sec3_s1_desc: "Entre com seu número de telefone para consultar os alunos vinculados à sua conta.",
      sec3_s2_title: "2. Acompanhamento de notas e faltas",
      sec3_s2_desc: "Consulte notas publicadas, histórico de faltas e baixe os boletins emitidos pela escola.",
      sec3_s3_title: "3. Pagamentos e recibos",
      sec3_s3_desc: "Verifique o status das mensalidades e acesse o histórico de recibos de pagamento.",
      bottom_title: "Pronto para modernizar sua escola?",
      bottom_desc: "Crie o espaço da sua escola e configure suas informações no seu próprio ritmo.",
      bottom_cta: "Inscrever minha escola"
    },
    contact: {
      partnershipSubject: "Pedido de parceria",
      partnershipMessage: "[Pedido de parceria] Olá, nossa organização deseja estabelecer uma parceria com a YZIOW."
    }
  },

  // ── CHINOIS ──
  zh: {
    nav: {
      features: "解决方案",
      partners: "合作伙伴",
      login: "进入我的空间",
      loginMobile: "登录"
    },
    hero: {
      badge: "行业领先的数字化教育平台",
      title1: "卓越管理",
      title2: "始于智慧校园。",
      desc: "全面的学校管理系统，在现代化直观的环境中连接校长、教师、家长与学生。",
      ctaRegister: "注册我的学校",
      ctaFeatures: "了解核心功能",
      boxTitle: "结构化与安全的校园管理",
      boxDesc: "集中管理您的学校运营，并为每个用户分配基于角色的权限。平台所有通信均受 HTTPS 保护。",
      benefit1_title: "集中化管理",
      benefit1_desc: "行政、教务与财务一体化",
      benefit2_title: "基于角色的权限",
      benefit2_desc: "校长、教师与家长协同"
    },
    sponsors: {
      subtitle: "合作伙伴生态圈",
      title: "携手打造服务教育的共赢生态",
      desc: "YZIOW 正与金融、科技和教育领域的伙伴展开合作，为学校、教职员工和家庭提供定制化服务。",
      c1_title: "银行与金融机构",
      c1_desc: "学费缴纳服务与面向教育领域的金融解决方案。",
      c2_title: "电信与数字化服务",
      c2_desc: "校园网络连接基础设施、短信通知与数字化工具。",
      c3_title: "学校用品与教学设备",
      c3_desc: "经认证的教材、文具和教学设备供应商网络。",
      c4_title: "交通、保险与综合服务",
      c4_desc: "校车出行、学生保险与课后服务综合支持。",
      partnerCta: "成为合作伙伴"
    },
    features: {
      subtitle: "解决方案",
      title: "在一站式平台上汇聚所有校园管理",
      f1_title: "成绩单与考评",
      f1_desc: "实时查看录入的成绩。下载并验证安全 PDF 格式的官方成绩单。",
      f2_title: "考勤与缺勤管理",
      f2_desc: "实时跟踪出勤情况。发生缺勤或迟到时即刻接收通知。",
      f3_title: "学校管理空间",
      f3_desc: "面向校长和教务人员的完整界面：管理招生、教务与账单。"
    },
    footer: {
      desc: "连接学校、家长和学生的现代化平台，助力学业成功。",
      company: "企业",
      about: "关于我们",
      contact: "联系与支持",
      careers: "加入我们",
      ambassador: "校园大使计划",
      resources: "资源中心",
      guide: "使用指南",
      legal: "法律信息",
      cgu: "服务条款",
      privacy: "隐私政策",
      mentions: "法律声明",
      partner_title: "成为合作伙伴",
      partner_desc: "加入 YZIOW 生态圈，共同为学校、教职员工和家庭开发优质服务。",
      partner_discover: "了解合作伙伴",
      partner_btn: "成为合作伙伴",
      rights: "© 2026 Yziow. 保留所有权利。",
      madeIn: "倾心打造于贝宁 🇧🇯"
    },
    guide: {
      backToHome: "返回首页",
      registerCta: "注册我的学校",
      badge: "快速入门指南",
      title: "开启 YZIOW 校园管理之旅",
      desc: "逐步了解针对不同角色用户所提供的实用功能。",
      notice: "本指南为 YZIOW 平台可用功能的公开概述。",
      sec1_role: "学校与校长",
      sec1_desc: "学校的全局部署与行政管理。",
      sec1_s1_title: "1. 学校基础设置",
      sec1_s1_desc: "创建校长账户，设置教学学段，并配置班级、科目和学业权重。",
      sec1_s2_title: "2. 学生与教职工登记",
      sec1_s2_desc: "录入学生信息，为教师分配教学科目，并管理带二维码的电子学生卡。",
      sec1_s3_title: "3. 财务与成绩单管理",
      sec1_s3_desc: "跟踪学费收缴进度，生成缴费凭证，并导出 PDF 格式学期成绩单。",
      sec2_role: "教师与教学人员",
      sec2_desc: "课堂教学与学生日常跟踪的高效工具。",
      sec2_s1_title: "1. 课堂点名与考勤",
      sec2_s1_desc: "直接在教师空间内一键记录出勤与缺勤情况。",
      sec2_s2_title: "2. 成绩快速录入",
      sec2_s2_desc: "录入作业与考试成绩，系统依据预设权重自动计算平均分。",
      sec2_s3_title: "3. 教学日志与作业",
      sec2_s3_desc: "发布课堂进度、课后作业及相关学习辅导资料。",
      sec3_role: "家长与家庭",
      sec3_desc: "全面透明地伴随孩子的学习成长。",
      sec3_s1_title: "1. 登录家长专属空间",
      sec3_s1_desc: "使用手机号码安全登录，查看与您账户关联的孩子信息。",
      sec3_s2_title: "2. 实时成绩与出勤跟踪",
      sec3_s2_desc: "查阅已发布的成绩、缺勤记录，并下载学校出具的正式成绩单。",
      sec3_s3_title: "3. 缴费记录与收据",
      sec3_s3_desc: "查看学费缴纳明细并访问完整的缴费收据历史。",
      bottom_title: "准备好开启校园数字化了吗？",
      bottom_desc: "创建您的学校空间，并根据实际需求逐步完善配置。",
      bottom_cta: "注册我的学校"
    },
    contact: {
      partnershipSubject: "合作咨询",
      partnershipMessage: "[合作咨询] 您好，我们机构希望与 YZIOW 建立合作伙伴关系。"
    }
  },

  // ── RUSSE ──
  ru: {
    nav: {
      features: "Наши Решения",
      partners: "Партнёры",
      login: "ВОЙТИ В КАБИНЕТ",
      loginMobile: "ВХОД"
    },
    hero: {
      badge: "ВЕДУЩАЯ ОБРАЗОВАТЕЛЬНАЯ ПЛАТФОРМА",
      title1: "Превосходство",
      title2: "в самом центре школы.",
      desc: "Комплексная система управления школой, объединяющая директоров, учителей, родителей и учеников в современной и удобной среде.",
      ctaRegister: "Зарегистрировать школу",
      ctaFeatures: "Узнать о возможностях",
      boxTitle: "Структурированное и безопасное управление школой",
      boxDesc: "Централизуйте работу учебного заведения и предоставьте каждому пользователю доступ в соответствии с его ролью. Обмен данными защищён по протоколу HTTPS.",
      benefit1_title: "Централизованное управление",
      benefit1_desc: "Администрация, учебный процесс и финансы",
      benefit2_title: "Ролевой доступ",
      benefit2_desc: "Директора, учителя и родители"
    },
    sponsors: {
      subtitle: "ЭКОСИСТЕМА ПАРТНЁРОВ",
      title: "Вместе создаём полезные сервисы для образования",
      desc: "YZIOW развивает сотрудничество с финансовыми, технологическими и образовательными партнерами для предоставления удобных услуг школам и семьям.",
      c1_title: "Банки и финансовые организации",
      c1_desc: "Сервисы оплаты обучения и финансовые решения для сферы образования.",
      c2_title: "Телеком и цифровые сервисы",
      c2_desc: "Инфраструктура связи, SMS-уведомления и цифровые инструменты для школ.",
      c3_title: "Школьные товары и оборудование",
      c3_desc: "Сеть проверенных поставщиков учебников, канцелярии и учебного оборудования.",
      c4_title: "Транспорт, страхование и сервисы",
      c4_desc: "Школьный транспорт, страховая защита и внеклассное сопровождение.",
      partnerCta: "Стать партнёром"
    },
    features: {
      subtitle: "Наши Решения",
      title: "Весь школьный мониторинг на единой платформе",
      f1_title: "Табели и Оценки",
      f1_desc: "Просматривайте оценки сразу после выставления. Скачивайте официальные табели в защищённом формате PDF.",
      f2_title: "Посещаемость и Пропуски",
      f2_desc: "Контролируйте посещаемость в реальном времени. Получайте мгновенные уведомления об опозданиях.",
      f3_title: "Кабинет Школы",
      f3_desc: "Полноценный интерфейс для директоров и секретарей: приём учеников, учебный процесс и оплата."
    },
    footer: {
      desc: "Современная платформа, объединяющая школу, родителей и учеников для успешной учёбы.",
      company: "О компании",
      about: "О нас",
      contact: "Контакты и Поддержка",
      careers: "Вакансии",
      ambassador: "Программа Амбассадоров",
      resources: "Ресурсы",
      guide: "Руководство пользователя",
      legal: "Правовая информация",
      cgu: "Условия использования",
      privacy: "Политика конфиденциальности",
      mentions: "Юридическая информация",
      partner_title: "Стать Партнёром",
      partner_desc: "Присоединяйтесь к экосистеме YZIOW и развивайте полезные сервисы для школ и семей вместе с нами.",
      partner_discover: "Партнёры платформы",
      partner_btn: "Стать партнёром",
      rights: "© 2026 Yziow. Все права защищены.",
      madeIn: "Создано с душой в Бенине 🇧🇯"
    },
    guide: {
      backToHome: "На главную",
      registerCta: "Зарегистрировать школу",
      badge: "Руководство пользователя",
      title: "Начало работы с YZIOW",
      desc: "Пошаговый обзор возможностей платформы в зависимости от вашей роли.",
      notice: "Данное руководство представляет собой открытый обзор возможностей платформы YZIOW.",
      sec1_role: "Школы и Руководство",
      sec1_desc: "Базовая настройка и общее административное управление учебным заведением.",
      sec1_s1_title: "1. Настройка школы",
      sec1_s1_desc: "Создайте аккаунт директора, укажите ступени обучения и настройте классы, предметы и коэффициенты оценивания.",
      sec1_s2_title: "2. Учёт учеников и сотрудников",
      sec1_s2_desc: "Вносите учеников, распределяйте предметы среди учителей и управляйте электронными картами с QR-кодом.",
      sec1_s3_title: "3. Финансы и табели успеваемости",
      sec1_s3_desc: "Контролируйте оплату обучения, формируйте квитанции и экспортируйте табели успеваемости в PDF.",
      sec2_role: "Учителя и Педагогический состав",
      sec2_desc: "Ежедневные инструменты для ведения занятий и контроля успеваемости.",
      sec2_s1_title: "1. Журнал посещаемости",
      sec2_s1_desc: "Отмечайте присутствие и пропуски непосредственно из своего учительского кабинета.",
      sec2_s2_title: "2. Выставление оценок",
      sec2_s2_desc: "Выставляйте оценки за задания и контрольные с автоматическим расчетом средних баллов.",
      sec2_s3_title: "3. Электронный журнал и задания",
      sec2_s3_desc: "Публикуйте темы уроков, домашние задания и учебные материалы.",
      sec3_role: "Родители и Семьи",
      sec3_desc: "Прозрачное сопровождение учебного процесса ваших детей.",
      sec3_s1_title: "1. Вход в кабинет родителя",
      sec3_s1_desc: "Входите безопасно по номеру телефона для доступа к информации о ваших детях.",
      sec3_s2_title: "2. Оценки и посещаемость",
      sec3_s2_desc: "Просматривайте выставленные оценки, пропуски и скачивайте табели успеваемости.",
      sec3_s3_title: "3. Оплата и квитанции",
      sec3_s3_desc: "Проверяйте статус оплаты за обучение и просматривайте историю платежей.",
      bottom_title: "Готовы перевести школу в цифровой формат?",
      bottom_desc: "Создайте пространство вашей школы и настраивайте данные в удобном темпе.",
      bottom_cta: "Зарегистрировать школу"
    },
    contact: {
      partnershipSubject: "Запрос на партнерство",
      partnershipMessage: "[Запрос на партнерство] Здравствуйте, наша организация хотела бы стать партнёром YZIOW."
    }
  }
};

export function getPublicTranslations(lang: string): PublicTranslations {
  return PUBLIC_I18N[lang] || PUBLIC_I18N.fr;
}
