// src/utils/__tests__/paymentStatus.spec.ts
import { describe, it, expect } from 'vitest';
import {
  computePaymentStatus,
  computeStatusFromRestant,
  normalizePaymentStatus,
  isSeuil70Atteint
} from '../paymentStatus';

describe('PHASE 4 — Tests Financiers Canoniques P2 (Décision Propriétaire)', () => {
  // ── Matrice obligatoire de référence ──
  const testMatrix = [
    { ecolage: 80000, paye: 0, expected: 'Non payé' },
    { ecolage: 80000, paye: 1000, expected: 'Partiel' },
    { ecolage: 80000, paye: 40000, expected: 'Partiel' },
    { ecolage: 80000, paye: 50000, expected: 'Partiel' },
    { ecolage: 80000, paye: 55999, expected: 'Partiel' },
    { ecolage: 80000, paye: 56000, expected: 'Partiel' },
    { ecolage: 80000, paye: 72000, expected: 'Partiel' },
    { ecolage: 80000, paye: 79999, expected: 'Partiel' },
    { ecolage: 80000, paye: 80000, expected: 'Soldé' },
    { ecolage: 80000, paye: 90000, expected: 'Soldé' },
  ] as const;

  it.each(testMatrix)(
    'Écolage $ecolage, Payé $paye => Statut $expected',
    ({ ecolage, paye, expected }) => {
      expect(computePaymentStatus(paye, ecolage)).toBe(expected);
      expect(computeStatusFromRestant(ecolage - paye, ecolage)).toBe(expected);
    }
  );

  describe('Cas Particulier : Écolage à 0 FCFA (Exonération / Bourse Complète)', () => {
    it('Écolage 0 FCFA avec 0 payé est Soldé (exonération valide)', () => {
      expect(computePaymentStatus(0, 0)).toBe('Soldé');
      expect(computeStatusFromRestant(0, 0)).toBe('Soldé');
    });

    it('Écolage 0 FCFA avec paiement quelconque est Soldé', () => {
      expect(computePaymentStatus(5000, 0)).toBe('Soldé');
      expect(computeStatusFromRestant(0, 0)).toBe('Soldé');
    });
  });

  describe('Cas Particulier : Trop-perçu (Paiement supérieur à l’écolage)', () => {
    it('Payé 90 000 pour écolage 80 000 donne le statut Soldé avec restant exigible nul', () => {
      const ecolage = 80000;
      const dejaPaye = 90000;
      const statut = computePaymentStatus(dejaPaye, ecolage);
      const restant = Math.max(0, ecolage - dejaPaye);
      const tropPercu = dejaPaye > ecolage ? dejaPaye - ecolage : 0;

      expect(statut).toBe('Soldé');
      expect(restant).toBe(0);
      expect(tropPercu).toBe(10000);
    });
  });

  describe('Indicateur Séparé du Seuil de 70% (Non déterminant pour le statut)', () => {
    it('L’indicateur de 70% est distinct et ne conditionne pas Partiel', () => {
      // 50 000 / 80 000 = 62.5% (< 70%) => statut est Partiel, mais seuil70 est false
      expect(computePaymentStatus(50000, 80000)).toBe('Partiel');
      expect(isSeuil70Atteint(50000, 80000)).toBe(false);

      // 56 000 / 80 000 = 70% (>= 70%) => statut est Partiel, et seuil70 est true
      expect(computePaymentStatus(56000, 80000)).toBe('Partiel');
      expect(isSeuil70Atteint(56000, 80000)).toBe(true);

      // 80 000 / 80 000 = 100% => statut est Soldé, et seuil70 est true
      expect(computePaymentStatus(80000, 80000)).toBe('Soldé');
      expect(isSeuil70Atteint(80000, 80000)).toBe(true);
    });
  });

  describe('Rétrocompatibilité et Normalisation des Statuts Historiques', () => {
    it('Normalise "Non soldé" vers "Non payé"', () => {
      expect(normalizePaymentStatus('Non soldé')).toBe('Non payé');
    });

    it('Préserve "Soldé" et "Partiel"', () => {
      expect(normalizePaymentStatus('Soldé')).toBe('Soldé');
      expect(normalizePaymentStatus('Partiel')).toBe('Partiel');
    });

    it('Recalcule canoniquement si dejaPaye et ecolage sont fournis', () => {
      // Jean Paul DOSSOU : avait 'Non soldé' en base mais avec 50 000 / 80 000
      expect(normalizePaymentStatus('Non soldé', 50000, 80000)).toBe('Partiel');
    });

    it('Gère défensivement les valeurs null, undefined ou invalides', () => {
      expect(computePaymentStatus(null, null)).toBe('Soldé'); // écolage nul/manquant = 0 => Soldé
      expect(computePaymentStatus(0, null)).toBe('Soldé');
      expect(computePaymentStatus(NaN as any, 80000)).toBe('Non payé');
      expect(computePaymentStatus(-500, 80000)).toBe('Non payé');
      expect(normalizePaymentStatus(null)).toBe('Non payé');
    });
  });

  describe('Cas de Référence Obligatoire : Jean Paul DOSSOU (CM2)', () => {
    it('Vérifie l’exactitude financière et l’arrondi conforme pour Jean Paul DOSSOU', () => {
      const ecolage = 80000;
      const dejaPaye = 50000;
      const restant = Math.max(0, ecolage - dejaPaye);
      const tauxExact = (dejaPaye / ecolage) * 100;
      const tauxArrondi = Math.round(tauxExact);
      const statut = computePaymentStatus(dejaPaye, ecolage);

      expect(ecolage).toBe(80000);
      expect(dejaPaye).toBe(50000);
      expect(restant).toBe(30000);
      expect(tauxExact).toBe(62.5);
      expect(tauxArrondi).toBe(63);
      expect(statut).toBe('Partiel');
    });
  });
});
