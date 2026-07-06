const fs = require('fs');
const lines = fs.readFileSync('tsc-errors.txt', 'utf8').split('\n');
const files = new Set();
lines.forEach(l => {
  if (l.includes("Cannot find name 't'") || l.includes("Cannot find name 'Language'") || l.includes("Cannot find name 'T'")) {
    const match = l.match(/^(.+?)\(/);
    if (match) files.add(match[1]);
  }
});
console.log(Array.from(files).join('\n'));
