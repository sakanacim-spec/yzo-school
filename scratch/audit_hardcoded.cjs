const fs = require('fs');
const path = require('path');

const filesToAudit = [
  'src/pages/Communication.tsx',
  'src/components/ChatWindow.tsx',
  'src/components/ChatList.tsx',
  'src/components/NewMessageModal.tsx'
];

filesToAudit.forEach(file => {
  const filepath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  
  console.log(`\n--- Hardcoded text in ${file} ---`);
  
  // A simple heuristic to find text outside tags or within attributes that should be translated
  lines.forEach((line, i) => {
    // skip if line has t(
    if (line.includes('t(')) return;
    
    // Look for plain text between tags >text<
    const textMatch = line.match(/>([^<]+)</g);
    if (textMatch) {
      for (const m of textMatch) {
        const text = m.slice(1, -1).trim();
        if (text.length > 2 && /[a-zA-ZÀ-ÿ]/.test(text) && !text.includes('{')) {
          console.log(`Line ${i + 1}: ${text}`);
        }
      }
    }
    
    // Look for placeholders placeholder="Text"
    const placeholderMatch = line.match(/placeholder=["']([^"']+)["']/i);
    if (placeholderMatch) {
      const text = placeholderMatch[1].trim();
      if (text.length > 2 && /[a-zA-ZÀ-ÿ]/.test(text) && !text.includes('{')) {
        console.log(`Line ${i + 1} (placeholder): ${text}`);
      }
    }
  });
});
