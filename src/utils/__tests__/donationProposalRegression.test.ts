// Tests de régression pour la soumission des propositions de dons :
// - Gestion stricte du sous-secteur (obligatoire pour mobility_services, absent/omis pour telecom et autres secteurs)
// - Validation stricte des réponses HTTP 201 malformées (Politique A : exactement { id, reference, status: 'pending' })
//
// Exécution : node --experimental-strip-types --test src/utils/__tests__/donationProposalRegression.test.ts

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDonationProposalPayload,
  validatePartnerForm,
  submitDonationProposal,
  SECTORS_REQUIRING_SUBSECTOR,
} from '../partnerApplication.ts';
import type { PartnerApplicationData } from '../partnerApplication.ts';

const VALID_UUID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const VALID_REF = 'DON-2026-TEST9876';

function createValidData(overrides: Partial<PartnerApplicationData> = {}): PartnerApplicationData {
  return {
    fullName: 'Jane Doe',
    role: 'Directrice des partenariats',
    companyName: 'Tech Solidarity Corp',
    sector: 'telecom',
    subSector: '',
    regulationDeclaration: '',
    otherSectorDetails: '',
    organizationType: '',
    intent: 'donation_sponsorship',
    supportType: 'future_financial_donation',
    license: '',
    country: 'France',
    targetMarkets: 'Afrique de l\'Ouest',
    email: 'jane.doe@tech-solidarity.org',
    phone: '+33 6 12 34 56 78',
    website: 'https://tech-solidarity.org',
    selectedFormula: '',
    projectDescription: 'Financement d\'équipements numériques scolaires.',
    consent: true,
    ...overrides,
  };
}

// ============================================================================
// 1. RÉGRESSION SOUS-SECTEUR : Validation, construction de payload & réseau
// ============================================================================

describe('Régression Sous-Secteur — Validation et émission réseau', () => {
  it('SECTORS_REQUIRING_SUBSECTOR contient uniquement mobility_services', () => {
    assert.strictEqual(SECTORS_REQUIRING_SUBSECTOR.has('mobility_services'), true);
    assert.strictEqual(SECTORS_REQUIRING_SUBSECTOR.has('telecom'), false);
    assert.strictEqual(SECTORS_REQUIRING_SUBSECTOR.has('finance'), false);
    assert.strictEqual(SECTORS_REQUIRING_SUBSECTOR.has('other'), false);
    assert.strictEqual(SECTORS_REQUIRING_SUBSECTOR.has('ngo_institutions'), false);
  });

  it('validatePartnerForm — secteur mobility_services sans subSector échoue (errorField: subSector)', () => {
    const data = createValidData({
      sector: 'mobility_services',
      subSector: '',
    });
    const result = validatePartnerForm(data);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errorField, 'subSector');
  });

  it('validatePartnerForm — secteur mobility_services avec subSector blanc échoue', () => {
    const data = createValidData({
      sector: 'mobility_services',
      subSector: '   ',
    });
    const result = validatePartnerForm(data);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errorField, 'subSector');
  });

  it('validatePartnerForm — secteur mobility_services avec sous-secteur valide réussit', () => {
    for (const sub of ['transport', 'insurance', 'afterSchool', 'otherRegulated'] as const) {
      const data = createValidData({
        sector: 'mobility_services',
        subSector: sub,
        license: sub === 'insurance' || sub === 'otherRegulated' ? 'AGR-TEST-123' : '',
      });
      const result = validatePartnerForm(data);
      assert.strictEqual(result.valid, true, `Le sous-secteur "${sub}" doit être accepté`);
    }
  });

  it('validatePartnerForm — secteur telecom ne requiert PAS de subSector', () => {
    const data = createValidData({
      sector: 'telecom',
      subSector: '',
    });
    const result = validatePartnerForm(data);
    assert.strictEqual(result.valid, true);
  });

  it('buildDonationProposalPayload — mobility_services inclut le sous-secteur trimmé', () => {
    const data = createValidData({
      sector: 'mobility_services',
      subSector: '  transport  ',
    });
    const payload = buildDonationProposalPayload(data, 'fr');
    assert.strictEqual(payload.subSector, 'transport');
  });

  it('buildDonationProposalPayload — telecom omet complètement la clé subSector du payload', () => {
    const data = createValidData({
      sector: 'telecom',
      subSector: '',
    });
    const payload = buildDonationProposalPayload(data, 'fr');
    assert.strictEqual(
      Object.hasOwn(payload, 'subSector'),
      false,
      'La propriété subSector ne doit pas être présente pour telecom'
    );
  });

  it('buildDonationProposalPayload — valeur résiduelle de subSector ignorée hors mobility_services', () => {
    const data = createValidData({
      sector: 'telecom',
      subSector: 'transport', // résidu d\'un choix précédent
    });
    const payload = buildDonationProposalPayload(data, 'fr');
    assert.strictEqual(
      Object.hasOwn(payload, 'subSector'),
      false,
      'Un résidu de subSector ne doit pas être inclus si le secteur est telecom'
    );
  });

  it('submitDonationProposal — secteur telecom : exactement 1 appel fetch et subSector absent du JSON envoyé', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: VALID_UUID, reference: VALID_REF, status: 'pending' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const data = createValidData({ sector: 'telecom', subSector: '' });
    const res = await submitDonationProposal(data, 'fr', { fetchFn: mockFetch });

    assert.strictEqual(res.outcome, 'success');
    assert.strictEqual(capturedUrl.endsWith('/api/public/donation-proposals'), true);
    assert.ok(capturedBody !== null);
    assert.strictEqual(capturedBody.sector, 'telecom');
    assert.strictEqual(
      Object.hasOwn(capturedBody, 'subSector'),
      false,
      'La clé subSector doit être rigoureusement absente du corps JSON envoyé au backend'
    );
  });

  it('submitDonationProposal — scénario transition mobility_services → telecom : subSector absent du réseau', async () => {
    let callCount = 0;
    let sentBody: any = null;

    const mockFetch: typeof fetch = async (_input, init) => {
      callCount++;
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: VALID_UUID, reference: VALID_REF, status: 'pending' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    // Formulaire initialement avec mobility_services + transport, puis basculé sur telecom
    const transitionedData = createValidData({
      sector: 'telecom',
      subSector: '', // Réinitialisé lors du basculement de secteur
    });

    const validation = validatePartnerForm(transitionedData);
    assert.strictEqual(validation.valid, true);

    const res = await submitDonationProposal(transitionedData, 'fr', { fetchFn: mockFetch });
    assert.strictEqual(res.outcome, 'success');
    assert.strictEqual(callCount, 1, 'Exactement 1 requête réseau doit être effectuée');
    assert.strictEqual(sentBody.sector, 'telecom');
    assert.strictEqual(Object.hasOwn(sentBody, 'subSector'), false, 'subSector doit être absent du payload');
  });
});

// ============================================================================
// 2. RÉGRESSION HTTP 201 : Rejet strict des réponses 201 malformées
// ============================================================================

describe('Régression HTTP 201 — Rejet strict des réponses malformées (Politique A)', () => {
  async function submitWithMockBody(body: any, status = 201) {
    const mockFetch: typeof fetch = async () => {
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    return submitDonationProposal(createValidData(), 'fr', { fetchFn: mockFetch });
  }

  it('201 avec { success: true } (manque id, reference, status) → outcome: error', async () => {
    const res = await submitWithMockBody({ success: true });
    assert.strictEqual(res.outcome, 'error');
  });

  it('201 avec clé id manquante → outcome: error', async () => {
    const res = await submitWithMockBody({ reference: VALID_REF, status: 'pending' });
    assert.strictEqual(res.outcome, 'error');
  });

  it('201 avec id non-UUID v4 valide → outcome: error', async () => {
    const res1 = await submitWithMockBody({ id: 'invalid-id-1234', reference: VALID_REF, status: 'pending' });
    assert.strictEqual(res1.outcome, 'error');

    // UUID v1 au lieu de v4
    const res2 = await submitWithMockBody({ id: 'a1b2c3d4-e5f6-1a7b-8c9d-0e1f2a3b4c5d', reference: VALID_REF, status: 'pending' });
    assert.strictEqual(res2.outcome, 'error');
  });

  it('201 avec clé reference manquante ou pattern invalide → outcome: error', async () => {
    const resNoRef = await submitWithMockBody({ id: VALID_UUID, status: 'pending' });
    assert.strictEqual(resNoRef.outcome, 'error');

    const resBadPattern = await submitWithMockBody({ id: VALID_UUID, reference: 'REF-INVALID', status: 'pending' });
    assert.strictEqual(resBadPattern.outcome, 'error');
  });

  it('201 avec status absent ou différent de "pending" strict → outcome: error', async () => {
    const resNoStatus = await submitWithMockBody({ id: VALID_UUID, reference: VALID_REF });
    assert.strictEqual(resNoStatus.outcome, 'error');

    const resCompleted = await submitWithMockBody({ id: VALID_UUID, reference: VALID_REF, status: 'completed' });
    assert.strictEqual(resCompleted.outcome, 'error');

    const resUpper = await submitWithMockBody({ id: VALID_UUID, reference: VALID_REF, status: 'PENDING' });
    assert.strictEqual(resUpper.outcome, 'error');

    const resSuccess = await submitWithMockBody({ id: VALID_UUID, reference: VALID_REF, status: 'success' });
    assert.strictEqual(resSuccess.outcome, 'error');
  });

  it('201 avec champs supplémentaires inattendus (règle stricte 3 clés) → outcome: error', async () => {
    const resExtra = await submitWithMockBody({
      id: VALID_UUID,
      reference: VALID_REF,
      status: 'pending',
      extraField: 'intruder',
    });
    assert.strictEqual(resExtra.outcome, 'error');
  });

  it('201 avec corps null ou tableau → outcome: error', async () => {
    const resNull = await submitWithMockBody(null);
    assert.strictEqual(resNull.outcome, 'error');

    const resArr = await submitWithMockBody([{ id: VALID_UUID, reference: VALID_REF, status: 'pending' }]);
    assert.strictEqual(resArr.outcome, 'error');
  });

  it('201 avec réponse HTML non-parsable → outcome: error', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('<html>502 Bad Gateway</html>', {
        status: 201,
        headers: { 'Content-Type': 'text/html' },
      });
    };
    const res = await submitDonationProposal(createValidData(), 'fr', { fetchFn: mockFetch });
    assert.strictEqual(res.outcome, 'error');
  });

  it('201 strictement valide ({ id, reference, status: "pending" }) → outcome: success avec data typée', async () => {
    const validBody = { id: VALID_UUID, reference: VALID_REF, status: 'pending' as const };
    const res = await submitWithMockBody(validBody);
    assert.strictEqual(res.outcome, 'success');
    if (res.outcome === 'success') {
      assert.strictEqual(res.data.id, VALID_UUID);
      assert.strictEqual(res.data.reference, VALID_REF);
      assert.strictEqual(res.data.status, 'pending');
    }
  });
});
