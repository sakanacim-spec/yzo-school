const fs = require('fs');
const path = require('path');

function walk(d){
    let r=[];
    fs.readdirSync(d).forEach(f=>{
        const p=path.join(d,f);
        if(fs.statSync(p).isDirectory()) r=r.concat(walk(p));
        else if(p.endsWith('.ts')||p.endsWith('.tsx')) r.push(p);
    });
    return r;
}

const files = walk('./src');
let count = 0;

files.forEach(f => {
    let c = fs.readFileSync(f, 'utf8');
    let original = c;

    // 1. Remove duplicate useStore imports
    const lines = c.split('\n');
    const useStoreImports = [];
    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('import { useStore }') || lines[i].includes('import {useStore}')) {
            if (useStoreImports.length > 0) {
                // Skip duplicate
                continue;
            }
            useStoreImports.push(lines[i]);
        }
        
        // Also remove duplicate notificationService imports
        if (lines[i].includes('import { notificationService }')) {
            if (newLines.find(l => l.includes('import { notificationService }'))) continue;
        }

        newLines.push(lines[i]);
    }
    c = newLines.join('\n');

    // 2. Fix Language import
    c = c.replace(/import type \{ Language \} from '.*types';/g, (match) => {
        const relativePath = path.relative(path.join(__dirname, 'src'), f);
        const depth = relativePath.split(path.sep).length - 1;
        const prefix = '../'.repeat(depth);
        return `import type { Language } from '${prefix}i18n';`;
    });

    if (c !== original) {
        fs.writeFileSync(f, c, 'utf8');
        count++;
        console.log('Fixed', f);
    }
});
console.log('Total fixed:', count);
