const fs = require('fs');
const path = require('path');

function walk(d) {
    let r = [];
    fs.readdirSync(d).forEach(f => {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) r = r.concat(walk(p));
        else if (p.endsWith('.tsx') || p.endsWith('.ts')) r.push(p);
    });
    return r;
}

const files = walk('./src');
const extracted = {};

files.forEach(f => {
    const c = fs.readFileSync(f, 'utf8');
    const matches = [...c.matchAll(/t\([^,]+,\s*'([^']+)'\)\s*\|\|\s*(['"])(.*?)\2/g)];
    matches.forEach(m => {
        const key = m[1];
        const fallback = m[3];
        if (key.startsWith('auth.') || key.startsWith('login.') || key.startsWith('register.') || key.startsWith('common.')) {
            extracted[key] = fallback;
        }
    });
});

console.log(JSON.stringify(extracted, null, 2));
