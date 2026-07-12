import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frTsPath = path.join(__dirname, 'src', 'i18n', 'fr.ts');

try {
    const content = fs.readFileSync(frTsPath, 'utf8');
    const lines = content.split('\n');
    let hasError = false;

    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        
        // Check for strings ending in a backslash (encoded as \\ in the source code)
        // This matches lines like: "schoolIdentity": "Identité de l\\",
        if (line.match(/\\+"\s*(,|})/)) {
            // But wait, if it's an even number of backslashes before the quote, it's a backslash at the end of the string.
            // Actually, let's just flag any line ending with \\", because no valid translation should end with a literal backslash.
            if (line.match(/\\\\"\s*(,|})/)) {
                console.error(`[i18n VALIDATION ERROR] Truncated string (ends with \\) detected at line ${lineNumber}: ${line.trim()}`);
                hasError = true;
            }
        }

        // Check for empty string values like: "key": "",
        if (line.match(/:\s*""\s*(,|})/)) {
            console.error(`[i18n VALIDATION ERROR] Empty string value detected at line ${lineNumber}: ${line.trim()}`);
            hasError = true;
        }
    });

    if (hasError) {
        console.error("\n❌ i18n validation failed! Please fix the errors in fr.ts before building.");
        process.exit(1);
    } else {
        console.log("✅ i18n validation passed.");
    }
} catch (error) {
    console.error(`[i18n VALIDATION ERROR] Could not read ${frTsPath}:`, error.message);
    process.exit(1);
}
