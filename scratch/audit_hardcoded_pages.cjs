const fs = require('fs');
const path = require('path');

function checkFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  let hardcoded = [];
  lines.forEach((line, i) => {
    // very basic check: text inside > < that contains letters
    const textMatch = line.match(/>([^<]+)</g);
    if (textMatch) {
      for (const m of textMatch) {
        const text = m.slice(1, -1).trim();
        // Ignore if it's empty, just a number, or just symbols
        if (text.length > 2 && /[a-zA-ZÀ-ÿ]/.test(text) && !text.includes('{') && !line.includes('t(')) {
          hardcoded.push(`Line ${i + 1}: ${text}`);
        }
      }
    }
  });
  if (hardcoded.length > 0) {
    console.log(`\n--- Hardcoded text in ${file} ---`);
    console.log(hardcoded.join('\n'));
  }
}

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      getAllFiles(path.join(dir, file), fileList);
    } else if (file.endsWith('.tsx')) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const filesToAudit = getAllFiles('src/pages');
filesToAudit.forEach(checkFile);
