const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(path.join(__dirname, 'src'));

let changed = 0;
for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    content = content.replace(/import\s*\{\s*useLanguage\s*\}\s*from\s*'(\.\.\/)*contexts\/LanguageContext';/g, (match, p1) => {
        return `import { useStore } from '${p1 || ''}store/useStore';`;
    });
    
    content = content.replace(/useLanguage\(\)/g, 'useStore()');

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        changed++;
        console.log('Fixed', file);
    }
}
console.log('Total files fixed:', changed);
