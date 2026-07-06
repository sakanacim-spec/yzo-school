const fs = require('fs');

const authBlocks = {
  fr: `
  auth: {
    phoneEx: '+33 6 12 34 56 78',
    passwordPlaceholderMobile: '••••••',
    forgotPasswordBtn: 'Mot de passe oublié ?',
    privacyAndData: 'Confidentialité & Données',
    trialExpiredWarning: '⚠️ Période d\\'essai expirée',
    contactAdmin: 'Contactez l\\'administrateur.',
    registerSchoolBtn: 'INSCRIRE MON ÉTABLISSEMENT',
    secureConnection: 'Connexion sécurisée',
    dataProtected: 'Vos données sont protégées',
    privacyAndSecurity: 'Confidentialité & Sécurité',
    contactAdminToPay: 'Contactez l\\'administrateur pour régler l\\'abonnement.',
    iAmParentCreateAccount: 'Je suis parent, Créer mon compte',
    connectedEducation: 'Éducation Connectée',
  },`,
  en: `
  auth: {
    phoneEx: '+1 234 567 8900',
    passwordPlaceholderMobile: '••••••',
    forgotPasswordBtn: 'Forgot password?',
    privacyAndData: 'Privacy & Data',
    trialExpiredWarning: '⚠️ Trial period expired',
    contactAdmin: 'Contact the administrator.',
    registerSchoolBtn: 'REGISTER MY SCHOOL',
    secureConnection: 'Secure connection',
    dataProtected: 'Your data is protected',
    privacyAndSecurity: 'Privacy & Security',
    contactAdminToPay: 'Contact the administrator to pay the subscription.',
    iAmParentCreateAccount: 'I am a parent, Create my account',
    connectedEducation: 'Connected Education',
  },`,
  es: `
  auth: {
    phoneEx: '+34 600 12 34 56',
    passwordPlaceholderMobile: '••••••',
    forgotPasswordBtn: '¿Contraseña olvidada?',
    privacyAndData: 'Privacidad y Datos',
    trialExpiredWarning: '⚠️ Período de prueba expirado',
    contactAdmin: 'Contacte al administrador.',
    registerSchoolBtn: 'REGISTRAR MI ESCUELA',
    secureConnection: 'Conexión segura',
    dataProtected: 'Tus datos están protegidos',
    privacyAndSecurity: 'Privacidad y Seguridad',
    contactAdminToPay: 'Contacte al administrador para pagar la suscripción.',
    iAmParentCreateAccount: 'Soy padre, Crear mi cuenta',
    connectedEducation: 'Educación Conectada',
  },`,
  ar: `
  auth: {
    phoneEx: '+212 6 12 34 56 78',
    passwordPlaceholderMobile: '••••••',
    forgotPasswordBtn: 'هل نسيت كلمة المرور؟',
    privacyAndData: 'الخصوصية والبيانات',
    trialExpiredWarning: '⚠️ انتهت الفترة التجريبية',
    contactAdmin: 'اتصل بالمسؤول.',
    registerSchoolBtn: 'تسجيل مؤسستي',
    secureConnection: 'اتصال آمن',
    dataProtected: 'بياناتك محمية',
    privacyAndSecurity: 'الخصوصية والأمان',
    contactAdminToPay: 'اتصل بالمسؤول لدفع الاشتراك.',
    iAmParentCreateAccount: 'أنا ولي أمر، إنشاء حسابي',
    connectedEducation: 'التعليم المتصل',
  },`
};

for (const lang of ['fr', 'en', 'es', 'ar']) {
  const filePath = 'src/i18n/' + lang + '.ts';
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('auth: {')) {
    // Inject after "header: {" block. The header block ends with "},"
    // Let's use a regex to find the end of the header block.
    // It looks like:
    //   header: {
    //     ...
    //   },
    
    // We can just inject it before "// Auth — Login"
    content = content.replace(/\/\/ Auth — Login/g, authBlocks[lang].trim() + '\\n\\n  // Auth — Login');
    
    // If it didn't have "// Auth — Login", just put it after "header: { ... },"
    if (!content.includes('auth: {')) {
        const parts = content.split('header: {');
        if (parts.length > 1) {
            const afterHeaderIndex = parts[1].indexOf('},');
            if (afterHeaderIndex !== -1) {
                const insertPos = parts[0].length + 'header: {'.length + afterHeaderIndex + 2;
                content = content.slice(0, insertPos) + '\\n' + authBlocks[lang] + content.slice(insertPos);
            }
        }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Injected auth into ' + lang + '.ts');
  }
}
