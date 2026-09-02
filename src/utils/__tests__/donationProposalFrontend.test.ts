// Tests des fonctions frontend donation et contact de partnerApplication.ts
// Exécution : node --experimental-strip-types --test src/utils/__tests__/donationProposalFrontend.test.ts
// Dépendances : node:test, node:assert/strict uniquement.
// Aucune requête réseau réelle n'est émise durant ces tests.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDonationProposalPayload,
  resolvePartnerSubmissionEndpoint,
  validateDonationProposalSuccessResponse,
  submitDonationProposal,
  submitPartnerContact,
} from '../partnerApplication.ts';
import type {
  PartnerApplicationData,
  PartnerMessageLabels,
} from '../partnerApplication.ts';

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const VALID_REF = 'DON-2026-ABCDEFGH';

function baseValidData(): PartnerApplicationData {
  return {
    fullName: '  Jane Doe  ',
    role: 'Directrice',
    companyName: 'ONG Exemple',
    sector: 'telecom',
    subSector: '',
    regulationDeclaration: '',
    otherSectorDetails: '',
    organizationType: '',
    intent: 'donation_sponsorship',
    supportType: 'future_financial_donation',
    license: '',
    country: 'FR',
    targetMarkets: 'Afrique de l\u0027Ouest',
    email: 'jane@example.com',
    phone: '+33612345678',
    website: 'https://example.com',
    selectedFormula: '',
    projectDescription: 'Description du projet.',
    consent: true,
  };
}

const baseLabels: PartnerMessageLabels = {
  formulaName: 'Formule Visibilité',
  sectorLabel: 'Télécoms & Fournisseurs d\u0027accès',
  subSectorLabel: undefined,
  organizationTypeLabel: undefined,
  intentLabel: 'Demande de partenariat YZIOW',
  supportTypeLabel: undefined,
  regulationDeclarationLabel: undefined,
};

// ---------------------------------------------------------------------------
// 1. buildDonationProposalPayload — structure, clés & exclusions
// ---------------------------------------------------------------------------

test('buildDonationProposalPayload — exactement 13 clés avec website valide hors mobility_services', () => {
  const payload = buildDonationProposalPayload(baseValidData(), 'fr');
  assert.strictEqual(Object.keys(payload).length, 13);
});

test('buildDonationProposalPayload — pas de clé intent', () => {
  const payload = buildDonationProposalPayload(baseValidData(), 'fr');
  assert.equal('intent' in payload, false);
});

test('buildDonationProposalPayload — pas de clé selectedFormula', () => {
  const payload = buildDonationProposalPayload(baseValidData(), 'fr');
  assert.equal('selectedFormula' in payload, false);
});

test('buildDonationProposalPayload — pas de clé structuredMessage', () => {
  const payload = buildDonationProposalPayload(baseValidData(), 'fr');
  assert.equal('structuredMessage' in payload, false);
});

test('buildDonationProposalPayload — liste exacte des 13 clés attendues avec website hors mobility_services', () => {
  const EXPECTED_KEYS = [
    'fullName', 'role', 'companyName', 'sector',
    'supportType', 'country', 'targetMarkets',
    'email', 'phone', 'website', 'projectDescription', 'language', 'consent',
  ];
  const payload = buildDonationProposalPayload(baseValidData(), 'fr');
  const keys = Object.keys(payload).sort();
  assert.deepStrictEqual(keys, EXPECTED_KEYS.sort());
});

test('buildDonationProposalPayload — aucune valeur undefined dans le payload', () => {
  const payload = buildDonationProposalPayload(baseValidData(), 'fr') as Record<string, unknown>;
  for (const [key, val] of Object.entries(payload)) {
    assert.notStrictEqual(val, undefined, `Clé "${key}" ne doit pas être undefined`);
  }
});

test('buildDonationProposalPayload — absence de mutation sur l\u0027objet d\u0027entrée', () => {
  const data = baseValidData();
  const snapshot = JSON.stringify(data);
  buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(JSON.stringify(data), snapshot);
});

// ---------------------------------------------------------------------------
// 2. buildDonationProposalPayload — omission conditionnelle des champs facultatifs obsolètes
// ---------------------------------------------------------------------------

test('subSector est omis si sector !== mobility_services même avec valeur résiduelle', () => {
  const data = baseValidData();
  data.sector = 'telecom';
  data.subSector = 'transport'; // valeur obsolète
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.subSector, undefined);
  assert.strictEqual('subSector' in payload, false);
});

test('subSector conservé et trimmé si sector === mobility_services', () => {
  const data = baseValidData();
  data.sector = 'mobility_services';
  data.subSector = '  transport  ';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.subSector, 'transport');
});

test('regulationDeclaration est omis si sector !== other même avec valeur résiduelle', () => {
  const data = baseValidData();
  data.sector = 'finance';
  data.regulationDeclaration = 'yes'; // valeur résiduelle
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.regulationDeclaration, undefined);
  assert.strictEqual('regulationDeclaration' in payload, false);
});

test('otherSectorDetails est omis si sector !== other même avec valeur résiduelle', () => {
  const data = baseValidData();
  data.sector = 'finance';
  data.otherSectorDetails = 'Détails résiduels';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.otherSectorDetails, undefined);
  assert.strictEqual('otherSectorDetails' in payload, false);
});

test('regulationDeclaration et otherSectorDetails conservés si sector === other', () => {
  const data = baseValidData();
  data.sector = 'other';
  data.regulationDeclaration = 'yes';
  data.otherSectorDetails = '  Activité de conseil  ';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.regulationDeclaration, 'yes');
  assert.strictEqual(payload.otherSectorDetails, 'Activité de conseil');
});

test('organizationType est omis si sector !== ngo_institutions même avec valeur résiduelle', () => {
  const data = baseValidData();
  data.sector = 'telecom';
  data.organizationType = 'foundation'; // résiduel
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.organizationType, undefined);
  assert.strictEqual('organizationType' in payload, false);
});

test('organizationType conservé si sector === ngo_institutions', () => {
  const data = baseValidData();
  data.sector = 'ngo_institutions';
  data.organizationType = 'foundation';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.organizationType, 'foundation');
});

test('license est omise si secteur non réglementé (telecom) même avec licence saisie', () => {
  const data = baseValidData();
  data.sector = 'telecom';
  data.license = 'LIC-999';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.license, undefined);
  assert.strictEqual('license' in payload, false);
});

test('license conservée et trimmée si secteur réglementé (finance)', () => {
  const data = baseValidData();
  data.sector = 'finance';
  data.license = '  AGR-12345  ';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.license, 'AGR-12345');
});

test('license est omise si secteur mobility_services avec sous-secteur non réglementé (transport)', () => {
  const data = baseValidData();
  data.sector = 'mobility_services';
  data.subSector = 'transport';
  data.license = 'LIC-123';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.license, undefined);
  assert.strictEqual('license' in payload, false);
});

test('license conservée si secteur mobility_services avec sous-secteur réglementé (insurance)', () => {
  const data = baseValidData();
  data.sector = 'mobility_services';
  data.subSector = 'insurance';
  data.license = 'INS-888';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.license, 'INS-888');
});

test('website vide ou composé d\u0027espaces est omis du payload', () => {
  const data = baseValidData();
  data.website = '   ';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.website, undefined);
  assert.strictEqual('website' in payload, false);
});

test('website non-vide est trimmé', () => {
  const data = baseValidData();
  data.website = '  https://example.com/don  ';
  const payload = buildDonationProposalPayload(data, 'fr');
  assert.strictEqual(payload.website, 'https://example.com/don');
});

test('tous les champs textuels obligatoires sont trimmés', () => {
  const data = baseValidData();
  data.fullName = '  Jane Doe  ';
  data.role = '  Directrice  ';
  data.companyName = '  ONG Solidarité  ';
  data.country = '  FR  ';
  data.targetMarkets = '  Afrique de l\u0027Ouest  ';
  data.email = '  jane@example.com  ';
  data.phone = '  +33612345678  ';
  data.projectDescription = '  Projet éducatif majeur.  ';
  const payload = buildDonationProposalPayload(data, '  fr  ');

  assert.strictEqual(payload.fullName, 'Jane Doe');
  assert.strictEqual(payload.role, 'Directrice');
  assert.strictEqual(payload.companyName, 'ONG Solidarité');
  assert.strictEqual(payload.country, 'FR');
  assert.strictEqual(payload.targetMarkets, 'Afrique de l\u0027Ouest');
  assert.strictEqual(payload.email, 'jane@example.com');
  assert.strictEqual(payload.phone, '+33612345678');
  assert.strictEqual(payload.projectDescription, 'Projet éducatif majeur.');
  assert.strictEqual(payload.language, 'fr');
});

test('consent reste un booléen strict', () => {
  const data = baseValidData();
  data.consent = true;
  assert.strictEqual(buildDonationProposalPayload(data, 'fr').consent, true);
});

// ---------------------------------------------------------------------------
// 3. resolvePartnerSubmissionEndpoint
// ---------------------------------------------------------------------------

test('donation_sponsorship → /api/public/donation-proposals', () => {
  assert.strictEqual(
    resolvePartnerSubmissionEndpoint('donation_sponsorship'),
    '/api/public/donation-proposals'
  );
});

test('commercial_partnership → /api/public/contact', () => {
  assert.strictEqual(
    resolvePartnerSubmissionEndpoint('commercial_partnership'),
    '/api/public/contact'
  );
});

test('institutional_partnership → /api/public/contact', () => {
  assert.strictEqual(
    resolvePartnerSubmissionEndpoint('institutional_partnership'),
    '/api/public/contact'
  );
});

// ---------------------------------------------------------------------------
// 4. validateDonationProposalSuccessResponse (Politique A : Stricte à 3 clés)
// ---------------------------------------------------------------------------

test('Politique A — réponse 201 avec exactement { id, reference, status } → true', () => {
  const validBody = { id: VALID_UUID, reference: VALID_REF, status: 'pending' };
  assert.strictEqual(validateDonationProposalSuccessResponse(validBody), true);
});

test('Politique A — champ supplémentaire rejeté (stricte 3 clés)', () => {
  const bodyWithExtra = {
    id: VALID_UUID,
    reference: VALID_REF,
    status: 'pending',
    extraField: 'unexpected',
  };
  assert.strictEqual(validateDonationProposalSuccessResponse(bodyWithExtra), false);
});

test('Politique A — null → false', () => {
  assert.strictEqual(validateDonationProposalSuccessResponse(null), false);
});

test('Politique A — tableau → false', () => {
  assert.strictEqual(
    validateDonationProposalSuccessResponse([{ id: VALID_UUID, reference: VALID_REF, status: 'pending' }]),
    false
  );
});

test('Politique A — chaîne ou nombre → false', () => {
  assert.strictEqual(validateDonationProposalSuccessResponse('ok'), false);
  assert.strictEqual(validateDonationProposalSuccessResponse(201), false);
});

test('Politique A — clé id manquante → false', () => {
  assert.strictEqual(
    validateDonationProposalSuccessResponse({ reference: VALID_REF, status: 'pending' }),
    false
  );
});

test('Politique A — id non-UUID → false', () => {
  assert.strictEqual(
    validateDonationProposalSuccessResponse({ id: 'not-a-valid-uuid', reference: VALID_REF, status: 'pending' }),
    false
  );
});

test('Politique A — id UUID v1 (au lieu de v4) → false', () => {
  // UUID version 1
  assert.strictEqual(
    validateDonationProposalSuccessResponse({ id: 'a1b2c3d4-e5f6-1a7b-8c9d-0e1f2a3b4c5d', reference: VALID_REF, status: 'pending' }),
    false
  );
});

test('Politique A — clé reference manquante → false', () => {
  assert.strictEqual(
    validateDonationProposalSuccessResponse({ id: VALID_UUID, status: 'pending' }),
    false
  );
});

test('Politique A — reference ne respecte pas le pattern DON-AAAA-XXXXXXXX → false', () => {
  assert.strictEqual(
    validateDonationProposalSuccessResponse({ id: VALID_UUID, reference: 'DON-2024-ABC', status: 'pending' }),
    false
  );
});

test('Politique A — reference contenant 0 ou 1 (caractères exclus du charset) → false', () => {
  assert.strictEqual(
    validateDonationProposalSuccessResponse({ id: VALID_UUID, reference: 'DON-2026-ABCDEF01', status: 'pending' }),
    false
  );
});

test('Politique A — clé status manquante → false', () => {
  assert.strictEqual(
    validateDonationProposalSuccessResponse({ id: VALID_UUID, reference: VALID_REF }),
    false
  );
});

test('Politique A — status différent de "pending" → false', () => {
  assert.strictEqual(
    validateDonationProposalSuccessResponse({ id: VALID_UUID, reference: VALID_REF, status: 'completed' }),
    false
  );
  assert.strictEqual(
    validateDonationProposalSuccessResponse({ id: VALID_UUID, reference: VALID_REF, status: 'PENDING' }),
    false
  );
});

// ---------------------------------------------------------------------------
// 5. submitDonationProposal — tests d'orchestration avec fetch mocké (zéro réseau)
// ---------------------------------------------------------------------------

test('submitDonationProposal — appel URL, méthode, en-têtes et payload 18 clés exacts', async () => {
  let capturedUrl = '';
  let capturedOptions: RequestInit | undefined;

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedOptions = init;
    return new Response(JSON.stringify({ id: VALID_UUID, reference: VALID_REF, status: 'pending' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const data = baseValidData();
  const res = await submitDonationProposal(data, 'fr', {
    apiUrl: 'https://api.test.local',
    fetchFn: mockFetch,
  });

  assert.strictEqual(res.outcome, 'success');
  assert.strictEqual(capturedUrl, 'https://api.test.local/api/public/donation-proposals');
  assert.strictEqual(capturedOptions?.method, 'POST');
  assert.deepStrictEqual(capturedOptions?.headers, { 'Content-Type': 'application/json' });

  const sentBody = JSON.parse(String(capturedOptions?.body));
  assert.strictEqual(Object.keys(sentBody).length, 13);
  assert.strictEqual('subSector' in sentBody, false);
  assert.strictEqual('regulationDeclaration' in sentBody, false);
  assert.strictEqual('otherSectorDetails' in sentBody, false);
  assert.strictEqual('organizationType' in sentBody, false);
  assert.strictEqual('license' in sentBody, false);
  assert.strictEqual(sentBody.fullName, 'Jane Doe');
  assert.strictEqual(sentBody.language, 'fr');
  assert.strictEqual(sentBody.consent, true);
});

test('submitDonationProposal — 201 valide → outcome success avec data typée', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ id: VALID_UUID, reference: VALID_REF, status: 'pending' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const res = await submitDonationProposal(baseValidData(), 'fr', { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'success');
  if (res.outcome === 'success') {
    assert.strictEqual(res.data.id, VALID_UUID);
    assert.strictEqual(res.data.reference, VALID_REF);
    assert.strictEqual(res.data.status, 'pending');
  }
});

test('submitDonationProposal — 201 malformé (champs en trop ou mauvais UUID) → outcome error', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ id: 'bad-uuid', reference: VALID_REF, status: 'pending' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const res = await submitDonationProposal(baseValidData(), 'fr', { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'error');
});

test('submitDonationProposal — 201 avec JSON non-parsable → outcome error', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response('<html>502 Bad Gateway</html>', {
      status: 201,
      headers: { 'Content-Type': 'text/html' },
    });
  };

  const res = await submitDonationProposal(baseValidData(), 'fr', { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'error');
});

test('submitDonationProposal — 400 validation error → outcome validation_error', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: 'VALIDATION_FAILED', field: 'email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const res = await submitDonationProposal(baseValidData(), 'fr', { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'validation_error');
});

test('submitDonationProposal — 429 rate limit → outcome rate_limit', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: 'Trop de soumissions' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const res = await submitDonationProposal(baseValidData(), 'fr', { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'rate_limit');
});

test('submitDonationProposal — 500 erreur serveur → outcome error', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const res = await submitDonationProposal(baseValidData(), 'fr', { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'error');
});

test('submitDonationProposal — rejet fetch (Network Error / TypeError) → outcome error sans crash', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new TypeError('Failed to fetch (network disconnected)');
  };

  const res = await submitDonationProposal(baseValidData(), 'fr', { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'error');
});

// ---------------------------------------------------------------------------
// 6. submitPartnerContact — tests d'orchestration avec fetch mocké
// ---------------------------------------------------------------------------

test('submitPartnerContact — appel URL historique /api/public/contact et payload attendu', async () => {
  let capturedUrl = '';
  let capturedOptions: RequestInit | undefined;

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedOptions = init;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const data = baseValidData();
  const res = await submitPartnerContact(data, baseLabels, {
    apiUrl: 'https://api.test.local',
    fetchFn: mockFetch,
  });

  assert.strictEqual(res.outcome, 'success');
  assert.strictEqual(capturedUrl, 'https://api.test.local/api/public/contact');
  assert.strictEqual(capturedOptions?.method, 'POST');
  assert.deepStrictEqual(capturedOptions?.headers, { 'Content-Type': 'application/json' });

  const sentBody = JSON.parse(String(capturedOptions?.body));
  assert.strictEqual(sentBody.name, 'Jane Doe - ONG Exemple');
  assert.strictEqual(sentBody.country, 'FR');
  assert.strictEqual(sentBody.email, 'jane@example.com');
  assert.ok(typeof sentBody.message === 'string' && sentBody.message.length > 0);
});

test('submitPartnerContact — 200 → outcome success', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  const res = await submitPartnerContact(baseValidData(), baseLabels, { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'success');
});

test('submitPartnerContact — 429 → outcome rate_limit', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429 });
  };
  const res = await submitPartnerContact(baseValidData(), baseLabels, { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'rate_limit');
});

test('submitPartnerContact — 500 → outcome error', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  };
  const res = await submitPartnerContact(baseValidData(), baseLabels, { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'error');
});

test('submitPartnerContact — rejet fetch → outcome error', async () => {
  const mockFetch: typeof fetch = async () => {
    throw new Error('Connection refused');
  };
  const res = await submitPartnerContact(baseValidData(), baseLabels, { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'error');
});

test('submitPartnerContact — message trop long (>5000 car) → payload_too_long sans appel fetch', async () => {
  let fetchCalled = false;
  const mockFetch: typeof fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  const data = baseValidData();
  data.projectDescription = 'X'.repeat(5100);

  const res = await submitPartnerContact(data, baseLabels, { fetchFn: mockFetch });
  assert.strictEqual(res.outcome, 'payload_too_long');
  assert.strictEqual(fetchCalled, false, 'Le fetch ne doit pas être appelé si le payload dépasse la limite');
});

// ---------------------------------------------------------------------------
// 7. Confidentialité des logs — aucune fuite de sentinelle & aucun log intempestif
// ---------------------------------------------------------------------------

test('Confidentialité — la sentinelle sensible n\u0027apparaît dans aucun log lors des erreurs donation & contact', async () => {
  const SENSITIVE_SENTINEL = 'SENSITIVE-DONATION-SENTINEL-DO-NOT-LOG';

  const loggedMessages: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  const capture = (...args: unknown[]) => {
    loggedMessages.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
  };

  console.log = capture;
  console.error = capture;
  console.warn = capture;
  console.info = capture;

  try {
    const sensitiveData = baseValidData();
    sensitiveData.fullName = `Jane ${SENSITIVE_SENTINEL} Doe`;
    sensitiveData.email = `sensitive-${SENSITIVE_SENTINEL}@example.com`;
    sensitiveData.projectDescription = `Confidential notes: ${SENSITIVE_SENTINEL}`;

    // Scénario A : 400 validation error
    const mock400: typeof fetch = async () => new Response(JSON.stringify({ error: 'VALIDATION_FAILED' }), { status: 400 });
    await submitDonationProposal(sensitiveData, 'fr', { fetchFn: mock400 });

    // Scénario B : 500 server error
    const mock500: typeof fetch = async () => new Response(JSON.stringify({ error: 'Internal Error' }), { status: 500 });
    await submitDonationProposal(sensitiveData, 'fr', { fetchFn: mock500 });
    await submitPartnerContact(sensitiveData, baseLabels, { fetchFn: mock500 });

    // Scénario C : JSON invalide
    const mockInvalidJson: typeof fetch = async () => new Response('<html>500 Error</html>', { status: 201 });
    await submitDonationProposal(sensitiveData, 'fr', { fetchFn: mockInvalidJson });

    // Scénario D : Rejet réseau
    const mockReject: typeof fetch = async () => { throw new TypeError('Network connection reset'); };
    await submitDonationProposal(sensitiveData, 'fr', { fetchFn: mockReject });
    await submitPartnerContact(sensitiveData, baseLabels, { fetchFn: mockReject });

    // Assertions :
    // 1. La sentinelle ne doit jamais apparaître
    for (const msg of loggedMessages) {
      assert.strictEqual(
        msg.includes(SENSITIVE_SENTINEL),
        false,
        `Fuite détectée : la sentinelle apparaît dans les logs: "${msg}"`
      );
    }

    // 2. Les fonctions de soumission ne doivent émettre aucun log console direct
    assert.strictEqual(
      loggedMessages.length,
      0,
      `Aucun message ne devrait être émis dans la console lors des soumissions frontend (reçu: ${loggedMessages.length})`
    );
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    console.info = originalInfo;
  }
});

// ---------------------------------------------------------------------------
// 8. Contrôle statique du raccordement dans Partners.tsx (absence d\u0027environnement DOM)
// ---------------------------------------------------------------------------

test('Contrôle statique — Partners.tsx implémente submissionInFlightRef et appelle les fonctions d\u0027orchestration', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const partnersPath = path.resolve('src/pages/public/Partners.tsx');

  assert.ok(fs.existsSync(partnersPath), 'Partners.tsx doit exister au chemin attendu');
  const source = fs.readFileSync(partnersPath, 'utf8');

  // 1. Présence du verrou useRef
  assert.match(
    source,
    /const\s+submissionInFlightRef\s*=\s*useRef\s*\(\s*false\s*\)/,
    'submissionInFlightRef doit être déclaré via useRef(false)'
  );

  // 2. Garde au début de handleSubmit
  assert.match(
    source,
    /if\s*\(\s*submissionInFlightRef\.current\s*\|\|\s*isSubmitting\s*\)\s*return/,
    'handleSubmit doit bloquer immédiatement si submissionInFlightRef.current est vrai'
  );

  // 3. Pose du verrou avant tout traitement asynchrone
  assert.match(
    source,
    /submissionInFlightRef\.current\s*=\s*true/,
    'submissionInFlightRef.current doit être positionné à true avant l\u0027appel asynchrone'
  );

  // 4. Libération du verrou dans finally
  assert.match(
    source,
    /finally\s*\{[^}]*submissionInFlightRef\.current\s*=\s*false/,
    'submissionInFlightRef.current doit être libéré à false dans le bloc finally'
  );

  // 5. Appel réel aux fonctions d'orchestration
  assert.match(
    source,
    /submitDonationProposal\s*\(/,
    'Partners.tsx doit appeler submitDonationProposal'
  );
  assert.match(
    source,
    /submitPartnerContact\s*\(/,
    'Partners.tsx doit appeler submitPartnerContact'
  );

  // 6. Absence d'anciens imports inutilisés
  assert.doesNotMatch(
    source,
    /import\s*\{[^}]*\bbuildDonationProposalPayload\b[^}]*\}\s*from/,
    'buildDonationProposalPayload ne doit plus être importé dans Partners.tsx'
  );
  assert.doesNotMatch(
    source,
    /import\s*\{[^}]*\bresolvePartnerSubmissionEndpoint\b[^}]*\}\s*from/,
    'resolvePartnerSubmissionEndpoint ne doit plus être importé dans Partners.tsx'
  );
  assert.doesNotMatch(
    source,
    /import\s*\{[^}]*\bvalidateDonationProposalSuccessResponse\b[^}]*\}\s*from/,
    'validateDonationProposalSuccessResponse ne doit plus être importé dans Partners.tsx'
  );
});
