const fs = require('fs');
const path = require('path');

const frFile = path.join(__dirname, '../src/i18n/fr.ts');
const srcDir = path.join(__dirname, '../src');

// 1. Read fr.ts using regex to extract all keys
const frContent = fs.readFileSync(frFile, 'utf-8');
const tempPath = path.join(__dirname, 'temp_fr_audit.js');
let jsContent = frContent.replace('export const fr =', 'export default ');
fs.writeFileSync(tempPath, jsContent);

import('file://' + tempPath).then(module => {
  const frData = module.default;
  fs.unlinkSync(tempPath);

  let totalKeys = 0;
  const definedKeys = new Set();
  const valueMap = {};
  const duplicates = [];

  function flattenKeys(obj, prefix = '') {
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        totalKeys++;
        definedKeys.add(fullKey);
        if (!valueMap[v]) valueMap[v] = [];
        valueMap[v].push(fullKey);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        flattenKeys(v, fullKey);
      }
    }
  }

  flattenKeys(frData);

  for (const [val, keys] of Object.entries(valueMap)) {
  if (keys.length > 1 && val.length > 3) {
    duplicates.push({ value: val, keys });
  }
}

// 2. Scan all TSX/TS files for t() calls and hardcoded text
function walkSync(dir, filelist = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      filelist = walkSync(filepath, filelist);
    } else if (filepath.endsWith('.tsx') || filepath.endsWith('.ts')) {
      filelist.push(filepath);
    }
  }
  return filelist;
}

const allFiles = walkSync(srcDir);
const usedKeys = new Set();
const missingKeys = new Set();
let hardcodedFragments = [];

const tRegex = /t\([^,]+,\s*['"]([^'"]+)['"]/g;
// Regex for text outside JSX tags. Rough approximation: >TEXT<
const hardcodedRegex = />([^<{}]+)</g;

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  
  // Find t()
  while ((match = tRegex.exec(content)) !== null) {
    const key = match[1];
    usedKeys.add(key);
    if (!definedKeys.has(key)) {
      missingKeys.add(key);
    }
  }
  
  // Find hardcoded text in JSX
  if (file.endsWith('.tsx')) {
      while ((match = hardcodedRegex.exec(content)) !== null) {
        let text = match[1].trim();
        if (text.length > 1 && /[a-zA-Z]{2,}/.test(text) && !text.includes('t(')) {
          // Exclude some false positives (e.g., F for FCFA, basic symbols)
          hardcodedFragments.push({ file: path.basename(file), text });
        }
      }
  }
}

const unusedKeys = [...definedKeys].filter(k => !usedKeys.has(k));

const report = {
  totalKeys,
  duplicatesCount: duplicates.length,
  duplicatesSample: duplicates.slice(0, 5),
  unusedKeysCount: unusedKeys.length,
  unusedKeysSample: unusedKeys.slice(0, 10),
  missingKeysCount: missingKeys.size,
  missingKeysSample: [...missingKeys].slice(0, 10),
  hardcodedCount: hardcodedFragments.length,
  hardcodedSample: hardcodedFragments.slice(0, 10)
};

console.log(JSON.stringify(report, null, 2));
}).catch(e => console.error(e));
