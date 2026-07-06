const fs = require('fs');

['fr', 'en', 'es', 'ar'].forEach(lang => {
    const f = 'src/i18n/' + lang + '.ts';
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace('},\\n\\n  // Auth — Login', '},\n\n  // Auth — Login');
    fs.writeFileSync(f, c, 'utf8');
});
console.log('Fixed newlines');
