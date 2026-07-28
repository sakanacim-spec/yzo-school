const fs = require('fs');
const path = require('path');

const frFile = 'src/i18n/fr.ts';
let frContent = fs.readFileSync(frFile, 'utf8');

// Extract the object part
const startIndex = frContent.indexOf('{');
const endIndex = frContent.lastIndexOf('}');
const jsonString = frContent.substring(startIndex, endIndex + 1);

let frObj;
try {
  // Use Function to evaluate the JS object string
  frObj = new Function(`return ${jsonString}`)();
} catch (err) {
  console.error("Failed to parse fr.ts", err);
  process.exit(1);
}

// Extract all strings
const strings = [];
function traverseAndCollect(obj, pathArr = []) {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      strings.push({ path: [...pathArr, key], text: obj[key] });
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      traverseAndCollect(obj[key], [...pathArr, key]);
    }
  }
}
traverseAndCollect(frObj);
console.log(`Found ${strings.length} strings to translate.`);

async function translateChunk(texts, tl) {
  // We can join texts with a special separator to translate in one request, or just do parallel single requests
  // Parallel single requests might trigger 429 if too fast, so let's use the special separator technique: " ||| "
  const separator = " ||| ";
  const query = texts.join(separator);
  
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=${tl}&dt=t&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    let fullTranslation = '';
    for (let i = 0; i < data[0].length; i++) {
        if (data[0][i][0]) fullTranslation += data[0][i][0];
    }
    
    return fullTranslation.split(separator).map(s => s.trim());
  } catch (err) {
    console.error("Translation error", err);
    return texts; // fallback
  }
}

async function translateToLanguage(targetLang, langObjName, outputFile) {
  console.log(`\nTranslating to ${targetLang}...`);
  const chunkSize = 25;
  const translatedStrings = [];
  
  for (let i = 0; i < strings.length; i += chunkSize) {
    const chunk = strings.slice(i, i + chunkSize).map(s => s.text);
    console.log(`  Translating chunk ${i} to ${i + chunk.length} / ${strings.length}`);
    const res = await translateChunk(chunk, targetLang);
    
    // In case splitting fails
    if (res.length !== chunk.length) {
      console.log(`  Mismatch in chunk splitting! Expected ${chunk.length}, got ${res.length}. Falling back to individual translations for this chunk...`);
      for (let j = 0; j < chunk.length; j++) {
         const singleRes = await translateChunk([chunk[j]], targetLang);
         translatedStrings.push(singleRes[0] || chunk[j]);
         await new Promise(r => setTimeout(r, 100)); // sleep
      }
    } else {
      translatedStrings.push(...res);
    }
    
    await new Promise(r => setTimeout(r, 500)); // sleep between chunks
  }
  
  // Reconstruct the object
  const newObj = JSON.parse(JSON.stringify(frObj));
  
  for (let i = 0; i < strings.length; i++) {
    const p = strings[i].path;
    let curr = newObj;
    for (let j = 0; j < p.length - 1; j++) {
      curr = curr[p[j]];
    }
    curr[p[p.length - 1]] = translatedStrings[i];
  }
  
  const tsContent = `export const ${langObjName} = ${JSON.stringify(newObj, null, 2)};\n`;
  fs.writeFileSync(outputFile, tsContent, 'utf8');
  console.log(`Successfully generated ${outputFile}`);
}

async function main() {
  await Promise.all([
    translateToLanguage('pt', 'pt', 'src/i18n/pt.ts'),
    translateToLanguage('zh-CN', 'zh', 'src/i18n/zh.ts')
  ]);
}

main().catch(console.error);
