const https = require('https');

function fetchGtx(text) {
  return new Promise(resolve => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data)[0][0][0]);
        } catch(e) { resolve('error'); }
      });
    }).on('error', () => resolve('error'));
  });
}

async function run() {
  const start = Date.now();
  const promises = [];
  for(let i=0; i<30; i++) {
    promises.push(fetchGtx('Bonjour ' + i));
  }
  const results = await Promise.all(promises);
  console.log('Time:', Date.now() - start, 'ms');
  console.log('Results:', results.length, 'Errors:', results.filter(r => r === 'error').length);
}
run();
