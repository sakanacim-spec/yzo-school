'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.resolve('.github/workflows/quality.yml');

test('Workflow quality.yml : conformité structurelle et sécuritaire', () => {
  assert.ok(fs.existsSync(workflowPath), '.github/workflows/quality.yml doit exister');
  const content = fs.readFileSync(workflowPath, 'utf8');

  // 1. Déclencheurs requis
  assert.match(content, /push:\s*\n\s*branches:\s*\n\s*-\s*main/, 'Déclencheur push sur main requis');
  assert.match(content, /pull_request:\s*\n\s*branches:\s*\n\s*-\s*main/, 'Déclencheur pull_request sur main requis');
  assert.match(content, /workflow_dispatch:\s*/, 'Déclencheur workflow_dispatch requis');

  // 2. Permissions minimales
  assert.match(content, /permissions:\s*\n\s*contents:\s*read/, 'Permissions minimales contents: read requises');

  // 3. Concurrence et annulation
  assert.match(content, /cancel-in-progress:\s*true/, 'cancel-in-progress: true requis');
  assert.match(content, /concurrency:/, 'Bloc concurrency requis');

  // 4. Timeout et variables d’environnement du job
  assert.match(content, /timeout-minutes:\s*15/, 'timeout-minutes: 15 requis');
  assert.match(content, /env:\s*\n\s*CI:\s*['"]true['"]/, 'env: CI: \'true\' requis au niveau du job');

  // 5. Durcissement Checkout
  assert.match(content, /persist-credentials:\s*false/, 'Checkout durci avec persist-credentials: false');

  // 6. Prohibitions strictes de sécurité
  assert.doesNotMatch(content, /secrets\./i, 'Aucun secret applicatif ne doit être utilisé dans le workflow');
  assert.doesNotMatch(content, /pull_request_target/i, 'pull_request_target est strictement interdit');
  assert.doesNotMatch(content, /vercel/i, 'Aucune commande de déploiement Vercel');
  assert.doesNotMatch(content, /migration/i, 'Aucune étape de migration SQL');
  assert.doesNotMatch(content, /deploy/i, 'Aucune étape de déploiement');

  // 7. Étapes ordonnées et commandes conformes
  assert.match(content, /run:\s*npm\s+ci/, 'Étape installation via npm ci requise');
  assert.match(content, /run:\s*npm\s+run\s+typecheck/, 'Étape npm run typecheck requise');
  assert.match(content, /run:\s*node\s+validate-i18n\.js/, 'Étape node validate-i18n.js requise');
  assert.match(content, /run:\s*npm\s+run\s+test:ci-infrastructure/, 'Étape npm run test:ci-infrastructure requise');
  assert.match(content, /run:\s*npm\s+run\s+test:frontend/, 'Étape npm run test:frontend requise');
  assert.match(content, /run:\s*npm\s+run\s+test:backend/, 'Étape npm run test:backend requise');
  assert.match(content, /run:\s*npm\s+run\s+build/, 'Étape npm run build requise');
});
