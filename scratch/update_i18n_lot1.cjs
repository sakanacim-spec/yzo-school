const fs = require('fs');
const path = require('path');

const files = {
  fr: path.join(__dirname, '../src/i18n/fr.ts'),
  en: path.join(__dirname, '../src/i18n/en.ts'),
  es: path.join(__dirname, '../src/i18n/es.ts'),
  ar: path.join(__dirname, '../src/i18n/ar.ts')
};

const replacements = {
  fr: `  dashboard: {
    title: 'Tableau de bord',
    subtitle: "Vue d'ensemble de la gestion financière",
    cycles: {
      primaire: 'Primaire',
      college: 'Collège',
      lycee: 'Lycée'
    },
    status: {
      soldes: 'Soldés',
      non_soldes: 'Non Soldés'
    },
    stats: {
      totalStudents: 'Total Élèves',
      expectedTuition: 'Écolage Attendu',
      totalTuitionDesc: 'Total des frais de scolarité',
      amountPaid: 'Montant Payé',
      studentsPaid: '{count} élèves soldés',
      recoveryRate: 'Taux de Recouvrement',
      remaining: 'Reste : {amount}',
      cyclesFormat: 'P:{p} | C:{c} | L:{l}'
    },
    charts: {
      recoveryByClass: 'Taux de recouvrement par classe',
      rate: 'Taux',
      noData: 'Aucune donnée disponible',
      byCycle: 'Par cycle',
      paymentStatus: 'Statut paiements'
    },
    table: {
      rankingTitle: 'Classement des classes (par taux de recouvrement)',
      rank: 'Rang',
      class: 'Classe',
      cycle: 'Cycle',
      count: 'Effectif',
      expected: 'Attendu',
      paid: 'Payé',
      remaining: 'Restant',
      rate: 'Taux',
      noData: 'Aucun élève enregistré. Importez des données pour voir les statistiques.'
    }
  },
  settings: {
    accessDeniedTitle: 'Accès refusé',
    accessDeniedMessage: 'Seuls les administrateurs peuvent accéder aux paramètres.',
    title: 'Paramètres',
    subtitle: "Configuration de l'application",
    schoolInfo: "Informations de l'école",
    schoolName: "Nom de l'école",
    schoolYear: "Année scolaire",
    address: "Adresse",
    phone: "Téléphone",
    email: "Email",
    customMessages: "Messages personnalisés pour PDF",
    thanksMessage: "Message de remerciement (élèves soldés)",
    reminderMessage: "Message de rappel (élèves non soldés)",
    paymentSettings: "Paramètres de paiement",
    secondTrancheThreshold: "Seuil de validation 2ème tranche (%)",
    secondTrancheDesc: "Pourcentage minimum payé pour valider la 2ème tranche",
    currentRule: "Règle actuelle:",
    ruleDescription: "Un élève ayant payé ≥{seuil}% de son écolage obtient le badge \\"2ème Tranche Validée\\" sur son reçu.",
    feesInfo: "Informations sur les tarifs",
    saved: "Paramètres enregistrés !",
    saveBtn: "Enregistrer les paramètres"
  },
  support: {
    title: 'Nouvelle discussion',
    subtitle: 'Choisissez le service à contacter',
    adminTitle: 'Administration',
    adminDesc: 'Questions générales, documents, inscriptions et vie scolaire.',
    comptaTitle: 'Comptabilité',
    comptaDesc: 'Paiements de scolarité, reçus, restes à payer et facturation.',
    secureMsg: 'Votre messagerie est cryptée et sécurisée. Une réponse vous sera apportée dans les plus brefs délais par nos équipes.'
  },`,
  
  en: `  dashboard: {
    title: 'Dashboard',
    subtitle: 'Financial management overview',
    cycles: {
      primaire: 'Primary',
      college: 'Middle School',
      lycee: 'High School'
    },
    status: {
      soldes: 'Paid',
      non_soldes: 'Unpaid'
    },
    stats: {
      totalStudents: 'Total Students',
      expectedTuition: 'Expected Tuition',
      totalTuitionDesc: 'Total school fees',
      amountPaid: 'Amount Paid',
      studentsPaid: '{count} students paid',
      recoveryRate: 'Recovery Rate',
      remaining: 'Remaining: {amount}',
      cyclesFormat: 'P:{p} | M:{c} | H:{l}'
    },
    charts: {
      recoveryByClass: 'Recovery rate by class',
      rate: 'Rate',
      noData: 'No data available',
      byCycle: 'By cycle',
      paymentStatus: 'Payment status'
    },
    table: {
      rankingTitle: 'Class ranking (by recovery rate)',
      rank: 'Rank',
      class: 'Class',
      cycle: 'Cycle',
      count: 'Count',
      expected: 'Expected',
      paid: 'Paid',
      remaining: 'Remaining',
      rate: 'Rate',
      noData: 'No students registered. Import data to see statistics.'
    }
  },
  settings: {
    accessDeniedTitle: 'Access Denied',
    accessDeniedMessage: 'Only administrators can access settings.',
    title: 'Settings',
    subtitle: 'Application configuration',
    schoolInfo: 'School Information',
    schoolName: 'School Name',
    schoolYear: 'School Year',
    address: 'Address',
    phone: 'Phone',
    email: 'Email',
    customMessages: 'Custom PDF Messages',
    thanksMessage: 'Thank you message (paid students)',
    reminderMessage: 'Reminder message (unpaid students)',
    paymentSettings: 'Payment Settings',
    secondTrancheThreshold: '2nd Installment Validation Threshold (%)',
    secondTrancheDesc: 'Minimum percentage paid to validate the 2nd installment',
    currentRule: 'Current Rule:',
    ruleDescription: 'A student who has paid ≥{seuil}% of their tuition gets the \\"2nd Installment Validated\\" badge on their receipt.',
    feesInfo: 'Tuition Fees Information',
    saved: 'Settings saved!',
    saveBtn: 'Save Settings'
  },
  support: {
    title: 'New Discussion',
    subtitle: 'Choose the department to contact',
    adminTitle: 'Administration',
    adminDesc: 'General questions, documents, enrollment, and school life.',
    comptaTitle: 'Accounting',
    comptaDesc: 'Tuition payments, receipts, remaining balances, and billing.',
    secureMsg: 'Your messages are encrypted and secure. Our team will respond as soon as possible.'
  },`,

  es: `  dashboard: {
    title: 'Panel principal',
    subtitle: 'Resumen de la gestión financiera',
    cycles: {
      primaire: 'Primaria',
      college: 'Secundaria',
      lycee: 'Bachillerato'
    },
    status: {
      soldes: 'Pagados',
      non_soldes: 'No pagados'
    },
    stats: {
      totalStudents: 'Total de Alumnos',
      expectedTuition: 'Matrícula Esperada',
      totalTuitionDesc: 'Total de gastos escolares',
      amountPaid: 'Monto Pagado',
      studentsPaid: '{count} alumnos pagados',
      recoveryRate: 'Tasa de Recuperación',
      remaining: 'Restante: {amount}',
      cyclesFormat: 'P:{p} | S:{c} | B:{l}'
    },
    charts: {
      recoveryByClass: 'Tasa de recuperación por clase',
      rate: 'Tasa',
      noData: 'Sin datos disponibles',
      byCycle: 'Por ciclo',
      paymentStatus: 'Estado de pagos'
    },
    table: {
      rankingTitle: 'Clasificación de clases (por tasa de recuperación)',
      rank: 'Rango',
      class: 'Clase',
      cycle: 'Ciclo',
      count: 'Efectivo',
      expected: 'Esperado',
      paid: 'Pagado',
      remaining: 'Restante',
      rate: 'Tasa',
      noData: 'No hay alumnos registrados. Importe datos para ver las estadísticas.'
    }
  },
  settings: {
    accessDeniedTitle: 'Acceso Denegado',
    accessDeniedMessage: 'Solo los administradores pueden acceder a la configuración.',
    title: 'Configuración',
    subtitle: 'Configuración de la aplicación',
    schoolInfo: 'Información de la escuela',
    schoolName: 'Nombre de la escuela',
    schoolYear: 'Año escolar',
    address: 'Dirección',
    phone: 'Teléfono',
    email: 'Correo',
    customMessages: 'Mensajes personalizados para PDF',
    thanksMessage: 'Mensaje de agradecimiento (alumnos pagados)',
    reminderMessage: 'Mensaje de recordatorio (alumnos no pagados)',
    paymentSettings: 'Configuración de pagos',
    secondTrancheThreshold: 'Umbral de validación de 2ª cuota (%)',
    secondTrancheDesc: 'Porcentaje mínimo pagado para validar la 2ª cuota',
    currentRule: 'Regla actual:',
    ruleDescription: 'Un alumno que ha pagado ≥{seuil}% de su matrícula obtiene la insignia \\"2ª Cuota Validada\\" en su recibo.',
    feesInfo: 'Información de tarifas',
    saved: '¡Configuración guardada!',
    saveBtn: 'Guardar configuración'
  },
  support: {
    title: 'Nueva Discusión',
    subtitle: 'Elija el departamento a contactar',
    adminTitle: 'Administración',
    adminDesc: 'Preguntas generales, documentos, inscripciones y vida escolar.',
    comptaTitle: 'Contabilidad',
    comptaDesc: 'Pagos de colegiatura, recibos, saldos pendientes y facturación.',
    secureMsg: 'Sus mensajes están encriptados y son seguros. Nuestro equipo responderá lo antes posible.'
  },`,

  ar: `  dashboard: {
    title: 'لوحة القيادة',
    subtitle: 'نظرة عامة على الإدارة المالية',
    cycles: {
      primaire: 'ابتدائي',
      college: 'إعدادي',
      lycee: 'ثانوي'
    },
    status: {
      soldes: 'مدفوع',
      non_soldes: 'غير مدفوع'
    },
    stats: {
      totalStudents: 'إجمالي الطلاب',
      expectedTuition: 'الرسوم المتوقعة',
      totalTuitionDesc: 'إجمالي الرسوم المدرسية',
      amountPaid: 'المبلغ المدفوع',
      studentsPaid: '{count} طلاب دفعوا',
      recoveryRate: 'معدل التحصيل',
      remaining: 'المتبقي: {amount}',
      cyclesFormat: 'ا:{p} | ع:{c} | ث:{l}'
    },
    charts: {
      recoveryByClass: 'معدل التحصيل حسب الفصل',
      rate: 'المعدل',
      noData: 'لا توجد بيانات متاحة',
      byCycle: 'حسب المرحلة',
      paymentStatus: 'حالة الدفع'
    },
    table: {
      rankingTitle: 'ترتيب الفصول (حسب معدل التحصيل)',
      rank: 'الرتبة',
      class: 'الفصل',
      cycle: 'المرحلة',
      count: 'العدد',
      expected: 'المتوقع',
      paid: 'المدفوع',
      remaining: 'المتبقي',
      rate: 'المعدل',
      noData: 'لا يوجد طلاب مسجلين. قم باستيراد البيانات لرؤية الإحصائيات.'
    }
  },
  settings: {
    accessDeniedTitle: 'رفض الوصول',
    accessDeniedMessage: 'يمكن للمسؤولين فقط الوصول إلى الإعدادات.',
    title: 'الإعدادات',
    subtitle: 'تكوين التطبيق',
    schoolInfo: 'معلومات المدرسة',
    schoolName: 'اسم المدرسة',
    schoolYear: 'السنة الدراسية',
    address: 'العنوان',
    phone: 'رقم الهاتف',
    email: 'البريد الإلكتروني',
    customMessages: 'رسائل مخصصة لملفات PDF',
    thanksMessage: 'رسالة شكر (للطلاب الذين سددوا الرسوم)',
    reminderMessage: 'رسالة تذكير (للطلاب الذين لم يسددوا)',
    paymentSettings: 'إعدادات الدفع',
    secondTrancheThreshold: 'عتبة التحقق من الدفعة الثانية (%)',
    secondTrancheDesc: 'الحد الأدنى للنسبة المدفوعة لاعتماد الدفعة الثانية',
    currentRule: 'القاعدة الحالية:',
    ruleDescription: 'يحصل الطالب الذي دفع ≥{seuil}% من الرسوم على شارة \\"تم اعتماد الدفعة الثانية\\" على إيصاله.',
    feesInfo: 'معلومات الرسوم الدراسية',
    saved: 'تم حفظ الإعدادات!',
    saveBtn: 'حفظ الإعدادات'
  },
  support: {
    title: 'نقاش جديد',
    subtitle: 'اختر القسم الذي تريد الاتصال به',
    adminTitle: 'الإدارة',
    adminDesc: 'أسئلة عامة، مستندات، تسجيل، والحياة المدرسية.',
    comptaTitle: 'الحسابات',
    comptaDesc: 'مدفوعات الرسوم الدراسية، الإيصالات، الأرصدة المتبقية، والفوترة.',
    secureMsg: 'رسائلك مشفرة وآمنة. سيرد فريقنا في أقرب وقت ممكن.'
  },`
};

for (const [lang, filepath] of Object.entries(files)) {
  let content = fs.readFileSync(filepath, 'utf8');
  // Insert the new keys just before nav: {
  const target = 'nav: {';
  const startIdx = content.indexOf(target);
  
  if (startIdx !== -1) {
    const before = content.substring(0, startIdx);
    const after = content.substring(startIdx);
    
    // Check if dashboard: already exists so we don't duplicate
    if (!content.includes('dashboard: {')) {
      content = before + replacements[lang] + '\\n  ' + after;
      fs.writeFileSync(filepath, content, 'utf8');
      console.log('Updated ' + lang);
    } else {
      console.log('Already updated ' + lang);
    }
  } else {
    console.log('Could not find match in ' + lang);
  }
}
