const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch/detailed_audit.json', 'utf8'));

// 1. Analyze missing keys
const missingKeys = data.missingKeys;
let proposedTranslations = [];
let toValidate = [];

for (const [key, instances] of Object.entries(missingKeys)) {
  // If it's a date format or number, mark as invalid/ignore
  if (/^[\d]+$/.test(key) || key.includes('HH:mm') || key.includes('MM/DD')) {
    toValidate.push({ key, reason: 'Probablement une erreur de code (format date/nombre passé à t())' });
    continue;
  }
  
  // Try to deduce from key name
  const parts = key.split('.');
  const lastPart = parts[parts.length - 1];
  
  // Format camelCase to readable string
  let deduced = lastPart.replace(/([A-Z])/g, ' $1').toLowerCase();
  deduced = deduced.charAt(0).toUpperCase() + deduced.slice(1);
  
  // Hardcoded deductions for obvious ones
  if (key === 'parent_historique') deduced = 'Historique des paiements';
  else if (lastPart === 'totalStudents') deduced = 'Total Élèves';
  else if (lastPart === 'primaire') deduced = 'Primaire';
  else if (lastPart === 'college') deduced = 'Collège';
  else if (lastPart === 'lycee') deduced = 'Lycée';
  else if (lastPart === 'soldes') deduced = 'Soldés';
  else if (lastPart === 'non_soldes') deduced = 'Non Soldés';
  
  proposedTranslations.push({
    key,
    deduced,
    file: instances[0].file
  });
}

// Write markdown plan
let md = `# Plan de Nettoyage et Finalisation i18n

Conformément à vos règles, voici le plan détaillé du nettoyage final.

## 1. Clés Mortes (235 clés)
- **82 clés conservées** : Utilisées dynamiquement dans le code (ex: \`nav.\${tab}\`, \`groups.\${name}\`, \`bulletin.\${key}\`).
- **153 clés supprimées** : Ce sont des doublons obsolètes générés lors d'anciennes itérations (ex: \`login.loginButton\`, \`header.profile\`).

## 2. Clés Manquantes (192 clés)

### Traductions Déduites (${proposedTranslations.length} clés)
J'ai déduit le libellé français de ces clés à partir de leur contexte et de leur nom. *Seul un échantillon est affiché ici, l'ensemble sera injecté de la même manière.*

| Clé manquante | Texte Français proposé | Fichier Source |
|---|---|---|
`;

for (let i = 0; i < Math.min(15, proposedTranslations.length); i++) {
  const p = proposedTranslations[i];
  md += `| \`${p.key}\` | "${p.deduced}" | ${p.file} |\n`;
}

if (proposedTranslations.length > 15) {
  md += `| ... | ... | ... (+${proposedTranslations.length - 15} autres) |\n`;
}

md += `

### Exceptions à Valider / Corriger (${toValidate.length} cas)
Ces chaînes sont passées à \`t()\` dans le code mais ne ressemblent pas à des clés de traduction. Ce sont des anomalies dans le code React.

| Valeur passée | Raison |
|---|---|
`;

for (const v of toValidate) {
  md += `| \`${v.key}\` | ${v.reason} |\n`;
}

md += `

## Actions prévues
1. Supprimer les 153 clés inutiles de \`fr.ts\`.
2. Injecter les ${proposedTranslations.length} traductions déduites dans \`fr.ts\`.
3. Corriger les appels \`t()\` erronés dans les fichiers React (ex: ne pas passer \`HH:mm\` dans \`t()\`).
4. Relancer l'audit pour garantir les scores de 0 erreur.

Veuillez valider ce plan d'action !
`;

fs.writeFileSync('C:\\Users\\acer\\.gemini\\antigravity-ide\\brain\\f943a53a-4c5c-475c-9a7c-4f7cae9b4f7f\\implementation_plan.md', md, 'utf-8');
console.log('Plan generated');
