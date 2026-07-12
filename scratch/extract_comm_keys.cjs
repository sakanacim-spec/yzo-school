const fs = require('fs');

const frFile = 'src/i18n/fr.ts';
const frContent = fs.readFileSync(frFile, 'utf8');

const targetFiles = [
  'src/pages/Communication.tsx',
  'src/components/ChatWindow.tsx',
  'src/components/ChatList.tsx',
  'src/components/NewMessageModal.tsx'
];

targetFiles.forEach(file => {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/t\(\s*[^,]+,\s*['"]([^'"]+)['"]/g) || [];
  
  matches.forEach(m => {
    const key = m.match(/['"]([^'"]+)['"]/)[1];
    // Check if key is in frContent
    const keyPart = key.split('.').pop();
    if (!frContent.includes(`"${keyPart}"`) && !frContent.includes(`'${keyPart}'`)) {
      console.log(`${file}: Key NOT FOUND in fr.ts -> ${key}`);
    } else {
       // console.log(`${file}: Key found -> ${key}`);
    }
  });
});
