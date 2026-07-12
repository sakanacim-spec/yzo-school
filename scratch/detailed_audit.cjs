const fs = require('fs');
const path = require('path');

const frFile = path.join(__dirname, '../src/i18n/fr.ts');
const srcDir = path.join(__dirname, '../src');

// 1. Get current defined keys
const frContent = fs.readFileSync(frFile, 'utf-8');
const tempPath = path.join(__dirname, 'temp_fr_detailed.js');
let jsContent = frContent.replace('export const fr =', 'export default ');
fs.writeFileSync(tempPath, jsContent);

import('file://' + tempPath).then(module => {
  const frData = module.default;
  fs.unlinkSync(tempPath);

  const definedKeys = new Set();
  for (const [ns, keys] of Object.entries(frData)) {
    for (const k of Object.keys(keys)) {
      definedKeys.add(`${ns}.${k}`);
    }
  }

  // 2. Scan all files
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
  const missingKeysMap = {}; // key -> [{file, context}]

  const tRegex = /\bt\([^,]+,\s*['"]([^'"]+)['"]/g;

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    let match;
    
    while ((match = tRegex.exec(content)) !== null) {
      const key = match[1];
      usedKeys.add(key);
      if (!definedKeys.has(key)) {
        if (!missingKeysMap[key]) missingKeysMap[key] = [];
        // find line number
        const upToMatch = content.substring(0, match.index);
        const lineNum = upToMatch.split('\n').length - 1;
        
        // Extract context: 2 lines before, the line, 2 lines after
        const contextLines = lines.slice(Math.max(0, lineNum - 2), Math.min(lines.length, lineNum + 3));
        missingKeysMap[key].push({
          file: path.basename(file),
          line: lineNum + 1,
          context: contextLines.join('\n')
        });
      }
    }
  }

  const unusedKeys = [...definedKeys].filter(k => !usedKeys.has(k));

  // Find dynamic usage
  const dynamicUsageMap = {};
  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    // Look for t(..., `prefix.${var}`) or similar
    const dynamicRegex = /t\([^,]+,\s*[`']([^`'\n\$]+)\$\{/g;
    let match;
    while ((match = dynamicRegex.exec(content)) !== null) {
      const prefix = match[1]; // e.g. "nav." or "status."
      dynamicUsageMap[prefix] = dynamicUsageMap[prefix] || [];
      dynamicUsageMap[prefix].push(path.basename(file));
    }
  }

  const report = {
    missingKeys: missingKeysMap,
    unusedKeys,
    dynamicUsageMap
  };

  fs.writeFileSync(path.join(__dirname, 'detailed_audit.json'), JSON.stringify(report, null, 2), 'utf-8');
  console.log('Detailed audit completed.');
}).catch(e => console.error(e));
