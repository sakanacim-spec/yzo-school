'use strict';

/**
 * Catalogue commercial officiel des fonctionnalités réelles de la plateforme SaaS YZIOW.
 * Construit exclusivement à partir des modules et fonctionnalités réellement implémentés dans le projet.
 */

const PRODUCT_PRESENTATION_FR = `YZIOW est une plateforme Cloud de gestion scolaire pour les établissements d'enseignement (maternelles, primaires, collèges, lycées et supérieur).

Ce que YZIOW apporte concrètement à votre établissement :

• Administration & Structure Scolaire : Configuration de l'établissement, des années scolaires, des classes, des cycles et des matières.
• Gestion des Élèves & Inscriptions : Dossiers scolaires centralisés, attribution de matricules élèves et édition de cartes scolaires avec QR Code.
• Évaluations & Bulletins PDF : Saisie des notes, calcul des moyennes et des rangs, et édition de bulletins scolaires en PDF.
• Pointage & Présences par QR Code : Émargement des présences et des sorties par scanner de QR Code avec suivi horodaté.
• Cahier de Textes & Pédagogie : Suivi des devoirs, cours et activités par classe et par matière avec partage de documents.
• Espace Parents & Familles : Portail dédié aux parents pour consulter les notes, présences, bulletins et devoirs de leurs enfants.
• Finances & Scolarités : Suivi du recouvrement des frais scolaires et émission de reçus de paiement en PDF.
• Comptabilité & Suivi Financier : Suivi des dépenses, gestion des salaires du personnel et tableaux de bord de gestion.
• Communication : Messagerie interne et diffusion d'annonces aux familles.
• Sécurité & Isolation des Données : Cloisonnement strict des données par établissement (architecture multi-tenant) et gestion des accès par rôle.
• Interface Multilingue : Application disponible en Français, Anglais, Espagnol et Arabe.

Bénéfices clés : Gain de temps administratif, automatisation des calculs de moyennes, suivi facilité avec les familles et outils de gestion financière.

Tarification : La grille tarifaire applicable dépend du pays dans lequel se trouve l’établissement.

Dans quel pays se trouve votre établissement ?`;

const PRODUCT_PRESENTATION_EN = `YZIOW is a Cloud school management platform for educational institutions (kindergarten, primary, secondary, high school, and higher education).

Key Features of YZIOW:

• School Administration: Setup of your institution, school years, classes, cycles, and customized subjects.
• Student Management: Centralized student records, student ID assignment, and student ID cards with QR Code.
• Grades & PDF Report Cards: Grade entry, automatic average and rank calculation, and PDF report cards generation.
• Attendance Tracking: Student attendance and dismissal logging via QR Code scanner with timestamping.
• Digital Gradebook & Homework: Homework logs, lesson plans, and learning document sharing.
• Parent Portal: Dedicated portal for parents to follow grades, attendance, homework, and report cards.
• Tuition Fees & Receipts: Tuition tracking and generation of payment receipts in PDF.
• Accounting & Finance: Expense tracking, staff payroll management, and analytical management dashboards.
• Communication: Internal messaging and school announcements for families.
• Security & Data Isolation: Strict multi-tenant data isolation per school and role-based access control.
• Multilingual Interface: Available in French, English, Spanish, and Arabic.

Key Benefits: Administrative time savings, automated grade calculations, structured communication with families, and financial tracking tools.

Pricing: The applicable pricing grid depends on the country where the institution is located.

In which country is your school located?`;

const PRODUCT_PRESENTATION_ES = `YZIOW es una plataforma Cloud de gestión escolar para instituciones educativas (infantil, primaria, secundaria, bachillerato y superior).

Funcionalidades principales de YZIOW:

• Gestión Institucional: Configuración de años escolares, clases, ciclos y asignaturas personalizadas.
• Expedientes de Alumnos: Matrículas centralizadas, asignación de identificadores y carnets escolares con código QR.
• Calificaciones y Boletines en PDF: Registro de notas, cálculo de promedios y rangos, y generación de boletines en PDF.
• Control de Asistencia: Registro de asistencias y salidas mediante escaneo de código QR con registro horario.
• Cuaderno de Tareas Digital: Seguimiento de tareas, clases y recursos pedagógicos compartidos.
• Portal para Padres: Acceso para consultar notas, asistencias, tareas y boletines de los hijos.
• Pagos de Colegiaturas y Recibos: Seguimiento de cobros y emisión de recibos de pago en PDF.
• Contabilidad y Finanzas: Control de gastos, gestión de nóminas del personal y cuadros de mando de gestión.
• Communication: Mensajería interna y difusión de avisos para las familias.
• Seguridad y Privacidad: Aislamiento estricto de datos por escuela (arquitectura multi-tenant) y control de acceso por roles.
• Plataforma Multilingüe: Disponible en francés, inglés, español y árabe.

Beneficios clave: Ahorro de tiempo administrativo, automatización de cálculos de promedios, mejor seguimiento con las familias y herramientas de gestión financiera.

Tarifas: La tabla de tarifas aplicable depende del país en el que se encuentra la institución educativa.

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
