const fs = require('fs');
const path = require('path');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      getAllFiles(path.join(dir, file), fileList);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const frFile = 'src/i18n/fr.ts';
const frContent = fs.readFileSync(frFile, 'utf8');

// Parse frContent crudely to find keys
// A simple way to check if a key exists is just to check if `"keyPart"` exists
// But let's build a map
let frKeys = new Set();
const keyRegex = /"([a-zA-Z0-9_]+)"\s*:/g;
let m;
while ((m = keyRegex.exec(frContent)) !== null) {
  frKeys.add(m[1]);
}

const files = getAllFiles('src');
let missingKeys = new Set();

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/t\(\s*[^,]+,\s*['"]([^'"]+)['"]/g) || [];
  matches.forEach(match => {
    const fullKey = match.match(/['"]([^'"]+)['"]/)[1];
    const keyPart = fullKey.split('.').pop();
    
    // Check if keyPart is in frKeys (or if it exists as a string in the file)
    if (!frKeys.has(keyPart) && !frContent.includes(`"${keyPart}"`) && !frContent.includes(`'${keyPart}'`)) {
      missingKeys.add(fullKey);
    }
  });
});

console.log("Missing keys:");
console.log(Array.from(missingKeys).sort().join('\n'));
