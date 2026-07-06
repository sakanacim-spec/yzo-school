const fs = require('fs');

const authKeys = {
  fr: {
    globalAccess: 'Accès Global (SuperAdmin)',
    schoolsList: 'Établissements',
    welcomeBack: 'De retour ? 👋',
    welcomeBackDesc: 'Connectez-vous pour accéder au tableau de bord et gérer votre établissement.',
    fastFreeSecure: "C'est rapide, gratuit et sécurisé.",
  },
  en: {
    globalAccess: 'Global Access (SuperAdmin)',
    schoolsList: 'Schools',
    welcomeBack: 'Welcome back! 👋',
    welcomeBackDesc: 'Log in to access your dashboard and manage your school.',
    fastFreeSecure: "It's fast, free, and secure.",
  },
  es: {
    globalAccess: 'Acceso Global (SuperAdmin)',
    schoolsList: 'Escuelas',
    welcomeBack: '¡Bienvenido de nuevo! 👋',
    welcomeBackDesc: 'Inicie sesión para acceder a su panel y administrar su escuela.',
    fastFreeSecure: 'Es rápido, gratis y seguro.',
  },
  ar: {
    globalAccess: 'الوصول الشامل (المدير العام)',
    schoolsList: 'المدارس',
    welcomeBack: 'مرحباً بعودتك! 👋',
    welcomeBackDesc: 'سجل الدخول للوصول إلى لوحة القيادة وإدارة مؤسستك.',
    fastFreeSecure: 'سريع، مجاني، وآمن.',
  }
};

const commonKeys = {
  fr: "    or: 'ou',",
  en: "    or: 'or',",
  es: "    or: 'o',",
  ar: "    or: 'أو',"
};

for (const lang of ['fr', 'en', 'es', 'ar']) {
  const f = `src/i18n/${lang}.ts`;
  let c = fs.readFileSync(f, 'utf8');

  // Inject common.or
  if (!c.includes("or: '")) {
    c = c.replace(/common: \{/, `common: {\n${commonKeys[lang]}`);
  }

  // Inject auth keys
  const keysStr = Object.entries(authKeys[lang]).map(([k, v]) => `    ${k}: '${v.replace(/'/g, "\\'")}',`).join('\n');
  if (!c.includes('globalAccess:')) {
    c = c.replace(/auth: \{/, `auth: {\n${keysStr}`);
  }

  fs.writeFileSync(f, c, 'utf8');
}
console.log('Added missing keys to translations');
