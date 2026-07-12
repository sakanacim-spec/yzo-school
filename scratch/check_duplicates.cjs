const fs = require('fs');

const frFile = 'src/i18n/fr.ts';
const frContent = fs.readFileSync(frFile, 'utf8');

const keys = new Set();
const duplicates = [];

const keyRegex = /^\s*"([a-zA-Z0-9_]+)"\s*:/gm;
let m;
while ((m = keyRegex.exec(frContent)) !== null) {
  if (keys.has(m[1])) {
    duplicates.push(m[1]);
  } else {
    keys.add(m[1]);
  }
}

console.log("Duplicate keys:", duplicates);
