const fs = require('fs');

const files = [
  'src/components/Login.tsx',
  'src/components/Register.tsx',
  'src/components/ParentRegister.tsx',
  'src/components/ForgotPassword.tsx'
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');

  // absolute positioning
  c = c.replace(/absolute left-4/g, 'absolute start-4');
  c = c.replace(/absolute right-4/g, 'absolute end-4');
  c = c.replace(/absolute left-3/g, 'absolute start-3');
  c = c.replace(/absolute right-3/g, 'absolute end-3');
  c = c.replace(/absolute left-5/g, 'absolute start-5');
  c = c.replace(/absolute right-5/g, 'absolute end-5');
  
  // padding
  c = c.replace(/!pl-12/g, '!ps-12');
  c = c.replace(/pr-10/g, 'pe-10');
  c = c.replace(/pr-11/g, 'pe-11');
  c = c.replace(/pr-4/g, 'pe-4');
  c = c.replace(/pl-10/g, 'ps-10');
  c = c.replace(/pl-4/g, 'ps-4');
  c = c.replace(/pl-2/g, 'ps-2');
  c = c.replace(/pr-2/g, 'pe-2');

  // margins
  c = c.replace(/ml-2/g, 'ms-2');
  c = c.replace(/mr-2/g, 'me-2');
  c = c.replace(/ml-3/g, 'ms-3');
  c = c.replace(/mr-3/g, 'me-3');
  c = c.replace(/ml-4/g, 'ms-4');
  c = c.replace(/mr-4/g, 'me-4');

  // text alignment
  c = c.replace(/text-left/g, 'text-start');
  c = c.replace(/text-right/g, 'text-end');

  fs.writeFileSync(f, c, 'utf8');
});

console.log('RTL layout fixes applied.');
