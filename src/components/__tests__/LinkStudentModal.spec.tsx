import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LinkStudentModal } from '../LinkStudentModal';
import {
    GLOBAL_ID,
    LABELS,
    STUDENT,
    bodyOf,
    deferred,
    installFetchMock,
    jsonResponse,
    sleep,
    transferRequiredResponse,
    type FakeResponse,
} from './linkTransferTestUtils';

vi.mock('../../store/useStore', () => ({ useStore: () => ({ language: 'fr' }) }));

const EXPECTED_BODY = { studentId: STUDENT.id, target_student_global_id: GLOBAL_ID };

describe('LinkStudentModal — transfert d’identité (P25-T.4b)', () => {
    // Mocks recréés à chaque test : le composant planifie onSuccess/onClose via
    // setTimeout(1500) sans nettoyage au démontage ; un mock partagé recevrait
    // les appels tardifs d'un test précédent.
    let onClose: ReturnType<typeof vi.fn<() => void>>;
    let onSuccess: ReturnType<typeof vi.fn<() => void>>;

    beforeEach(() => {
        onClose = vi.fn();
        onSuccess = vi.fn();
        localStorage.clear();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    const ui = (isOpen = true) => (
        <LinkStudentModal isOpen={isOpen} onClose={onClose} onSuccess={onSuccess} />
    );

    async function reachTransferPrompt() {
        const view = render(ui());
        fireEvent.change(screen.getByPlaceholderText(LABELS.modalPlaceholder), { target: { value: 'Doe' } });
        const linkBtn = await screen.findByRole('button', { name: LABELS.linkBtn }, { timeout: 2000 });
        fireEvent.click(linkBtn);
        await screen.findByText(LABELS.promptTitle);
        return view;
    }

    // Le bouton "Annuler" de la confirmation précède celui du pied de modale (onClose).
    const promptCancelButton = () => {
        const buttons = screen.getAllByRole('button', { name: LABELS.cancel });
        expect(buttons).toHaveLength(2);
        return buttons[0];
    };

    it('affiche la confirmation après 409 TRANSFER_REQUIRED sans lancer le transfert', async () => {
        const api = installFetchMock({ link: async () => transferRequiredResponse() });
        await reachTransferPrompt();

        expect(api.link).toHaveBeenCalledTimes(1);
        expect(bodyOf(api.link.mock.calls[0][0])).toEqual({ studentId: STUDENT.id });
        expect(screen.getByRole('button', { name: LABELS.confirm })).toBeTruthy();
        expect(api.transfer).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("n'affiche pas la confirmation si TRANSFER_REQUIRED est incomplet", async () => {
        const api = installFetchMock({
            link: async () => jsonResponse(409, { error: 'TRANSFER_REQUIRED', studentId: STUDENT.id }),
        });
        render(ui());
        fireEvent.change(screen.getByPlaceholderText(LABELS.modalPlaceholder), { target: { value: 'Doe' } });
        fireEvent.click(await screen.findByRole('button', { name: LABELS.linkBtn }, { timeout: 2000 }));

        await screen.findByText('TRANSFER_REQUIRED');
        expect(screen.queryByText(LABELS.promptTitle)).toBeNull();
        expect(api.transfer).not.toHaveBeenCalled();
    });

    it("annulation : ferme la confirmation sans appeler le transfert", async () => {
        const api = installFetchMock({ link: async () => transferRequiredResponse() });
        await reachTransferPrompt();

        fireEvent.click(promptCancelButton());

        expect(screen.queryByText(LABELS.promptTitle)).toBeNull();
        expect(screen.getByPlaceholderText(LABELS.modalPlaceholder)).toBeTruthy();
        await sleep(50);
        expect(api.transfer).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('confirmation : POST avec les identifiants exacts et le jeton parent', async () => {
        localStorage.setItem('parent_token', 'tok-parent');
        const api = installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status: 'created' }),
        });
        await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));

        await waitFor(() => expect(api.transfer).toHaveBeenCalledTimes(1));
        const init = api.transfer.mock.calls[0][0]!;
        expect(init.method).toBe('POST');
        expect(bodyOf(init)).toEqual(EXPECTED_BODY);
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-parent');
    });

    it('double clic : un seul appel de transfert, bouton désactivé pendant la requête', async () => {
        const pending = deferred<FakeResponse>();
        const api = installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: () => pending.promise,
        });
        await reachTransferPrompt();

        const confirm = screen.getByRole('button', { name: LABELS.confirm });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        fireEvent.click(confirm);

        expect(api.transfer).toHaveBeenCalledTimes(1);
        expect((confirm as HTMLButtonElement).disabled).toBe(true);
        expect((promptCancelButton() as HTMLButtonElement).disabled).toBe(true);

        pending.resolve(jsonResponse(200, { status: 'created' }));
        await screen.findByText(LABELS.linkSuccess);
        expect(api.transfer).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1), { timeout: 3000 });
    });

    it.each(['created', 'already_mapped'])('succès "%s" : message puis onSuccess + onClose', async status => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status }),
        });
        await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));

        await screen.findByText(LABELS.linkSuccess);
        expect(onSuccess).not.toHaveBeenCalled();
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1), { timeout: 3000 });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('statut inattendu : erreur affichée, aucun callback de succès', async () => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status: 'pending' }),
        });
        await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));

        await screen.findByText(LABELS.errUnexpected);
        await sleep(1700);
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
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
        expect(screen.queryByRole('button', { name: LABELS.confirm })).toBeNull();
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('409 IDENTITY_CONFLICT : message de conflit et confirmation retirée', async () => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(409, { error: 'IDENTITY_CONFLICT' }),
        });
        await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));

        await screen.findByText(LABELS.errConflict);
        expect(screen.queryByText(LABELS.promptTitle)).toBeNull();
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('erreur réseau : message, confirmation conservée, nouvel essai réussi', async () => {
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
        const confirm = screen.getByRole('button', { name: LABELS.confirm }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(false);

        fireEvent.click(confirm);
        await screen.findByText(LABELS.linkSuccess);
        expect(screen.queryByText(LABELS.errRetry)).toBeNull();
        expect(api.transfer).toHaveBeenCalledTimes(2);
        expect(bodyOf(api.transfer.mock.calls[1][0])).toEqual(EXPECTED_BODY);
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1), { timeout: 3000 });
    });

    it('fermeture puis réouverture : aucun ancien transfert affiché ni rejoué', async () => {
        const api = installFetchMock({ link: async () => transferRequiredResponse() });
        const view = await reachTransferPrompt();

        view.rerender(ui(false));
        expect(screen.queryByText(LABELS.promptTitle)).toBeNull();

        view.rerender(ui(true));
        expect(screen.queryByText(LABELS.promptTitle)).toBeNull();
        expect(screen.queryByRole('button', { name: LABELS.confirm })).toBeNull();
        expect((screen.getByPlaceholderText(LABELS.modalPlaceholder) as HTMLInputElement).value).toBe('');
        await sleep(50);
        expect(api.transfer).not.toHaveBeenCalled();
    });

    it('fermeture prématurée avant 1500ms annule le timer et empêche les callbacks différés', async () => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status: 'created' }),
        });
        const view = await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));
        await screen.findByText(LABELS.linkSuccess);

        // Fermeture via le bouton X de la modale avant les 1500ms
        const xButton = screen.getByRole('button', { name: '' });
        fireEvent.click(xButton);
        expect(onClose).toHaveBeenCalledTimes(1);

        // Rerender fermé et attente après le délai de 1500ms
        view.rerender(ui(false));
        await sleep(1600);

        // Aucun callback onSuccess différé ne doit avoir été déclenché
        expect(onSuccess).not.toHaveBeenCalled();
        // onClose ne doit pas avoir été rappelé une seconde fois
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('démontage (unmount) avant 1500ms annule le timer de succès', async () => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status: 'created' }),
        });
        const view = await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));
        await screen.findByText(LABELS.linkSuccess);

        // Démontage immédiat du composant
        view.unmount();

        // Attente au-delà du timer de 1500ms
        await sleep(1600);
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('fermeture puis réouverture : aucun callback différé de l’ancienne session', async () => {
        installFetchMock({
            link: async () => transferRequiredResponse(),
            transfer: async () => jsonResponse(200, { status: 'created' }),
        });
        const view = await reachTransferPrompt();

        fireEvent.click(screen.getByRole('button', { name: LABELS.confirm }));
        await screen.findByText(LABELS.linkSuccess);

        // Fermeture via prop isOpen=false avant expiration
        view.rerender(ui(false));

        // Réouverture
        view.rerender(ui(true));

        await sleep(1600);
        expect(onSuccess).not.toHaveBeenCalled();
    });
});
