const fs = require('fs');
const path = require('path');

const frFile = path.join(__dirname, '../src/i18n/fr.ts');
const missingKeysFile = path.join(__dirname, 'missing_keys_utf8.json');

const frContent = fs.readFileSync(frFile, 'utf-8');
const missingKeys = JSON.parse(fs.readFileSync(missingKeysFile, 'utf-8'));

// We need to parse the existing fr.ts export.
// The easiest way is to require it. Since it's TS, we can just run it through a quick regex or use eval if we replace `export const fr = `
let jsContent = frContent.replace('export const fr =', 'module.exports =');
// Handle any other exports if present
const tempPath = path.join(__dirname, 'temp_fr.js');
// Add export default so dynamic import works easily
jsContent = jsContent.replace('module.exports =', 'export default');
fs.writeFileSync(tempPath, jsContent);

import('file://' + tempPath).then(module => {
  let existingData = module.default;

  // Deep merge
  for (const [namespace, keys] of Object.entries(missingKeys)) {
    if (!existingData[namespace]) {
      existingData[namespace] = {};
    }
    for (const [key, value] of Object.entries(keys)) {
      if (!existingData[namespace][key]) {
        existingData[namespace][key] = value;
      }
    }
  }

  const newFrContent = `// ============================================================
// TRADUCTIONS FRANÇAISES (Auto-généré et complété)
// ============================================================
export const fr = ${JSON.stringify(existingData, null, 2)};
`;

  fs.writeFileSync(frFile, newFrContent, 'utf-8');
  console.log('Successfully merged missing keys into fr.ts');
  fs.unlinkSync(tempPath);
}).catch(e => {
  console.error("Failed", e);
});
