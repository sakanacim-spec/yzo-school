// src/pages/__tests__/ParentHistorique.spec.tsx
import React from 'react';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import { describe, test, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ParentHistorique } from '../parent/ParentHistorique';
import { parentApi } from '../../services/parentApi';
import { useStore } from '../../store/useStore';
import { ApiError } from '../../services/apiHelpers';

describe('PHASE 3 — Tests Comportementaux React Réels : ParentHistorique (H-R01 à H-R06)', () => {
  const child1 = { id: 'c-1', nom: 'DOSSOU', prenom: 'Jean Paul', classe: 'CM2' };
  const child2 = { id: 'c-2', nom: 'DOSSOU', prenom: 'Marie', classe: 'CE1' };

  const payment1 = {
    id: 'pay-1',
    date: '2026-11-20T10:00:00.000Z',
    montant: 25000,
    recu: 'REC-001'
  };

  beforeEach(() => {
    cleanup();
    useStore.setState({
      user: { id: 'parent-1', nom: 'ZE Caroline', role: 'parent', schoolSlug: 'test' } as any,
      currency: 'FCFA',
      language: 'fr',
      settings: {} as any
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── H-R01 : Aucun enfant rattaché ─────────────────────────────────────────
  it('H-R01: Aucun enfant rattaché => Aucune requête de paiement émise, état vide propre', async () => {
    vi.spyOn(parentApi, 'getDashboard').mockResolvedValue({ students: [] });
    const getPaymentsSpy = vi.spyOn(parentApi, 'getPayments');
    const getPresencesSpy = vi.spyOn(parentApi, 'getPresences');

    render(<ParentHistorique />);

    await waitFor(() => {
      expect(screen.getByText("Aucun enfant rattaché")).toBeTruthy();
    });

    expect(screen.getByText(/Aucun historique de paiement n'est disponible/i)).toBeTruthy();

    // Vérifie qu'AUCUNE requête de paiement ni présence n'a été émise
    expect(getPaymentsSpy).not.toHaveBeenCalled();
    expect(getPresencesSpy).not.toHaveBeenCalled();

    // Vérifie l'absence de message d'erreur
    expect(screen.queryByText(/Impossible de charger l'historique/i)).toBeNull();
  });

  // ── H-R02 : Enfants présents mais aucun paiement ──────────────────────────
  it('H-R02: Aucun paiement enregistré => Affiche "Aucun paiement." sans bannière d’erreur', async () => {
    vi.spyOn(parentApi, 'getDashboard').mockResolvedValue({ students: [child1 as any] });
    vi.spyOn(parentApi, 'getPayments').mockResolvedValue({
      student: child1,
      payments: []
    });
    vi.spyOn(parentApi, 'getPresences').mockResolvedValue({ presences: [] });

    render(<ParentHistorique />);

    await waitFor(() => {
      expect(screen.getByText("Aucun paiement.")).toBeTruthy();
    });

    // L'en-tête de tableau est bien présent
    expect(screen.getByText("Historique complet")).toBeTruthy();

    // Aucune bannière d'erreur contradictoire n'apparaît
    expect(screen.queryByText(/Impossible de charger l'historique/i)).toBeNull();
  });

  // ── H-R03 : Erreur technique globale ─────────────────────────────────────
  it('H-R03: Erreur technique globale => Affiche l’écran d’erreur SANS le tableau "Aucun paiement"', async () => {
    vi.spyOn(parentApi, 'getDashboard').mockRejectedValue(new ApiError('Table indisponible (42P01)', 500));

    render(<ParentHistorique />);

    await waitFor(() => {
      expect(screen.getByText(/Impossible de charger l'historique/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /Réessayer/i })).toBeTruthy();
    });

    // Éradication du double affichage contradictoire : le message "Aucun paiement." ne doit PAS être présent
    expect(screen.queryByText("Aucun paiement.")).toBeNull();
  });

  // ── H-R04 : Paiements disponibles ────────────────────────────────────────
  it('H-R04: Paiements disponibles => Affiche les lignes de transactions formatées', async () => {
    vi.spyOn(parentApi, 'getDashboard').mockResolvedValue({ students: [child1 as any] });
    vi.spyOn(parentApi, 'getPayments').mockResolvedValue({
      student: child1,
      payments: [payment1]
    });
    vi.spyOn(parentApi, 'getPresences').mockResolvedValue({ presences: [] });

    render(<ParentHistorique />);

    await waitFor(() => {
      expect(screen.getByText("Jean Paul DOSSOU")).toBeTruthy();
      expect(screen.getByText("25 000 FCFA")).toBeTruthy();
    });

    // Le message "Aucun paiement" ne doit pas apparaître
    expect(screen.queryByText("Aucun paiement.")).toBeNull();
  });

  // ── H-R05 : Résultat partiel avec Promise.allSettled ──────────────────────
  it('H-R05: Échec sur 1 enfant parmi 2 => Les données valides s’affichent avec bandeau partiel', async () => {
    vi.spyOn(parentApi, 'getDashboard').mockResolvedValue({ students: [child1 as any, child2 as any] });

    // Enfant 1 réussit
    vi.spyOn(parentApi, 'getPayments')
      .mockResolvedValueOnce({ student: child1, payments: [payment1] })
      // Enfant 2 échoue
      .mockRejectedValueOnce(new ApiError('Accès non autorisé élève 2', 403));

    vi.spyOn(parentApi, 'getPresences').mockResolvedValue({ presences: [] });

    render(<ParentHistorique />);

    await waitFor(() => {
      // Les données de l'enfant 1 sont bien visibles
      expect(screen.getByText("Jean Paul DOSSOU")).toBeTruthy();
      expect(screen.getByText("25 000 FCFA")).toBeTruthy();
    });

    // Un bandeau discret de synchronisation partielle s'affiche
    expect(screen.getByText(/Certaines données n'ont pas pu être synchronisées/i)).toBeTruthy();

    // Pas de blocage global
    expect(screen.queryByText(/Impossible de charger l'historique/i)).toBeNull();
  });

  // ── H-R06 : Changement de session ────────────────────────────────────────
  it('H-R06: Changement d’utilisateur => L’historique précédent est immédiatement purgé', async () => {
    vi.spyOn(parentApi, 'getDashboard')
      .mockResolvedValueOnce({ students: [child1 as any] })
      .mockResolvedValueOnce({ students: [] });

    vi.spyOn(parentApi, 'getPayments').mockResolvedValue({
      student: child1,
      payments: [payment1]
    });
    vi.spyOn(parentApi, 'getPresences').mockResolvedValue({ presences: [] });

    render(<ParentHistorique />);

    await waitFor(() => {
      expect(screen.getByText("Jean Paul DOSSOU")).toBeTruthy();
    });

    // Déconnexion / switch vers un autre utilisateur
    await act(async () => {
      useStore.setState({
        user: { id: 'parent-2', nom: 'Autre Parent', role: 'parent' } as any
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Jean Paul DOSSOU")).toBeNull();
      expect(screen.getByText("Aucun enfant rattaché")).toBeTruthy();
    });
  });
});
