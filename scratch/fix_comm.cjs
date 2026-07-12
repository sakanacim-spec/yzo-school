const fs = require('fs');

const frFile = 'src/i18n/fr.ts';
let fr = fs.readFileSync(frFile, 'utf8');

// Fix chat section
fr = fr.replace(
  /"selectDiscussion":\s*"[^"]*"/, 
  `"selectDiscussion": "Sélectionnez une discussion pour commencer à échanger avec l'administration.",\n    "welcomeTitle": "Bienvenue dans la Messagerie",\n    "welcomeDesc": "Sélectionnez une conversation à gauche pour démarrer une discussion avec l'établissement ou les parents."`
);

// Add support section
fr = fr.replace(
  /"staff": \{/,
  `"support": {
    "title": "Nouvelle discussion",
    "subtitle": "Choisissez le service à contacter",
    "adminTitle": "Administration",
    "adminDesc": "Questions générales, documents, inscriptions et vie scolaire.",
    "comptaTitle": "Comptabilité",
    "comptaDesc": "Paiements de scolarité, reçus, restes à payer et facturation.",
    "secureMsg": "Votre messagerie est cryptée et sécurisée. Une réponse vous sera apportée dans les plus brefs délais par nos équipes."
  },
  "staff": {`
);

// Fix communication section
fr = fr.replace(
  /"whatsappWarning":\s*"[^"]*",/,
  `"whatsappWarning": "Pour éviter le spam WhatsApp, nous allons ouvrir la conversation pour le premier parent ({{name}}).\\n\\nVous devrez répéter l'opération pour les autres depuis la fiche de l'élève ou utiliser le module SMS pour un envoi de masse en 1 clic.",`
);

fr = fr.replace(
  /"confirmSms":\s*"[^"]*",/,
  `"confirmSms": "Êtes-vous sûr de vouloir envoyer {{count}} SMS ?",`
);

fr = fr.replace(
  /"confirmPush":\s*"[^"]*",/,
  `"confirmPush": "Êtes-vous sûr de vouloir envoyer une Notification Push à {{count}} parents ?\\n(Cette action est 100% gratuite)",`
);

fr = fr.replace(
  /"pushFailed":\s*"[^"]*",/,
  `"pushFailed": "{{count}} push ont échoué (parents non connectés).",`
);

fr = fr.replace(
  /"previewLength":\s*"[^"]*",/,
  `"previewLength": "Aperçu : {{chars}} caractères (env. {{sms}} SMS/destinataire).",`
);

fr = fr.replace(
  /"pushBtn":\s*"[^"]*",/,
  `"pushBtn": "Push ({{count}}) - Gratuit",`
);

fr = fr.replace(
  /"smsBtn":\s*"[^"]*",/,
  `"smsBtn": "SMS ({{count}})",`
);

fr = fr.replace(
  /"messagesSentSuccess":\s*"[^"]*"/,
  `"messagesSentSuccess": "{{count}} messages ont été envoyés avec succès. {{error}}",
    "varStudent": "Élève",
    "varRemaining": "Reste à payer",
    "varClass": "Classe"`
);

fs.writeFileSync(frFile, fr, 'utf8');

const commFile = 'src/pages/Communication.tsx';
let comm = fs.readFileSync(commFile, 'utf8');
comm = comm.replace(
  /\+ \{'\{nom_eleve\}'\}/,
  "+ {t(language as Language, 'communication.varStudent') || 'Élève'}"
);
comm = comm.replace(
  /\+ \{'\{reste_a_payer\}'\}/,
  "+ {t(language as Language, 'communication.varRemaining') || 'Reste à payer'}"
);
comm = comm.replace(
  /\+ \{'\{classe\}'\}/,
  "+ {t(language as Language, 'communication.varClass') || 'Classe'}"
);
fs.writeFileSync(commFile, comm, 'utf8');

console.log('Fixed fr.ts and Communication.tsx');
