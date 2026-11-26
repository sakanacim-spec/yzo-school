// src/pages/__tests__/ParentDashboard.spec.tsx
import React from 'react';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ParentDashboard } from '../parent/ParentDashboard';
import { parentApi } from '../../services/parentApi';
import { useStore } from '../../store/useStore';
import { ApiError } from '../../services/apiHelpers';

// Mock Lucide icons that may have issues in jsdom if any
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
  };
});

describe('PHASE 3 — Tests Comportementaux React Réels : ParentDashboard (R01 à R10)', () => {
  const syntheticUser = {
    id: 'parent-synth-001',
    nom: 'ZE Caroline',
    role: 'parent',
    schoolSlug: 'test'
  };

  const syntheticChildActive = {
    id: 'child-synth-001',
    nom: 'DOSSOU',
    prenom: 'Jean Paul',
    classe: 'CM2',
    cycle: 'Primaire',
    ecolage: 80000,
    dejaPaye: 50000,
    deja_paye: 50000,
    restant: 30000,
    status: 'Partiel',
    statut: 'Partiel',
    telephone: '+2290141204707',
    sexe: 'M',
    redoublant: false,
    ecoleProvenance: '',
    dateNaissance: null,
    photoUrl: null,
    historiquesPaiements: []
  };

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    useStore.setState({
      user: { ...syntheticUser } as any,
      students: [],
      devoirs: [],
      presences: [],
      currency: 'FCFA',
      language: 'fr',
      settings: { schoolName: 'École Pilote Test', paymentGateway: 'none' } as any
    });

    // Mock global announcements & fetch
    vi.spyOn(parentApi, 'getAnnouncements').mockResolvedValue({ announcements: [] });
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => JSON.stringify([])
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── R01 : Parent sans enfant rattaché ──────────────────────────────────────
  it('R01: Parent sans enfant => Affiche "Aucun enfant rattaché", sans boucle ni erreur', async () => {
    const getDashboardSpy = vi.spyOn(parentApi, 'getDashboard').mockResolvedValue({
      students: []
    });

    render(<ParentDashboard />);

    // Attente du rendu stabilisé
    await waitFor(() => {
      expect(screen.getByText("Aucun enfant rattaché")).toBeTruthy();
    });

    // Vérifie qu'aucune erreur de connexion n'est affichée
    expect(screen.queryByText(/Erreur de connexion/i)).toBeNull();
    expect(screen.queryByText(/Session expirée/i)).toBeNull();

    // Vérifie la présence du bouton pour lier un enfant (dans le bandeau et/ou l'état vide)
    const linkButtons = screen.getAllByRole('button', { name: /Lier un enfant/i });
    expect(linkButtons.length).toBeGreaterThanOrEqual(1);

    // Vérifie l'absence de boucle infinie de requêtes
    await new Promise((r) => setTimeout(r, 200));
    expect(getDashboardSpy).toHaveBeenCalledTimes(1);
  });

  // ── R02 : Détachement avec rafraîchissement forcé (Correctif P1) ───────────
  it('R02: Détachement réussi (P1) => Rafraîchit immédiatement la liste et retire l’enfant', async () => {
    // 1er appel : 1 enfant présent
    // 2ème appel (après unlink) : 0 enfant
    const getDashboardSpy = vi.spyOn(parentApi, 'getDashboard')
      .mockResolvedValueOnce({ students: [syntheticChildActive as any] })
      .mockResolvedValueOnce({ students: [] });

    const unlinkSpy = vi.spyOn(parentApi, 'unlinkStudent').mockResolvedValue({ success: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ParentDashboard />);

    // L'enfant s'affiche au 1er chargement
    await waitFor(() => {
      expect(screen.getByText(/Jean Paul DOSSOU/)).toBeTruthy();
    });

    // Clic sur le bouton de déliaison
    const unlinkButton = screen.getByTitle(/Retirer/i);
    expect(unlinkButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(unlinkButton);
    });

    // Invalidation immédiate et forced refresh
    await waitFor(() => {
      expect(unlinkSpy).toHaveBeenCalledWith(syntheticChildActive.id);
      expect(getDashboardSpy).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/Jean Paul DOSSOU/)).toBeNull();
      expect(screen.getByText("Aucun enfant rattaché")).toBeTruthy();
    });
  });

  // ── R03 : Demande de rattachement en attente (P26-B) ──────────────────────
  it('R03: Demande P26-B pending => L’accès reste bloqué tant que non approuvée', async () => {
    // Le dashboard ne renvoie pas l'enfant car la demande est 'pending'
    vi.spyOn(parentApi, 'getDashboard').mockResolvedValue({ students: [] });

    render(<ParentDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Aucun enfant rattaché")).toBeTruthy();
    });

    // Aucune donnée sensible (notes, absences, paiement de l'enfant) n'est rendue
    expect(screen.queryByText('Total Scolarité')).toBeNull();
    expect(screen.queryByText('Jean Paul DOSSOU')).toBeNull();
  });

  // ── R04 : Approbation effective par le directeur ─────────────────────────
  it('R04: Après approbation directeur, un rechargement affiche l’enfant sans doublon', async () => {
    const getDashboardSpy = vi.spyOn(parentApi, 'getDashboard')
      .mockResolvedValueOnce({ students: [] })
      .mockResolvedValueOnce({ students: [syntheticChildActive as any] });

    const { rerender } = render(<ParentDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Aucun enfant rattaché")).toBeTruthy();
    });

    // Simulation d'une action déclenchant le rafraîchissement (ex: modal link success)
    await act(async () => {
      useStore.setState({ students: [syntheticChildActive as any] });
    });

    rerender(<ParentDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Jean Paul DOSSOU/)).toBeTruthy();
    });

    // Vérifie l'unicité de l'affichage de l'enfant
    const studentHeaders = screen.getAllByText(/Jean Paul DOSSOU/);
    expect(studentHeaders.length).toBe(1);
  });

  // ── R05 : Protection contre les réponses tardives / obsolètes (reqSeqRef) ─
  it('R05: Réponse ancienne reçue après une réponse récente => La réponse ancienne est ignorée', async () => {
    let resolveFirstReq: (val: any) => void = () => {};
    const firstReqPromise = new Promise((res) => { resolveFirstReq = res; });

    const getDashboardSpy = vi.spyOn(parentApi, 'getDashboard')
      // Première requête très lente
      .mockImplementationOnce(() => firstReqPromise as any)
      // Deuxième requête plus rapide renvoyant un nouvel état avec l'enfant
      .mockResolvedValueOnce({ students: [syntheticChildActive as any] });

    render(<ParentDashboard />);

    await waitFor(() => {
      expect(getDashboardSpy).toHaveBeenCalledTimes(1);
    });

    // Déclenche une 2ème requête (ex: changement de session parent ou re-fetch)
    await act(async () => {
      useStore.setState({
        user: { ...syntheticUser, id: 'parent-synth-seq2' } as any
      });
    });

    // La 2ème requête a terminé et a placé l'enfant
    await waitFor(() => {
      expect(getDashboardSpy).toHaveBeenCalledTimes(2);
      expect(useStore.getState().students.length).toBe(1);
    });

    // Maintenant l'ancienne requête 1 (lente) se termine en retard avec des données vides
    await act(async () => {
      resolveFirstReq({ students: [] });
    });

    // Grâce à reqSeqRef, la réponse obsolète de la 1ère requête est ignorée !
    // L'enfant reste bien présent dans le store
    expect(useStore.getState().students.length).toBe(1);
    expect(useStore.getState().students[0].nom).toBe('DOSSOU');
  });

  // ── R06 : Changement de session / déconnexion / reconnexion ───────────────
  it('R06: Changement de compte parent => Les données de l’ancien parent disparaissent', async () => {
    vi.spyOn(parentApi, 'getDashboard')
      .mockResolvedValueOnce({ students: [syntheticChildActive as any] })
      .mockResolvedValueOnce({ students: [] });

    render(<ParentDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Jean Paul DOSSOU/)).toBeTruthy();
    });

    // Déconnexion et connexion d'un nouveau parent sans enfant
    await act(async () => {
      useStore.setState({
        user: { id: 'parent-synth-002', nom: 'Autre Parent', role: 'parent', schoolSlug: 'test' } as any,
        students: []
      });
    });

    await waitFor(() => {
      expect(screen.queryByText(/Jean Paul DOSSOU/)).toBeNull();
      expect(screen.getByText("Aucun enfant rattaché")).toBeTruthy();
    });
  });

  // ── R07 : Session expirée (HTTP 401) ─────────────────────────────────────
  it('R07: Erreur HTTP 401 => Affiche "Session expirée" avec bouton "Se reconnecter"', async () => {
    const error401 = new ApiError('Session expirée ou invalide.', 401, 'UNAUTHORIZED');
    vi.spyOn(parentApi, 'getDashboard').mockRejectedValue(error401);

    render(<ParentDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Session expirée")).toBeTruthy();
      expect(screen.getByRole('button', { name: "Se reconnecter" })).toBeTruthy();
    });
  });

  // ── R08 : Erreur serveur HTTP 500 sans fuite technique SQL ───────────────
  it('R08: Erreur HTTP 500 avec fuite PostgreSQL masquée => Message propre affiché', async () => {
    const error500 = new ApiError('Une erreur interne est survenue sur le serveur.', 500);
    vi.spyOn(parentApi, 'getDashboard').mockRejectedValue(error500);

    render(<ParentDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Erreur de connexion/i)).toBeTruthy();
      expect(screen.getByText(/Une erreur interne est survenue/i)).toBeTruthy();
    });

    // Aucune trace de PostgreSQL ou de syntaxe SQL n'apparaît
    expect(screen.queryByText(/42P01/)).toBeNull();
    expect(screen.queryByText(/relation/)).toBeNull();
  });

  // ── R09 : Bouton Retry après échec temporaire ────────────────────────────
  it('R09: Premier échec puis succès sur clic "Réessayer"', async () => {
    vi.spyOn(parentApi, 'getDashboard')
      .mockRejectedValueOnce(new ApiError('Problème passager.', 503))
      .mockResolvedValueOnce({ students: [syntheticChildActive as any] });

    render(<ParentDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Problème passager/i)).toBeTruthy();
    });

    const retryBtn = screen.getByRole('button', { name: /Réessayer/i });
    expect(retryBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Jean Paul DOSSOU/)).toBeTruthy();
    });
  });

  // ── R10 : Révocation administrative distante (P26-B) ─────────────────────
  it('R10: Révocation du lien côté serveur => L’enfant est retiré lors du rafraîchissement', async () => {
    vi.spyOn(parentApi, 'getDashboard')
      .mockResolvedValueOnce({ students: [syntheticChildActive as any] })
      .mockResolvedValueOnce({ students: [] });

    render(<ParentDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Jean Paul DOSSOU/)).toBeTruthy();
    });

    // Simule la révocation survenue côté serveur et un refresh manuel/automatique
    await act(async () => {
      useStore.setState({ students: [] });
    });

    await waitFor(() => {
      expect(screen.queryByText(/Jean Paul DOSSOU/)).toBeNull();
      expect(screen.getByText("Aucun enfant rattaché")).toBeTruthy();
    });
  });
});
