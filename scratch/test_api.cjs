const https = require('https');

const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=en&dt=t&q=Bonjour&q=Merci';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', data));
}).on('error', err => console.log('Error:', err.message));
