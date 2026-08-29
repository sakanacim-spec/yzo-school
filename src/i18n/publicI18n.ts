// ============================================================
// PUBLIC I18N — Dictionnaire complet pour les 9 langues
// (fr, en, es, ar, it, de, pt, zh, ru)
// ============================================================

export const LANGUAGES = [
  { code: 'fr', name: 'Français', flagUrl: 'https://flagcdn.com/w40/fr.png' },
  { code: 'en', name: 'English', flagUrl: 'https://flagcdn.com/w40/gb.png' },
  { code: 'es', name: 'Español', flagUrl: 'https://flagcdn.com/w40/es.png' },
  { code: 'ar', name: 'العربية', flagUrl: 'https://flagcdn.com/w40/sa.png' },
  { code: 'it', name: 'Italiano', flagUrl: 'https://flagcdn.com/w40/it.png' },
  { code: 'de', name: 'Deutsch', flagUrl: 'https://flagcdn.com/w40/de.png' },
  { code: 'pt', name: 'Português', flagUrl: 'https://flagcdn.com/w40/pt.png' },
  { code: 'zh', name: '中文', flagUrl: 'https://flagcdn.com/w40/cn.png' },
  { code: 'ru', name: 'Русский', flagUrl: 'https://flagcdn.com/w40/ru.png' }
] as const;

export interface PartnerFormula {
  name: string;
  tagline: string;
  priceTag: string;
  desc: string;
  features: string[];
  cta: string;
}

export interface PartnerCategory {
  title: string;
  desc: string;
  scope: string;
}

export interface PartnerTranslations {
  title: string;
  subtitle: string;
  badge: string;
  backHome: string;
  breadcrumbHome: string;
  breadcrumbPartners: string;
  categoriesTitle: string;
  categoriesSubtitle: string;
  categories: {
    cat1: PartnerCategory;
    cat2: PartnerCategory;
    cat3: PartnerCategory;
    cat4: PartnerCategory;
  };
  formulasTitle: string;
  formulasSubtitle: string;
  formulas: {
    presence: PartnerFormula;
    visibility: PartnerFormula;
    strategic: PartnerFormula;
  };
  form: {
    title: string;
    subtitle: string;
    fullName: string;
    fullNamePlaceholder: string;
    role: string;
    rolePlaceholder: string;
    companyName: string;
    companyPlaceholder: string;
    sector: string;
    selectSector: string;
    sectorOptions: {
      finance: string;
      insurance: string;
      telecom: string;
      equipment: string;
      transport: string;
      otherRegulated: string;
      other: string;
    };
    regulatedHelp: string;
    license: string;
    licensePlaceholder: string;
    country: string;
    countryPlaceholder: string;
    targetMarkets: string;
    targetMarketsPlaceholder: string;
    email: string;
    emailPlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    website: string;
    websitePlaceholder: string;
    formula: string;
    selectFormula: string;
    projectDescription: string;
    projectPlaceholder: string;
    consentText: string;
    submit: string;
    submitting: string;
    successTitle: string;
    successMessage: string;
    errorMessage: string;
    rateLimitMessage: string;
    validationError: string;
    payloadTooLongError: string;
    invalidEmailError: string;
    invalidPhoneError: string;
    invalidWebsiteError: string;
    privacyLinkText: string;
  };
  ethics: {
    title: string;
    p1: string;
    p2: string;
    p3: string;
  };
}

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
    blog?: string;
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
  blog: {
    title: string;
    subtitle: string;
    badge: string;
    emptyTitle: string;
    emptyDesc: string;
    backHome: string;
    backBlog: string;
    notFoundTitle: string;
    notFoundDesc: string;
    readTime: string;
    readMore: string;
    publishedOn: string;
    authorBy: string;
    category: string;
    breadcrumbHome?: string;
    breadcrumbBlog?: string;
    allArticles?: string;
    backArticles?: string;
    discoverYziow?: string;
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
  partners?: PartnerTranslations;
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
      badge: "LA PLATEFORME DE GESTION SCOLAIRE",
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
      c3_desc: "Manuels, papeterie, équipements et matériel pédagogique destinés aux établissements.",
      c4_title: "Transport, Assurance & Services",
      c4_desc: "Solutions de mobilité scolaire, couverture d'assurance et accompagnement périscolaire.",
      partnerCta: "Devenir partenaire"
    },
    features: {
      subtitle: "Nos Solutions",
      title: "Tout le suivi scolaire regroupé sur une plateforme unique",
      f1_title: "Bulletins & Notes",
      f1_desc: "Consultez les notes publiées par l’établissement et téléchargez les bulletins mis à disposition au format PDF.",
      f2_title: "Présences & Absences",
      f2_desc: "Consultez les présences, les absences et les retards enregistrés par l’établissement.",
      f3_title: "Espaces Établissements",
      f3_desc: "Un espace destiné aux directeurs et au personnel autorisé pour gérer les inscriptions, la scolarité et la facturation."
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
      blog: "Blog & Actualités",
      legal: "Légal",
      cgu: "Conditions générales d'utilisation",
      privacy: "Politique de confidentialité",
      mentions: "Mentions légales",
      partner_title: "Devenir Partenaire",
      partner_desc: "Rejoignez l'écosystème YZIOW et développons ensemble des services utiles aux établissements, au personnel et aux familles.",
      partner_discover: "Découvrir les partenaires",
      partner_btn: "Devenir partenaire",
      rights: "© 2026 Yziow. Tous droits réservés.",
      madeIn: "Conçu au Bénin"
    },
    blog: {
      title: "Blog YZIOW",
      subtitle: "Conseils, méthodes et actualités pour accompagner la gestion des établissements scolaires.",
      badge: "Blog & Ressources",
      emptyTitle: "Aucun article publié pour le moment",
      emptyDesc: "Nos articles et guides pratiques seront bientôt disponibles. Revenez très prochainement !",
      backHome: "Retour à l'accueil",
      backBlog: "Retour au Blog",
      notFoundTitle: "Article introuvable",
      notFoundDesc: "L'article que vous recherchez n'existe pas ou a été déplacé.",
      readTime: "min de lecture",
      readMore: "Lire l'article",
      publishedOn: "Publié le",
      authorBy: "Par",
      category: "Catégorie",
      breadcrumbHome: "Accueil",
      breadcrumbBlog: "Blog",
      allArticles: "Tous les articles",
      backArticles: "Retour aux articles",
      discoverYziow: "Découvrir YZIOW"
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
    partners: {
    "title": "Partenaires YZIOW",
    "subtitle": "Développons ensemble un écosystème de services utiles et responsables pour l'éducation.",
    "badge": "ÉCOSYSTÈME & OFFRES PARTENAIRES",
    "backHome": "Retour à l'accueil",
    "breadcrumbHome": "Accueil",
    "breadcrumbPartners": "Partenaires",
    "categoriesTitle": "Catégories de partenaires admissibles",
    "categoriesSubtitle": "Des partenariats ciblés pour répondre aux besoins concrets des établissements scolaires, des équipes éducatives et des familles.",
    "categories": {
        "cat1": {
            "title": "Banques & Institutions financières agréées",
            "desc": "Facilitation du règlement des frais de scolarité, comptes scolaires et services financiers opérés exclusivement par des établissements agréés.",
            "scope": "Paiements scolaires, comptes dédiés et solutions financières agréées"
        },
        "cat2": {
            "title": "Télécoms & Services numériques",
            "desc": "Connectivité Internet pour les établissements, forfaits dédiés et passerelles de messagerie SMS d'information scolaire.",
            "scope": "Connectivité haut débit, SMS d'information et outils numériques"
        },
        "cat3": {
            "title": "Fournitures, Édition & Équipements",
            "desc": "Manuels scolaires, papeterie, mobilier pédagogique et équipements informatiques adaptés aux écoles.",
            "scope": "Manuels scolaires, papeterie, matériel pédagogique et informatique"
        },
        "cat4": {
            "title": "Mobilité, Assurance & Services scolaires",
            "desc": "Transport scolaire sécurisé, couvertures assurantielles adaptées et services d'accompagnement périscolaire.",
            "scope": "Transport scolaire, assurances scolaires et activités périscolaires"
        },
        "cat5": {
            "title": "ONG, Fondations & Institutions internationales",
            "desc": "Programmes éducatifs, bourses d'études, mécénat et projets d'inclusion scolaire à impact durable.",
            "scope": "Bourses, développement communautaire, mécénat et programmes éducatifs"
        }
    },
    "formulasTitle": "Nos formules de collaboration",
    "formulasSubtitle": "Trois niveaux d'accompagnement transparents, sur mesure et soumis à un accord contractuel préalable.",
    "formulas": {
        "selectedBadge": "✓ Sélectionnée",
        "recommendedBadge": "★ Recommandée",
        "presence": {
            "name": "Présence",
            "tagline": "Référencement dans l'annuaire partenaire",
            "priceTag": "Sur devis",
            "desc": "Présentation dans l’annuaire des partenaires après vérification, validation et signature d’un accord avec YZIOW.",
            "features": [
                "Fiche de présentation vérifiée de votre organisation",
                "Lien direct vers vos offres dédiées à l'éducation",
                "Revue annuelle de conformité et de qualité"
            ],
            "cta": "Choisir la formule Présence",
            "selectedCta": "✓ Formule Présence sélectionnée"
        },
        "visibility": {
            "name": "Visibilité",
            "tagline": "Mise en avant ciblée et communication sponsorisée",
            "priceTag": "Sur devis",
            "desc": "Campagnes identifiées comme Offre partenaire ou Contenu sponsorisé, diffusées uniquement dans les espaces autorisés et auprès des publics ayant accepté de les recevoir.",
            "features": [
                "Emplacement dédié identifié comme « Offre partenaire »",
                "Ciblage géographique et sectoriel respectueux des choix utilisateurs",
                "Rapports consolidés de visibilité et d'impact"
            ],
            "cta": "Choisir la formule Visibilité",
            "selectedCta": "✓ Formule Visibilité sélectionnée"
        },
        "strategic": {
            "name": "Partenaire stratégique",
            "tagline": "Intégration technique et opérationnelle avancée",
            "priceTag": "Sur devis",
            "desc": "Étude d’intégrations techniques ou opérationnelles, sous réserve de faisabilité, de conformité réglementaire et d’un accord contractuel.",
            "features": [
                "Co-développement et intégration technique (API sécurisées, passerelles agréées)",
                "Accompagnement opérationnel et gouvernance dédiée",
                "Comité de suivi régulier et déploiement coordonné"
            ],
            "cta": "Choisir la formule Partenaire stratégique",
            "selectedCta": "✓ Formule Partenaire stratégique sélectionnée"
        }
    },
    "donations": {
        "badge": "MÉCÉNAT & IMPACT ÉDUCATIF",
        "title": "Dons & Mécénat",
        "subtitle": "Soutenez des initiatives scolaires et favorisez l'égalité des chances éducatives.",
        "desc": "Vous êtes une fondation, une institution, une entreprise ou un donateur engagé ? Proposez un soutien matériel, financier ou pédagogique pour équiper et accompagner les écoles partenaires.",
        "noticeLot3B": "Point d’entrée Lot 3A : Aucun encaissement direct n’est réalisé à cette étape. La collecte et la traçabilité comptable des dons seront déployées dans le Lot 3B.",
        "cta": "Proposer un don ou un mécénat"
    },
    "form": {
        "title": "Transmettre une demande de partenariat",
        "subtitle": "Présentez votre organisation et vos objectifs de collaboration avec YZIOW. Notre équipe étudiera votre demande.",
        "fullName": "Nom et prénom du représentant",
        "fullNamePlaceholder": "Ex. : Jean Dupont",
        "role": "Fonction du représentant",
        "rolePlaceholder": "Ex. : Directeur des Partenariats",
        "companyName": "Entreprise ou organisation",
        "companyPlaceholder": "Ex. : Société Éducative SA",
        "organizationType": "Type d’organisation",
        "selectOrganizationType": "Sélectionnez votre type d’organisation",
        "organizationTypeOptions": {
            "ngo": "ONG",
            "foundation": "Fondation",
            "association": "Association",
            "international_institution": "Institution internationale",
            "cooperation_agency": "Agence de coopération",
            "public_body": "Organisme public",
            "sponsor_company": "Entreprise mécène",
            "other": "Autre"
        },
        "sector": "Secteur d'activité & Catégorie",
        "selectSector": "Sélectionnez votre secteur",
        "sectorOptions": {
            "finance": "Banques & Institutions financières agréées",
            "insurance": "Assurance & Prévoyance scolaire",
            "telecom": "Télécoms & Services numériques",
            "equipment": "Fournitures, Édition & Équipements",
            "mobility_services": "Mobilité, Assurance & Services scolaires",
            "after_school_services": "Services et activités périscolaires",
            "transport": "Transport scolaire",
            "ngo_institutions": "ONG, Fondations & Institutions internationales",
            "otherRegulated": "Autre activité réglementée (avec agrément)",
            "other": "Autre secteur d'activité"
        },
        "otherSectorLabel": "Précisez votre secteur d’activité",
        "otherSectorPlaceholder": "Ex. : Énergie solaire, Équipements de cantine, EdTech...",
        "otherRegulatedQuestion": "Votre activité nécessite-t-elle un agrément ou une autorisation réglementaire ?",
        "otherRegulatedYes": "Oui",
        "otherRegulatedNo": "Non",
        "subSector": "Sous-catégorie d’activité",
        "selectSubSector": "Sélectionnez votre activité",
        "subSectorOptions": {
            "transport": "Transport scolaire",
            "insurance": "Assurance & Prévoyance scolaire (Agrément requis)",
            "afterSchool": "Services et activités périscolaires",
            "otherRegulated": "Autre activité réglementée (Agrément requis)"
        },
        "regulatedHelp": "Pour les activités bancaires, financières ou d'assurance, veuillez préciser votre agrément réglementaire.",
        "license": "Agrément ou autorité de régulation",
        "licensePlaceholder": "Ex. : Agrément BCEAO N°..., Licence CIMA, AMF...",
        "country": "Pays d'implantation",
        "countryPlaceholder": "Ex. : Bénin, Côte d'Ivoire, Sénégal, France...",
        "targetMarkets": "Pays ou marchés ciblés",
        "targetMarketsPlaceholder": "Ex. : Espace UEMOA, Afrique de l'Ouest, National...",
        "email": "Email professionnel",
        "emailPlaceholder": "contact@entreprise.com",
        "phone": "Téléphone professionnel",
        "phonePlaceholder": "+229 01 00 00 00",
        "website": "Site internet (facultatif)",
        "websitePlaceholder": "https://www.entreprise.com",
        "formula": "Formule souhaitée",
        "selectFormula": "Sélectionnez une formule",
        "supportType": "Type de soutien envisagé",
        "selectSupportType": "Sélectionnez le type de soutien",
        "supportTypeOptions": {
            "future_financial_donation": "Don financier futur",
            "equipment_donation": "Don de matériel",
            "school_sponsorship": "Parrainage d’un établissement",
            "educational_project_funding": "Financement d’un projet éducatif",
            "skills_sponsorship": "Mécénat de compétences",
            "other_proposal": "Autre proposition"
        },
        "projectDescription": "Description du projet de partenariat",
        "projectPlaceholder": "Décrivez les services envisagés, vos objectifs et la valeur apportée aux établissements scolaires et aux familles...",
        "donationProjectPlaceholder": "Décrivez votre proposition de don ou de mécénat, les bénéficiaires visés et les modalités de mise en œuvre...",
        "consentText": "J’accepte que YZIOW utilise les informations transmises afin d’étudier ma demande et de me recontacter conformément à sa politique de confidentialité.",
        "submit": "Envoyer ma demande de partenariat",
        "submitDonation": "Transmettre ma proposition de mécénat",
        "submitting": "Transmission en cours...",
        "successTitle": "Demande de partenariat transmise",
        "successMessage": "Votre demande a bien été envoyée à l'équipe YZIOW. Nous l'étudierons dans les plus brefs délais.",
        "errorMessage": "Une erreur est survenue lors de l'envoi. Veuillez vérifier vos informations ou réessayer ultérieurement.",
        "rateLimitMessage": "Trop de soumissions récentes. Veuillez patienter 15 minutes avant de réessayer.",
        "validationError": "Veuillez remplir tous les champs obligatoires et accepter les conditions.",
        "payloadTooLongError": "Votre message dépasse la limite maximale autorisée de 5 000 caractères. Veuillez raccourcir votre description.",
        "invalidEmailError": "Veuillez saisir une adresse email professionnelle valide.",
        "invalidPhoneError": "Veuillez saisir un numéro de téléphone professionnel valide.",
        "invalidWebsiteError": "Le site internet doit débuter par http:// ou https://",
        "privacyLinkText": "politique de confidentialité"
    },
    "ethics": {
        "title": "Protection des données et engagements éthiques",
        "p1": "Protection des données et séparation stricte entre les services partenaires et les données scolaires.",
        "p2": "Aucun partenaire n'a d'accès direct aux bases de données des établissements, enseignants, parents ou élèves. YZIOW ne commercialise aucune donnée personnelle.",
        "p3": "YZIOW n’accorde aucun prêt. Le cas échéant, les services financiers présentés sur la plateforme seront exclusivement proposés et gérés par des institutions agréées, sous leur propre responsabilité."
    },
    "placeholderTitle": "Construisons ensemble des services utiles à l’éducation",
    "placeholderDesc": "Choisissez une formule de collaboration ci-dessus ou proposez un don ou mécénat pour ouvrir votre dossier de candidature.",
    "placeholderAlt": "Illustration des partenariats et du mécénat éducatif YZIOW",
    "modifyChoiceBtn": "Modifier mes choix"
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
      badge: "THE SCHOOL MANAGEMENT PLATFORM",
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
      c3_desc: "Textbooks, stationery, equipment, and teaching material intended for schools.",
      c4_title: "Transport, Insurance & Services",
      c4_desc: "School mobility solutions, insurance coverage, and extracurricular support.",
      partnerCta: "Become a partner"
    },
    features: {
      subtitle: "Our Solutions",
      title: "All school tracking gathered on a single platform",
      f1_title: "Report Cards & Grades",
      f1_desc: "View grades published by the school and download term report cards available in PDF format.",
      f2_title: "Attendance & Absences",
      f2_desc: "Check attendance, absences, and tardiness recorded by the school.",
      f3_title: "School Workspaces",
      f3_desc: "A space dedicated to principals and authorized staff to manage enrollments, academics, and billing."
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
      blog: "Blog & News",
      legal: "Legal",
      cgu: "Terms of Service",
      privacy: "Privacy Policy",
      mentions: "Legal Mentions",
      partner_title: "Become a Partner",
      partner_desc: "Join the YZIOW ecosystem and let's develop valuable services for schools, staff, and families.",
      partner_discover: "Explore partners",
      partner_btn: "Become a partner",
      rights: "© 2026 Yziow. All rights reserved.",
      madeIn: "Designed in Benin"
    },
    blog: {
      title: "YZIOW Blog",
      subtitle: "Insights, best practices, and news for modern school management.",
      badge: "Blog & Resources",
      emptyTitle: "No articles published yet",
      emptyDesc: "Our articles and practical guides will be available soon. Please check back later!",
      backHome: "Back to home",
      backBlog: "Back to Blog",
      notFoundTitle: "Article not found",
      notFoundDesc: "The article you are looking for does not exist or has been moved.",
      readTime: "min read",
      readMore: "Read article",
      publishedOn: "Published on",
      authorBy: "By",
      category: "Category",
      breadcrumbHome: "Home",
      breadcrumbBlog: "Blog",
      allArticles: "All articles",
      backArticles: "Back to articles",
      discoverYziow: "Discover YZIOW"
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
    partners: {
    "title": "YZIOW Partners",
    "subtitle": "Together, let's build an ecosystem of useful and responsible services for education.",
    "badge": "ECOSYSTEM & PARTNER OFFERS",
    "backHome": "Back to Home",
    "breadcrumbHome": "Home",
    "breadcrumbPartners": "Partners",
    "categoriesTitle": "Eligible Partner Categories",
    "categoriesSubtitle": "Targeted partnerships to address practical needs of schools, educators, and families.",
    "categories": {
        "cat1": {
            "title": "Licensed Banks & Financial Institutions",
            "desc": "Tuition fee payment facilitation, school accounts, and financial services operated exclusively by authorized institutions.",
            "scope": "School tuition payments, dedicated accounts, and licensed financial solutions"
        },
        "cat2": {
            "title": "Telecom & Digital Services",
            "desc": "Internet connectivity for schools, dedicated bundles, and SMS messaging gateways for school communication.",
            "scope": "Broadband connectivity, notification SMS, and digital infrastructure"
        },
        "cat3": {
            "title": "Supplies, Publishing & Equipment",
            "desc": "Textbooks, stationery, pedagogical furniture, and IT equipment tailored for schools.",
            "scope": "Textbooks, stationery, pedagogical supplies, and IT hardware"
        },
        "cat4": {
            "title": "Mobility, Insurance & School Services",
            "desc": "Safe student transportation, tailored insurance coverage, and extracurricular support services.",
            "scope": "School transportation, student insurance, and extracurricular programs"
        },
        "cat5": {
            "title": "NGOs, Foundations & International Institutions",
            "desc": "Educational programs, scholarships, philanthropy, and school inclusion projects with sustainable impact.",
            "scope": "Scholarships, community development, philanthropy, and educational programs"
        }
    },
    "formulasTitle": "Our Partnership Packages",
    "formulasSubtitle": "Three transparent, tailored collaboration levels subject to prior contractual agreement.",
    "formulas": {
        "selectedBadge": "✓ Selected",
        "recommendedBadge": "★ Recommended",
        "presence": {
            "name": "Presence",
            "tagline": "Listing in the partner directory",
            "priceTag": "On quote",
            "desc": "Presentation in the partner directory after verification, approval, and signature of an agreement with YZIOW.",
            "features": [
                "Verified profile of your organization",
                "Direct link to your education-specific offers",
                "Annual quality and compliance review"
            ],
            "cta": "Select Presence Package",
            "selectedCta": "✓ Presence Package Selected"
        },
        "visibility": {
            "name": "Visibility",
            "tagline": "Targeted spotlight and sponsored communication",
            "priceTag": "On quote",
            "desc": "Campaigns identified as Partner Offer or Sponsored Content, broadcast only in authorized spaces and to audiences who agreed to receive them.",
            "features": [
                "Dedicated space labeled as 'Partner Offer'",
                "Geographic and sector targeting respecting user preferences",
                "Consolidated visibility and impact analytics"
            ],
            "cta": "Select Visibility Package",
            "selectedCta": "✓ Visibility Package Selected"
        },
        "strategic": {
            "name": "Strategic Partner",
            "tagline": "Advanced technical and operational integration",
            "priceTag": "On quote",
            "desc": "Study of technical or operational integrations, subject to feasibility, regulatory compliance, and a contractual agreement.",
            "features": [
                "Co-development and technical integration (secure APIs, licensed gateways)",
                "Dedicated operational and technical governance",
                "Regular steering committee and coordinated deployment"
            ],
            "cta": "Select Strategic Partner Package",
            "selectedCta": "✓ Strategic Partner Package Selected"
        }
    },
    "donations": {
        "badge": "PHILANTHROPY & EDUCATIONAL IMPACT",
        "title": "Donations & Philanthropy",
        "subtitle": "Support educational initiatives and promote equal opportunities in schooling.",
        "desc": "Are you a foundation, international institution, corporation, or committed donor? Provide material, financial, or pedagogical support to equip and assist partner schools.",
        "noticeLot3B": "Lot 3A Entry Point: No direct payment or transaction is performed at this stage. Donation collection and accounting traceability will be deployed in Lot 3B.",
        "cta": "Propose a Donation or Sponsorship"
    },
    "form": {
        "title": "Submit a Partnership Application",
        "subtitle": "Present your organization and collaboration goals with YZIOW. Our team will review your application.",
        "fullName": "Representative Full Name",
        "fullNamePlaceholder": "e.g. John Doe",
        "role": "Job Title",
        "rolePlaceholder": "e.g. Head of Partnerships",
        "companyName": "Company or Organization",
        "companyPlaceholder": "e.g. Education Solutions Ltd",
        "organizationType": "Organization Type",
        "selectOrganizationType": "Select your organization type",
        "organizationTypeOptions": {
            "ngo": "NGO",
            "foundation": "Foundation",
            "association": "Association",
            "international_institution": "International Institution",
            "cooperation_agency": "Cooperation Agency",
            "public_body": "Public Body",
            "sponsor_company": "Corporate Sponsor",
            "other": "Other"
        },
        "sector": "Industry Sector & Category",
        "selectSector": "Select your sector",
        "sectorOptions": {
            "finance": "Licensed Banks & Financial Institutions",
            "insurance": "Insurance & Student Coverage",
            "telecom": "Telecom & Digital Services",
            "equipment": "Supplies, Publishing & Equipment",
            "mobility_services": "Mobility, Insurance & School Services",
            "after_school_services": "Services et activités périscolaires",
            "transport": "Student Transportation",
            "ngo_institutions": "NGOs, Foundations & International Institutions",
            "otherRegulated": "Other Regulated Activity (Licensed)",
            "other": "Other Sector"
        },
        "otherSectorLabel": "Specify your activity sector",
        "otherSectorPlaceholder": "e.g. Solar energy, Cafeteria equipment, EdTech...",
        "otherRegulatedQuestion": "Does your activity require official licensing or regulatory authorization?",
        "otherRegulatedYes": "Yes",
        "otherRegulatedNo": "No",
        "subSector": "Service sub-category",
        "selectSubSector": "Select your activity",
        "subSectorOptions": {
            "transport": "School transport",
            "insurance": "School insurance & protection (License required)",
            "afterSchool": "Extracurricular and after-school services",
            "otherRegulated": "Other regulated activity (License required)"
        },
        "regulatedHelp": "For banking, financial, or insurance activities, please specify your regulatory license.",
        "license": "Regulatory License or Authority",
        "licensePlaceholder": "e.g. Central Bank License No., Regulatory Authority...",
        "country": "Country of Incorporation",
        "countryPlaceholder": "e.g. Benin, Ivory Coast, France, UK...",
        "targetMarkets": "Target Countries or Markets",
        "targetMarketsPlaceholder": "e.g. WAEMU region, West Africa, National...",
        "email": "Work Email",
        "emailPlaceholder": "partnerships@company.com",
        "phone": "Work Phone",
        "phonePlaceholder": "+1 234 567 8900",
        "website": "Website (optional)",
        "websitePlaceholder": "https://www.company.com",
        "formula": "Desired Package",
        "selectFormula": "Select a package",
        "supportType": "Intended Type of Support",
        "selectSupportType": "Select the type of support",
        "supportTypeOptions": {
            "future_financial_donation": "Future Financial Donation",
            "equipment_donation": "Equipment Donation",
            "school_sponsorship": "School Sponsorship",
            "educational_project_funding": "Educational Project Funding",
            "skills_sponsorship": "Skills-based Philanthropy",
            "other_proposal": "Other Proposal"
        },
        "projectDescription": "Partnership Project Description",
        "projectPlaceholder": "Describe proposed services, objectives, and value brought to schools and families...",
        "donationProjectPlaceholder": "Describe your donation or sponsorship proposal, target beneficiaries, and collaboration terms...",
        "consentText": "I agree that YZIOW may use the information submitted to review my request and contact me in accordance with its privacy policy.",
        "submit": "Submit Partnership Request",
        "submitDonation": "Submit Sponsorship Proposal",
        "submitting": "Submitting...",
        "successTitle": "Partnership Request Submitted",
        "successMessage": "Your request has been successfully submitted to YZIOW. We will review it promptly.",
        "errorMessage": "An error occurred while submitting. Please check your information and try again.",
        "rateLimitMessage": "Too many recent submissions. Please wait 15 minutes before trying again.",
        "validationError": "Please fill in all mandatory fields and accept the terms.",
        "payloadTooLongError": "Your message exceeds the maximum allowed limit of 5,000 characters. Please shorten your description.",
        "invalidEmailError": "Please enter a valid work email address.",
        "invalidPhoneError": "Please enter a valid work phone number.",
        "invalidWebsiteError": "The website URL must start with http:// or https://",
        "privacyLinkText": "privacy policy"
    },
    "ethics": {
        "title": "Data Protection & Ethical Commitments",
        "p1": "Protection des données et séparation stricte entre les services partenaires et les données scolaires.",
        "p2": "No partner has direct access to school, teacher, parent, or student databases. YZIOW does not sell any personal data.",
        "p3": "YZIOW does not grant any loans. Where applicable, financial services presented on the platform will be exclusively offered and managed by licensed institutions under their own responsibility."
    },
    "placeholderTitle": "Together, let's build useful services for education",
    "placeholderDesc": "Select a collaboration package above or submit a donation / sponsorship proposal to open your application.",
    "placeholderAlt": "Illustration of YZIOW educational partnerships and philanthropy",
    "modifyChoiceBtn": "Modify my choices"
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
      badge: "LA PLATAFORMA DE GESTIÓN ESCOLAR",
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
      c3_desc: "Libros de texto, papelería, equipamiento y material pedagógico destinados a los centros.",
      c4_title: "Transporte, Seguros y Servicios",
      c4_desc: "Soluciones de transporte escolar, coberturas de seguros y actividades complementarias.",
      partnerCta: "Convertirse en socio"
    },
    features: {
      subtitle: "Nuestras Soluciones",
      title: "Todo el seguimiento escolar en una plataforma única",
      f1_title: "Boletines y Notas",
      f1_desc: "Consulte las notas publicadas por el centro y descargue los boletines escolares en formato PDF.",
      f2_title: "Asistencias y Ausencias",
      f2_desc: "Consulte las asistencias, ausencias y retrasos registrados por el centro.",
      f3_title: "Espacios para Escuelas",
      f3_desc: "Un espacio destinado a directores y personal autorizado para gestionar admisiones, escolaridad y facturación."
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
      blog: "Blog y Noticias",
      legal: "Legal",
      cgu: "Términos de Servicio",
      privacy: "Política de Privacidad",
      mentions: "Avisos legales",
      partner_title: "Convertirse en Socio",
      partner_desc: "Únase al ecosistema YZIOW y desarrollemos juntos servicios útiles para los colegios, el personal y las familias.",
      partner_discover: "Descubrir socios",
      partner_btn: "Convertirse en socio",
      rights: "© 2026 Yziow. Todos los derechos reservados.",
      madeIn: "Diseñado en Benín"
    },
    blog: {
      title: "Blog YZIOW",
      subtitle: "Consejos, métodos y noticias para la gestión moderna de centros escolares.",
      badge: "Blog y Recursos",
      emptyTitle: "No hay artículos publicados todavía",
      emptyDesc: "Nuestros artículos y guías prácticas estarán disponibles pronto. ¡Vuelva pronto!",
      backHome: "Volver al inicio",
      backBlog: "Volver al Blog",
      notFoundTitle: "Artículo no encontrado",
      notFoundDesc: "El artículo solicitado no existe o ha sido trasladado.",
      readTime: "min de lectura",
      readMore: "Leer artículo",
      publishedOn: "Publicado el",
      authorBy: "Por",
      category: "Categoría",
      breadcrumbHome: "Inicio",
      breadcrumbBlog: "Blog",
      allArticles: "Todos los artículos",
      backArticles: "Volver a los artículos",
      discoverYziow: "Descubrir YZIOW"
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
    partners: {
    "title": "Socios YZIOW",
    "subtitle": "Desarrollemos juntos un ecosistema de servicios útiles y responsables para la educación.",
    "badge": "ECOSISTEMA Y OFERTAS DE SOCIOS",
    "backHome": "Volver al Inicio",
    "breadcrumbHome": "Inicio",
    "breadcrumbPartners": "Socios",
    "categoriesTitle": "Categorías de socios admisibles",
    "categoriesSubtitle": "Alianzas dirigidas para satisfacer las necesidades concretas de escuelas, docentes y familias.",
    "categories": {
        "cat1": {
            "title": "Bancos e Instituciones Financieras Autorizadas",
            "desc": "Facilitación del pago de matrículas, cuentas escolares y servicios financieros operados exclusivamente por entidades autorizadas.",
            "scope": "Pagos de matrícula, cuentas dedicadas y soluciones financieras autorizadas"
        },
        "cat2": {
            "title": "Telecomunicaciones y Servicios Digitales",
            "desc": "Conectividad a Internet para centros educativos, paquetes dedicados y pasarelas de SMS de información escolar.",
            "scope": "Conectividad de banda ancha, SMS de notificación y herramientas digitales"
        },
        "cat3": {
            "title": "Material, Editorial y Equipamiento Escolar",
            "desc": "Libros de texto, papelería, mobiliario pedagógico y equipos informáticos adaptados para centros educativos.",
            "scope": "Libros de texto, papelería, material didáctico e informática"
        },
        "cat4": {
            "title": "Movilidad, Seguros y Servicios Escolares",
            "desc": "Transporte escolar seguro, coberturas de seguro adaptadas y servicios de actividades extraescolares.",
            "scope": "Transporte escolar, seguros escolares y programas extraescolares"
        },
        "cat5": {
            "title": "ONG, Fundaciones e Instituciones Internacionales",
            "desc": "Programas educativos, becas escolares, mecenazgo y proyectos de inclusión escolar con impacto sostenible.",
            "scope": "Becas, desarrollo comunitario, mecenazgo y programas educativos"
        }
    },
    "formulasTitle": "Nuestras fórmulas de colaboración",
    "formulasSubtitle": "Tres niveles de acompañamiento transparentes, a medida y sujetos a acuerdo contractual previo.",
    "formulas": {
        "selectedBadge": "✓ Seleccionada",
        "recommendedBadge": "★ Recomendada",
        "presence": {
            "name": "Presencia",
            "tagline": "Inclusión en el directorio de socios",
            "priceTag": "Bajo presupuesto",
            "desc": "Presentación en el directorio de socios tras verificación, validación y firma de un acuerdo con YZIOW.",
            "features": [
                "Ficha verificada de su organización",
                "Enlace directo a sus ofertas educativas",
                "Revisión anual de calidad y cumplimiento"
            ],
            "cta": "Elegir fórmula Presencia",
            "selectedCta": "✓ Fórmula Presencia seleccionada"
        },
        "visibility": {
            "name": "Visibilidad",
            "tagline": "Destacado selectivo y comunicación patrocinada",
            "priceTag": "Bajo presupuesto",
            "desc": "Campañas identificadas como Oferta de socio o Contenido patrocinado, difundidas únicamente en espacios autorizados y a usuarios que aceptaron recibirlas.",
            "features": [
                "Espacio dedicado identificado como «Oferta de socio»",
                "Segmentación geográfica y sectorial respetuosa con los usuarios",
                "Informes consolidados de visibilidad e impacto"
            ],
            "cta": "Elegir fórmula Visibilidad",
            "selectedCta": "✓ Fórmula Visibilidad seleccionada"
        },
        "strategic": {
            "name": "Socio Estratégico",
            "tagline": "Integración técnica y operativa avanzada",
            "priceTag": "Bajo presupuesto",
            "desc": "Estudio de integraciones técnicas u operativas, sujeto a viabilidad, conformidad regulatoria y acuerdo contractual.",
            "features": [
                "Codesarrollo e integración técnica (APIs seguras, pasarelas autorizadas)",
                "Acompañamiento operativo y gobernanza dedicada",
                "Comité de seguimiento periódico y despliegue coordinado"
            ],
            "cta": "Elegir fórmula Socio Estratégico",
            "selectedCta": "✓ Fórmula Socio Estratégico seleccionada"
        }
    },
    "donations": {
        "badge": "MECENAZGO E IMPACTO EDUCATIVO",
        "title": "Donaciones y Mecenazgo",
        "subtitle": "Apoye iniciativas escolares y fomente la igualdad de oportunidades educativas.",
        "desc": "¿Es usted una fundación, institución, empresa o donante comprometido? Ofrezca apoyo material, financiero o pedagógico para equipar y respaldar a los centros escolares.",
        "noticeLot3B": "Punto de entrada Lote 3A: No se realiza ningún cobro directo en esta etapa. La recaudación y trazabilidad contable de las donaciones se implementarán en el Lote 3B.",
        "cta": "Proponer una donación o mecenazgo"
    },
    "form": {
        "title": "Enviar una solicitud de alianza",
        "subtitle": "Presente su organización y sus objetivos de colaboración con YZIOW. Nuestro equipo evaluará su solicitud.",
        "fullName": "Nombre y apellido del representante",
        "fullNamePlaceholder": "Ej.: Juan Pérez",
        "role": "Cargo del representante",
        "rolePlaceholder": "Ej.: Director de Alianzas",
        "companyName": "Empresa u organización",
        "companyPlaceholder": "Ej.: Soluciones Educativas S.A.",
        "organizationType": "Tipo de organización",
        "selectOrganizationType": "Seleccione el tipo de organización",
        "organizationTypeOptions": {
            "ngo": "ONG",
            "foundation": "Fundación",
            "association": "Asociación",
            "international_institution": "Institución internacional",
            "cooperation_agency": "Agencia de cooperación",
            "public_body": "Organismo público",
            "sponsor_company": "Empresa mecenas",
            "other": "Otro"
        },
        "sector": "Sector de actividad y categoría",
        "selectSector": "Seleccione su sector",
        "sectorOptions": {
            "finance": "Bancos e Instituciones Financieras Autorizadas",
            "insurance": "Seguros y Coberturas Escolares",
            "telecom": "Telecomunicaciones y Servicios Digitales",
            "equipment": "Material, Editorial y Equipamiento Escolar",
            "mobility_services": "Movilidad, Seguros y Servicios escolares",
            "after_school_services": "Services et activités périscolaires",
            "transport": "Transporte Escolar",
            "ngo_institutions": "ONG, Fundaciones e Instituciones Internacionales",
            "otherRegulated": "Otra actividad regulada (con acreditación)",
            "other": "Otro sector de actividad"
        },
        "otherSectorLabel": "Especifique su sector de actividad",
        "otherSectorPlaceholder": "Ej.: Energía solar, Equipamiento de comedor, EdTech...",
        "otherRegulatedQuestion": "¿Su actividad requiere una licencia o autorización regulatoria oficial?",
        "otherRegulatedYes": "Sí",
        "otherRegulatedNo": "No",
        "subSector": "Subcategoría de actividad",
        "selectSubSector": "Seleccione su actividad",
        "subSectorOptions": {
            "transport": "Transporte escolar",
            "insurance": "Seguro y previsión escolar (Requiere autorización)",
            "afterSchool": "Servicios y actividades extraescolares",
            "otherRegulated": "Otra actividad regulada (Requiere autorización)"
        },
        "regulatedHelp": "Para actividades bancarias, financieras o de seguros, indique su acreditación regulatoria.",
        "license": "Acreditación o autoridad de regulación",
        "licensePlaceholder": "Ej.: Licencia Bancaria N°, Autoridad Reguladora...",
        "country": "País de implantación",
        "countryPlaceholder": "Ej.: España, Benín, México, Colombia...",
        "targetMarkets": "Países o mercados objetivo",
        "targetMarketsPlaceholder": "Ej.: África Occidental, Nacional, Internacional...",
        "email": "Correo electrónico profesional",
        "emailPlaceholder": "alianzas@empresa.com",
        "phone": "Teléfono profesional",
        "phonePlaceholder": "+34 600 000 000",
        "website": "Sitio web (opcional)",
        "websitePlaceholder": "https://www.empresa.com",
        "formula": "Fórmula deseada",
        "selectFormula": "Seleccione una fórmula",
        "supportType": "Tipo de apoyo previsto",
        "selectSupportType": "Seleccione el tipo de apoyo",
        "supportTypeOptions": {
            "future_financial_donation": "Donación financiera futura",
            "equipment_donation": "Donación de material",
            "school_sponsorship": "Patrocinio de un centro educativo",
            "educational_project_funding": "Financiación de proyecto educativo",
            "skills_sponsorship": "Mecenazgo de competencias",
            "other_proposal": "Otra propuesta"
        },
        "projectDescription": "Descripción del proyecto de alianza",
        "projectPlaceholder": "Describa los servicios previstos, sus objetivos y el valor aportado a las escuelas y familias...",
        "donationProjectPlaceholder": "Describa su propuesta de donación o mecenazgo, los beneficiarios previstos y las modalidades de colaboración...",
        "consentText": "Acepto que YZIOW utilice la información transmitida para estudiar mi solicitud y contactarme de acuerdo con su política de privacidad.",
        "submit": "Enviar mi solicitud de alianza",
        "submitDonation": "Enviar propuesta de mecenazgo",
        "submitting": "Enviando...",
        "successTitle": "Solicitud enviada con éxito",
        "successMessage": "Su solicitud ha sido enviada al equipo de YZIOW. La evaluaremos a la mayor brevedad.",
        "errorMessage": "Ocurrió un error al enviar. Por favor revise sus datos y vuelva a intentarlo.",
        "rateLimitMessage": "Demasiadas solicitudes recientes. Por favor espere 15 minutos.",
        "validationError": "Por favor complete todos los campos obligatorios y acepte las condiciones.",
        "payloadTooLongError": "Su mensaje supera el límite máximo permitido de 5.000 caracteres. Por favor acorte su descripción.",
        "invalidEmailError": "Por favor introduzca un correo electrónico profesional válido.",
        "invalidPhoneError": "Por favor introduzca un número de teléfono profesional válido.",
        "invalidWebsiteError": "El sitio web debe comenzar con http:// o https://",
        "privacyLinkText": "política de privacidad"
    },
    "ethics": {
        "title": "Protección de datos y compromisos éticos",
        "p1": "Protection des données et séparation stricte entre les services partenaires et les données scolaires.",
        "p2": "Ningún socio tiene acceso directo a las bases de datos de centros, docentes, padres o alumnos. YZIOW no comercializa datos personales.",
        "p3": "YZIOW no concede ningún préstamo. En su caso, los servicios financieros presentados en la plateforme serán ofrecidos y gestionados exclusivamente por instituciones autorizadas, bajo su propia responsabilité."
    },
    "placeholderTitle": "Construyamos juntos servicios útiles para la educación",
    "placeholderDesc": "Seleccione un paquete de colaboración arriba o proponga una donación o mecenazgo para abrir su solicitud.",
    "placeholderAlt": "Ilustración de alianzas educativas y mecenazgo YZIOW",
    "modifyChoiceBtn": "Modificar mis elecciones"
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
      badge: "منصة الإدارة المدرسية",
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
      c3_desc: "كتب مدرسية وقرطاسية وتجهيزات ووسائل تعليمية موجهة للمؤسسات.",
      c4_title: "النقل والتأمين والخدمات",
      c4_desc: "حلول النقل المدرسي والتغطية التأمينية والأنشطة الإضافية.",
      partnerCta: "كن شريكاً"
    },
    features: {
      subtitle: "حلولنا",
      title: "كل التتبع المدرسي مجموع في منصة واحدة",
      f1_title: "النتائج والدرجات",
      f1_desc: "اطلع على الدرجات المعلنة من المؤسسة وحمّل كشوف النقاط المتوفرة بصيغة PDF.",
      f2_title: "الحضور والغياب",
      f2_desc: "اطلع على سجل الحضور والغياب والتأخيرات المسجلة من طرف المؤسسة.",
      f3_title: "مساحات المؤسسات",
      f3_desc: "مساحة مخصصة للمديرين والموظفين المخولين لإدارة التسجيل والدراسة والفوترة."
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
      blog: "المدونة والأخبار",
      legal: "قانوني",
      cgu: "شروط الاستخدام",
      privacy: "سياسة الخصوصية",
      mentions: "ملاحظات قانونية",
      partner_title: "كن شريكاً",
      partner_desc: "انضم إلى منظومة YZIOW ولنعمل معاً على تطوير خدمات مفيدة للمدارس والكوادر والأسر.",
      partner_discover: "استكشف الشركاء",
      partner_btn: "كن شريكاً",
      rights: "© 2026 Yziow. جميع الحقوق محفوظة.",
      madeIn: "صُمم في بنين"
    },
    blog: {
      title: "مدونة YZIOW",
      subtitle: "إرشادات وأساليب وأخبار حديثة لدعم إدارة المؤسسات التعليمية.",
      badge: "المدونة والموارد",
      emptyTitle: "لا توجد مقالات منشورة حالياً",
      emptyDesc: "ستتوفر مقالاتنا وأدلتنا العملية قريباً. يرجى العودة لاحقاً!",
      backHome: "العودة للرئيسية",
      backBlog: "العودة للمدونة",
      notFoundTitle: "المقال غير موجود",
      notFoundDesc: "المقال الذي تبحث عنه غير موجود أو تم نقله.",
      readTime: "دقائق للقراءة",
      readMore: "اقرأ المقال",
      publishedOn: "نُشر في",
      authorBy: "بواسطة",
      category: "التصنيف",
      breadcrumbHome: "الرئيسية",
      breadcrumbBlog: "المدونة",
      allArticles: "جميع المقالات",
      backArticles: "العودة للمقالات",
      discoverYziow: "اكتشف YZIOW"
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
    partners: {
    "title": "شركاء YZIOW",
    "subtitle": "معاً نبني منظومة خدمات مفيدة ومسؤولة لدعم التعليم.",
    "badge": "المنظومة وعروض الشركاء",
    "backHome": "العودة إلى الرئيسية",
    "breadcrumbHome": "الرئيسية",
    "breadcrumbPartners": "الشركاء",
    "categoriesTitle": "فئات الشركاء المؤهلين",
    "categoriesSubtitle": "شراكات هادفة لتلبية الاحتياجات العملية للمؤسسات التعليمية والكوادر التربوية والأسر.",
    "categories": {
        "cat1": {
            "title": "البنوك والمؤسسات المالية المعتمدة",
            "desc": "تيسير سداد الرسوم الدراسية، الحسابات المدرسية والخدمات المالية المقدمة حصرياً عبر مؤسسات معتمدة.",
            "scope": "مدفوعات الرسوم الدراسية، حسابات مخصصة وحلول مالية معتمدة"
        },
        "cat2": {
            "title": "الاتصالات والخدمات الرقمية",
            "desc": "توفير الاتصال بالإنترنت للمدارس، باقات مخصصة وبوابات رسائل نصية للتواصل المدرسي.",
            "scope": "إنترنت عالي السرعة، رسائل إشعار مدرسية وأدوات رقمية"
        },
        "cat3": {
            "title": "المستلزمات، النشر والتجهيزات المدرسية",
            "desc": "الكتب المدرسية، القرطاسية، الأثاث التربوي والتجهيزات التقنية المخصصة للمدارس.",
            "scope": "كتب مدرسية، قرطاسية، مستلزمات تعليمية ومعدات حاسوبية"
        },
        "cat4": {
            "title": "النقل، التأمين والخدمات المدرسية",
            "desc": "النقل المدرسي الآمن، التغطية التأمينية المناسبة وخدمات الأنشطة المدرسية التكميلية.",
            "scope": "نقل مدرسي، تأمين مدرسي وأنشطة لاصفية"
        },
        "cat5": {
            "title": "المنظمات غير الحكومية والمؤسسات والهيئات الدولية",
            "desc": "البرامج التعليمية والمنح الدراسية ورعاية المشاريع ومبادرات الشمول المدرسي ذات الأثر المستدام.",
            "scope": "المنح الدراسية والتنمية المجتمعية والرعاية والبرامج التعليمية"
        }
    },
    "formulasTitle": "باقات التعاون والشراكة",
    "formulasSubtitle": "ثلاثة مستويات مرافقة شفافة ومخصصة تخضع لاتفاق تعاقدي مسبق.",
    "formulas": {
        "selectedBadge": "✓ محددة",
        "recommendedBadge": "★ موصى بها",
        "presence": {
            "name": "حضور",
            "tagline": "الإدراج في دليل الشركاء",
            "priceTag": "حسب المقايسة",
            "desc": "الظهور في دليل الشركاء بعد التحقق والمصادقة وتوقيع اتفاق رسمي مع YZIOW.",
            "features": [
                "ملف تعريفي معتمد لمؤسستكم",
                "رابط مباشر لعروضكم الموجهة للتعليم",
                "مراجعة سنوية لضمان الجودة والمطابقة"
            ],
            "cta": "اختيار باقة حضور",
            "selectedCta": "✓ تم اختيار باقة حضور"
        },
        "visibility": {
            "name": "ظهور",
            "tagline": "إبراز موجه وتواصل مدعوم",
            "priceTag": "حسب المقايسة",
            "desc": "حملات محددة كـ «عرض شريك» أو «محتوى ممول»، تُنشر فقط في المساحات المصرح بها وللجمهور الذي وافق على تلقيها.",
            "features": [
                "مساحة مخصصة موسومة بـ «عرض شريك»",
                "استهداف جغرافي وقطاعي يحترم اختيارات المستخدمين",
                "تقارير موحدة لقياس الوصول والتأثير"
            ],
            "cta": "اختيار باقة ظهور",
            "selectedCta": "✓ تم اختيار باقة ظهور"
        },
        "strategic": {
            "name": "شريك استراتيجي",
            "tagline": "تكامل تقني وتشغيلي متقدم",
            "priceTag": "حسب المقايسة",
            "desc": "دراسة التكامل التقني أو التشغيلي رهناً بجدوى التطبيق والمطابقة التنظيمية والاتفاق التعاقدي.",
            "features": [
                "تطوير وتكامل تقني (واجهات برمجة آمنة، بوابات معتمدة)",
                "مرافقة تشغيلية وإشراف مخصص",
                "لجنة متابعة دورية وانتشار منسق"
            ],
            "cta": "اختيار باقة شريك استراتيجي",
            "selectedCta": "✓ تم اختيار باقة شريك استراتيجي"
        }
    },
    "donations": {
        "badge": "الرعاية والأثر التعليمي",
        "title": "التبرعات والرعاية التعليمية",
        "subtitle": "ادعم المبادرات المدرسية وعزز تكافؤ الفرص في التعليم.",
        "desc": "هل أنتم مؤسسة خيرية أو هيئة دولية أو شركة أو جهة مانحة؟ قدموا دعماً مادياً أو مالياً أو تربوياً لتجهيز ودعم المدارس الشريكة.",
        "noticeLot3B": "نقطة دخول الحزمة 3A: لا يتم تحصيل أي مبالغ مالية في هذه المرحلة. سيتم نشر آلية التبرعات والتحصيل في الحزمة 3B.",
        "cta": "تقديم مقترح تبرع أو رعاية"
    },
    "form": {
        "title": "تقديم طلب شراكة",
        "subtitle": "عرّف بمؤسستك وأهدافك للتعاون مع YZIOW. سيقوم فريقنا بدراسة طلبك بعناية.",
        "fullName": "الاسم الكامل للممثل",
        "fullNamePlaceholder": "مثال: أحمد محمد",
        "role": "الصفة أو المنصب",
        "rolePlaceholder": "مثال: مدير الشراكات",
        "companyName": "الشركة أو المؤسسة",
        "companyPlaceholder": "مثال: مؤسسة الحلول التعليمية",
        "organizationType": "نوع المنظمة أو الهيئة",
        "selectOrganizationType": "اختر نوع المنظمة",
        "organizationTypeOptions": {
            "ngo": "منظمة غير حكومية",
            "foundation": "مؤسسة خيرية / وقفية",
            "association": "جمعية",
            "international_institution": "هيئة دولية",
            "cooperation_agency": "وكالة تعاون دولي",
            "public_body": "جهة حكومية أو عامة",
            "sponsor_company": "شركة راعية / مانحة",
            "other": "أخرى"
        },
        "sector": "قطاع النشاط والفئة",
        "selectSector": "اختر قطاع نشاطك",
        "sectorOptions": {
            "finance": "البنوك والمؤسسات المالية المعتمدة",
            "insurance": "التأمين والحماية المدرسية",
            "telecom": "الاتصالات والخدمات الرقمية",
            "equipment": "المستلزمات، النشر والتجهيزات المدرسية",
            "mobility_services": "التنقل والتأمين والخدمات المدرسية",
            "after_school_services": "Services et activités périscolaires",
            "transport": "النقل المدرسي",
            "ngo_institutions": "المنظمات غير الحكومية والمؤسسات والهيئات الدولية",
            "otherRegulated": "نشاط منظم آخر (مع ترخيص رسمي)",
            "other": "قطاع نشاط آخر"
        },
        "otherSectorLabel": "يرجى تحديد قطاع نشاطكم",
        "otherSectorPlaceholder": "مثال: الطاقة الشمسية، تجهيزات المطاعم المدرسية، تكنولوجيا التعليم...",
        "otherRegulatedQuestion": "هل يتطلب نشاطكم ترخيصاً أو اعتماداً تنظيمياً رسمياً؟",
        "otherRegulatedYes": "نعم",
        "otherRegulatedNo": "لا",
        "subSector": "الفئة الفرعية للنشاط",
        "selectSubSector": "اختر نوع النشاط",
        "subSectorOptions": {
            "transport": "النقل المدرسي",
            "insurance": "التأمين والحماية المدرسية (يتطلب ترخيصاً)",
            "afterSchool": "الخدمات والأنشطة المدرسية التكميلية",
            "otherRegulated": "نشاط آخر خاضع للتنظيم (يتطلب ترخيصاً)"
        },
        "regulatedHelp": "بالنسبة للأنشطة البنكية أو المالية أو التأمينية، يرجى تحديد الترخيص الرسمي.",
        "license": "الترخيص أو الهيئة الرقابية",
        "licensePlaceholder": "مثال: ترخيص البنك المركزي رقم...، هيئة الرقابة...",
        "country": "بلد المقر",
        "countryPlaceholder": "مثال: بنين، ساحل العاج، مصر، المغرب...",
        "targetMarkets": "البلدان أو الأسواق المستهدفة",
        "targetMarketsPlaceholder": "مثال: منطقة غرب إفريقيا، محلي، إقليمي...",
        "email": "البريد الإلكتروني المهني",
        "emailPlaceholder": "partners@company.com",
        "phone": "الهاتف المهني",
        "phonePlaceholder": "+229 01 00 00 00",
        "website": "الموقع الإلكتروني (اختياري)",
        "websitePlaceholder": "https://www.company.com",
        "formula": "الباقة المطلوبة",
        "selectFormula": "اختر باقة",
        "supportType": "نوع الدعم المقترح",
        "selectSupportType": "اختر نوع الدعم",
        "supportTypeOptions": {
            "future_financial_donation": "تبرع مالي مستقبلي",
            "equipment_donation": "تبرع بمعدات وتجهيزات",
            "school_sponsorship": "كفالة أو رعاية مؤسسة تعليمية",
            "educational_project_funding": "تمويل مشروع تعليمي",
            "skills_sponsorship": "رعاية بالخبرات والمهارات",
            "other_proposal": "مقترح آخر"
        },
        "projectDescription": "وصف مشروع الشراكة",
        "projectPlaceholder": "صف الخدمات المقترحة، أهدافكم والقيمة المضافة المقدمة للمدارس والأسر...",
        "donationProjectPlaceholder": "صف مقترح التبرع أو الرعاية، الفئات المستفيدة وآليات التنفيذ المقترحة...",
        "consentText": "أوافق على أن تستخدم YZIOW المعلومات المرسلة لدراسة طلبي والتواصل معي وفقاً لسياسة الخصوصية الخاصة بها.",
        "submit": "إرسال طلب الشراكة",
        "submitDonation": "إرسال مقترح الرعاية أو التبرع",
        "submitting": "جاري الإرسال...",
        "successTitle": "تم إرسال طلب الشراكة بنجاح",
        "successMessage": "تم استلام طلبكم وسيقوم فريق YZIOW بمراجعته والتواصل معكم في أقرب وقت.",
        "errorMessage": "حدث خطأ أثناء الإرسال. يرجى التحقق من البيانات والمحاولة مجدداً.",
        "rateLimitMessage": "طلبات كثيرة مؤخراً. يرجى الانتظار 15 دقيقة قبل إعادة المحاولة.",
        "validationError": "يرجى ملء جميع الحقول المطلوبة والموافقة على الشروط.",
        "payloadTooLongError": "تتجاوز رسالتكم الحد الأقصى المسموح به وهو 5000 حرف. يرجى اختصار الوصف.",
        "invalidEmailError": "يرجى إدخال عنوان بريد إلكتروني مهني صحيح.",
        "invalidPhoneError": "يرجى إدخال رقم هاتف مهني صحيح.",
        "invalidWebsiteError": "يجب أن يبدأ عنوان الموقع الإلكتروني بـ http:// أو https://",
        "privacyLinkText": "سياسة الخصوصية"
    },
    "ethics": {
        "title": "حماية البيانات والالتزامات الأخلاقية",
        "p1": "Protection des données et séparation stricte entre les services partenaires et les données scolaires.",
        "p2": "لا يملك أي شريك وصولاً مباشراً إلى قواعد بيانات المدارس أو المعلمين أو أولياء الأمور أو الطلاب. ولا تبيع YZIOW أي بيانات شخصية.",
        "p3": "لا تقدم YZIOW أي قروض. وعند الاقتضاء، تُعرض وتُدار الخدمات المالية على المنصة حصرياً من قِبل مؤسسات معتمدة وتحت مسؤوليتها الخاصة."
    },
    "placeholderTitle": "معاً نبني خدمات مفيدة ومسؤولة للتعليم",
    "placeholderDesc": "اختر باقة تعاون من الأعلى أو قدم مقترح تبرع أو رعاية لفتح ملف الترشح.",
    "placeholderAlt": "رسم توضيحي للشراكات والرعاية التعليمية YZIOW",
    "modifyChoiceBtn": "تعديل اختياراتي"
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
      badge: "LA PIATTAFORMA DI GESTIONE SCOLASTICA",
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
      c3_desc: "Libri di testo, cancelleria, attrezzature e materiale didattico destinati agli istituti.",
      c4_title: "Trasporti, Assicurazioni e Servizi",
      c4_desc: "Soluzioni per la mobilità scolastica, coperture assicurative e attività extrascolastiche.",
      partnerCta: "Diventa partner"
    },
    features: {
      subtitle: "Le Nostre Soluzioni",
      title: "Tutto il monitoraggio scolastico in un'unica piattaforma",
      f1_title: "Pagelle e Voti",
      f1_desc: "Consulta i voti pubblicati dall'istituto e scarica le pagelle rese disponibili in formato PDF.",
      f2_title: "Presenze e Assenze",
      f2_desc: "Consulta le presenze, le assenze e i ritardi registrati dall'istituto.",
      f3_title: "Spazi Istituti",
      f3_desc: "Uno spazio dedicato ai dirigenti e al personale autorizzato per gestire iscrizioni, didattica e fatturazione."
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
      blog: "Blog & Notizie",
      legal: "Legale",
      cgu: "Condizioni di Servizio",
      privacy: "Informativa sulla Privacy",
      mentions: "Note Legali",
      partner_title: "Diventa Partner",
      partner_desc: "Unisciti all'ecosistema YZIOW e sviluppiamo insieme servizi utili a scuole, personale e famiglie.",
      partner_discover: "Scopri i partner",
      partner_btn: "Diventa partner",
      rights: "© 2026 Yziow. Tutti i diritti riservati.",
      madeIn: "Progettato in Benin"
    },
    blog: {
      title: "Blog YZIOW",
      subtitle: "Consigli, metodi e novità per la gestione moderna degli istituti scolastici.",
      badge: "Blog e Risorse",
      emptyTitle: "Nessun articolo pubblicato al momento",
      emptyDesc: "I nostri articoli e guide pratiche saranno presto disponibili. Torna a trovarci presto!",
      backHome: "Torna alla home",
      backBlog: "Torna al Blog",
      notFoundTitle: "Articolo non trovato",
      notFoundDesc: "L'articolo cercato non esiste o è stato rimosso.",
      readTime: "min di lettura",
      readMore: "Leggi articolo",
      publishedOn: "Pubblicato il",
      authorBy: "Di",
      category: "Categoria",
      breadcrumbHome: "Home",
      breadcrumbBlog: "Blog",
      allArticles: "Tutti gli articoli",
      backArticles: "Torna agli articoli",
      discoverYziow: "Scopri YZIOW"
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
    partners: {
    "title": "Partner YZIOW",
    "subtitle": "Costruiamo insieme un ecosistema di servizi utili e responsabili per l'istruzione.",
    "badge": "ECOSISTEMA E OFFERTE PARTNER",
    "backHome": "Torna alla Home",
    "breadcrumbHome": "Home",
    "breadcrumbPartners": "Partner",
    "categoriesTitle": "Categorie di partner ammissibili",
    "categoriesSubtitle": "Collaborazioni mirate per rispondere alle esigenze concrete delle scuole, dei docenti e delle famiglie.",
    "categories": {
        "cat1": {
            "title": "Banche e Istituti Finanziari Autorizzati",
            "desc": "Agevolazione del pagamento delle rette scolastiche, conti dedicati e servizi finanziari operati esclusivamente da istituti autorizzati.",
            "scope": "Pagamenti delle rette, conti dedicati e soluzioni finanziarie autorizzate"
        },
        "cat2": {
            "title": "Telecomunicazioni e Servizi Digitali",
            "desc": "Connettività Internet per le scuole, pacchetti dedicati e gateway SMS per le comunicazioni scolastiche.",
            "scope": "Banda larga, SMS informativi e strumenti digitali"
        },
        "cat3": {
            "title": "Forniture, Editoria e Attrezzature Scolastiche",
            "desc": "Libri di testo, cancelleria, arredi pedagogici e attrezzature informatiche per istituti scolastici.",
            "scope": "Libri di testo, cancelleria, materiale didattico e informatica"
        },
        "cat4": {
            "title": "Mobilità, Assicurazioni e Servizi Scolastici",
            "desc": "Trasporto scolastico sicuro, coperture assicurative su misura e servizi extrascolastici.",
            "scope": "Trasporto scolastico, assicurazioni e attività extrascolastiche"
        },
        "cat5": {
            "title": "ONG, Fondazioni e Istituzioni Internazionali",
            "desc": "Programmi educativi, borse di studio, mecenatismo e progetti di inclusione scolastica a impatto sostenibile.",
            "scope": "Borse di studio, sviluppo comunitario, mecenatismo e programmi educativi"
        }
    },
    "formulasTitle": "Le nostre formule di collaborazione",
    "formulasSubtitle": "Tre livelli di supporto trasparenti, su misura e soggetti ad accordo contrattuale preventivo.",
    "formulas": {
        "selectedBadge": "✓ Selezionata",
        "recommendedBadge": "★ Consigliata",
        "presence": {
            "name": "Presenza",
            "tagline": "Inserimento nella directory partner",
            "priceTag": "Su preventivo",
            "desc": "Presentazione nella directory partner dopo verifica, approvazione e firma di un accordo con YZIOW.",
            "features": [
                "Scheda verificata della vostra organizzazione",
                "Link diretto alle vostre offerte per l'istruzione",
                "Revisione annuale di qualità e conformità"
            ],
            "cta": "Scegli la formula Presenza",
            "selectedCta": "✓ Formula Presenza selezionata"
        },
        "visibility": {
            "name": "Visibilità",
            "tagline": "In risalto mirato e communication sponsorizzata",
            "priceTag": "Su preventivo",
            "desc": "Campagne identificate come Offerta partner o Contenuto sponsorizzato, diffuse unicamente negli spazi autorizzati e agli utenti che hanno accettato di riceverle.",
            "features": [
                "Spazio dedicato contrassegnato come «Offerta partner»",
                "Targeting geografico e di settore nel rispetto degli utenti",
                "Report consolidati di visibilità e impatto"
            ],
            "cta": "Scegli la formula Visibilità",
            "selectedCta": "✓ Formula Visibilità selezionata"
        },
        "strategic": {
            "name": "Partner Strategico",
            "tagline": "Integrazione tecnica e operativa avanzata",
            "priceTag": "Su preventivo",
            "desc": "Studio di integrazioni tecniche o operative, subordinato a fattibilità, conformità normativa e accordo contrattuale.",
            "features": [
                "Co-sviluppo e integrazione tecnica (API sicure, gateway autorizzati)",
                "Supporto operativo e governance dedicata",
                "Comitato di monitoraggio periodico e implementazione coordinata"
            ],
            "cta": "Scegli la formula Partner Strategico",
            "selectedCta": "✓ Formula Partner Strategico selezionata"
        }
    },
    "donations": {
        "badge": "MECENATISMO E IMPATTO EDUCATIVO",
        "title": "Donazioni e Mecenatismo",
        "subtitle": "Sostieni iniziative scolastiche e favorisci pari opportunità educative.",
        "desc": "Sei una fondazione, istituzione, azienda o un donatore impegnato? Offri supporto materiale, finanziario o pedagogico per attrezzare e accompagnare le scuole partner.",
        "noticeLot3B": "Punto di ingresso Lotto 3A: Nessun incasso diretto viene effettuato in questa fase. La raccolta e tracciabilità contabile delle donazioni saranno implementate nel Lotto 3B.",
        "cta": "Proponi una donazione o mecenatismo"
    },
    "form": {
        "title": "Invia una richiesta di partnership",
        "subtitle": "Presenta la tua organizzazione e i tuoi obiettivi di collaborazione con YZIOW. Il nostro team esaminerà la richiesta.",
        "fullName": "Nome e cognome del rappresentante",
        "fullNamePlaceholder": "Es.: Mario Rossi",
        "role": "Ruolo aziendale",
        "rolePlaceholder": "Es.: Responsabile Partnership",
        "companyName": "Azienda o organizzazione",
        "companyPlaceholder": "Es.: Soluzioni Educative S.p.A.",
        "organizationType": "Tipo di organizzazione",
        "selectOrganizationType": "Seleziona il tipo di organizzazione",
        "organizationTypeOptions": {
            "ngo": "ONG",
            "foundation": "Fondazione",
            "association": "Associazione",
            "international_institution": "Istituzione internazionale",
            "cooperation_agency": "Agenzia di cooperazione",
            "public_body": "Ente pubblico",
            "sponsor_company": "Azienda mecenate",
            "other": "Altro"
        },
        "sector": "Settore di attività e categoria",
        "selectSector": "Seleziona il tuo settore",
        "sectorOptions": {
            "finance": "Banche e Istituti Finanziari Autorizzati",
            "insurance": "Assicurazioni e Previdenza Scolastica",
            "telecom": "Telecomunicazioni e Servizi Digitali",
            "equipment": "Forniture, Editoria e Attrezzature Scolastiche",
            "mobility_services": "Mobilità, Assicurazione e Servizi scolastici",
            "after_school_services": "Services et activités périscolaires",
            "transport": "Trasporto Scolastico",
            "ngo_institutions": "ONG, Fondazioni e Istituzioni Internazionali",
            "otherRegulated": "Altra attività regolamentata (con autorizzazione)",
            "other": "Altro settore di attività"
        },
        "otherSectorLabel": "Specificare il settore di attività",
        "otherSectorPlaceholder": "Es.: Energia solare, Attrezzature per mense, EdTech...",
        "otherRegulatedQuestion": "La vostra attività richiede un'autorizzazione o abilitazione normativa specifica?",
        "otherRegulatedYes": "Sì",
        "otherRegulatedNo": "No",
        "subSector": "Sottocategoria di attività",
        "selectSubSector": "Seleziona la tua attività",
        "subSectorOptions": {
            "transport": "Trasporto scolastico",
            "insurance": "Assicurazione e protezione scolastica (Autorizzazione richiesta)",
            "afterSchool": "Servizi e attività parascolastiche",
            "otherRegulated": "Altra attività regolamentata (Autorizzazione richiesta)"
        },
        "regulatedHelp": "Per attività bancarie, finanziarie o assicurative, indicare l'autorizzazione normativa.",
        "license": "Autorizzazione o autorità di vigilanza",
        "licensePlaceholder": "Es.: Licenza Bancaria N°..., Autorità di Vigilanza...",
        "country": "Paese della sede",
        "countryPlaceholder": "Es.: Italia, Benin, Francia...",
        "targetMarkets": "Paesi o mercati target",
        "targetMarketsPlaceholder": "Es.: Africa Occidentale, Nazionale, Internazionale...",
        "email": "Email aziendale",
        "emailPlaceholder": "partner@azienda.com",
        "phone": "Telefono aziendale",
        "phonePlaceholder": "+39 02 0000 0000",
        "website": "Sito web (opzionale)",
        "websitePlaceholder": "https://www.azienda.com",
        "formula": "Formula desiderata",
        "selectFormula": "Seleziona una formula",
        "supportType": "Tipo di supporto previsto",
        "selectSupportType": "Seleziona il tipo di supporto",
        "supportTypeOptions": {
            "future_financial_donation": "Donazione finanziaria futura",
            "equipment_donation": "Donazione di attrezzature",
            "school_sponsorship": "Adozione o sostegno a una scuola",
            "educational_project_funding": "Finanziamento di un progetto educativo",
            "skills_sponsorship": "Mecenatismo di competenze",
            "other_proposal": "Altra proposta"
        },
        "projectDescription": "Descrizione del progetto di partnership",
        "projectPlaceholder": "Descrivi i servizi proposti, i tuoi obiettivi e il valore offerto a scuole e famiglie...",
        "donationProjectPlaceholder": "Descrivi la proposta di donazione o mecenatismo, i beneficiari previsti e le modalità di attuazione...",
        "consentText": "Accetto che YZIOW utilizzi le informazioni trasmesse per valutare la mia richiesta e ricontattarmi in conformità con la sua informativa sulla privacy.",
        "submit": "Invia richiesta di partnership",
        "submitDonation": "Invia proposta di mecenatismo",
        "submitting": "Invio in corso...",
        "successTitle": "Richiesta inviata con successo",
        "successMessage": "La tua richiesta è stata trasmessa al team YZIOW. La esamineremo al più presto.",
        "errorMessage": "Si è verificato un errore durante l'invio. Verifica i dati e riprova.",
        "rateLimitMessage": "Troppe richieste recenti. Attendi 15 minuti prima di riprovare.",
        "validationError": "Compila tutti i campi obbligatori e accetta le condizioni.",
        "payloadTooLongError": "Il tuo messaggio supera il limite massimo consentito di 5.000 caratteri. Si prega di abbreviare la descrizione.",
        "invalidEmailError": "Inserisci un indirizzo email aziendale valido.",
        "invalidPhoneError": "Inserisci un numero di telefono aziendale valido.",
        "invalidWebsiteError": "L'indirizzo del sito web deve iniziare con http:// o https://",
        "privacyLinkText": "informativa sulla privacy"
    },
    "ethics": {
        "title": "Protezione dei dati e impegni etici",
        "p1": "Protection des données et séparation stricte entre les services partenaires et les données scolaires.",
        "p2": "Nessun partner ha accesso diretto ai database di scuole, docenti, genitori o studenti. YZIOW non vende dati personali.",
        "p3": "YZIOW non concede alcun prestito. Se del caso, i servizi finanziari presentati sulla piattaforma saranno esclusivamente offerti e gestiti da istituti autorizzati, sotto la propria responsabilità."
    },
    "placeholderTitle": "Costruiamo insieme servizi utili per l'istruzione",
    "placeholderDesc": "Seleziona una formula di collaborazione sopra o proponi una donazione o mecenatismo per aprire la tua candidatura.",
    "placeholderAlt": "Illustrazione delle partnership educative e mecenatismo YZIOW",
    "modifyChoiceBtn": "Modifica le mie scelte"
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
      badge: "DIE SCHULVERWALTUNGSPLATTFORM",
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
      c3_desc: "Schulbücher, Schreibwaren, Geräte und Lehrmaterialien für Bildungseinrichtungen.",
      c4_title: "Transport, Versicherung & Services",
      c4_desc: "Schülertransport, Versicherungsschutz und schulbegleitende Angebote.",
      partnerCta: "Partner werden"
    },
    features: {
      subtitle: "Unsere Lösungen",
      title: "Gesamte Schulverwaltung auf einer Plattform",
      f1_title: "Zeugnisse & Noten",
      f1_desc: "Sehen Sie die von der Schule veröffentlichten Noten ein und laden Sie die Zeugnisse als PDF herunter.",
      f2_title: "Anwesenheit & Fehlzeiten",
      f2_desc: "Sehen Sie die von der Schule erfassten Anwesenheiten, Fehlzeiten und Verspätungen ein.",
      f3_title: "Schulverwaltung",
      f3_desc: "Ein Bereich für Schulleitung und befugtes Personal zur Verwaltung von Anmeldungen, Unterricht und Abrechnung."
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
      blog: "Blog & Aktuelles",
      legal: "Rechtliches",
      cgu: "Nutzungsbedingungen",
      privacy: "Datenschutzerklärung",
      mentions: "Impressum",
      partner_title: "Partner werden",
      partner_desc: "Werden Sie Teil des YZIOW-Ökosystems und entwickeln Sie nützliche Dienste für Schulen und Familien.",
      partner_discover: "Partner entdecken",
      partner_btn: "Partner werden",
      rights: "© 2026 Yziow. Alle Rechte vorbehalten.",
      madeIn: "Entwickelt in Benin"
    },
    blog: {
      title: "YZIOW Blog",
      subtitle: "Praxistipps, Methoden und Neuigkeiten für das moderne Schulmanagement.",
      badge: "Blog & Ressourcen",
      emptyTitle: "Derzeit keine Beiträge veröffentlicht",
      emptyDesc: "Unsere Beiträge und Praxisratgeber sind in Kürze verfügbar. Schauen Sie bald wieder vorbei!",
      backHome: "Zurück zur Startseite",
      backBlog: "Zurück zum Blog",
      notFoundTitle: "Beitrag nicht gefunden",
      notFoundDesc: "Der gesuchte Beitrag existiert nicht oder wurde verschoben.",
      readTime: "Min. Lesezeit",
      readMore: "Beitrag lesen",
      publishedOn: "Veröffentlicht am",
      authorBy: "Von",
      category: "Kategorie",
      breadcrumbHome: "Startseite",
      breadcrumbBlog: "Blog",
      allArticles: "Alle Artikel",
      backArticles: "Zurück zu den Artikeln",
      discoverYziow: "YZIOW entdecken"
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
    partners: {
    "title": "YZIOW Partner",
    "subtitle": "Gemeinsam bauen wir ein Ökosystem nützlicher und verantwortungsvoller Bildungsdienste auf.",
    "badge": "ÖKOSYSTEM & PARTNERANGEBOTE",
    "backHome": "Zurück zur Startseite",
    "breadcrumbHome": "Startseite",
    "breadcrumbPartners": "Partner",
    "categoriesTitle": "Zulässige Partnerkategorien",
    "categoriesSubtitle": "Gezielte Partnerschaften für die praktischen Bedürfnisse von Schulen, Lehrkräften und Familien.",
    "categories": {
        "cat1": {
            "title": "Zugelassene Banken & Finanzinstitute",
            "desc": "Erleichterung von Schulgeldzahlungen, Schulkonten und Finanzdienstleistungen ausschließlich über autorisierte Institute.",
            "scope": "Schulgebührenzahlungen, dedizierte Konten und lizenzierte Finanzlösungen"
        },
        "cat2": {
            "title": "Telekommunikation & Digitale Dienste",
            "desc": "Internetverbindung für Schulen, maßgeschneiderte Tarife und SMS-Gateways für Schulbenachrichtigungen.",
            "scope": "Breitband-Konnektivität, Benachrichtigungs-SMS und digitale Werkzeuge"
        },
        "cat3": {
            "title": "Schulbedarf, Verlage & Ausstattung",
            "desc": "Schulbücher, Schreibwaren, Lehrmöbel und IT-Ausstattung speziell für Bildungseinrichtungen.",
            "scope": "Schulbücher, Schreibwaren, Lehrmaterialien und IT-Hardware"
        },
        "cat4": {
            "title": "Mobilität, Versicherung & Schuldienste",
            "desc": "Sicherer Schülertransport, maßgeschneiderter Versicherungsschutz und außerschulische Förderprogramme.",
            "scope": "Schülertransport, Schulversicherungen und außerschulische Aktivitäten"
        },
        "cat5": {
            "title": "NGOs, Stiftungen & Internationale Institutionen",
            "desc": "Bildungsprogramme, Stipendien, Mäzenatentum und schulische Inklusionsprojekte mit nachhaltiger Wirkung.",
            "scope": "Stipendien, Gemeinschaftsentwicklung, Mäzenatentum und Bildungsprogramme"
        }
    },
    "formulasTitle": "Unsere Partnerschaftsmodelle",
    "formulasSubtitle": "Drei transparente, maßgeschneiderte Zusammenarbeitsstufen vorbehaltlich vertraglicher Vereinbarung.",
    "formulas": {
        "selectedBadge": "✓ Ausgewählt",
        "recommendedBadge": "★ Empfohlen",
        "presence": {
            "name": "Präsenz",
            "tagline": "Eintrag im Partnerverzeichnis",
            "priceTag": "Auf Anfrage",
            "desc": "Präsentation im Partnerverzeichnis nach Prüfung, Bestätigung und Unterzeichnung einer Vereinbarung mit YZIOW.",
            "features": [
                "Geprüftes Unternehmensprofil Ihrer Organisation",
                "Direkter Link zu Ihren Bildungsangeboten",
                "Jährliche Qualitäts- und Compliance-Prüfung"
            ],
            "cta": "Paket Präsenz wählen",
            "selectedCta": "✓ Paket Präsenz ausgewählt"
        },
        "visibility": {
            "name": "Sichtbarkeit",
            "tagline": "Gezielte Hervorhebung und gesponserte Kommunikation",
            "priceTag": "Auf Anfrage",
            "desc": "Kampagnen, die als Partnerangebot oder Gesponserter Inhalt gekennzeichnet sind und nur in autorisierten Bereichen an zustimmende Zielgruppen ausgespielt werden.",
            "features": [
                "Dedizierte Fläche gekennzeichnet als «Partnerangebot»",
                "Geografisches und sektorielles Targeting unter Wahrung der Nutzerrechte",
                "Konsolidierte Reichweiten- und Wirkungsberichte"
            ],
            "cta": "Paket Sichtbarkeit wählen",
            "selectedCta": "✓ Paket Sichtbarkeit ausgewählt"
        },
        "strategic": {
            "name": "Strategischer Partner",
            "tagline": "Fortgeschrittene technische und operative Integration",
            "priceTag": "Auf Anfrage",
            "desc": "Prüfung technischer oder operativer Integrationen unter Vorbehalt der Machbarkeit, regulatorischen Konformität und eines Vertrags.",
            "features": [
                "Gemeinsame Entwicklung und technische Integration (sichere APIs, lizenzierte Gateways)",
                "Dedizierte operative Betreuung und Governance",
                "Regelmäßiger Lenkungsausschuss und koordinierter Rollout"
            ],
            "cta": "Paket Strategischer Partner wählen",
            "selectedCta": "✓ Paket Strategischer Partner ausgewählt"
        }
    },
    "donations": {
        "badge": "MÄZENATENTUM & BILDUNGSWIRKUNG",
        "title": "Spenden & Mäzenatentum",
        "subtitle": "Unterstützen Sie Schulinitiativen und fördern Sie Bildungsgerechtigkeit.",
        "desc": "Sind Sie eine Stiftung, Institution, ein Unternehmen oder engagierter Förderer? Bieten Sie materielle, finanzielle oder pädagogische Unterstützung für Partnerschulen.",
        "noticeLot3B": "Einstiegspunkt Los 3A: In dieser Phase findet kein direkter Zahlungseinzug statt. Sammlung und buchhalterische Nachverfolgung von Spenden werden in Los 3B umgesetzt.",
        "cta": "Spende oder Mäzenatentum vorschlagen"
    },
    "form": {
        "title": "Partnerschaftsanfrage stellen",
        "subtitle": "Stellen Sie Ihre Organisation und Ihre Kooperationsziele mit YZIOW vor. Unser Team prüft Ihre Anfrage.",
        "fullName": "Vor- und Nachname des Vertreters",
        "fullNamePlaceholder": "z.B. Max Mustermann",
        "role": "Position / Funktion",
        "rolePlaceholder": "z.B. Leiter Partnerschaften",
        "companyName": "Unternehmen oder Organisation",
        "companyPlaceholder": "z.B. Bildungslösungen GmbH",
        "organizationType": "Organisationstyp",
        "selectOrganizationType": "Wählen Sie Ihren Organisationstyp",
        "organizationTypeOptions": {
            "ngo": "NGO",
            "foundation": "Stiftung",
            "association": "Verein / Verband",
            "international_institution": "Internationale Institution",
            "cooperation_agency": "Entwicklungsagentur",
            "public_body": "Öffentliche Körperschaft",
            "sponsor_company": "Förderunternehmen",
            "other": "Sonstiges"
        },
        "sector": "Branche & Kategorie",
        "selectSector": "Wählen Sie Ihre Branche",
        "sectorOptions": {
            "finance": "Zugelassene Banken & Finanzinstitute",
            "insurance": "Versicherung & Schulischer Schutz",
            "telecom": "Telekommunikation & Digitale Dienste",
            "equipment": "Schulbedarf, Verlage & Ausstattung",
            "mobility_services": "Mobilität, Versicherung & Schuldienste",
            "after_school_services": "Services et activités périscolaires",
            "transport": "Schülertransport",
            "ngo_institutions": "NGOs, Stiftungen & Internationale Institutionen",
            "otherRegulated": "Sonstige regulierte Tätigkeit (mit Zulassung)",
            "other": "Sonstige Branche"
        },
        "otherSectorLabel": "Geben Sie Ihren Tätigkeitsbereich an",
        "otherSectorPlaceholder": "z.B. Solarenergie, Mensa-Ausstattung, EdTech...",
        "otherRegulatedQuestion": "Erfordert Ihre Tätigkeit eine behördliche Genehmigung oder Regulierung?",
        "otherRegulatedYes": "Ja",
        "otherRegulatedNo": "Nein",
        "subSector": "Tätigkeits-Unterkategorie",
        "selectSubSector": "Wählen Sie Ihre Tätigkeit",
        "subSectorOptions": {
            "transport": "Schülertransport",
            "insurance": "Schulversicherung & Vorsorge (Zulassung erforderlich)",
            "afterSchool": "Schulische und außerschulische Aktivitäten",
            "otherRegulated": "Sonstige regulierte Tätigkeit (Zulassung erforderlich)"
        },
        "regulatedHelp": "Für Bank-, Finanz- oder Versicherungsaktivitäten geben Sie bitte Ihre behördliche Zulassung an.",
        "license": "Zulassung oder Regulierungsbehörde",
        "licensePlaceholder": "z.B. Banklizenz Nr., Aufsichtsbehörde...",
        "country": "Sitzland",
        "countryPlaceholder": "z.B. Deutschland, Benin, Frankreich...",
        "targetMarkets": "Zielmärkte / Zielregionen",
        "targetMarketsPlaceholder": "z.B. Westafrika, National, International...",
        "email": "Geschäftliche E-Mail",
        "emailPlaceholder": "partner@unternehmen.de",
        "phone": "Geschäftliche Telefonnummer",
        "phonePlaceholder": "+49 30 000000",
        "website": "Website (optional)",
        "websitePlaceholder": "https://www.unternehmen.de",
        "formula": "Gewünschtes Modell",
        "selectFormula": "Modell auswählen",
        "supportType": "Art der geplanten Unterstützung",
        "selectSupportType": "Wählen Sie die Art der Unterstützung",
        "supportTypeOptions": {
            "future_financial_donation": "Künftige Geldspende",
            "equipment_donation": "Sachspende / Material",
            "school_sponsorship": "Schulpatenschaft",
            "educational_project_funding": "Finanzierung eines Bildungsprojekts",
            "skills_sponsorship": "Kompetenz-Mäzenatentum",
            "other_proposal": "Sonstiger Vorschlag"
        },
        "projectDescription": "Beschreibung des Partnerschaftsprojekts",
        "projectPlaceholder": "Beschreiben Sie Ihre geplanten Dienste, Ziele und den Mehrwert für Schulen und Familien...",
        "donationProjectPlaceholder": "Beschreiben Sie Ihren Spenden- oder Förderansatz, Zielgruppen und Durchführungsmodalitäten...",
        "consentText": "Ich stimme zu, dass YZIOW die übermittelten Daten zur Prüfung meiner Anfrage und Kontaktaufnahme gemäß seiner Datenschutzerklärung verwendet.",
        "submit": "Partnerschaftsanfrage absenden",
        "submitDonation": "Förderantrag übermitteln",
        "submitting": "Wird gesendet...",
        "successTitle": "Anfrage erfolgreich übermittelt",
        "successMessage": "Ihre Partnerschaftsanfrage wurde an das YZIOW-Team übermittelt. Wir melden uns zeitnah.",
        "errorMessage": "Beim Senden ist ein Fehler aufgetreten. Bitte überprüfen Sie Ihre Angaben und versuchen Sie es erneut.",
        "rateLimitMessage": "Zu viele Anfragen in kurzer Zeit. Bitte warten Sie 15 Minuten.",
        "validationError": "Bitte füllen Sie alle Pflichtfelder aus und akzeptieren Sie die Bedingungen.",
        "payloadTooLongError": "Ihre Nachricht überschreitet die maximal zulässige Grenze von 5.000 Zeichen. Bitte kürzen Sie Ihre Beschreibung.",
        "invalidEmailError": "Bitte geben Sie eine gültige geschäftliche E-Mail-Adresse ein.",
        "invalidPhoneError": "Bitte geben Sie eine gültige geschäftliche Telefonnummer ein.",
        "invalidWebsiteError": "Die Website-Adresse muss mit http:// oder https:// beginnen.",
        "privacyLinkText": "Datenschutzerklärung"
    },
    "ethics": {
        "title": "Datenschutz & Ethische Verpflichtungen",
        "p1": "Protection des données et séparation stricte entre les services partenaires et les données scolaires.",
        "p2": "Kein Partner hat direkten Zugriff auf Datenbanken von Schulen, Lehrern, Eltern oder Schülern. YZIOW verkauft keine personenbezogenen Daten.",
        "p3": "YZIOW vergibt keine Kredite. Gegebenenfalls werden auf der Plattform vorgestellte Finanzdienstleistungen ausschließlich von zugelassenen Instituten unter deren eigener Verantwortung angeboten und verwaltet."
    },
    "placeholderTitle": "Gemeinsam bauen wir nützliche Bildungsdienste auf",
    "placeholderDesc": "Wählen Sie oben ein Partnerschaftsmodell oder schlagen Sie eine Spende / ein Mäzenatentum vor, um Ihre Bewerbung zu öffnen.",
    "placeholderAlt": "Illustration von YZIOW-Bildungspartnerschaften und Mäzenatentum",
    "modifyChoiceBtn": "Auswahl bearbeiten"
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
      badge: "A PLATAFORMA DE GESTÃO ESCOLAR",
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
      c3_desc: "Livros didáticos, papelaria, equipamentos e material pedagógico destinados às escolas.",
      c4_title: "Transporte, Seguros e Serviços",
      c4_desc: "Transporte escolar, cobertura de seguro e atividades extracurriculares.",
      partnerCta: "Tornar-se parceiro"
    },
    features: {
      subtitle: "Nossas Soluções",
      title: "Todo o acompanhamento escolar em uma única plataforma",
      f1_title: "Boletins e Notas",
      f1_desc: "Consulte as notas publicadas pela escola e baixe os boletins disponibilizados em formato PDF.",
      f2_title: "Presenças e Faltas",
      f2_desc: "Consulte as presenças, faltas e atrasos registrados pela escola.",
      f3_title: "Espaço Instituições",
      f3_desc: "Um espaço destinado a diretores e pessoal autorizado para gerir matrículas, vida acadêmica e faturação."
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
      blog: "Blog e Notícias",
      legal: "Legal",
      cgu: "Termos de Uso",
      privacy: "Política de Privacidade",
      mentions: "Avisos Legais",
      partner_title: "Tornar-se Parceiro",
      partner_desc: "Junte-se ao ecossistema YZIOW e desenvolva conosco serviços valiosos para escolas e famílias.",
      partner_discover: "Descobrir parceiros",
      partner_btn: "Tornar-se parceiro",
      rights: "© 2026 Yziow. Todos os direitos reservados.",
      madeIn: "Concebido no Benim"
    },
    blog: {
      title: "Blog YZIOW",
      subtitle: "Conselhos, métodos e novidades para a gestão moderna de escolas.",
      badge: "Blog e Recursos",
      emptyTitle: "Nenhum artigo publicado no momento",
      emptyDesc: "Nossos artigos e guias práticos estarão disponíveis em breve. Volte em breve!",
      backHome: "Voltar ao início",
      backBlog: "Voltar ao Blog",
      notFoundTitle: "Artigo não encontrado",
      notFoundDesc: "O artigo que procura não existe ou foi movido.",
      readTime: "min de leitura",
      readMore: "Ler artigo",
      publishedOn: "Publicado em",
      authorBy: "Por",
      category: "Categoria",
      breadcrumbHome: "Início",
      breadcrumbBlog: "Blog",
      allArticles: "Todos os artigos",
      backArticles: "Voltar aos artigos",
      discoverYziow: "Descobrir o YZIOW"
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
    partners: {
    "title": "Parceiros YZIOW",
    "subtitle": "Vamos construir juntos um ecossistema de serviços úteis e responsáveis para a educação.",
    "badge": "ECOSSISTEMA E OFERTAS DE PARCEIROS",
    "backHome": "Voltar ao Início",
    "breadcrumbHome": "Início",
    "breadcrumbPartners": "Parceiros",
    "categoriesTitle": "Categorias de parceiros elegíveis",
    "categoriesSubtitle": "Parcerias direcionadas para atender às necessidades concretas de escolas, educadores e famílias.",
    "categories": {
        "cat1": {
            "title": "Bancos e Instituições Financeiras Autorizadas",
            "desc": "Facilitação do pagamento de mensalidades, contas escolares e serviços financeiros operados exclusivamente por entidades autorizadas.",
            "scope": "Pagamento de mensalidades, contas dedicadas e soluções financeiras autorizadas"
        },
        "cat2": {
            "title": "Telecomunicações e Serviços Digitais",
            "desc": "Conectividade de Internet para escolas, pacotes dedicados e gateways de SMS para comunicação escolar.",
            "scope": "Banda larga, SMS informativos e ferramentas digitais"
        },
        "cat3": {
            "title": "Materiais, Editoras e Equipamentos Escolares",
            "desc": "Livros didáticos, papelaria, mobiliário pedagógico e equipamentos de informática para instituições de ensino.",
            "scope": "Livros didáticos, papelaria, material pedagógico e informática"
        },
        "cat4": {
            "title": "Mobilidade, Seguros e Serviços Escolares",
            "desc": "Transporte escolar seguro, coberturas de seguro sob medida e serviços extracurriculares.",
            "scope": "Transporte escolar, seguros escolares e programas extracurriculares"
        },
        "cat5": {
            "title": "ONGs, Fundações e Instituições Internacionais",
            "desc": "Programas educacionais, bolsas de estudo, mecenato e projetos de inclusão escolar de impacto sustentável.",
            "scope": "Bolsas de estudo, desenvolvimento comunitário, mecenato e programas educacionais"
        }
    },
    "formulasTitle": "Nossas modalidades de colaboração",
    "formulasSubtitle": "Três níveis de suporte transparentes, sob medida e sujeitos a acordo contratual prévio.",
    "formulas": {
        "selectedBadge": "✓ Selecionada",
        "recommendedBadge": "★ Recomendada",
        "presence": {
            "name": "Presença",
            "tagline": "Inclusão no diretório de parceiros",
            "priceTag": "Sob orçamento",
            "desc": "Apresentação no diretório de parceiros após verificação, validação e assinatura de acordo com a YZIOW.",
            "features": [
                "Perfil verificado da sua organização",
                "Link direto para suas ofertas educacionais",
                "Revisão anual de qualidade e conformidade"
            ],
            "cta": "Escolher modalidade Presença",
            "selectedCta": "✓ Modalidade Presença selecionada"
        },
        "visibility": {
            "name": "Visibilidade",
            "tagline": "Destaque direcionado e comunicação patrocinada",
            "priceTag": "Sob orçamento",
            "desc": "Campanhas identificadas como Oferta de parceiro ou Conteúdo patrocinado, veiculadas apenas em espaços autorizados e para quem aceitou recebê-las.",
            "features": [
                "Espaço dedicado identificado como «Oferta de parceiro»",
                "Segmentação geográfica e setorial com respeito aos utilizadores",
                "Relatórios consolidados de visibilidade e impacto"
            ],
            "cta": "Escolher modalidade Visibilidade",
            "selectedCta": "✓ Modalidade Visibilidade selecionada"
        },
        "strategic": {
            "name": "Parceiro Estratégico",
            "tagline": "Integração técnica e operacional avançada",
            "priceTag": "Sob orçamento",
            "desc": "Estudo de integrações técnicas ou operacionais, sujeito a viabilidade, conformidade regulatória e acordo contratual.",
            "features": [
                "Co-desenvolvimento e integração técnica (APIs seguras, gateways autorizados)",
                "Suporte operacional e governança dedicada",
                "Comitê de acompanhamento periódico e implantação coordenada"
            ],
            "cta": "Escolher modalidade Parceiro Estratégico",
            "selectedCta": "✓ Modalidade Parceiro Estratégico selecionada"
        }
    },
    "donations": {
        "badge": "MECENATO E IMPACTO EDUCACIONAL",
        "title": "Doações e Mecenato",
        "subtitle": "Apoie iniciativas escolares e promova a igualdade de oportunidades educacionais.",
        "desc": "É uma fundação, instituição, empresa ou doador empenhado? Proponha apoio material, financeiro ou pedagógico para equipar e acompanhar escolas parceiras.",
        "noticeLot3B": "Ponto de entrada Lote 3A: Nenhuma cobrança direta é realizada nesta etapa. A arrecadação e rastreabilidade contábil de doações serão implementadas no Lote 3B.",
        "cta": "Propor uma doação ou mecenato"
    },
    "form": {
        "title": "Enviar proposta de parceria",
        "subtitle": "Apresente sua organização e seus objetivos de colaboração com a YZIOW. Nossa equipe analisará sua solicitação.",
        "fullName": "Nome e sobrenome do representante",
        "fullNamePlaceholder": "Ex.: Carlos Silva",
        "role": "Cargo / Função",
        "rolePlaceholder": "Ex.: Diretor de Parcerias",
        "companyName": "Empresa ou organização",
        "companyPlaceholder": "Ex.: Soluções Educacionais Ltda",
        "organizationType": "Tipo de organização",
        "selectOrganizationType": "Selecione o tipo de organização",
        "organizationTypeOptions": {
            "ngo": "ONG",
            "foundation": "Fundação",
            "association": "Associação",
            "international_institution": "Instituição internacional",
            "cooperation_agency": "Agência de cooperação",
            "public_body": "Organismo público",
            "sponsor_company": "Empresa mecenas",
            "other": "Outro"
        },
        "sector": "Setor de atividade e categoria",
        "selectSector": "Selecione o seu setor",
        "sectorOptions": {
            "finance": "Bancos e Instituições Financeiras Autorizadas",
            "insurance": "Seguros e Proteção Escolar",
            "telecom": "Telecomunicações e Serviços Digitais",
            "equipment": "Materiais, Editoras e Equipamentos Escolares",
            "mobility_services": "Mobilidade, Seguros e Serviços escolares",
            "after_school_services": "Services et activités périscolaires",
            "transport": "Transporte Escolar",
            "ngo_institutions": "ONGs, Fundações e Instituições Internacionais",
            "otherRegulated": "Outra atividade regulamentada (com autorização)",
            "other": "Outro setor de atividade"
        },
        "otherSectorLabel": "Especifique seu setor de atividade",
        "otherSectorPlaceholder": "Ex.: Energia solar, Equipamentos de cantina, EdTech...",
        "otherRegulatedQuestion": "A sua atividade exige autorização ou licença regulatória oficial?",
        "otherRegulatedYes": "Sim",
        "otherRegulatedNo": "Não",
        "subSector": "Subcategoria de atividade",
        "selectSubSector": "Selecione a sua atividade",
        "subSectorOptions": {
            "transport": "Transporte escolar",
            "insurance": "Seguro e previdência escolar (Autorização necessária)",
            "afterSchool": "Serviços e atividades extracurriculares",
            "otherRegulated": "Outra atividade regulada (Autorização necessária)"
        },
        "regulatedHelp": "Para atividades bancárias, financeiras ou de seguros, especifique a sua autorização regulatória.",
        "license": "Autorização ou autoridade reguladora",
        "licensePlaceholder": "Ex.: Licença Bancária N°, Autoridade Reguladora...",
        "country": "País sede",
        "countryPlaceholder": "Ex.: Portugal, Brasil, Angola, Moçambique...",
        "targetMarkets": "Países ou mercados alvo",
        "targetMarketsPlaceholder": "Ex.: África Ocidental, Nacional, Internacional...",
        "email": "E-mail profissional",
        "emailPlaceholder": "parcerias@empresa.com",
        "phone": "Telefone profissional",
        "phonePlaceholder": "+351 21 000 0000",
        "website": "Site (opcional)",
        "websitePlaceholder": "https://www.empresa.com",
        "formula": "Modalidade desejada",
        "selectFormula": "Selecione uma modalidade",
        "supportType": "Tipo de apoio pretendido",
        "selectSupportType": "Selecione o tipo de apoio",
        "supportTypeOptions": {
            "future_financial_donation": "Doação financeira futura",
            "equipment_donation": "Doação de equipamentos",
            "school_sponsorship": "Apadrinhamento de escola",
            "educational_project_funding": "Financiamento de projeto educativo",
            "skills_sponsorship": "Mecenato de competências",
            "other_proposal": "Outra proposta"
        },
        "projectDescription": "Descrição do projeto de parceria",
        "projectPlaceholder": "Descreva os serviços propostos, os seus objetivos e o valor gerado para escolas e famílias...",
        "donationProjectPlaceholder": "Descreva a sua proposta de doação ou mecenato, os beneficiários visados e os termos de parceria...",
        "consentText": "Concordo que a YZIOW utilize as informações transmitidas para analisar o meu pedido e entrar em contacto de acordo com a sua política de privacidade.",
        "submit": "Enviar proposta de parceria",
        "submitDonation": "Enviar proposta de mecenato",
        "submitting": "Enviando...",
        "successTitle": "Proposta enviada com sucesso",
        "successMessage": "A sua solicitação foi enviada à equipe da YZIOW. Analisaremos com brevidade.",
        "errorMessage": "Ocorreu um erro ao enviar. Por favor verifique os seus dados e tente novamente.",
        "rateLimitMessage": "Muitas solicitações recentes. Por favor aguarde 15 minutos.",
        "validationError": "Preencha todos os campos obrigatórios e aceite as condições.",
        "payloadTooLongError": "A sua mensagem excede o limite máximo permitido de 5.000 caracteres. Por favor encurte a descrição.",
        "invalidEmailError": "Por favor insira um endereço de e-mail profissional válido.",
        "invalidPhoneError": "Por favor insira um número de telefone profissional válido.",
        "invalidWebsiteError": "O site deve começar com http:// ou https://",
        "privacyLinkText": "política de privacidade"
    },
    "ethics": {
        "title": "Proteção de dados e compromissos éticos",
        "p1": "Protection des données et séparation stricte entre les services partenaires et les données scolaires.",
        "p2": "Nenhum parceiro tem acesso direto às bases de dados de escolas, professores, pais ou alunos. A YZIOW não comercializa dados pessoais.",
        "p3": "A YZIOW não concede empréstimos. Se aplicável, os services financeiros apresentados na plataforma serão exclusivamente oferecidos e geridos por instituições autorizadas, sob sua própria responsabilidade."
    },
    "placeholderTitle": "Vamos construir juntos serviços úteis para a educação",
    "placeholderDesc": "Selecione uma modalidade de colaboração acima ou proponha uma doação ou mecenato para abrir sua candidatura.",
    "placeholderAlt": "Ilustração das parcerias educacionais e mecenato YZIOW",
    "modifyChoiceBtn": "Alterar minhas escolhas"
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
      badge: "数字化学校管理平台",
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
      c3_desc: "面向学校的教材、文具、设备及教学用品支持。",
      c4_title: "交通、保险与综合服务",
      c4_desc: "校车出行、学生保险与课后服务综合支持。",
      partnerCta: "成为合作伙伴"
    },
    features: {
      subtitle: "解决方案",
      title: "在一站式平台上汇聚所有校园管理",
      f1_title: "成绩单与考评",
      f1_desc: "查阅学校发布的成绩，并下载提供的 PDF 格式成绩单。",
      f2_title: "考勤与缺勤管理",
      f2_desc: "查阅学校记录的出勤、缺勤及迟到情况。",
      f3_title: "学校管理空间",
      f3_desc: "专为校长及授权人员打造的空间，用于管理招生、教务与账单。"
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
      blog: "博客与动态",
      legal: "法律信息",
      cgu: "服务条款",
      privacy: "隐私政策",
      mentions: "法律声明",
      partner_title: "成为合作伙伴",
      partner_desc: "加入 YZIOW 生态圈，共同为学校、教职员工和家庭开发优质服务。",
      partner_discover: "了解合作伙伴",
      partner_btn: "成为合作伙伴",
      rights: "© 2026 Yziow. 保留所有权利。",
      madeIn: "设计于贝宁"
    },
    blog: {
      title: "YZIOW 博客",
      subtitle: "关于现代学校管理、教学方法与最新资讯的实用指南。",
      badge: "博客与资源",
      emptyTitle: "暂无已发布的文章",
      emptyDesc: "我们的精选文章和实用指南即将上线，敬请期待！",
      backHome: "返回首页",
      backBlog: "返回博客",
      notFoundTitle: "未找到相关文章",
      notFoundDesc: "您查找的文章不存在或已被移动。",
      readTime: "分钟阅读",
      readMore: "阅读全文",
      publishedOn: "发布于",
      authorBy: "作者：",
      category: "分类",
      breadcrumbHome: "首页",
      breadcrumbBlog: "博客",
      allArticles: "所有文章",
      backArticles: "返回文章列表",
      discoverYziow: "探索 YZIOW"
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
    partners: {
    "title": "YZIOW 合作伙伴",
    "subtitle": "携手共建实用、负责任的教育服务生态系统。",
    "badge": "生态系统与合作伙伴方案",
    "backHome": "返回首页",
    "breadcrumbHome": "首页",
    "breadcrumbPartners": "合作伙伴",
    "categoriesTitle": "合资格合作伙伴类别",
    "categoriesSubtitle": "针对性合作，切实满足学校、教师团队和家庭的实际需求。",
    "categories": {
        "cat1": {
            "title": "持牌银行与受监管金融机构",
            "desc": "学费支付便利化、学校专用账户及金融服务，均由持牌机构独立运营。",
            "scope": "学费支付、专用账户和持牌金融解决方案"
        },
        "cat2": {
            "title": "电信与数字技术服务",
            "desc": "为学校提供互联网接入、专用套餐和学校通知短信网关服务。",
            "scope": "宽带连接、通知短信和数字化工具"
        },
        "cat3": {
            "title": "教材出版、学习用品与教学设备",
            "desc": "教科书、文具、教学家具及适合学校使用的计算机设备。",
            "scope": "教科书、文具、教学用品和计算机硬件"
        },
        "cat4": {
            "title": "校车出行、保险与课外服务",
            "desc": "安全校车接送、定制化校园保险及丰富的课外活动支持服务。",
            "scope": "校车交通、学生保险和课外活动项目"
        },
        "cat5": {
            "title": "非政府组织、基金会与国际机构",
            "desc": "教育合作项目、奖助学金、公益赞助及具备可持续影响力的全纳教育计划。",
            "scope": "奖助学金、社区发展、公益资助与教育发展项目"
        }
    },
    "formulasTitle": "合作方案与模式",
    "formulasSubtitle": "三个清晰、定制化的合作层级，均须事先达成正式协议。",
    "formulas": {
        "selectedBadge": "✓ 已选择",
        "recommendedBadge": "★ 推荐",
        "presence": {
            "name": "入驻方案",
            "tagline": "收录于合作伙伴名录",
            "priceTag": "按需报价",
            "desc": "经过验证、审核并与 YZIOW 签署协议后，在合作伙伴名录中进行展示。",
            "features": [
                "经认证的机构官方简介展示",
                "直达教育专项产品或服务的链接",
                "年度合规与服务质量审核"
            ],
            "cta": "选择入驻方案",
            "selectedCta": "✓ 已选择入驻方案"
        },
        "visibility": {
            "name": "推广方案",
            "tagline": "定向推广与赞助内容传播",
            "priceTag": "按需报价",
            "desc": "标识为“合作伙伴精选”或“赞助内容”的推广活动，仅在合规区域并向同意接收的用户发布。",
            "features": [
                "清晰标识为“合作伙伴精选”的专属推广位",
                "尊重用户意愿的地理区域和行业精准定向",
                "曝光度与影响力的综合统计报告"
            ],
            "cta": "选择推广方案",
            "selectedCta": "✓ 已选择推广方案"
        },
        "strategic": {
            "name": "战略合作伙伴",
            "tagline": "深度技术与运营整合",
            "priceTag": "按需报价",
            "desc": "在可行性、监管合规及合同协议框架下，开展深度技术或业务整合研究。",
            "features": [
                "联合开发与深度技术对接（安全API、合规支付网关）",
                "专属运营支持与协调治理机制",
                "定期联席会议与联合推广落地"
            ],
            "cta": "选择战略合作伙伴方案",
            "selectedCta": "✓ 已选择战略合作伙伴方案"
        }
    },
    "donations": {
        "badge": "公益赞助与教育赋能",
        "title": "公益捐赠与教育资助",
        "subtitle": "支持优质校园公益项目，促进教育公平与资源均衡发展。",
        "desc": "如果您是基金会、国际机构、企业或爱心捐助者，欢迎提供物资、资金或教育资源支持，共同赋能合作学校。",
        "noticeLot3B": "阶段说明（Lot 3A）：本阶段仅为合作意向登记，不设任何在线收款功能。捐赠收款与资金财务追溯将在后续 Lot 3B 中统一推出。",
        "cta": "提交公益赞助与捐赠意向"
    },
    "form": {
        "title": "提交合作意向申请",
        "subtitle": "向我们介绍您的机构以及与 YZIOW 的合作设想。我们的团队将认真评估您的申请。",
        "fullName": "代表姓名",
        "fullNamePlaceholder": "例如：张三",
        "role": "职务",
        "rolePlaceholder": "例如：商务合作总监",
        "companyName": "企业或机构名称",
        "companyPlaceholder": "例如：某某教育科技有限公司",
        "organizationType": "机构类型",
        "selectOrganizationType": "请选择机构类型",
        "organizationTypeOptions": {
            "ngo": "非政府组织 (NGO)",
            "foundation": "基金会",
            "association": "行业协会 / 社会团体",
            "international_institution": "国际机构",
            "cooperation_agency": "国际合作机构",
            "public_body": "公共事业单位",
            "sponsor_company": "爱心赞助企业",
            "other": "其他机构"
        },
        "sector": "行业领域与合作类别",
        "selectSector": "请选择行业领域",
        "sectorOptions": {
            "finance": "持牌银行与受监管金融机构",
            "insurance": "校园保险与学生保障",
            "telecom": "电信与数字技术服务",
            "equipment": "教材出版、学习用品与教学设备",
            "mobility_services": "出行、保险与校园综合服务",
            "after_school_services": "Services et activités périscolaires",
            "transport": "校车与学生交通",
            "ngo_institutions": "非政府组织、基金会与国际机构",
            "otherRegulated": "其他受监管行业（须持牌）",
            "other": "其他行业领域"
        },
        "otherSectorLabel": "请明确您的业务领域",
        "otherSectorPlaceholder": "例如：太阳能、食堂设备、教育科技...",
        "otherRegulatedQuestion": "您的业务是否需要特定的行业牌照或许可资质？",
        "otherRegulatedYes": "是",
        "otherRegulatedNo": "否",
        "subSector": "业务子类别",
        "selectSubSector": "请选择具体业务",
        "subSectorOptions": {
            "transport": "校车与学生接送交通",
            "insurance": "校园保险与安全保障（需持牌资质）",
            "afterSchool": "课外活动与综合拓展服务",
            "otherRegulated": "其他受监管业务（需持牌资质）"
        },
        "regulatedHelp": "若涉及银行、金融或保险业务，请填写监管牌照或主管机构信息。",
        "license": "监管牌照或主管机构",
        "licensePlaceholder": "例如：央行金融牌照号、金融管理局...",
        "country": "注册所在国家/地区",
        "countryPlaceholder": "例如：贝宁、科特迪瓦、中国、法国...",
        "targetMarkets": "目标国家或市场",
        "targetMarketsPlaceholder": "例如：西非经济货币联盟、全国市场...",
        "email": "企业工作邮箱",
        "emailPlaceholder": "partner@company.com",
        "phone": "工作联系电话",
        "phonePlaceholder": "+86 10 0000 0000",
        "website": "官方网站（选填）",
        "websitePlaceholder": "https://www.company.com",
        "formula": "意向合作方案",
        "selectFormula": "请选择合作方案",
        "supportType": "意向支持形式",
        "selectSupportType": "请选择支持形式",
        "supportTypeOptions": {
            "future_financial_donation": "意向资金捐赠",
            "equipment_donation": "教学物资与设备捐赠",
            "school_sponsorship": "定向学校帮扶结对",
            "educational_project_funding": "专项教育项目资助",
            "skills_sponsorship": "专业技能与师资赋能",
            "other_proposal": "其他合作意向"
        },
        "projectDescription": "合作项目详细说明",
        "projectPlaceholder": "请描述拟提供的服务、合作目标及为学校和家庭带来的价值...",
        "donationProjectPlaceholder": "请简要描述您的捐赠或公益合作设想、受惠对象及期望的实施方式...",
        "consentText": "我同意 YZIOW 根据其隐私政策使用所提交的信息评估我的申请并与我联系。",
        "submit": "提交合作申请",
        "submitDonation": "提交公益赞助意向",
        "submitting": "正在提交...",
        "successTitle": "合作申请提交成功",
        "successMessage": "您的合作意向已成功发送至 YZIOW 团队，我们将尽快与您取得联系。",
        "errorMessage": "提交过程中发生错误，请检查信息后重试。",
        "rateLimitMessage": "近期提交请求过多，请等待15分钟后再试。",
        "validationError": "请填写所有必填字段并同意条款。",
        "payloadTooLongError": "您的消息内容超过了 5,000 字符的上限，请适当精简描述。",
        "invalidEmailError": "请输入有效的企业工作邮箱。",
        "invalidPhoneError": "请输入有效的工作联系电话。",
        "invalidWebsiteError": "网站地址必须以 http:// 或 https:// 开头",
        "privacyLinkText": "隐私政策"
    },
    "ethics": {
        "title": "数据安全与合规承诺",
        "p1": "Protection des données et séparation stricte entre les services partenaires et les données scolaires.",
        "p2": "任何合作伙伴均无权直接访问学校、教师、家长或学生数据库。YZIOW 绝不出售任何个人数据。",
        "p3": "YZIOW 不提供任何直接贷款。如涉及金融服务，本平台上展示的相关服务将由受监管的持牌机构全权独立提供并承担责任。"
    },
    "placeholderTitle": "携手共建实用、负责任的教育服务",
    "placeholderDesc": "请在上方选择一项合作方案，或提交公益赞助与捐赠意向，即可开启合作申请。",
    "placeholderAlt": "YZIOW 教育合作与公益赞助示意图",
    "modifyChoiceBtn": "修改我的选择"
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
      badge: "ПЛАТФОРМА УПРАВЛЕНИЯ ШКОЛОЙ",
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
      c3_desc: "Учебники, канцелярия, оборудование и учебные материалы для образовательных учреждений.",
      c4_title: "Транспорт, страхование и сервисы",
      c4_desc: "Школьный транспорт, страховая защита и внеклассное сопровождение.",
      partnerCta: "Стать партнёром"
    },
    features: {
      subtitle: "Наши Решения",
      title: "Весь школьный мониторинг на единой платформе",
      f1_title: "Табели и Оценки",
      f1_desc: "Просматривайте оценки, опубликованные школой, и скачивайте табели успеваемости в формате PDF.",
      f2_title: "Посещаемость и Пропуски",
      f2_desc: "Просматривайте данные о присутствии, пропусках и опозданиях, зафиксированные школой.",
      f3_title: "Кабинет Школы",
      f3_desc: "Пространство для директоров и уполномоченного персонала для управления приёмом, учебным процессом и оплатой."
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
      blog: "Блог и Новости",
      legal: "Правовая информация",
      cgu: "Условия использования",
      privacy: "Политика конфиденциальности",
      mentions: "Юридическая информация",
      partner_title: "Стать Партнёром",
      partner_desc: "Присоединяйтесь к экосистеме YZIOW и развивайте полезные сервисы для школ и семей вместе с нами.",
      partner_discover: "Партнёры платформы",
      partner_btn: "Стать партнёром",
      rights: "© 2026 Yziow. Все права защищены.",
      madeIn: "Разработано в Бенине"
    },
    blog: {
      title: "Блог YZIOW",
      subtitle: "Советы, методики и новости для эффективного управления учебными заведениями.",
      badge: "Блог и Ресурсы",
      emptyTitle: "На данный момент нет опубликованных статей",
      emptyDesc: "Наши практические руководства и статьи скоро появятся. Загляните позже!",
      backHome: "На главную",
      backBlog: "Назад в блог",
      notFoundTitle: "Статья не найдена",
      notFoundDesc: "Запрашиваемая статья не существует или была перемещена.",
      readTime: "мин чтения",
      readMore: "Читать статью",
      publishedOn: "Опубликовано",
      authorBy: "Автор",
      category: "Категория",
      breadcrumbHome: "Главная",
      breadcrumbBlog: "Блог",
      allArticles: "Все статьи",
      backArticles: "Вернуться к статьям",
      discoverYziow: "Узнать больше о YZIOW"
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
    partners: {
    "title": "Партнёры YZIOW",
    "subtitle": "Вместе создаём экосистему полезных и ответственных сервисов для сферы образования.",
    "badge": "ЭКОСИСТЕМА И ПАРТНЁРСКИЕ ПРЕДЛОЖЕНИЯ",
    "backHome": "На главную",
    "breadcrumbHome": "Главная",
    "breadcrumbPartners": "Партнёры",
    "categoriesTitle": "Категории партнёров",
    "categoriesSubtitle": "Целевое сотрудничество для решения практических задач школ, педагогов и семей.",
    "categories": {
        "cat1": {
            "title": "Лицензированные банки и финансовые институты",
            "desc": "Оплата обучения, специальные счета и финансовые услуги, предоставляемые исключительно уполномоченными организациями.",
            "scope": "Оплата обучения, специальные счета и лицензированные финансовые решения"
        },
        "cat2": {
            "title": "Телекоммуникации и цифровые сервисы",
            "desc": "Интернет-подключение для школ, специальные тарифы и SMS-шлюзы для школьных уведомлений.",
            "scope": "Широкополосный доступ, SMS-оповещения и цифровые инструменты"
        },
        "cat3": {
            "title": "Учебные материалы, издательства и оборудование",
            "desc": "Учебники, канцелярия, школьная мебель и IT-оборудование для учебных заведений.",
            "scope": "Учебники, канцтовары, учебные материалы и компьютерная техника"
        },
        "cat4": {
            "title": "Транспорт, страхование и школьные услуги",
            "desc": "Безопасный школьный транспорт, адаптированные страховые программы и внеурочные сервисы.",
            "scope": "Школьный транспорт, страхование учащихся и внеурочные программы"
        },
        "cat5": {
            "title": "НКО, фонды и международные институты",
            "desc": "Образовательные программы, стипендии, меценатство и проекты инклюзивного образования с устойчивым эффектом.",
            "scope": "Стипендии, развитие сообществ, меценатство и образовательные программы"
        }
    },
    "formulasTitle": "Форматы сотрудничества",
    "formulasSubtitle": "Три прозрачных уровня взаимодействия на индивидуальной договорной основе.",
    "formulas": {
        "selectedBadge": "✓ Выбрано",
        "recommendedBadge": "★ Рекомендуется",
        "presence": {
            "name": "Присутствие",
            "tagline": "Размещение в каталоге партнёров",
            "priceTag": "По запросу",
            "desc": "Презентация в каталоге партнёров после проверки, валидации и подписания соглашения с YZIOW.",
            "features": [
                "Верифицированная карточка организации",
                "Прямая ссылка на образовательные предложения",
                "Ежегодный аудит качества и соответствия"
            ],
            "cta": "Выбрать пакет Присутствие",
            "selectedCta": "✓ Пакет Присутствие выбран"
        },
        "visibility": {
            "name": "Видимость",
            "tagline": "Целевое продвижение и партнёрские публикации",
            "priceTag": "По запросу",
            "desc": "Кампании, помеченные как «Предложение партнёра» или «Спонсорский контент», транслируемые только в разрешённых разделах и пользователям, давшим согласие.",
            "features": [
                "Специальный блок с маркировкой «Предложение партнёра»",
                "Географический и отраслевой таргетинг с уважением к пользователям",
                "Консолидированные отчёты об охвате и эффективности"
            ],
            "cta": "Выбрать пакет Видимость",
            "selectedCta": "✓ Пакет Видимость выбран"
        },
        "strategic": {
            "name": "Стратегический партнёр",
            "tagline": "Глубокая техническая и операционная интеграция",
            "priceTag": "По запросу",
            "desc": "Исследование возможностей технической или операционной интеграции при условии реализуемости, регуляторного соответствия и договора.",
            "features": [
                "Совместная разработка и интеграция (защищённые API, лицензированные шлюзы)",
                "Персональное операционное сопровождение и координация",
                "Регулярный управляющий комитет и совместный запуск"
            ],
            "cta": "Выбрать пакет Стратегический партнёр",
            "selectedCta": "✓ Пакет Стратегический партнёр выбран"
        }
    },
    "donations": {
        "badge": "МЕЦЕНАТСТВО И ОБРАЗОВАНИЕ",
        "title": "Пожертвования и Меценатство",
        "subtitle": "Поддерживайте школьные инициативы и содействуйте качественному образованию для всех.",
        "desc": "Вы представляете фонд, международную организацию, компанию или являетесь частным меценатом? Предложите материальную, финансовую или экспертную поддержку школам.",
        "noticeLot3B": "Точка входа Лота 3A: На данном этапе прямой приём платежей не осуществляется. Сбор и финансовая отчётность по пожертвованиям будут реализованы в Лоте 3B.",
        "cta": "Предложить пожертвование или меценатство"
    },
    "form": {
        "title": "Подать заявку на партнёрство",
        "subtitle": "Расскажите о вашей организации и целях сотрудничества с YZIOW. Наша команда изучит вашу заявку.",
        "fullName": "ФИО представителя",
        "fullNamePlaceholder": "Например: Иван Иванов",
        "role": "Должность",
        "rolePlaceholder": "Например: Директор по развитию",
        "companyName": "Компания или организация",
        "companyPlaceholder": "Например: ООО Образовательные Технологии",
        "organizationType": "Тип организации",
        "selectOrganizationType": "Выберите тип организации",
        "organizationTypeOptions": {
            "ngo": "НКО",
            "foundation": "Фонд",
            "association": "Ассоциация / Союз",
            "international_institution": "Международный институт",
            "cooperation_agency": "Агентство по сотрудничеству",
            "public_body": "Государственная организация",
            "sponsor_company": "Компания-меценат",
            "other": "Другое"
        },
        "sector": "Сфера деятельности и категория",
        "selectSector": "Выберите сферу деятельности",
        "sectorOptions": {
            "finance": "Лицензированные банки и финансовые институты",
            "insurance": "Страхование и школьная защита",
            "telecom": "Телекоммуникации и цифровые сервисы",
            "equipment": "Учебные материалы, издательства и оборудование",
            "mobility_services": "Транспорт, страхование и школьные сервисы",
            "after_school_services": "Services et activités périscolaires",
            "transport": "Школьный транспорт",
            "ngo_institutions": "НКО, фонды и международные институты",
            "otherRegulated": "Другая регулируемая деятельность (с лицензией)",
            "other": "Другая сфера деятельности"
        },
        "otherSectorLabel": "Укажите сферу вашей деятельности",
        "otherSectorPlaceholder": "Напр.: Солнечная энергетика, Оборудование для столовых, EdTech...",
        "otherRegulatedQuestion": "Требуется ли для вашей деятельности специальная лицензия или регуляторное разрешение?",
        "otherRegulatedYes": "Да",
        "otherRegulatedNo": "Нет",
        "subSector": "Подкатегория деятельности",
        "selectSubSector": "Выберите направление деятельности",
        "subSectorOptions": {
            "transport": "Школьный транспорт",
            "insurance": "Школьное страхование и защита (требуется лицензия)",
            "afterSchool": "Внеурочные сервисы и развивающие программы",
            "otherRegulated": "Другая регулируемая деятельность (требуется лицензия)"
        },
        "regulatedHelp": "Для банковской, финансовой или страховой деятельности укажите лицензию регулятора.",
        "license": "Лицензия или орган регулирования",
        "licensePlaceholder": "Например: Лицензия ЦБ №..., Регулятор...",
        "country": "Страна регистрации",
        "countryPlaceholder": "Например: Бенин, Кот-д'Ивуар, Франция, Россия...",
        "targetMarkets": "Целевые страны или рынки",
        "targetMarketsPlaceholder": "Например: Западная Африка, Национальный рынок...",
        "email": "Корпоративный email",
        "emailPlaceholder": "partner@company.com",
        "phone": "Рабочий телефон",
        "phonePlaceholder": "+7 495 000 0000",
        "website": "Веб-сайт (необязательно)",
        "websitePlaceholder": "https://www.company.com",
        "formula": "Желаемый формат",
        "selectFormula": "Выберите формат сотрудничества",
        "supportType": "Формат поддержки",
        "selectSupportType": "Выберите формат поддержки",
        "supportTypeOptions": {
            "future_financial_donation": "Финансовое пожертвование",
            "equipment_donation": "Передача оборудования и материалов",
            "school_sponsorship": "Шефство над школой",
            "educational_project_funding": "Финансирование образовательного проекта",
            "skills_sponsorship": "Экспертная и менторская помощь",
            "other_proposal": "Другое предложение"
        },
        "projectDescription": "Описание проекта сотрудничества",
        "projectPlaceholder": "Опишите предполагаемые услуги, цели и пользу для учебных заведений и семей...",
        "donationProjectPlaceholder": "Опишите ваше предложение по меценатству, целевых получателей и условия сотрудничества...",
        "consentText": "Я согласен на обработку переданной информации компанией YZIOW для рассмотрения заявки и связи со мной в соответствии с политикой конфиденциальности.",
        "submit": "Отправить заявку на партнёрство",
        "submitDonation": "Отправить предложение о меценатстве",
        "submitting": "Отправка...",
        "successTitle": "Заявка успешно отправлена",
        "successMessage": "Ваша заявка направлена команде YZIOW. Мы свяжемся с вами в ближайшее время.",
        "errorMessage": "Произошла ошибка при отправке. Пожалуйста, проверьте данные и попробуйте снова.",
        "rateLimitMessage": "Слишком много недавних запросов. Пожалуйста, подождите 15 минут.",
        "validationError": "Пожалуйста, заполните все обязательные поля и примите условия.",
        "payloadTooLongError": "Ваше сообщение превышает максимально допустимый лимит в 5 000 символов. Пожалуйста, сократите описание.",
        "invalidEmailError": "Пожалуйста, введите корректный рабочий email.",
        "invalidPhoneError": "Пожалуйста, введите корректный номер рабочего телефона.",
        "invalidWebsiteError": "Адрес веб-сайта должен начинаться с http:// или https://",
        "privacyLinkText": "политикой конфиденциальности"
    },
    "ethics": {
        "title": "Защита данных и этические стандарты",
        "p1": "Protection des données et séparation stricte entre les services partenaires et les données scolaires.",
        "p2": "Партнёры не имеют прямого доступа к базам данных школ, учителей, родителей или учеников. YZIOW не продаёт персональные данные.",
        "p3": "YZIOW не предоставляет кредиты. При наличии, финансовые услуги, представленные на платформе, будут предлагаться и управляться исключительно лицензированными организациями под их собственную ответственность."
    },
    "placeholderTitle": "Вместе создаём полезные сервисы для образования",
    "placeholderDesc": "Выберите формат сотрудничества выше или предложите пожертвование / меценатство, чтобы открыть форму заявки.",
    "placeholderAlt": "Иллюстрация образовательного партнёрства и меценатства YZIOW",
    "modifyChoiceBtn": "Изменить выбор"
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
