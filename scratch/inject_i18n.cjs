const fs = require('fs');
const path = require('path');

const files = {
  fr: path.join(__dirname, '../src/i18n/fr.ts'),
  en: path.join(__dirname, '../src/i18n/en.ts'),
  es: path.join(__dirname, '../src/i18n/es.ts'),
  ar: path.join(__dirname, '../src/i18n/ar.ts')
};

function insertIntoBlock(content, blockName, newFieldsStr) {
  const startIndex = content.indexOf('  ' + blockName + ': {');
  if (startIndex === -1) {
    const endObjIdx = content.lastIndexOf('};');
    return content.slice(0, endObjIdx) + '\\n  ' + blockName + ': {\\n' + newFieldsStr + '\\n  },\\n' + content.slice(endObjIdx);
  }
  const endMarker = '\\n  },';
  const endIndex = content.indexOf(endMarker, startIndex);
  if (endIndex === -1) return content;
  
  const firstKey = newFieldsStr.split(':')[0].trim();
  const blockContent = content.slice(startIndex, endIndex);
  if (blockContent.includes(firstKey + ':')) {
    return content;
  }

  return content.slice(0, endIndex) + ',\\n' + newFieldsStr + content.slice(endIndex);
}

const additions = {
  fr: {
    dashboard: "    subtitle: 'Vue d\\'ensemble de la gestion financière',\\n" +
      "    cycles: { primaire: 'Primaire', college: 'Collège', lycee: 'Lycée' },\\n" +
      "    status: { soldes: 'Soldés', non_soldes: 'Non Soldés' },\\n" +
      "    stats: {\\n" +
      "      totalStudents: 'Total Élèves',\\n" +
      "      expectedTuition: 'Écolage Attendu',\\n" +
      "      totalTuitionDesc: 'Total des frais de scolarité',\\n" +
      "      amountPaid: 'Montant Payé',\\n" +
      "      studentsPaid: '{count} élèves soldés',\\n" +
      "      recoveryRate: 'Taux de Recouvrement',\\n" +
      "      remaining: 'Reste : {amount}',\\n" +
      "      cyclesFormat: 'P:{p} | C:{c} | L:{l}'\\n" +
      "    },\\n" +
      "    charts: {\\n" +
      "      recoveryByClass: 'Taux de recouvrement par classe',\\n" +
      "      rate: 'Taux',\\n" +
      "      noData: 'Aucune donnée disponible',\\n" +
      "      byCycle: 'Par cycle',\\n" +
      "      paymentStatus: 'Statut paiements'\\n" +
      "    },\\n" +
      "    table: {\\n" +
      "      rankingTitle: 'Classement des classes (par taux de recouvrement)',\\n" +
      "      rank: 'Rang',\\n" +
      "      class: 'Classe',\\n" +
      "      cycle: 'Cycle',\\n" +
      "      count: 'Effectif',\\n" +
      "      expected: 'Attendu',\\n" +
      "      paid: 'Payé',\\n" +
      "      remaining: 'Restant',\\n" +
      "      rate: 'Taux',\\n" +
      "      noData: 'Aucun élève enregistré. Importez des données pour voir les statistiques.'\\n" +
      "    }",
    settings: "    accessDeniedTitle: 'Accès refusé',\\n" +
      "    accessDeniedMessage: 'Seuls les administrateurs peuvent accéder aux paramètres.',\\n" +
      "    subtitle: 'Configuration de l\\'application',\\n" +
      "    schoolInfo: 'Informations de l\\'école',\\n" +
      "    customMessages: 'Messages personnalisés pour PDF',\\n" +
      "    thanksMessage: 'Message de remerciement (élèves soldés)',\\n" +
      "    reminderMessage: 'Message de rappel (élèves non soldés)',\\n" +
      "    paymentSettings: 'Paramètres de paiement',\\n" +
      "    secondTrancheThreshold: 'Seuil de validation 2ème tranche (%)',\\n" +
      "    secondTrancheDesc: 'Pourcentage minimum payé pour valider la 2ème tranche',\\n" +
      "    currentRule: 'Règle actuelle:',\\n" +
      "    ruleDescription: 'Un élève ayant payé ≥{seuil}% de son écolage obtient le badge \"2ème Tranche Validée\" sur son reçu.',\\n" +
      "    feesInfo: 'Informations sur les tarifs',\\n" +
      "    saved: 'Paramètres enregistrés !',\\n" +
      "    saveBtn: 'Enregistrer les paramètres'",
    support: "    title: 'Nouvelle discussion',\\n" +
      "    subtitle: 'Choisissez le service à contacter',\\n" +
      "    adminTitle: 'Administration',\\n" +
      "    adminDesc: 'Questions générales, documents, inscriptions et vie scolaire.',\\n" +
      "    comptaTitle: 'Comptabilité',\\n" +
      "    comptaDesc: 'Paiements de scolarité, reçus, restes à payer et facturation.',\\n" +
      "    secureMsg: 'Votre messagerie est cryptée et sécurisée. Une réponse vous sera apportée dans les plus brefs délais par nos équipes.'"
  },
  en: {
    dashboard: "    subtitle: 'Financial management overview',\\n" +
      "    cycles: { primaire: 'Primary', college: 'Middle School', lycee: 'High School' },\\n" +
      "    status: { soldes: 'Paid', non_soldes: 'Unpaid' },\\n" +
      "    stats: {\\n" +
      "      totalStudents: 'Total Students',\\n" +
      "      expectedTuition: 'Expected Tuition',\\n" +
      "      totalTuitionDesc: 'Total school fees',\\n" +
      "      amountPaid: 'Amount Paid',\\n" +
      "      studentsPaid: '{count} students paid',\\n" +
      "      recoveryRate: 'Recovery Rate',\\n" +
      "      remaining: 'Remaining: {amount}',\\n" +
      "      cyclesFormat: 'P:{p} | M:{c} | H:{l}'\\n" +
      "    },\\n" +
      "    charts: {\\n" +
      "      recoveryByClass: 'Recovery rate by class',\\n" +
      "      rate: 'Rate',\\n" +
      "      noData: 'No data available',\\n" +
      "      byCycle: 'By cycle',\\n" +
      "      paymentStatus: 'Payment status'\\n" +
      "    },\\n" +
      "    table: {\\n" +
      "      rankingTitle: 'Class ranking (by recovery rate)',\\n" +
      "      rank: 'Rank',\\n" +
      "      class: 'Class',\\n" +
      "      cycle: 'Cycle',\\n" +
      "      count: 'Count',\\n" +
      "      expected: 'Expected',\\n" +
      "      paid: 'Paid',\\n" +
      "      remaining: 'Remaining',\\n" +
      "      rate: 'Rate',\\n" +
      "      noData: 'No students registered. Import data to see statistics.'\\n" +
      "    }",
    settings: "    accessDeniedTitle: 'Access Denied',\\n" +
      "    accessDeniedMessage: 'Only administrators can access settings.',\\n" +
      "    subtitle: 'Application configuration',\\n" +
      "    schoolInfo: 'School Information',\\n" +
      "    customMessages: 'Custom PDF Messages',\\n" +
      "    thanksMessage: 'Thank you message (paid students)',\\n" +
      "    reminderMessage: 'Reminder message (unpaid students)',\\n" +
      "    paymentSettings: 'Payment Settings',\\n" +
      "    secondTrancheThreshold: '2nd Installment Validation Threshold (%)',\\n" +
      "    secondTrancheDesc: 'Minimum percentage paid to validate the 2nd installment',\\n" +
      "    currentRule: 'Current Rule:',\\n" +
      "    ruleDescription: 'A student who has paid ≥{seuil}% of their tuition gets the \"2nd Installment Validated\" badge on their receipt.',\\n" +
      "    feesInfo: 'Tuition Fees Information',\\n" +
      "    saved: 'Settings saved!',\\n" +
      "    saveBtn: 'Save Settings'",
    support: "    title: 'New Discussion',\\n" +
      "    subtitle: 'Choose the department to contact',\\n" +
      "    adminTitle: 'Administration',\\n" +
      "    adminDesc: 'General questions, documents, enrollment, and school life.',\\n" +
      "    comptaTitle: 'Accounting',\\n" +
      "    comptaDesc: 'Tuition payments, receipts, remaining balances, and billing.',\\n" +
      "    secureMsg: 'Your messages are encrypted and secure. Our team will respond as soon as possible.'"
  },
  es: {
    dashboard: "    subtitle: 'Resumen de la gestión financiera',\\n" +
      "    cycles: { primaire: 'Primaria', college: 'Secundaria', lycee: 'Bachillerato' },\\n" +
      "    status: { soldes: 'Pagados', non_soldes: 'No pagados' },\\n" +
      "    stats: {\\n" +
      "      totalStudents: 'Total de Alumnos',\\n" +
      "      expectedTuition: 'Matrícula Esperada',\\n" +
      "      totalTuitionDesc: 'Total de gastos escolares',\\n" +
      "      amountPaid: 'Monto Pagado',\\n" +
      "      studentsPaid: '{count} alumnos pagados',\\n" +
      "      recoveryRate: 'Tasa de Recuperación',\\n" +
      "      remaining: 'Restante: {amount}',\\n" +
      "      cyclesFormat: 'P:{p} | S:{c} | B:{l}'\\n" +
      "    },\\n" +
      "    charts: {\\n" +
      "      recoveryByClass: 'Tasa de recuperación por clase',\\n" +
      "      rate: 'Tasa',\\n" +
      "      noData: 'Sin datos disponibles',\\n" +
      "      byCycle: 'Por ciclo',\\n" +
      "      paymentStatus: 'Estado de pagos'\\n" +
      "    },\\n" +
      "    table: {\\n" +
      "      rankingTitle: 'Clasificación de clases (por tasa de recuperación)',\\n" +
      "      rank: 'Rango',\\n" +
      "      class: 'Clase',\\n" +
      "      cycle: 'Ciclo',\\n" +
      "      count: 'Efectivo',\\n" +
      "      expected: 'Esperado',\\n" +
      "      paid: 'Pagado',\\n" +
      "      remaining: 'Restante',\\n" +
      "      rate: 'Tasa',\\n" +
      "      noData: 'No hay alumnos registrados. Importe datos para ver las estadísticas.'\\n" +
      "    }",
    settings: "    accessDeniedTitle: 'Acceso Denegado',\\n" +
      "    accessDeniedMessage: 'Solo los administradores pueden acceder a la configuración.',\\n" +
      "    subtitle: 'Configuración de la aplicación',\\n" +
      "    schoolInfo: 'Información de la escuela',\\n" +
      "    customMessages: 'Mensajes personalizados para PDF',\\n" +
      "    thanksMessage: 'Mensaje de agradecimiento (alumnos pagados)',\\n" +
      "    reminderMessage: 'Mensaje de recordatorio (alumnos no pagados)',\\n" +
      "    paymentSettings: 'Configuración de pagos',\\n" +
      "    secondTrancheThreshold: 'Umbral de validación de 2ª cuota (%)',\\n" +
      "    secondTrancheDesc: 'Porcentaje mínimo pagado para validar la 2ª cuota',\\n" +
      "    currentRule: 'Regla actual:',\\n" +
      "    ruleDescription: 'Un alumno que ha pagado ≥{seuil}% de su matrícula obtiene la insignia \"2ª Cuota Validada\" en su recibo.',\\n" +
      "    feesInfo: 'Información de tarifas',\\n" +
      "    saved: '¡Configuración guardada!',\\n" +
      "    saveBtn: 'Guardar configuración'",
    support: "    title: 'Nueva Discusión',\\n" +
      "    subtitle: 'Elija el departamento a contactar',\\n" +
      "    adminTitle: 'Administración',\\n" +
      "    adminDesc: 'Preguntas generales, documentos, inscripciones y vida escolar.',\\n" +
      "    comptaTitle: 'Contabilidad',\\n" +
      "    comptaDesc: 'Pagos de colegiatura, recibos, saldos pendientes y facturación.',\\n" +
      "    secureMsg: 'Sus mensajes están encriptados y son seguros. Nuestro equipo responderá lo antes posible.'"
  },
  ar: {
    dashboard: "    subtitle: 'نظرة عامة على الإدارة المالية',\\n" +
      "    cycles: { primaire: 'ابتدائي', college: 'إعدادي', lycee: 'ثانوي' },\\n" +
      "    status: { soldes: 'مدفوع', non_soldes: 'غير مدفوع' },\\n" +
      "    stats: {\\n" +
      "      totalStudents: 'إجمالي الطلاب',\\n" +
      "      expectedTuition: 'الرسوم المتوقعة',\\n" +
      "      totalTuitionDesc: 'إجمالي الرسوم المدرسية',\\n" +
      "      amountPaid: 'المبلغ المدفوع',\\n" +
      "      studentsPaid: '{count} طلاب دفعوا',\\n" +
      "      recoveryRate: 'معدل التحصيل',\\n" +
      "      remaining: 'المتبقي: {amount}',\\n" +
      "      cyclesFormat: 'ا:{p} | ع:{c} | ث:{l}'\\n" +
      "    },\\n" +
      "    charts: {\\n" +
      "      recoveryByClass: 'معدل التحصيل حسب الفصل',\\n" +
      "      rate: 'المعدل',\\n" +
      "      noData: 'لا توجد بيانات متاحة',\\n" +
      "      byCycle: 'حسب المرحلة',\\n" +
      "      paymentStatus: 'حالة الدفع'\\n" +
      "    },\\n" +
      "    table: {\\n" +
      "      rankingTitle: 'ترتيب الفصول (حسب معدل التحصيل)',\\n" +
      "      rank: 'الرتبة',\\n" +
      "      class: 'الفصل',\\n" +
      "      cycle: 'المرحلة',\\n" +
      "      count: 'العدد',\\n" +
      "      expected: 'المتوقع',\\n" +
      "      paid: 'المدفوع',\\n" +
      "      remaining: 'المتبقي',\\n" +
      "      rate: 'المعدل',\\n" +
      "      noData: 'لا يوجد طلاب مسجلين. قم باستيراد البيانات لرؤية الإحصائيات.'\\n" +
      "    }",
    settings: "    accessDeniedTitle: 'رفض الوصول',\\n" +
      "    accessDeniedMessage: 'يمكن للمسؤولين فقط الوصول إلى الإعدادات.',\\n" +
      "    subtitle: 'تكوين التطبيق',\\n" +
      "    schoolInfo: 'معلومات المدرسة',\\n" +
      "    customMessages: 'رسائل مخصصة لملفات PDF',\\n" +
      "    thanksMessage: 'رسالة شكر (للطلاب الذين سددوا الرسوم)',\\n" +
      "    reminderMessage: 'رسالة تذكير (للطلاب الذين لم يسددوا)',\\n" +
      "    paymentSettings: 'إعدادات الدفع',\\n" +
      "    secondTrancheThreshold: 'عتبة التحقق من الدفعة الثانية (%)',\\n" +
      "    secondTrancheDesc: 'الحد الأدنى للنسبة المدفوعة لاعتماد الدفعة الثانية',\\n" +
      "    currentRule: 'القاعدة الحالية:',\\n" +
      "    ruleDescription: 'يحصل الطالب الذي دفع ≥{seuil}% من الرسوم على شارة \"تم اعتماد الدفعة الثانية\" على إيصاله.',\\n" +
      "    feesInfo: 'معلومات الرسوم الدراسية',\\n" +
      "    saved: 'تم حفظ الإعدادات!',\\n" +
      "    saveBtn: 'حفظ الإعدادات'",
    support: "    title: 'نقاش جديد',\\n" +
      "    subtitle: 'اختر القسم الذي تريد الاتصال به',\\n" +
      "    adminTitle: 'الإدارة',\\n" +
      "    adminDesc: 'أسئلة عامة، مستندات، تسجيل، والحياة المدرسية.',\\n" +
      "    comptaTitle: 'الحسابات',\\n" +
      "    comptaDesc: 'مدفوعات الرسوم الدراسية، الإيصالات، الأرصدة المتبقية، والفوترة.',\\n" +
      "    secureMsg: 'رسائلك مشفرة وآمنة. سيرد فريقنا في أقرب وقت ممكن.'"
  }
};

for (const [lang, filepath] of Object.entries(files)) {
  let content = fs.readFileSync(filepath, 'utf8');
  
  content = insertIntoBlock(content, 'dashboard', additions[lang].dashboard);
  content = insertIntoBlock(content, 'settings', additions[lang].settings);
  content = insertIntoBlock(content, 'support', additions[lang].support);
  
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('Updated ' + lang);
}
