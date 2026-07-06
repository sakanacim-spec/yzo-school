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

    content = content.replace(/import\s*\{\s*t\s*\}\s*from\s*'((?:\.\.\/)+)i18n';/g, (match, p1) => {
        // If the file is in src/pages/parent, it should be ../../i18n
        // Let's just calculate the depth based on the file path relative to src
        const relativePath = path.relative(path.join(__dirname, 'src'), file);
        const depth = relativePath.split(path.sep).length - 1;
        const correctPrefix = '../'.repeat(depth);
        return `import { t } from '${correctPrefix}i18n';`;
    });
    
    // Also fix useStore imports that might have been messed up similarly
    content = content.replace(/import\s*\{\s*useStore\s*\}\s*from\s*'((?:\.\.\/)+)store\/useStore';/g, (match, p1) => {
        const relativePath = path.relative(path.join(__dirname, 'src'), file);
        const depth = relativePath.split(path.sep).length - 1;
        const correctPrefix = '../'.repeat(depth);
        return `import { useStore } from '${correctPrefix}store/useStore';`;
    });

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        changed++;
        console.log('Fixed imports in', file);
    }
}
console.log('Total files fixed:', changed);
