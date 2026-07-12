const fs = require('fs');
const frFile = 'src/i18n/fr.ts';
const frContent = fs.readFileSync(frFile, 'utf8');

const keys = new Set();
const duplicates = [];

// Only match keys that are at the top level: they are indented by 2 spaces
const keyRegex = /^  "([a-zA-Z0-9_]+)"\s*:/gm;
let m;
while ((m = keyRegex.exec(frContent)) !== null) {
  if (keys.has(m[1])) {
    duplicates.push(m[1]);
  } else {
    keys.add(m[1]);
  }
}

console.log("Top-level duplicate keys:", duplicates);
