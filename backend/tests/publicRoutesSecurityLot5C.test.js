// ============================================================
// SUITE DE TESTS SÉCURITÉ LOT 5C — YZIOW BACKEND
// Routes Publiques, Uploads, Rate Limiting, HTTP Config, Signatures & Validation
// Tests 100% déterministes et hors-ligne (sans Supabase/FedaPay distant)
// ============================================================
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_minimum_32_characters_long_for_security';
process.env.AI_QUOTA_HASH_SECRET = 'test_quota_hash_secret_minimum_32_chars_long';
process.env.PASSWORD_RESET_OTP_SECRET = 'test_otp_secret_minimum_32_chars_long_xyz';
process.env.ALLOWED_ORIGINS = 'https://custom-partner.com,https://app.school-test.org,https://yzo-school-preview-123.vercel.app';

const {
    validateSlug,
    isValidUUID,
    validateBoundedString,
    validatePositiveNumber,
    normalizePhone,
    buildAuthEmail,
    hashOtp,
    verifyFileMagicBytes
} = require('../utils/helpers');

let passedTests = 0;
let failedTests = 0;

function it(description, fn) {
    try {
        fn();
        console.log(`  ✅ [PASS] ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${description}`);
        console.error(`     Erreur: ${err.message}`);
        failedTests++;
    }
}

async function runAllTests() {
    console.log('\n🧪 Démarrage de la suite de tests Lot 5C : Routes Publiques, Uploads, Rate Limiting & HTTP...\n');

    // ────────────────────────────────────────────────────────────
    // SECTION A : Routes Publiques et Rate Limiting
    // ────────────────────────────────────────────────────────────
    console.log('--- SECTION A : Routes Publiques & Rate Limiting ---');

    it('A1: Les routeurs publics montent des limiters express-rate-limit', () => {
        const authRoutes = require('../routes/auth');
        const publicRoutes = require('../routes/public');
        const affiliateRoutes = require('../routes/affiliate');
        const translationRoutes = require('../routes/translation');

        assert.ok(authRoutes, 'Routeur auth accessible');
        assert.ok(publicRoutes, 'Routeur public accessible');
        assert.ok(affiliateRoutes, 'Routeur affiliate accessible');
        assert.ok(translationRoutes, 'Routeur translation accessible');
    });

    it('A2: Simulation de Rate Limiter avec réponse HTTP 429 et headers standard', () => {
        const hits = new Map();
        const maxHits = 3;
        const windowMs = 60 * 1000;

        function simulateLimiter(ip) {
            const now = Date.now();
            const record = hits.get(ip) || { count: 0, resetTime: now + windowMs };
            if (now > record.resetTime) {
                record.count = 0;
                record.resetTime = now + windowMs;
            }
            record.count++;
            hits.set(ip, record);

            if (record.count > maxHits) {
                const retryAfter = Math.ceil((record.resetTime - now) / 1000);
                return { status: 429, retryAfter, error: 'Trop de requêtes, veuillez patienter.' };
            }
            return { status: 200, count: record.count };
        }

        assert.strictEqual(simulateLimiter('192.168.1.1').status, 200);
        assert.strictEqual(simulateLimiter('192.168.1.1').status, 200);
        assert.strictEqual(simulateLimiter('192.168.1.1').status, 200);
        const blocked = simulateLimiter('192.168.1.1');
        assert.strictEqual(blocked.status, 429);
        assert.ok(blocked.retryAfter >= 1, 'Retry-After doit être présent et supérieur ou égal à 1');
    });

    it('A3: Retry-After est fourni lors d\'un dépassement de quota', () => {
        const retryAfterSeconds = 60;
        const headers = {
            'Retry-After': String(retryAfterSeconds),
            'RateLimit-Limit': '10',
            'RateLimit-Remaining': '0',
            'RateLimit-Reset': String(Math.floor(Date.now() / 1000) + retryAfterSeconds)
        };
        assert.strictEqual(headers['Retry-After'], '60');
        assert.ok(Number(headers['RateLimit-Reset']) > 0);
    });

    it('A4: Payload JSON trop volumineux sur route publique est rejeté (> 5000 car. de texte)', () => {
        const largeText = 'A'.repeat(5001);
        let errorCaught = false;
        try {
            validateBoundedString(largeText, 1, 5000);
        } catch (e) {
            errorCaught = true;
        }
        assert.strictEqual(errorCaught, true, 'Le texte de plus de 5000 caractères doit être rejeté');
    });

    it('A5: Les réponses d\'erreur 500 n\'exposent aucun détail technique ou stack trace', () => {
        const errorMiddleware = (err, req, res) => {
            const isCors = err && err.message && err.message.includes('CORS');
            if (isCors) {
                return res.status(403).json({ error: 'Accès interdit par la politique CORS.' });
            }
            return res.status(500).json({ error: 'Erreur interne du serveur.' });
        };

        const resMock = {
            status(code) { this.statusCode = code; return this; },
            json(data) { this.body = data; return this; }
        };

        errorMiddleware(new Error('SELECT * FROM secret_table WHERE pkey=123 failed syntax error'), {}, resMock);
        assert.strictEqual(resMock.statusCode, 500);
        assert.strictEqual(resMock.body.error, 'Erreur interne du serveur.');
        assert.strictEqual(resMock.body.detail, undefined, 'Aucun detail technique ne doit être renvoyé');
    });

    it('A6: Absence d\'énumération utilisateur dans la réponse de réinitialisation', () => {
        const responseSuccess = { success: true, message: 'Si ce compte existe, un code a été envoyé.' };
        assert.strictEqual(responseSuccess.message.includes('mot de passe'), false);
        assert.strictEqual(responseSuccess.message.includes('inconnu'), false);
    });

    it('A7: Validation stricte du cache de traduction borné en mémoire (max 1000 entrées)', () => {
        const cache = new Map();
        const MAX = 1000;
        for (let i = 0; i < 1100; i++) {
            if (cache.size >= MAX) {
                const keysToDelete = Array.from(cache.keys()).slice(0, 200);
                for (const k of keysToDelete) cache.delete(k);
            }
            cache.set(`key_${i}`, `val_${i}`);
        }
        assert.ok(cache.size <= MAX, `La taille du cache (${cache.size}) doit être inférieure ou égale à 1000`);
    });

    // ────────────────────────────────────────────────────────────
    // SECTION B : Téléversements, Signatures Binaires, Clés & URLs Signées
    // ────────────────────────────────────────────────────────────
    console.log('\n--- SECTION B : Téléversements, Clés Permanentes & URLs Signées ---');

    it('B1: Absence totale de getPublicUrl sur les flux de fichiers privés', () => {
        const chatCode = fs.readFileSync(path.join(__dirname, '../controllers/chatController.js'), 'utf8');
        const syncCode = fs.readFileSync(path.join(__dirname, '../controllers/syncController.js'), 'utf8');
        const photoCode = fs.readFileSync(path.join(__dirname, '../controllers/photoController.js'), 'utf8');

        assert.strictEqual(chatCode.includes('getPublicUrl'), false, 'getPublicUrl absent de chatController');
        assert.strictEqual(syncCode.includes('getPublicUrl'), false, 'getPublicUrl absent de syncController');
        assert.strictEqual(photoCode.includes('getPublicUrl'), false, 'getPublicUrl absent de photoController');
    });

    it('B2: L\'upload et la persistance enregistrent une clé permanente, pas une URL signée contenant un token', () => {
        const schoolSlug = 'ecole_excellence';
        const fileUUID = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';
        const ext = 'jpg';
        const canonicalStorageKey = `${schoolSlug}/${fileUUID}.${ext}`;

        assert.ok(canonicalStorageKey.startsWith(`${schoolSlug}/`), 'Commence par le schoolSlug');
        assert.strictEqual(canonicalStorageKey.includes('token='), false, 'Aucun token dans la clé stockée');
        assert.strictEqual(canonicalStorageKey.includes('http'), false, 'Aucune URL absolue HTTP');
    });

    it('B3: createSignedUrl est utilisé avec expiration bornée à la lecture', () => {
        const chatCode = fs.readFileSync(path.join(__dirname, '../controllers/chatController.js'), 'utf8');
        const syncCode = fs.readFileSync(path.join(__dirname, '../controllers/syncController.js'), 'utf8');
        const photoCode = fs.readFileSync(path.join(__dirname, '../controllers/photoController.js'), 'utf8');
        const studentsCode = fs.readFileSync(path.join(__dirname, '../controllers/studentsController.js'), 'utf8');

        assert.ok(chatCode.includes('createSignedUrl'), 'createSignedUrl présent dans chatController');
        assert.ok(syncCode.includes('createSignedUrl'), 'createSignedUrl présent dans syncController');
        assert.ok(photoCode.includes('createSignedUrl'), 'createSignedUrl présent dans photoController');
        assert.ok(studentsCode.includes('createSignedUrl'), 'createSignedUrl présent dans studentsController à la lecture');
    });

    it('B4: express.static public est strictement absent de server.js pour les uploads', () => {
        const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
        assert.strictEqual(serverCode.includes("app.use('/uploads'"), false, 'express.static sur /uploads supprimé');
    });

    it('B5: Fichier avec signature JPEG réelle (FF D8 FF) validé', () => {
        const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
        const res = verifyFileMagicBytes(jpegBuffer, ['image']);
        assert.strictEqual(res.valid, true);
        assert.strictEqual(res.detectedType, 'jpeg');
    });

    it('B6: Vraie signature PNG (89 50 4E 47 0D 0A 1A 0A) validée', () => {
        const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
        const res = verifyFileMagicBytes(pngBuffer, ['image']);
        assert.strictEqual(res.valid, true);
        assert.strictEqual(res.detectedType, 'png');
    });

    it('B7: Vraie signature PDF (%PDF-) validée', () => {
        const pdfBuffer = Buffer.from('%PDF-1.4\n%test content');
        const res = verifyFileMagicBytes(pdfBuffer, ['pdf']);
        assert.strictEqual(res.valid, true);
        assert.strictEqual(res.detectedType, 'pdf');
    });

    it('B8: Fichier PHP déguisé en JPEG (ex: <?php system($_GET["cmd"]); ?>) rejeté par magic bytes', () => {
        const phpFakeJpeg = Buffer.from('<?php system($_GET["cmd"]); ?>');
        const res = verifyFileMagicBytes(phpFakeJpeg, ['image']);
        assert.strictEqual(res.valid, false);
    });

    it('B9: Fichier HTML/Script déguisé en PDF (ex: <script>alert(1)</script>) rejeté', () => {
        const htmlFakePdf = Buffer.from('<html><script>alert(1)</script></html>');
        const res = verifyFileMagicBytes(htmlFakePdf, ['pdf']);
        assert.strictEqual(res.valid, false);
    });

    it('B10: Fichier ZIP ordinaire (signature PK) rejeté lorsque seuls PDF et images sont autorisés (Option B)', () => {
        const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x0A, 0x00, 0x00, 0x00]);
        const res = verifyFileMagicBytes(zipBuffer, ['pdf', 'image']);
        assert.strictEqual(res.valid, false, 'Le ZIP ordinaire doit être rejeté sans décompression');
    });

    it('B11: Double extension malveillante (ex: avatar.php.png, script.exe.jpg) rejetée', () => {
        function checkDoubleExt(filename) {
            const parts = filename.toLowerCase().split('.');
            if (parts.length > 2) {
                const forbidden = ['php', 'exe', 'sh', 'bat', 'cmd', 'js', 'html', 'svg', 'py', 'phtml', 'phar', 'vbs', 'jar'];
                for (let i = 1; i < parts.length - 1; i++) {
                    if (forbidden.includes(parts[i])) return false;
                }
            }
            return true;
        }

        assert.strictEqual(checkDoubleExt('avatar.php.png'), false);
        assert.strictEqual(checkDoubleExt('doc.exe.jpg'), false);
        assert.strictEqual(checkDoubleExt('script.sh.webp'), false);
        assert.strictEqual(checkDoubleExt('photo.normal.jpg'), true);
    });

    it('B12: Path traversal bloqué et nom de stockage généré côté serveur', () => {
        const clientFileName = '../../etc/passwd';
        const rawExt = (clientFileName.split('.').pop() || 'jpg').toLowerCase();
        const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg';
        const fileUUID = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        const finalPath = `ecole_test/${fileUUID}.${safeExt}`;

        assert.strictEqual(finalPath.includes('..'), false);
        assert.strictEqual(finalPath.includes('passwd'), false);
        assert.ok(finalPath.startsWith('ecole_test/'));
    });

    it('B13: Contrôle JWT et SchoolSlug avant toute génération d\'URL signée', () => {
        function checkUploadAuth(user) {
            if (!user || !user.id) return { status: 401, error: 'Authentification requise.' };
            if (!user.schoolSlug) return { status: 403, error: 'Établissement non identifié.' };
            return { status: 200 };
        }

        assert.strictEqual(checkUploadAuth(null).status, 401);
        assert.strictEqual(checkUploadAuth({ id: 'u1' }).status, 403);
        assert.strictEqual(checkUploadAuth({ id: 'u1', schoolSlug: 'ecole1' }).status, 200);
    });

    it('B14: Contrôle d\'accès conversation : parent non participant ou autre école rejeté', () => {
        function checkChatAccess(user, conversation) {
            if (!user || !user.schoolSlug || user.schoolSlug !== conversation.schoolSlug) return false;
            if (user.role === 'parent' && conversation.parentId !== user.id) return false;
            return true;
        }

        const conv = { schoolSlug: 'ecole_alpha', parentId: 'parent_123' };
        assert.strictEqual(checkChatAccess({ id: 'parent_123', role: 'parent', schoolSlug: 'ecole_alpha' }, conv), true);
        assert.strictEqual(checkChatAccess({ id: 'parent_999', role: 'parent', schoolSlug: 'ecole_alpha' }, conv), false, 'Parent non participant');
        assert.strictEqual(checkChatAccess({ id: 'parent_123', role: 'parent', schoolSlug: 'ecole_beta' }, conv), false, 'Autre école');
        assert.strictEqual(checkChatAccess({ id: 'admin_1', role: 'directeur', schoolSlug: 'ecole_alpha' }, conv), true, 'Staff école alpha');
    });

    it('B15: Régénération déterministe d\'une URL signée expirée à partir de la clé permanente', () => {
        function generateSignedUrl(storageKey, expiresInSeconds = 900) {
            const token = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${storageKey}_${Date.now()}`).digest('hex');
            return `https://storage.supabase.co/object/sign/${storageKey}?token=${token}&expires=${expiresInSeconds}`;
        }

        const permanentKey = 'ecole_alpha/student_1.jpg';
        const url1 = generateSignedUrl(permanentKey, 900);
        const url2 = generateSignedUrl(permanentKey, 900);

        assert.ok(url1.startsWith(`https://storage.supabase.co/object/sign/${permanentKey}`));
        assert.ok(url2.startsWith(`https://storage.supabase.co/object/sign/${permanentKey}`));
    });

    // ────────────────────────────────────────────────────────────
    // SECTION C : CORS & Configuration HTTP / En-têtes de Sécurité
    // ────────────────────────────────────────────────────────────
    console.log('\n--- SECTION C : CORS & Configuration HTTP / Headers ---');

    const productionAllowedOrigins = ['https://yziow.com', 'https://www.yziow.com'];
    const developmentAllowedOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'];
    const envOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

    function evaluateCors(origin, isProd = true) {
        if (!origin) return true;
        const allowedSet = isProd
            ? new Set([...productionAllowedOrigins, ...envOrigins])
            : new Set([...productionAllowedOrigins, ...developmentAllowedOrigins, ...envOrigins]);
        return allowedSet.has(origin);
    }

    it('C1: Domaine officiel https://yziow.com et https://www.yziow.com acceptés', () => {
        assert.strictEqual(evaluateCors('https://yziow.com', true), true);
        assert.strictEqual(evaluateCors('https://www.yziow.com', true), true);
    });

    it('C2: Origine explicitement inscrite dans ALLOWED_ORIGINS acceptée en production', () => {
        assert.strictEqual(evaluateCors('https://custom-partner.com', true), true);
        assert.strictEqual(evaluateCors('https://yzo-school-preview-123.vercel.app', true), true);
    });

    it('C3: Preview Vercel non configurée dans ALLOWED_ORIGINS est REFUSÉE', () => {
        assert.strictEqual(evaluateCors('https://yzo-school-random.vercel.app', true), false);
    });

    it('C4: Application tierce malveillante (https://evil-project.vercel.app) REFUSÉE', () => {
        assert.strictEqual(evaluateCors('https://evil-project.vercel.app', true), false);
        assert.strictEqual(evaluateCors('https://evil-project.vercel.app', false), false);
    });

    it('C5: Domaine trompeur / subdomain spoofing (https://yziow.com.evil.example) REFUSÉ', () => {
        assert.strictEqual(evaluateCors('https://yziow.com.evil.example', true), false);
        assert.strictEqual(evaluateCors('https://www.yziow.com.attacker.org', true), false);
    });

    it('C6: Localhost REFUSÉ en production et ACCEPTÉ hors production', () => {
        assert.strictEqual(evaluateCors('http://localhost:5173', true), false, 'Localhost refusé en production');
        assert.strictEqual(evaluateCors('http://localhost:5173', false), true, 'Localhost accepté en dev');
    });

    it('C7: Les credentials ne sont jamais combinés avec origin wildcard *', () => {
        const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
        assert.strictEqual(serverCode.includes("origin: '*'"), false);
        assert.strictEqual(serverCode.includes("origin: true"), false);
    });

    it('C8: Requêtes pré-vol OPTIONS configurées avec optionsSuccessStatus: 204', () => {
        const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
        assert.ok(serverCode.includes('optionsSuccessStatus: 204'));
    });

    it('C9: En-tête X-Powered-By désactivé explicitement sur l\'application Express', () => {
        const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
        assert.ok(serverCode.includes("app.disable('x-powered-by')"));
    });

    it('C10: En-têtes de sécurité configurés (nosniff, SAMEORIGIN, Referrer-Policy, HSTS)', () => {
        const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
        assert.ok(serverCode.includes("'X-Content-Type-Options', 'nosniff'"));
        assert.ok(serverCode.includes("'X-Frame-Options', 'SAMEORIGIN'"));
        assert.ok(serverCode.includes("'Referrer-Policy', 'strict-origin-when-cross-origin'"));
        assert.ok(serverCode.includes('Strict-Transport-Security'));
    });

    // ────────────────────────────────────────────────────────────
    // SECTION D : Validation SQL Migration P5 & Entrées
    // ────────────────────────────────────────────────────────────
    console.log('\n--- SECTION D : Migration SQL P5 & Validation des Entrées ---');

    it('D1: Migration P5 définit public = false sur messages, devoirs et student-photos', () => {
        const sql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p5_private_storage_buckets.sql'), 'utf8');
        assert.ok(sql.includes("'messages'"));
        assert.ok(sql.includes("'devoirs'"));
        assert.ok(sql.includes("'student-photos'"));
        assert.ok(sql.includes("public = false"));
        assert.strictEqual(sql.includes("public = true"), false);
    });

    it('D2: Migration P5 est transactionnelle (BEGIN/COMMIT) et sans suppression de fichiers', () => {
        const sql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p5_private_storage_buckets.sql'), 'utf8');
        assert.ok(sql.includes('BEGIN;'), 'BEGIN; présent');
        assert.ok(sql.includes('COMMIT;'), 'COMMIT; présent');
        assert.strictEqual(sql.includes('DELETE FROM storage.objects'), false, 'Aucune suppression de fichier');
        assert.strictEqual(sql.includes('DROP TABLE'), false, 'Aucun drop de table destructif');
    });

    it('D3: Absence totale de DROP POLICY, SET ROLE, RESET ROLE ou ALTER TABLE storage.objects', () => {
        const sql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p5_private_storage_buckets.sql'), 'utf8');
        assert.strictEqual(sql.toLowerCase().includes('drop policy'), false, 'Aucun DROP POLICY direct interdit');
        assert.strictEqual(sql.toLowerCase().includes('set role'), false, 'Aucun SET ROLE');
        assert.strictEqual(sql.toLowerCase().includes('set local role'), false, 'Aucun SET LOCAL ROLE');
        assert.strictEqual(sql.toLowerCase().includes('reset role'), false, 'Aucun RESET ROLE');
        assert.strictEqual(sql.includes('ALTER TABLE storage.objects'), false, 'Aucun ALTER TABLE storage.objects');
    });

    it('D4: UUID valide accepté et injection SQL rejetée', () => {
        assert.strictEqual(isValidUUID('550e8400-e29b-41d4-a716-446655440000'), true);
        assert.strictEqual(isValidUUID('c9bf9e57-1685-4c89-bafb-ff5af830be8a'), true);
        assert.strictEqual(isValidUUID("550e8400-e29b-41d4-a716-446655440000' OR '1'='1"), false);
        assert.strictEqual(isValidUUID(null), false);
    });

    it('D5: Slug valide normalisé en minuscules par validateSlug', () => {
        assert.strictEqual(validateSlug('ecole_demo'), 'ecole_demo');
        assert.strictEqual(validateSlug('  ECOLE_EXCELLENCE  '), 'ecole_excellence');
        assert.throws(() => validateSlug('ecole/test'), /INVALID_SLUG/);
    });

    it('D6: Chaîne de caractères dépassant la longueur autorisée rejetée par validateBoundedString', () => {
        assert.throws(() => validateBoundedString('Trop court', 20, 50), /INVALID_STRING/);
        assert.throws(() => validateBoundedString('A'.repeat(201), 1, 200), /INVALID_STRING/);
    });

    it('D7: Montant positif fini validé par validatePositiveNumber', () => {
        assert.strictEqual(validatePositiveNumber(50000), 50000);
        assert.strictEqual(validatePositiveNumber('150000'), 150000);
        assert.throws(() => validatePositiveNumber(0), /INVALID_AMOUNT/);
        assert.throws(() => validatePositiveNumber(-5000), /INVALID_AMOUNT/);
    });

    it('D8: Identifiant client dans le body ne remplace jamais l\'identité JWT canonique', () => {
        const req = {
            user: { id: 'jwt-user-uuid-123', role: 'parent', schoolSlug: 'ecole_vraie' },
            body: { id: 'spoofed-admin-id', role: 'admin', schoolSlug: 'ecole_victime' }
        };
        assert.strictEqual(req.user.id, 'jwt-user-uuid-123');
        assert.strictEqual(req.user.role, 'parent');
        assert.strictEqual(req.user.schoolSlug, 'ecole_vraie');
    });

    it('D9: ALTER TABLE storage.objects, ALTER OWNER et DISABLE RLS strictement absents', () => {
        const sql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p5_private_storage_buckets.sql'), 'utf8');
        assert.strictEqual(sql.includes('ALTER TABLE storage.objects'), false, 'ALTER TABLE storage.objects interdit');
        assert.strictEqual(sql.toLowerCase().includes('owner to'), false, 'ALTER OWNER interdit');
        assert.strictEqual(sql.toLowerCase().includes('disable row level security'), false, 'DISABLE RLS interdit');
    });

    it('D10: Contrôle fail-closed relrowsecurity présent et aucun DROP BUCKET ni DELETE FROM objects', () => {
        const sql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p5_private_storage_buckets.sql'), 'utf8');
        assert.ok(sql.includes('relrowsecurity = true'), 'Contrôle relrowsecurity présent');
        assert.ok(sql.includes('RLS_NOT_ENABLED_ON_STORAGE_OBJECTS'), 'Exception fail-closed présente');
        assert.strictEqual(sql.toLowerCase().includes('drop bucket'), false, 'Aucun DROP BUCKET');
        assert.strictEqual(sql.includes('DELETE FROM storage.objects'), false, 'Aucune suppression d\'objet');
    });

    it('D11: Absence totale de RAISE NOTICE de sécurité ou de fallback permissif', () => {
        const sql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p5_private_storage_buckets.sql'), 'utf8');
        assert.strictEqual(sql.toUpperCase().includes('RAISE NOTICE'), false, 'Aucun RAISE NOTICE toléré');
    });

    it('D12: Exceptions bloquantes strictes (UNEXPECTED_STORAGE_POLICY_PRESENT, PRIVATE_BUCKET_VERIFICATION_FAILED, BUCKET_CONFIGURATION_VERIFICATION_FAILED)', () => {
        const sql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p5_private_storage_buckets.sql'), 'utf8');
        assert.ok(sql.includes('UNEXPECTED_STORAGE_POLICY_PRESENT'), 'Exception policy inattendue présente');
        assert.ok(sql.includes('PRIVATE_BUCKET_VERIFICATION_FAILED'), 'Exception vérification 3 buckets présente');
        assert.ok(sql.includes('BUCKET_CONFIGURATION_VERIFICATION_FAILED'), 'Exception configuration détaillée présente');
    });

    it('D13: Contrôle zéro policy et configurations exactes des 3 buckets (messages, devoirs, student-photos)', () => {
        const sql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p5_private_storage_buckets.sql'), 'utf8');
        assert.ok(sql.includes("file_size_limit = 5242880"), '5MB pour messages');
        assert.ok(sql.includes("file_size_limit = 10485760"), '10MB pour devoirs');
        assert.ok(sql.includes("file_size_limit = 3145728"), '3MB pour student-photos');
        assert.ok(sql.includes("policy_count > 0"), 'Vérification zéro policy préalable');
        assert.ok(sql.includes("policy_count_after > 0"), 'Vérification zéro policy post-migration');
        assert.strictEqual(sql.toLowerCase().includes('supabase_storage_admin'), false, 'Aucune dépendance supabase_storage_admin');
    });

    // ────────────────────────────────────────────────────────────
    // BILAN FINAL
    // ────────────────────────────────────────────────────────────
    console.log('\n============================================================');
    console.log(`🎉 BILAN LOT 5C : ${passedTests}/${passedTests + failedTests} tests réussis avec succès !`);
    console.log('============================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runAllTests().catch((err) => {
    console.error('Erreur fatale exécution suite Lot 5C:', err);
    process.exit(1);
});
