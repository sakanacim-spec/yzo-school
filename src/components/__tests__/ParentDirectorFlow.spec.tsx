import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { ParentLinkRequests } from '../ParentLinkRequests';
import { DirectorLinkRequests } from '../DirectorLinkRequests';
import { parentApi, type ParentLinkRequest } from '../../services/parentApi';
import { directorApi, type DirectorLinkRequest, DirectorApiError } from '../../services/directorApi';

let mockUser: any = { id: 'parent-1', role: 'parent', schoolSlug: 'ecole_principale' };

vi.mock('../../store/useStore', () => ({
  useStore: (selector?: (state: any) => any) => {
    const state = {
      user: mockUser,
      language: 'fr',
      currentSchool: { slug: 'ecole_principale', nom: 'École Principale' }
    };
    return selector ? selector(state) : state;
  }
}));

describe('P26-B — Validation Fonctionnelle DOM / Interactions React', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('A & C. Parcours Parent : Affichage et statuts des demandes', () => {
    beforeEach(() => {
      mockUser = { id: 'parent-1', role: 'parent', schoolSlug: 'ecole_principale' };
    });

    it('affiche la liste des demandes de rattachement avec les statuts pending, approved, rejected et motif de rejet', async () => {
      const mockRequests: ParentLinkRequest[] = [
        {
          id: 'req-uuid-1',
          school_slug: 'ecole_principale',
          school_name: 'École Primaire Victor Hugo',
          student_name: 'Amine Dupont',
          student_class: 'CM2-A',
          status: 'pending',
          requested_at: '2026-10-14T10:00:00Z',
          decided_at: null,
          rejection_reason: null,
          rejection_reason_code: null
        },
        {
          id: 'req-uuid-2',
          school_slug: 'ecole_principale',
          school_name: 'École Primaire Victor Hugo',
          student_name: 'Sophie Dupont',
          student_class: 'CE1-B',
          status: 'approved',
          requested_at: '2026-10-13T09:00:00Z',
          decided_at: '2026-10-13T11:00:00Z',
          rejection_reason: null,
          rejection_reason_code: null
        },
        {
          id: 'req-uuid-3',
          school_slug: 'college_secondaire',
          school_name: 'Collège Jean Moulin',
          student_name: 'Karim Traoré',
          student_class: '6ème C',
          status: 'rejected',
          requested_at: '2026-10-12T08:00:00Z',
          decided_at: '2026-10-12T14:30:00Z',
          rejection_reason: 'Numéro de téléphone non reconnu dans le dossier scolaire',
          rejection_reason_code: 'PHONE_MISMATCH'
        },
        {
          id: 'req-uuid-4',
          school_slug: 'ecole_principale',
          school_name: 'École Primaire Victor Hugo',
          student_name: 'Lucas Dupont',
          student_class: 'CP-A',
          status: 'pending_verification',
          requested_at: '2026-10-14T11:30:00Z',
          decided_at: null,
          rejection_reason: null,
          rejection_reason_code: null
        }
      ];

      vi.spyOn(parentApi, 'getLinkRequests').mockResolvedValue({
        requests: mockRequests,
        total: 4,
        page: 1,
        limit: 20
      });

      render(<ParentLinkRequests />);

      expect(await screen.findByText('Mes demandes de rattachement')).toBeDefined();

      expect(screen.getByText('Amine Dupont')).toBeDefined();
      expect(screen.getByText('Sophie Dupont')).toBeDefined();
      expect(screen.getByText('Karim Traoré')).toBeDefined();
      expect(screen.getByText('Lucas Dupont')).toBeDefined();

      // Badges
      expect(screen.getByText('En attente')).toBeDefined();
      expect(screen.getByText('Approuvée')).toBeDefined();
      expect(screen.getByText('Rejetée')).toBeDefined();
      expect(screen.getByText('En vérification')).toBeDefined();

      // Mention de protection des données scolaires avant approbation
      expect(
        screen.getAllByText(/L'accès au suivi scolaire sera actif dès l'approbation formelle de la direction/i).length
      ).toBeGreaterThanOrEqual(1);

      // Motif de rejet explicite
      expect(screen.getByText(/Numéro de téléphone non reconnu dans le dossier scolaire/)).toBeDefined();

      // Rafraîchissement
      const refreshBtn = screen.getByRole('button', { name: /Actualiser/i });
      fireEvent.click(refreshBtn);
      await waitFor(() => {
        expect(parentApi.getLinkRequests).toHaveBeenCalledTimes(2);
      });
    });

    it('ne rend aucun conteneur inutile lorsqu’aucune demande n’est présente (préservation de l’espace écran)', async () => {
      vi.spyOn(parentApi, 'getLinkRequests').mockResolvedValue({
        requests: [],
        total: 0,
        page: 1,
        limit: 20
      });

      const { container } = render(<ParentLinkRequests />);
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });
  });

  describe('B & D. Parcours Directeur : Validation, modales, motif obligatoire et anti-double-clic', () => {
    beforeEach(() => {
      mockUser = { id: 'dir-1', role: 'directeur', schoolSlug: 'ecole_principale' };
    });

    const pendingRequest: DirectorLinkRequest = {
      id: 'req-directeur-1',
      school_slug: 'ecole_principale',
      parent_name: 'Moussa Diop',
      student_name: 'Fatou Diop',
      status: 'pending',
      requested_at: '2026-10-14T08:00:00Z'
    };

    it('permet au directeur d’approuver après confirmation explicite', async () => {
      vi.spyOn(directorApi, 'listRequests').mockResolvedValue({
        requests: [pendingRequest],
        total: 1,
        page: 1,
        limit: 20
      });

      const approveSpy = vi.spyOn(directorApi, 'approveRequest').mockResolvedValue({
        success: true,
        status: 'approved',
        request_id: 'req-directeur-1'
      });

      render(<DirectorLinkRequests />);

      expect(await screen.findByText('Fatou Diop')).toBeDefined();
      expect(screen.getByText('Moussa Diop')).toBeDefined();

      const approveBtn = screen.getByRole('button', { name: /Approuver/i });
      fireEvent.click(approveBtn);

      expect(await screen.findByText(/Confirmer l'approbation du rattachement/i)).toBeDefined();
      expect(screen.getAllByText(/Fatou Diop/i).length).toBeGreaterThanOrEqual(1);

      const confirmApproveBtn = screen.getByRole('button', { name: /Confirmer l'approbation/i });
      fireEvent.click(confirmApproveBtn);

      await waitFor(() => {
        expect(approveSpy).toHaveBeenCalledWith('req-directeur-1');
      });
    });

    it('exige obligatoirement un motif avant de permettre le rejet d’une demande', async () => {
      vi.spyOn(directorApi, 'listRequests').mockResolvedValue({
        requests: [pendingRequest],
        total: 1,
        page: 1,
        limit: 20
      });

      const rejectSpy = vi.spyOn(directorApi, 'rejectRequest').mockResolvedValue({
        success: true,
        status: 'rejected',
        request_id: 'req-directeur-1'
      });

      render(<DirectorLinkRequests />);

      expect(await screen.findByText('Fatou Diop')).toBeDefined();

      const rejectBtn = screen.getByRole('button', { name: /Rejeter/i });
      fireEvent.click(rejectBtn);

      expect(await screen.findByText(/Rejeter la demande de rattachement/i)).toBeDefined();

      const confirmRejectBtn = await screen.findByRole('button', { name: /Confirmer le rejet/i });
      expect((confirmRejectBtn as HTMLButtonElement).disabled).toBe(true);

      const textarea = screen.getByPlaceholderText(/Expliquez la raison du rejet/i);
      fireEvent.change(textarea, { target: { value: '    ' } });
      expect((confirmRejectBtn as HTMLButtonElement).disabled).toBe(true);

      fireEvent.change(textarea, { target: { value: 'Identité non concordante avec le tuteur légal' } });
      expect((confirmRejectBtn as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(confirmRejectBtn);

      await waitFor(() => {
        expect(rejectSpy).toHaveBeenCalledWith(
          'req-directeur-1',
          'Identité non concordante avec le tuteur légal',
          'OTHER'
        );
      });
    });

    it('ferme la modale d’approbation, rafraîchit la liste et conserve le message de conflit visible lors d’un 409 INVALID_STATUS_TRANSITION', async () => {
      const listSpy = vi.spyOn(directorApi, 'listRequests').mockResolvedValue({
        requests: [pendingRequest],
        total: 1,
        page: 1,
        limit: 20
      });

      const conflictMsg = 'Cette demande a déjà été traitée (statut actuel : rejected).';
      vi.spyOn(directorApi, 'approveRequest').mockRejectedValue(
        new DirectorApiError(conflictMsg, 409, 'INVALID_STATUS_TRANSITION', 'rejected')
      );

      render(<DirectorLinkRequests />);

      expect(await screen.findByText('Fatou Diop')).toBeDefined();
      expect(listSpy).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: /Approuver/i }));
      const confirmBtn = await screen.findByRole('button', { name: /Confirmer l'approbation/i });
      fireEvent.click(confirmBtn);

      // 1. La modale se ferme
      await waitFor(() => {
        expect(screen.queryByText(/Confirmer l'approbation du rattachement/i)).toBeNull();
      });

      // 2. La liste a bien été rafraîchie
      await waitFor(() => {
        expect(listSpy).toHaveBeenCalledTimes(2);
      });

      // 3. Le message expliquant le conflit persiste dans le DOM après actualisation
      expect(screen.getByText(conflictMsg)).toBeDefined();
    });

    it('ferme la modale de rejet, rafraîchit la liste et conserve le message de conflit visible lors d’un 409 INVALID_STATUS_TRANSITION', async () => {
      const listSpy = vi.spyOn(directorApi, 'listRequests').mockResolvedValue({
        requests: [pendingRequest],
        total: 1,
        page: 1,
        limit: 20
      });

      const conflictMsg = 'Cette demande a déjà été traitée (statut actuel : approved).';
      vi.spyOn(directorApi, 'rejectRequest').mockRejectedValue(
        new DirectorApiError(conflictMsg, 409, 'INVALID_STATUS_TRANSITION', 'approved')
      );

      render(<DirectorLinkRequests />);

      expect(await screen.findByText('Fatou Diop')).toBeDefined();
      expect(listSpy).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: /Rejeter/i }));
      expect(await screen.findByText(/Rejeter la demande de rattachement/i)).toBeDefined();

      const textarea = screen.getByPlaceholderText(/Expliquez la raison du rejet/i);
      fireEvent.change(textarea, { target: { value: 'Motif de test' } });

      const confirmRejectBtn = screen.getByRole('button', { name: /Confirmer le rejet/i });
      fireEvent.click(confirmRejectBtn);

      // 1. La modale se ferme
      await waitFor(() => {
        expect(screen.queryByText(/Rejeter la demande de rattachement/i)).toBeNull();
      });

      // 2. La liste a bien été rafraîchie
      await waitFor(() => {
        expect(listSpy).toHaveBeenCalledTimes(2);
      });

      // 3. Le message expliquant le conflit persiste dans le DOM après actualisation
      expect(screen.getByText(conflictMsg)).toBeDefined();
    });

    it('refuse l’accès aux rôles non autorisés comme comptable', async () => {
      mockUser = { id: 'comptable-1', role: 'comptable', schoolSlug: 'ecole_principale' };
      const listSpy = vi.spyOn(directorApi, 'listRequests');

      render(<DirectorLinkRequests />);

      expect(await screen.findByText(/Accès restreint/i)).toBeDefined();
      expect(screen.getByText(/strictement réservée à la direction de l'établissement/i)).toBeDefined();
      expect(listSpy).not.toHaveBeenCalled();
    });
  });
});
