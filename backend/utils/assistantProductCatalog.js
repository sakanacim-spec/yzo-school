'use strict';

/**
 * Catalogue commercial officiel des fonctionnalités réelles de la plateforme SaaS YZIOW.
 * Construit exclusivement à partir des modules et fonctionnalités réellement implémentés dans le projet.
 */

const PRODUCT_PRESENTATION_FR = `YZIOW est la plateforme Cloud tout-en-un de référence pour la gestion moderne des établissements scolaires (maternelles, primaires, collèges, lycées et supérieur).

Ce que YZIOW apporte concrètement à votre établissement :

• Administration & Structure Scolaire : Configuration complète de l'établissement, des années scolaires, des classes, des cycles et des matières sur-mesure.
• Gestion des Élèves & Inscriptions : Dossiers scolaires centralisés, génération de matricules uniques, suivi des statuts et cartes scolaires certifiées.
• Évaluations & Bulletins PDF Officiels : Saisie des notes, calcul automatique et instantané des moyennes/rangs, et édition de bulletins PDF infalsifiables.
• Pointage & Présences par QR Code : Scanner de QR Code en temps réel pour l'émargement des présences et des sorties avec horodatage précis.
• Cahier de Textes & Pédagogie : Suivi des devoirs, cours et activités par classe et par matière avec partage de documents.
• Espace Parents & Familles : Portail dédié aux parents pour consulter en temps réel les notes, présences, bulletins et devoirs de leurs enfants.
• Finances, Scolarités & Reçus Instantanés : Suivi du recouvrement, émission automatique de reçus PDF certifiés et gestion des paiements en ligne via Yziow Pay.
• Comptabilité & Pilotage Analytique : Suivi des dépenses, salaires du personnel et tableaux de bord financiers pour les directeurs.
• Communication & Notifications : Messagerie interne sécurisée, diffusion d'annonces officielles et notifications push.
• Sécurité & Confidentialité : Cloisonnement strict des données de chaque école, rôles d'accès différenciés et conformité multi-tenant.
• Accessibilité Multilingue : Interface internationale disponible en Français, Anglais, Espagnol, Arabe et plus.

Bénéfices clés : Gain de temps administratif considérable, zéro erreur de calcul de moyenne, transparence totale avec les parents et maîtrise financière complète.

Tarification : Nos tarifs d'abonnement SaaS sont adaptés au pays de chaque établissement pour garantir l'accessibilité la plus juste.

Dans quel pays se trouve votre établissement ?`;

const PRODUCT_PRESENTATION_EN = `YZIOW is the premier all-in-one Cloud school management platform for modern educational institutions (kindergarten, primary, secondary, high school, and higher education).

Key Features of YZIOW:

• School Administration: Full setup of your institution, school years, classes, cycles, and customized subjects.
• Student Management: Centralized records, unique student IDs, attendance tracking, and certified student ID cards.
• Grades & Certified PDF Report Cards: Quick grade entry, automatic average & rank calculation, and official tamper-proof PDF report cards.
• QR Code Attendance Scanner: Real-time QR Code scanning for student check-in/check-out with instant timestamping.
• Digital Homework & Gradebook: Homework assignments, lecture logs, and learning material sharing.
• Parent Portal: Dedicated portal for parents to track grades, attendance, homework, and report cards in real-time.
• Tuition Fees & Instant Receipts: Tuition tracking, automatic certified PDF receipts, and online payments via Yziow Pay.
• Accounting & Financial Analytics: Expense tracking, staff payroll, and live analytical dashboards for school leadership.
• School-Family Communication: Direct secure messaging, broadcast announcements, and push notifications.
• Security & Data Privacy: Strict tenant data isolation, role-based access control, and robust privacy.
• Multilingual Platform: Available in French, English, Spanish, Arabic, and more.

Key Benefits: Significant administrative time savings, zero grade calculation errors, complete transparency with parents, and full financial control.

Pricing: Our SaaS subscription plans are customized by country to provide the fairest pricing for every school.

In which country is your school located?`;

const PRODUCT_PRESENTATION_ES = `YZIOW es la plataforma Cloud integral de referencia para la gestión moderna de instituciones educativas (infantil, primaria, secundaria, bachillerato y superior).

Funcionalidades principales de YZIOW:

• Gestión Institucional: Configuración completa de años escolares, clases, ciclos y asignaturas personalizadas.
• Expedientes de Alumnos: Matrículas centralizadas, identificadores únicos y carnets escolares certificados.
• Boletines de Calificaciones en PDF: Registro de notas, cálculo automático de promedios y generación de boletines oficiales.
• Control de Asistencia con Código QR: Escaneo rápido de códigos QR para el control de asistencia en tiempo real.
• Cuaderno de Tareas Digital: Seguimiento de tareas, clases y recursos pedagógicos compartidos.
• Portal para Padres: Acceso directo para seguir notas, asistencias y boletines de los hijos.
• Pagos de Colegiaturas y Recibos: Gestión de pagos escolares, recibos oficiales en PDF y pasarela Yziow Pay.
• Contabilidad y Análisis: Control de gastos, salarios y cuadros de mando analíticos para directores.
• Comunicación Segura: Mensajería interna, anuncios oficiales y notificaciones instantáneas.
• Seguridad y Privacidad: Aislamiento total de datos por escuela y control de accesos por rol.
• Plataforma Multilingüe: Disponible en francés, inglés, español, árabe y más.

Beneficios clave: Ahorro considerable de tiempo administrativo, cero errores en cálculos de promedios, total transparencia con los padres y control financiero completo.

Tarifas: Nuestros planes de suscripción SaaS están adaptados al país de cada institución educativa.

¿En qué país se encuentra su institución educativa?`;

/**
 * Retourne la présentation commerciale des fonctionnalités selon la langue.
 */
function getProductPresentation({ language = 'fr' } = {}) {
    const lang = String(language).toLowerCase().slice(0, 2);
    if (lang === 'en') return PRODUCT_PRESENTATION_EN;
    if (lang === 'es') return PRODUCT_PRESENTATION_ES;
    return PRODUCT_PRESENTATION_FR;
}

/**
 * Détecte si l'utilisateur demande à découvrir les fonctionnalités du produit.
 */
function isFeatureDiscoveryIntent(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return false;
    }

    const lastUserMsg = [...messages]
        .reverse()
        .find(m => m && (m.role === 'user' || m.sender === 'user'));

    if (!lastUserMsg) {
        return false;
    }

    const text = (typeof lastUserMsg.text === 'string' ? lastUserMsg.text : (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : ''))
        .toLowerCase();

    const featureKeywords = [
        'fonctionnalité', 'fonctionnalités', 'fonctionnalite', 'fonctionnalites',
        'découvrir les fonctionnalités', 'decouvrir les fonctionnalites',
        'que fait yziow', 'que propose yziow', 'présentation de yziow', 'presentation de yziow',
        'à quoi sert yziow', 'a quoi sert yziow', 'features', 'what does yziow do',
        'características', 'caracteristicas'
    ];

    // Vérifier si le message est une demande pure de fonctionnalités (sans pays explicite)
    return featureKeywords.some(kw => text.includes(kw));
}

module.exports = {
    getProductPresentation,
    isFeatureDiscoveryIntent,
    PRODUCT_PRESENTATION_FR,
    PRODUCT_PRESENTATION_EN,
    PRODUCT_PRESENTATION_ES
};
