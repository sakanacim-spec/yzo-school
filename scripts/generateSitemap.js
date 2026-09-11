#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 * SCRIPT DE GÉNÉRATION ET VÉRIFICATION DÉTERMINISTE DU SITEMAP XML — YZIOW V1
 * ============================================================================
 * Source de vérité unique : backend/data/publicKnowledgeRegistry.js
 * Articles de blog publiés : src/content/blog/postsData.json
 *
 * Utilisation :
 *   node scripts/generateSitemap.js          (Génère public/sitemap.xml)
 *   node scripts/generateSitemap.js --verify (Vérifie la conformité sans modifier)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

// Import du registre centralisé
import {
    CANONICAL_DOMAIN,
    buildValidatedRegistry,
    validateKnowledgeEntry
} from '../backend/data/publicKnowledgeRegistry.js';

// Lecture directe et stable de la source de vérité des articles (compatible Node 18, 20, 22, 24)
const blogPostsPath = path.resolve(workspaceRoot, 'src/content/blog/postsData.json');
export const BLOG_POSTS = JSON.parse(fs.readFileSync(blogPostsPath, 'utf8'));


/**
 * Transforme les articles de blog publiés en entrées du registre conformes.
 */
export function buildBlogKnowledgeEntries(posts = BLOG_POSTS) {
    const published = (posts || []).filter(p => p && p.status === 'published');
    return published.map(p => {
        const route = `/blog/${p.slug}`;
        return {
            route,
            title: p.title,
            language: p.language || 'fr',
            summary: p.excerpt || p.title,
            contentValidated: p.content,
            keywords: p.tags && p.tags.length > 0 ? p.tags : ['blog', 'yziow'],
            canonicalUrl: `${CANONICAL_DOMAIN}${route}`,
            publicationStatus: 'published',
            updatedAt: p.publishedAt || '2026-08-27',
            version: '1.0',
            sitemap: {
                include: true,
                changefreq: 'monthly',
                priority: '0.7'
            }
        };
    });
}

/**
 * Construit l'ensemble complet des entrées validées pour le sitemap.
 */
export function getFullRegistry() {
    const blogEntries = buildBlogKnowledgeEntries(BLOG_POSTS);
    return buildValidatedRegistry(blogEntries);
}

/**
 * Produit le document XML déterministe à partir du registre validé.
 */
export function generateSitemapXml(registry = getFullRegistry()) {
    const sitemapEntries = registry
        .filter(entry => entry.sitemap && entry.sitemap.include && entry.publicationStatus === 'published')
        .sort((a, b) => {
            // Racine en premier, puis ordre alphabétique de la route
            if (a.route === '/') return -1;
            if (b.route === '/') return 1;
            return a.route.localeCompare(b.route);
        });

    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ];

    for (const entry of sitemapEntries) {
        lines.push('  <url>');
        lines.push(`    <loc>${entry.canonicalUrl}</loc>`);
        lines.push(`    <lastmod>${entry.updatedAt}</lastmod>`);
        lines.push(`    <changefreq>${entry.sitemap.changefreq}</changefreq>`);
        lines.push(`    <priority>${entry.sitemap.priority}</priority>`);
        lines.push('  </url>');
    }

    lines.push('</urlset>');
    lines.push(''); // Ligne finale propre

    return lines.join('\n');
}

/**
 * Exécution principale en CLI.
 */
async function main() {
    const isVerify = process.argv.includes('--verify');
    const sitemapPath = path.resolve(workspaceRoot, 'public/sitemap.xml');

    const expectedXml = generateSitemapXml();

    if (isVerify) {
        if (!fs.existsSync(sitemapPath)) {
            console.error('❌ ERREUR: Le fichier public/sitemap.xml est introuvable.');
            process.exit(1);
        }

        const currentXml = fs.readFileSync(sitemapPath, 'utf-8').replace(/\r\n/g, '\n');
        const normalizedExpected = expectedXml.replace(/\r\n/g, '\n');

        if (currentXml !== normalizedExpected) {
            console.error('❌ DÉSYNCHRONISATION: public/sitemap.xml n\'est pas synchronisé avec le registre public.');
            process.exit(1);
        }

        console.log('✅ VALIDATION: public/sitemap.xml est parfaitement synchronisé et conforme.');
        process.exit(0);
    }

    fs.writeFileSync(sitemapPath, expectedXml, 'utf-8');
    console.log(`✅ SUCCÈS: public/sitemap.xml généré avec succès (${getFullRegistry().length} entrées validées).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch(err => {
        console.error('❌ Erreur lors de la génération du sitemap:', err);
        process.exit(1);
    });
}
