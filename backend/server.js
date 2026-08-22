// ============================================================
// SERVEUR PRINCIPAL — EduFinance Backend (Version Supabase)
// ============================================================
'use strict';
const path = require('path');
const fs = require('fs');

const rootEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(rootEnvPath)) {
    require('dotenv').config({ path: rootEnvPath, quiet: true });
}

const requiredVariables = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET', 'AI_QUOTA_HASH_SECRET', 'PASSWORD_RESET_OTP_SECRET'];
const missingVariables = requiredVariables.filter(name => !process.env[name]);

if (missingVariables.length > 0) {
    console.error('VARIABLE_ABSENTE');
    process.exitCode = 1;
    throw new Error('VARIABLE_ABSENTE');
}

// Validation stricte de AI_QUOTA_HASH_SECRET (longueur minimale 32 caractères)
const hashSecret = process.env.AI_QUOTA_HASH_SECRET;
if (!hashSecret || typeof hashSecret !== 'string' || hashSecret.trim().length < 32) {
    console.error('CONFIGURATION_INVALIDE: AI_QUOTA_HASH_SECRET doit comporter au moins 32 caractères.');
    process.exitCode = 1;
    throw new Error('CONFIGURATION_INVALIDE');
}

// Validation stricte de PASSWORD_RESET_OTP_SECRET (longueur minimale 32 caractères)
const otpSecret = process.env.PASSWORD_RESET_OTP_SECRET;
if (!otpSecret || typeof otpSecret !== 'string' || otpSecret.trim().length < 32) {
    console.error('CONFIGURATION_INVALIDE: PASSWORD_RESET_OTP_SECRET doit comporter au moins 32 caractères.');
    process.exitCode = 1;
    throw new Error('CONFIGURATION_INVALIDE');
}

// Validation stricte au démarrage de AI_GLOBAL_DAILY_LIMIT
if (process.env.AI_GLOBAL_DAILY_LIMIT !== undefined && process.env.AI_GLOBAL_DAILY_LIMIT !== null && process.env.AI_GLOBAL_DAILY_LIMIT !== '') {
    const rawLimit = String(process.env.AI_GLOBAL_DAILY_LIMIT).trim();
    if (!/^\d+$/.test(rawLimit)) {
        console.error('CONFIGURATION_INVALIDE: AI_GLOBAL_DAILY_LIMIT doit être un entier strict.');
        process.exitCode = 1;
        throw new Error('CONFIGURATION_INVALIDE');
    }
    const numLimit = Number(rawLimit);
    if (!Number.isSafeInteger(numLimit) || numLimit < 1 || numLimit > 100000) {
        console.error('CONFIGURATION_INVALIDE: AI_GLOBAL_DAILY_LIMIT doit être compris entre 1 et 100000.');
        process.exitCode = 1;
        throw new Error('CONFIGURATION_INVALIDE');
    }
}

const express = require('express');
const cors = require('cors');
const { supabase } = require('./utils/supabase');

const { PORT } = require('./config');

// ── Application Express ───────────────────────────────────────
const app = express();

// Désactiver la bannière X-Powered-By
app.disable('x-powered-by');

// Configuration explicite du proxy (Vercel / reverse-proxy depth = 1)
app.set('trust proxy', 1);

// ── En-têtes de Sécurité HTTP ─────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');

    // Strict-Transport-Security en production HTTPS
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Content-Security-Policy permissive mais protectrice pour les ressources légitimes
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.sheetjs.com https://unpkg.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com data:; " +
        "img-src 'self' data: blob: https:; " +
        "connect-src 'self' https://*.supabase.co https://api.groq.com https://generativelanguage.googleapis.com https://translation.googleapis.com https://api.mymemory.translated.net https://api.fedapay.com https://sandbox-api.fedapay.com; " +
        "frame-ancestors 'self';"
    );

    next();
});

// ── Configuration CORS Sécurisée ──────────────────────────────
const productionAllowedOrigins = [
    'https://yziow.com',
    'https://www.yziow.com'
];

const developmentAllowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
];

const envAllowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];

const baseAllowedOrigins = process.env.NODE_ENV === 'production'
    ? productionAllowedOrigins
    : [...productionAllowedOrigins, ...developmentAllowedOrigins];

const allowedOriginsSet = new Set([...baseAllowedOrigins, ...envAllowedOrigins]);

const corsOptions = {
    origin: (origin, callback) => {
        // Autorise les requêtes sans Origin (applications mobiles Capacitor, requêtes internes, curl)
        if (!origin) return callback(null, true);

        if (allowedOriginsSet.has(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Origine non autorisée par la politique de sécurité CORS.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Parseurs JSON pré-instanciés
const webhookJsonParser = express.json({
    limit: '256kb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    }
});

const globalJsonParser = express.json({
    limit: '2mb'
});

// Sélecteur de parseur JSON : limite dédiée 256 KB pour le webhook, 2 MB pour les autres routes
app.use((req, res, next) => {
    const pathname = (req.originalUrl ? req.originalUrl.split('?')[0] : req.path) || '';
    if (req.method === 'POST' && pathname === '/api/payment/webhook') {
        return webhookJsonParser(req, res, next);
    }
    return globalJsonParser(req, res, next);
});

app.use(express.urlencoded({ extended: false, limit: '512kb' }));

// Logger simple des requêtes
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// ── Routes API ────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/parent', require('./routes/parent'));
app.use('/api/students', require('./routes/students'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/assistant', require('./routes/assistant')); // 🤖 IA Assistant
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/translate', require('./routes/translation'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/support', require('./routes/support'));
app.use('/api/personnel', require('./routes/personnel'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/donations', require('./routes/donation')); // 🎁 Levée de fonds (Dons)
app.use('/api/withdrawals', require('./routes/withdrawal')); // 💳 Retrait de fonds (Dons)
app.use('/api/superadmin', require('./routes/superAdmin')); // 👑 Routes propriétaire SaaS
app.use('/api/affiliate', require('./routes/affiliate')); // 🤝 Routes pour les apporteurs d'affaires
app.use('/api/public', require('./routes/public')); // 🌍 Routes publiques (Formulaires)

// Route publique pour lister les écoles dans le login
app.get('/api/schools', async (req, res) => {
    try {
        const { data: schools, error } = await supabase
            .from('schools')
            .select('slug, name')
            .in('status', ['active', 'trial'])
            .order('name');
        if (error) throw error;
        res.json(schools);
    } catch (err) {
        res.status(500).json({ error: 'Erreur récupération écoles' });
    }
});

// ── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        backend: 'online',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// ── Service du Frontend (Static Files) ───────────────────────
// On pointe vers le dossier 'dist' à la racine du projet
const frontendDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));

    // Pour toutes les autres routes, on renvoie index.html (React Router)
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(frontendDir, 'index.html'));
        }
    });
}

// ── Gestion globale des erreurs ───────────────────────────────
app.use((err, req, res, _next) => {
    if (err && err.message && err.message.includes('CORS')) {
        return res.status(403).json({ error: 'Accès interdit par la politique CORS.' });
    }
    console.error('❌ Erreur serveur:', err.message || err);
    res.status(err.status || 500).json({ error: 'Erreur interne du serveur.' });
});

// ── Démarrage ─────────────────────────────────────────────────
if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🚀 Yziow Backend démarré`);
        console.log(`${'='.repeat(60)}`);
        console.log(`📡 Serveur: http://localhost:${PORT}`);
        console.log(`🛡️  Base de données: Supabase PostgreSQL`);
        console.log(`🔑 Auth: JWT ${process.env.JWT_SECRET ? '(configuré)' : '(DÉFAUT)'}`);
        console.log(`📁 Node env: ${process.env.NODE_ENV || 'development'}`);
        console.log(`💬 Routes actives: /api/auth, /api/parent, /api/students, /api/sync, /api/chat, /api/notifications, /api/announcements`);
        console.log(`🏥 Health check: /api/health`);
        console.log(`${'='.repeat(60)}\n`);
    });

    // Gestion des erreurs de démarrage
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ Le port ${PORT} est déjà utilisé. Utilisez un autre port.`);
        } else {
            console.error(`❌ Erreur au démarrage du serveur:`, err);
        }
        process.exit(1);
    });
}

module.exports = app;
