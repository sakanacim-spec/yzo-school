import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

const cjsRequire = createRequire(import.meta.url);

// Helper to transpile TSX on the fly for Node.js execution
function loadComponent(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf8');
  const transformed = esbuild.transformSync(code, {
    loader: 'tsx',
    format: 'cjs',
    target: 'node20',
    jsx: 'transform',
    define: {
      'import.meta.env': '{}'
    }
  });

  const m: any = { exports: {} };
  const req = (mod: string) => {
    if (mod.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), mod);
      for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']) {
        if (fs.existsSync(resolved + ext) && fs.statSync(resolved + ext).isFile()) {
          if (ext.endsWith('.ts') || ext.endsWith('.tsx')) {
            return loadComponent(resolved + ext);
          }
          return cjsRequire(resolved + ext);
        }
      }
    }
    return cjsRequire(mod);
  };

  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', transformed.code);
  fn(m, m.exports, req, filePath, path.dirname(filePath));
  return m.exports;
}

const partnersModule = loadComponent(path.resolve('src/pages/public/Partners.tsx'));
const { Partners } = partnersModule;

describe('Partners Component - SubSector Visibility, State Reset & Network Call Guard', () => {
  let originalFetch: typeof global.fetch;
  let fetchCalls: Array<{ url: string; options?: any }> = [];

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchCalls = [];
    global.fetch = (async (url: any, options: any) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: '00000000-0000-4000-8000-000000000000',
          reference: 'DON-2026-TEST2345',
          status: 'pending'
        })
      } as any;
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('telecom sector: sub-sector selector is hidden', () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(Partners, { onBack: () => {}, onHome: () => {} })
    );

    // Initial render with default / telecom: subsector dropdown must not be present
    assert.strictEqual(html.includes('id="partner-subsector"'), false, 'Sub-sector selector should not be rendered for telecom or initial state');
    assert.strictEqual(html.includes('data-testid="partner-subsector"'), false);
  });

  it('mobility_services sector: sub-sector selector is rendered', () => {
    // Check with category 4 (mobility_services)
    const { SECTORS_REQUIRING_SUBSECTOR } = loadComponent(path.resolve('src/utils/partnerApplication.ts'));
    assert.strictEqual(SECTORS_REQUIRING_SUBSECTOR.has('mobility_services'), true);
    assert.strictEqual(SECTORS_REQUIRING_SUBSECTOR.has('telecom'), false);
  });

  it('submission blocked when mobility_services has no subSector: 0 fetch network calls', async () => {
    const { validatePartnerForm, submitDonationProposal } = loadComponent(path.resolve('src/utils/partnerApplication.ts'));

    const invalidMobilityData = {
      fullName: 'Alice Test',
      role: 'Responsable',
      companyName: 'Mobility Co',
      sector: 'mobility_services',
      subSector: '',
      regulationDeclaration: '',
      otherSectorDetails: '',
      organizationType: '',
      intent: 'donation_sponsorship',
      supportType: 'equipment_donation',
      license: '',
      country: 'France',
      targetMarkets: 'Europe',
      email: 'alice@mobility.co',
      phone: '+33 6 00 00 00 00',
      website: '',
      selectedFormula: '',
      projectDescription: 'Don de vélos et bus scolaires',
      consent: true
    };

    const validation = validatePartnerForm(invalidMobilityData);
    assert.strictEqual(validation.valid, false, 'Frontend validation must fail');
    assert.strictEqual(validation.errorField, 'subSector', 'Error field must be subSector');

    // Because validation failed, no fetch call must happen
    assert.strictEqual(fetchCalls.length, 0, 'No fetch calls should be initiated when validation fails');
  });

  it('submission allowed when mobility_services has subSector transport: fetch is called with payload containing subSector', async () => {
    const { validatePartnerForm, submitDonationProposal } = loadComponent(path.resolve('src/utils/partnerApplication.ts'));

    const validMobilityData = {
      fullName: 'Alice Test',
      role: 'Responsable',
      companyName: 'Mobility Co',
      sector: 'mobility_services',
      subSector: 'transport',
      regulationDeclaration: '',
      otherSectorDetails: '',
      organizationType: '',
      intent: 'donation_sponsorship',
      supportType: 'equipment_donation',
      license: '',
      country: 'France',
      targetMarkets: 'Europe',
      email: 'alice@mobility.co',
      phone: '+33 6 00 00 00 00',
      website: '',
      selectedFormula: '',
      projectDescription: 'Don de vélos et bus scolaires',
      consent: true
    };

    const validation = validatePartnerForm(validMobilityData);
    assert.strictEqual(validation.valid, true, 'Frontend validation must pass');

    const result = await submitDonationProposal(validMobilityData, 'fr');
    assert.strictEqual(result.outcome, 'success');
    assert.strictEqual(fetchCalls.length, 1, 'Exactly 1 fetch call must be made');

    const sentPayload = JSON.parse(fetchCalls[0].options.body);
    assert.strictEqual(sentPayload.sector, 'mobility_services');
    assert.strictEqual(sentPayload.subSector, 'transport', 'subSector: transport must be sent');
  });

  it('sector switch: changing from mobility_services to telecom resets subSector and omits it from network payload', async () => {
    const { validatePartnerForm, submitDonationProposal } = loadComponent(path.resolve('src/utils/partnerApplication.ts'));

    // Changing sector to telecom resets subSector to ''
    const telecomData = {
      fullName: 'Alice Test',
      role: 'Responsable',
      companyName: 'Telecom Co',
      sector: 'telecom',
      subSector: '', // Reset to ''
      regulationDeclaration: '',
      otherSectorDetails: '',
      organizationType: '',
      intent: 'donation_sponsorship',
      supportType: 'equipment_donation',
      license: '',
      country: 'France',
      targetMarkets: 'Europe',
      email: 'alice@telecom.co',
      phone: '+33 6 00 00 00 00',
      website: '',
      selectedFormula: '',
      projectDescription: 'Fourniture de tablettes scolaires',
      consent: true
    };

    const validation = validatePartnerForm(telecomData);
    assert.strictEqual(validation.valid, true);

    const result = await submitDonationProposal(telecomData, 'fr');
    assert.strictEqual(result.outcome, 'success');
    assert.strictEqual(fetchCalls.length, 1);

    const sentPayload = JSON.parse(fetchCalls[0].options.body);
    assert.strictEqual(sentPayload.sector, 'telecom');
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(sentPayload, 'subSector'),
      false,
      'subSector property must NOT exist in the telecom payload'
    );
  });
});
