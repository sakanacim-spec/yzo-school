const fs = require('fs');
let c = fs.readFileSync('src/components/Login.tsx', 'utf8');

c = c.replace(/<option value="" disabled>-- Sélectionnez votre établissement --<\/option>/g, 
  `<option value="" disabled>-- {T.login?.schoolPlaceholder || 'Sélectionnez votre établissement'} --</option>`);

c = c.replace(/<option value="global">Accès Global \(SuperAdmin\)<\/option>/g, 
  `<option value="global">{t(language as Language, 'auth.globalAccess') || 'Accès Global (SuperAdmin)'}</option>`);

c = c.replace(/<option disabled>────── Établissements ──────<\/option>/g, 
  `<option disabled>────── {t(language as Language, 'auth.schoolsList') || 'Établissements'} ──────</option>`);

c = c.replace(/> SE CONNECTER\n/g, 
  `> {(T.login?.loginButton || 'SE CONNECTER').toUpperCase()}\n`);

c = c.replace(/<span className="text-\[10px\] text-slate-400 font-medium">ou<\/span>/g, 
  `<span className="text-[10px] text-slate-400 font-medium">{t(language as Language, 'common.or') || 'ou'}</span>`);

c = c.replace(/<h2 className="text-3xl font-black mb-4 tracking-tighter">De retour \? 👋<\/h2>/g, 
  `<h2 className="text-3xl font-black mb-4 tracking-tighter">{t(language as Language, 'auth.welcomeBack') || 'De retour ? 👋'}</h2>`);

c = c.replace(/Connectez-vous pour accéder au tableau de bord et gérer votre établissement\./g, 
  `{t(language as Language, 'auth.welcomeBackDesc') || 'Connectez-vous pour accéder au tableau de bord et gérer votre établissement.'}`);

c = c.replace(/>\s*SE CONNECTER\s*<\/button>/g, 
  `>\n                  {(T.login?.loginButton || 'SE CONNECTER').toUpperCase()}\n                </button>`);

c = c.replace(/CRÉER MON ESPACE PARENT <span/g, 
  `{(t(language as Language, 'auth.iAmParentCreateAccount') || 'CRÉER MON ESPACE PARENT').toUpperCase()} <span`);

c = c.replace(/>C'est rapide, gratuit et sécurisé\.</g, 
  `>{t(language as Language, 'auth.fastFreeSecure') || "C'est rapide, gratuit et sécurisé."}<`);

fs.writeFileSync('src/components/Login.tsx', c, 'utf8');
console.log('Fixed Login.tsx hardcoded strings');
