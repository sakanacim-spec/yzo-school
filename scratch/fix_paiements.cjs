const fs = require('fs');
const file = 'src/pages/Paiements.tsx';
let f = fs.readFileSync(file, 'utf8');
f = f.replace(/'payments\.totalReceived'/g, "'finance.totalReceived'");
f = f.replace(/'payments\.remainingToRecover'/g, "'finance.remaining'");
fs.writeFileSync(file, f, 'utf8');
console.log('Fixed Paiements.tsx');
