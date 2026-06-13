// ============================================================
// SERVEUR PRINCIPAL — EduFinance Backend (Version Supabase)
// ============================================================
'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { supabase } = require('./utils/supabase');

const { PORT } = require('./config');

// ── Créer les dossiers nécessaires ───────────────────────────
const uploadsDir = path.join(__dirname, 'uploads', 'messages');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Application Express ───────────────────────────────────────
const app = express();

// Middleware globaux
app.use(cors({
    origin: '*', // Plus flexible pour le dév, à restreindre en prod
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/personnel', require('./routes/personnel'));
app.use('/api/superadmin', require('./routes/superAdmin')); // 👑 Routes propriétaire SaaS

// Route publique pour lister les écoles dans le login
app.get('/api/schools', async (req, res) => {
    try {
        const { data: schools, error } = await supabase
            .from('schools')
            .select('slug, name, logo_url')
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
    console.error('❌ Erreur serveur:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur.', detail: err.message });
});

// ── Démarrage ─────────────────────────────────────────────────
const server = app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 GestioSchool Backend démarré`);
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
