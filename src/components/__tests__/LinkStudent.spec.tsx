import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LinkStudent } from '../LinkStudent';
import {
    GLOBAL_ID,
    LABELS,
    STUDENT,
    bodyOf,
    deferred,
    escapeRegExp,
    installFetchMock,
    jsonResponse,
    sleep,
    transferRequiredResponse,
    type FakeResponse,
} from './linkTransferTestUtils';

vi.mock('../../store/useStore', () => ({ useStore: () => ({ language: 'fr' }) }));

const EXPECTED_BODY = { studentId: STUDENT.id, target_student_global_id: GLOBAL_ID };
const bulkButtonName = new RegExp(`^${escapeRegExp(LABELS.linkSelectedPrefix)}\\s+1\\s`);

describe('LinkStudent (liaison groupée) — transfert d’identité (P25-T.4b)', () => {
    // Mock recréé à chaque test (timer setTimeout(1500) non nettoyé au démontage).
    let onComplete: ReturnType<typeof vi.fn<() => void>>;

    beforeEach(() => {
        onComplete = vi.fn();
        localStorage.clear();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    async function reachTransferPrompt() {
        render(<LinkStudent onComplete={onComplete} />);
        fireEvent.change(screen.getByPlaceholderText(LABELS.bulkPlaceholder), { target: { value: 'Doe' } });
        fireEvent.click(await screen.findByText(`${STUDENT.prenom} ${STUDENT.nom}`, {}, { timeout: 2000 }));
        fireEvent.click(screen.getByRole('button', { name: bulkButtonName }));
        await screen.findByText(LABELS.promptTitle);
    }

    it('affiche la confirmation après TRANSFER_REQUIRED sur la liaison groupée', async () => {
        const api = installFetchMock({ link: async () => transferRequiredResponse() });
        await reachTransferPrompt();

        expect(api.link).toHaveBeenCalledTimes(1);
        expect(bodyOf(api.link.mock.calls[0][0])).toEqual({ studentIds: [STUDENT.id] });
        expect(api.transfer).not.toHaveBeenCalled();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('annulation : retour à la liste sans appel de transfert', async () => {
        const api = installFetchMock({ link: async () => transferRequiredResponse() });
        await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.cancel }));

        expect(screen.queryByText(LABELS.promptTitle)).toBeNull();
        expect(screen.getByPlaceholderText(LABELS.bulkPlaceholder)).toBeTruthy();
        await sleep(50);
        expect(api.transfer).not.toHaveBeenCalled();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('confirmation + double clic : un seul POST avec les identifiants exacts', async () => {
        const pending = deferred<FakeResponse>();
        const api = installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: () => pending.promise,
        });
        await reachTransferPrompt();

        const confirm = screen.getByRole('button', { name: LABELS.confirm });
        fireEvent.click(confirm);
        fireEvent.click(confirm);

        expect(api.transfer).toHaveBeenCalledTimes(1);
        expect((confirm as HTMLButtonElement).disabled).toBe(true);
        const init = api.transfer.mock.calls[0][0]!;
        expect(init.method).toBe('POST');
        expect(bodyOf(init)).toEqual(EXPECTED_BODY);

        pending.resolve(jsonResponse(200, { status: 'created' }));
        await screen.findByText(LABELS.bulkTransferSuccess);
        expect(api.transfer).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 3000 });
    });

    it.each(['created', 'already_mapped'])('succès "%s" : message puis onComplete', async status => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status }),
        });
        await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));

        await screen.findByText(LABELS.bulkTransferSuccess);
        expect(onComplete).not.toHaveBeenCalled();
        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 3000 });
    });

    it('403 TARGET_NOT_OWNED : message d’autorisation et confirmation retirée', async () => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(403, { error: 'TARGET_NOT_OWNED' }),
        });
        await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));

        await screen.findByText(LABELS.errNotOwned);
        expect(screen.queryByText(LABELS.promptTitle)).toBeNull();
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('erreur réseau : confirmation conservée puis nouvel essai réussi', async () => {
        const api = installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status: 'created' }),
        });
        api.transfer.mockImplementationOnce(async () => {
            throw new TypeError('Failed to fetch');
        });
        await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));
        await screen.findByText(LABELS.errRetry);
        expect(screen.getByText(LABELS.promptTitle)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));
        await screen.findByText(LABELS.bulkTransferSuccess);
        expect(api.transfer).toHaveBeenCalledTimes(2);
        expect(bodyOf(api.transfer.mock.calls[1][0])).toEqual(EXPECTED_BODY);
        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 3000 });
    });

    it('fermeture prématurée (Annuler tout) avant 1500ms annule le timer et évite le double callback', async () => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status: 'created' }),
        });
        render(<LinkStudent onComplete={onComplete} />);
        fireEvent.change(screen.getByPlaceholderText(LABELS.bulkPlaceholder), { target: { value: 'Doe' } });
        fireEvent.click(await screen.findByText(`${STUDENT.prenom} ${STUDENT.nom}`, {}, { timeout: 2000 }));
        fireEvent.click(screen.getByRole('button', { name: bulkButtonName }));
        await screen.findByText(LABELS.promptTitle);

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));
        await screen.findByText(LABELS.bulkTransferSuccess);

        // Clic sur annuler de la vue de transfert avant l'expiration des 1500ms
        fireEvent.click(screen.getByRole('button', { name: LABELS.cancel }));
        await sleep(1600);

        // onComplete ne doit pas avoir été déclenché
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('démontage (unmount) de LinkStudent avant 1500ms empêche le callback onComplete différé', async () => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status: 'created' }),
        });
        const view = render(<LinkStudent onComplete={onComplete} />);
        fireEvent.change(screen.getByPlaceholderText(LABELS.bulkPlaceholder), { target: { value: 'Doe' } });
        fireEvent.click(await screen.findByText(`${STUDENT.prenom} ${STUDENT.nom}`, {}, { timeout: 2000 }));
        fireEvent.click(screen.getByRole('button', { name: bulkButtonName }));
        await screen.findByText(LABELS.promptTitle);

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));
        await screen.findByText(LABELS.bulkTransferSuccess);

        // Démontage immédiat
        view.unmount();
        await sleep(1600);

        expect(onComplete).not.toHaveBeenCalled();
    });
});
