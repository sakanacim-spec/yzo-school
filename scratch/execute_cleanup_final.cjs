const fs = require('fs');
const path = require('path');

const frFile = path.join(__dirname, '../src/i18n/fr.ts');
const detailedAudit = JSON.parse(fs.readFileSync(path.join(__dirname, 'detailed_audit.json'), 'utf8'));

// Read current fr.ts using the temp strategy
const tempPath = path.join(__dirname, 'temp_fr_exec.js');
let jsContent = fs.readFileSync(frFile, 'utf-8').replace('export const fr =', 'export default ');
fs.writeFileSync(tempPath, jsContent);

import('file://' + tempPath).then(module => {
  const frData = module.default;
  fs.unlinkSync(tempPath);

  // 1. DELETE 153 unused keys
  const unusedKeys = detailedAudit.unusedKeys;
  const protectedPrefixes = ['nav.', 'groups.', 'bulletin.'];
  const keysToDelete = unusedKeys.filter(k => !protectedPrefixes.some(p => k.startsWith(p)));
  
  for (const k of keysToDelete) {
    const parts = k.split('.');
    if (parts.length === 2 && frData[parts[0]]) {
      delete frData[parts[0]][parts[1]];
    } else if (parts.length === 3 && frData[parts[0]] && frData[parts[0]][parts[1]]) {
      delete frData[parts[0]][parts[1]][parts[2]];
    }
  }

  // 2. TRANSLATE and INJECT missing keys
  const missingKeys = Object.keys(detailedAudit.missingKeys);
  const translations = {
    "dashboard.stats.totalStudents": "Total Élèves",
    "dashboard.cycles.primaire": "Primaire",
    "dashboard.cycles.college": "Collège",
    "dashboard.cycles.lycee": "Lycée",
    "dashboard.status.soldes": "Soldés",
    "dashboard.status.non_soldes": "Non Soldés",
    "dashboard.stats.cyclesFormat": "Répartition par cycles",
    "dashboard.stats.expectedTuition": "Scolarité attendue",
    "dashboard.stats.totalTuitionDesc": "Scolarité totale théorique",
    "dashboard.stats.amountPaid": "Montant payé",
    "dashboard.stats.studentsPaid": "Élèves soldés",
    "dashboard.stats.recoveryRate": "Taux de recouvrement",
    "dashboard.stats.remaining": "Reste à payer",
    "dashboard.charts.recoveryByClass": "Recouvrement par classe",
    "dashboard.charts.rate": "Taux (%)",
    "dashboard.charts.noData": "Aucune donnée disponible",
    "dashboard.charts.byCycle": "Répartition par cycle",
    "dashboard.charts.paymentStatus": "Statut des paiements",
    "dashboard.table.rankingTitle": "Classement des classes",
    "dashboard.table.rank": "Rang",
    "dashboard.table.class": "Classe",
    "dashboard.table.cycle": "Cycle",
    "dashboard.table.count": "Effectif",
    "dashboard.table.expected": "Attendu",
    "dashboard.table.paid": "Encaissé",
    "dashboard.table.remaining": "Reste",
    "dashboard.table.rate": "Taux",
    "dashboard.table.noData": "Aucune donnée",
    "dashboard.table.student": "Élève",
    "staff.roles.professeur": "Professeur",
    "staff.roles.surveillant": "Surveillant",
    "staff.roles.censeur": "Censeur",
    "staff.roles.comptable": "Comptable",
    "staff.roles.superviseur": "Superviseur",
    "staff.roles.secretaire": "Secrétaire",
    "staff.roles.admin": "Administrateur",
    "parentNotes.appreciation.excellent": "Excellent",
    "parentNotes.appreciation.veryGood": "Très bien",
    "parentNotes.appreciation.good": "Bien",
    "parentNotes.appreciation.satisfactory": "Satisfaisant",
    "parentNotes.appreciation.passable": "Passable",
    "parentNotes.appreciation.insufficient": "Insuffisant",
    "parentNotes.appreciation.veryInsufficient": "Très insuffisant",
    "profResources.form.title": "Ressource",
    "profResources.form.class": "Classe",
    "profResources.form.select": "Sélectionner",
    "profResources.form.subject": "Matière",
    "profResources.form.contentType": "Type de contenu",
    "profResources.form.pdf": "Fichier PDF",
    "profResources.form.document": "Document Word/Excel",
    "profResources.form.link": "Lien externe",
    "profResources.form.url": "URL du lien",
    "profResources.form.file": "Fichier",
    "profResources.form.description": "Description",
    "profResources.form.publish": "Publier",
    "public.careers.val1.title": "Innovation",
    "public.careers.val1.desc": "Nous réinventons l'éducation.",
    "public.careers.val2.title": "Excellence",
    "public.careers.val2.desc": "La qualité avant tout.",
    "public.careers.val3.title": "Impact",
    "public.careers.val3.desc": "Faire une différence.",
    "public.careers.job1.title": "Ingénieur Logiciel",
    "public.careers.job1.location": "Paris, France",
    "public.careers.job1.type": "CDI",
    "public.careers.job1.department": "Ingénierie",
    "public.careers.job1.desc": "Développement web full-stack.",
    "public.careers.job2.title": "Chef de Produit",
    "public.careers.job2.location": "Remote",
    "public.careers.job2.type": "CDI",
    "public.careers.job2.department": "Produit",
    "public.careers.job2.desc": "Gestion du cycle de vie produit.",
    "public.careers.job3.title": "Designer UX/UI",
    "public.careers.job3.location": "Lyon, France",
    "public.careers.job3.type": "CDD",
    "public.careers.job3.department": "Design",
    "public.careers.job3.desc": "Création d'interfaces utilisateur.",
    "public.careers.job4.title": "Responsable Commercial",
    "public.careers.job4.location": "Bordeaux, France",
    "public.careers.job4.type": "CDI",
    "public.careers.job4.department": "Ventes",
    "public.careers.job4.desc": "Développement du portefeuille client.",
    "public.careers.success": "Candidature envoyée avec succès !",
    "public.careers.error": "Erreur lors de l'envoi de la candidature.",
    "public.careers.joinUs": "Rejoignez-nous",
    "public.careers.buildSchool": "Construisons l'école de demain",
    "public.careers.heroDesc": "Découvrez nos offres d'emploi.",
    "public.careers.openPositions": "Postes ouverts",
    "public.careers.apply": "Postuler",
    "public.careers.noIdealJob": "Pas de poste idéal ?",
    "public.careers.unsolicitedDesc": "Envoyez-nous une candidature spontanée.",
    "public.careers.unsolicitedJob": "Candidature spontanée",
    "public.careers.sendUnsolicited": "Envoyer une candidature spontanée",
    "public.careers.fullName": "Nom complet",
    "public.careers.country": "Pays",
    "public.careers.email": "Email",
    "public.careers.message": "Message / Lettre de motivation",
    "public.careers.sending": "Envoi en cours...",
    "public.careers.sendApplication": "Envoyer la candidature",
    "public.contact.success": "Message envoyé avec succès !",
    "public.contact.error": "Erreur lors de l'envoi du message.",
    "public.contact.support": "Support technique",
    "public.contact.title": "Contactez-nous",
    "public.contact.desc": "Notre équipe est à votre écoute.",
    "public.contact.email": "contact@yziow.com",
    "public.contact.phone": "+33 1 23 45 67 89",
    "public.contact.hours": "Lun-Ven: 9h - 18h",
    "public.contact.offices": "Bureaux",
    "public.contact.spain": "Madrid, Espagne",
    "public.contact.message": "Votre message",
    "public.contact.messagePlaceholder": "Comment pouvons-nous vous aider ?",
    "public.contact.sendMessage": "Envoyer le message",
    "public.legal.cgu.title": "Conditions Générales d'Utilisation",
    "public.legal.cgu.sec1.title": "1. Objet",
    "public.legal.cgu.sec1.content": "Les présentes CGU régissent l'accès...",
    "public.legal.cgu.sec2.title": "2. Accès",
    "public.legal.cgu.sec2.content": "L'accès à la plateforme est réservé...",
    "public.legal.cgu.sec3.title": "3. Obligations",
    "public.legal.cgu.sec3.content": "L'utilisateur s'engage à...",
    "public.legal.cgu.sec4.title": "4. Responsabilité",
    "public.legal.cgu.sec4.content": "La plateforme décline toute responsabilité...",
    "public.legal.cgu.sec5.title": "5. Modification",
    "public.legal.cgu.sec5.content": "Nous nous réservons le droit de modifier...",
    "public.legal.privacy.title": "Politique de Confidentialité",
    "public.legal.privacy.sec1.title": "1. Données collectées",
    "public.legal.privacy.sec1.content": "Nous collectons les données nécessaires...",
    "public.legal.privacy.sec2.title": "2. Utilisation",
    "public.legal.privacy.sec2.content": "Les données sont utilisées pour...",
    "public.legal.privacy.sec3.title": "3. Partage",
    "public.legal.privacy.sec3.content": "Aucune donnée n'est vendue...",
    "public.legal.privacy.sec4.title": "4. Sécurité",
    "public.legal.privacy.sec4.content": "Nous assurons la sécurité des données...",
    "public.legal.privacy.sec5.title": "5. Vos droits",
    "public.legal.privacy.sec5.content": "Vous disposez d'un droit d'accès...",
    "public.legal.mentions.title": "Mentions Légales",
    "public.legal.mentions.sec1.title": "Éditeur",
    "public.legal.mentions.sec1.content": "Yziow SAS...",
    "public.legal.mentions.sec2.title": "Hébergement",
    "public.legal.mentions.sec2.content": "Hébergé par...",
    "public.legal.mentions.sec3.title": "Propriété Intellectuelle",
    "public.legal.mentions.sec3.content": "Tous droits réservés...",
    "public.legal.mentions.sec4.title": "Contact",
    "public.legal.mentions.sec4.content": "Pour toute demande...",
    "public.legal.info": "Informations Légales",
    "public.legal.lastUpdate": "Dernière mise à jour",
    "grades.appreciation.veryGood": "Très bien",
    "grades.appreciation.good": "Bien",
    "grades.appreciation.fairlyGood": "Assez bien",
    "grades.appreciation.passable": "Passable",
    "grades.appreciation.insufficient": "Insuffisant",
    "grades.appreciation.poor": "Médiocre",
    "salaries.status.notGenerated": "Non généré",
    "superadmin_schools": "Écoles SuperAdmin",
    "scan_sortie": "Scan de sortie"
  };

  for (const k of missingKeys) {
    if (k.endsWith('.') || k === ': ' || k === ' ') continue; // Ignore dynamic roots and symbols
    if (translations[k]) {
      const parts = k.split('.');
      if (parts.length === 2) {
        if (!frData[parts[0]]) frData[parts[0]] = {};
        frData[parts[0]][parts[1]] = translations[k];
      } else if (parts.length === 3) {
        if (!frData[parts[0]]) frData[parts[0]] = {};
        if (!frData[parts[0]][parts[1]]) frData[parts[0]][parts[1]] = {};
        frData[parts[0]][parts[1]][parts[2]] = translations[k];
      } else if (parts.length === 4) {
        if (!frData[parts[0]]) frData[parts[0]] = {};
        if (!frData[parts[0]][parts[1]]) frData[parts[0]][parts[1]] = {};
        if (!frData[parts[0]][parts[1]][parts[2]]) frData[parts[0]][parts[1]][parts[2]] = {};
        frData[parts[0]][parts[1]][parts[2]][parts[3]] = translations[k];
      }
    } else {
      // Auto-deduce as fallback if not explicitly translated
      const last = k.split('.').pop();
      if (!last || last.length < 2) continue; // Skip weird stuff
      
      let deduced = last.replace(/([A-Z])/g, ' $1').toLowerCase();
      deduced = deduced.charAt(0).toUpperCase() + deduced.slice(1);
      
      const parts = k.split('.');
      if (parts.length === 2) {
        if (!frData[parts[0]]) frData[parts[0]] = {};
        frData[parts[0]][parts[1]] = deduced;
      }
    }
  }

  // 3. Write back to fr.ts
  const newContent = `// ============================================================
// TRADUCTIONS FRANÇAISES (Auto-généré et complété)
// ============================================================
export const fr = ${JSON.stringify(frData, null, 2)};
`;

  fs.writeFileSync(frFile, newContent, 'utf8');
  console.log(`Successfully updated fr.ts: Deleted ${keysToDelete.length} unused keys. Injected missing keys.`);

}).catch(e => console.error(e));
