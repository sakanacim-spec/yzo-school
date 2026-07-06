fetch('https://yziow.com/')
  .then(r => r.text())
  .then(html => {
    const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (m) return fetch('https://yziow.com' + m[1]).then(r => r.text());
    else throw 'no bundle';
  })
  .then(js => {
    console.log('Contains fallback:', js.includes("Une erreur s'est produite lors de la création de votre compte."));
    const idx = js.indexOf("Une erreur s'est produite lors de la création de votre compte.");
    if(idx !== -1) console.log('Surrounding code:', js.slice(Math.max(0, idx-100), idx+150));
  })
  .catch(console.error);
