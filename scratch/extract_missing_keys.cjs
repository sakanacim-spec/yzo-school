const fs = require('fs');
const path = require('path');

const frFile = path.join(__dirname, '../src/i18n/fr.ts');
let frContent = fs.readFileSync(frFile, 'utf-8');

// A very naive AST or regex parsing to find all t(..., 'key') || 'Fallback'
const glob = require('glob'); // Not available? We'll write a simple walk
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

const files = [
  ...walkSync(path.join(__dirname, '../src/pages')),
  ...walkSync(path.join(__dirname, '../src/components'))
];

const regex = /t\([^,]+,\s*['"]([^'"]+)['"](?:[^)]*)\)\s*\|\|\s*(['"])(.*?)\2/g;
const missingKeys = {};

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = regex.exec(content)) !== null) {
    const fullKey = match[1];
    const fallbackStr = match[3];
    
    // Check if key exists in frContent
    // This is a basic check.
    const [namespace, key] = fullKey.split('.');
    
    if (!missingKeys[namespace]) missingKeys[namespace] = {};
    missingKeys[namespace][key] = fallbackStr;
  }
}

console.log(JSON.stringify(missingKeys, null, 2));
