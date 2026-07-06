const fs = require('fs');
const path = require('path');

const lines = fs.readFileSync('tsc-errors.txt', 'utf8').split('\n');
const files = new Set();
lines.forEach(l => {
  if (l.includes("Cannot find name 't'") || l.includes("Cannot find name 'Language'") || l.includes("Cannot find name 'T'")) {
    const match = l.match(/^(.+?)\(/);
    if (match) files.add(match[1]);
  }
});

files.forEach(f => {
    const filePath = path.resolve(__dirname, f);
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Calculate relative path to src
    const relativePath = path.relative(path.join(__dirname, 'src'), filePath);
    const depth = relativePath.split(path.sep).length - 1;
    const prefix = '../'.repeat(depth);
    
    const i18nImport = `import { t } from '${prefix}i18n';`;
    const typeImport = `import type { Language } from '${prefix}types';`;

    if (!content.includes(i18nImport)) {
        // Find last import statement
        const lines = content.split('\n');
        let lastImportIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('import ')) {
                lastImportIndex = i;
            }
        }
        
        if (lastImportIndex !== -1) {
            lines.splice(lastImportIndex + 1, 0, i18nImport);
            changed = true;
            content = lines.join('\n');
        } else {
            content = i18nImport + '\n' + content;
            changed = true;
        }
    }

    if (!content.includes(typeImport)) {
        const lines = content.split('\n');
        let lastImportIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('import ')) {
                lastImportIndex = i;
            }
        }
        if (lastImportIndex !== -1) {
            lines.splice(lastImportIndex + 1, 0, typeImport);
            changed = true;
            content = lines.join('\n');
        }
    }
    
    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed imports in', f);
    }
});
