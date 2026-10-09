// Utilitaires partagés des tests comportementaux P25-T.4b (Vitest + jsdom).
// Le vrai module parentApi est exécuté : seul `fetch` (couche réseau) est simulé.
import { vi } from 'vitest';
import { t, Language } from '../../i18n';

export const STUDENT = {
    id: 'stu-001',
    nom: 'Doe',
    prenom: 'John',
    classe: 'CM1',
    cycle: 'Primaire',
    is_linked: false,
};
export const GLOBAL_ID = 'global-abc-123';

export interface FakeResponse {
    ok: boolean;
    status: number;
    text: () => Promise<string>;
}

export const jsonResponse = (status: number, body: unknown): FakeResponse => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
});

export const transferRequiredResponse = () =>
    jsonResponse(409, {
        error: 'TRANSFER_REQUIRED',
        studentId: STUDENT.id,
        target_student_global_id: GLOBAL_ID,
    });

export type Handler = (init: RequestInit | undefined) => Promise<FakeResponse>;

const notConfigured: Handler = async () => {
    throw new Error('handler not configured');
};

/**
 * Remplace `fetch` global par un routeur simulé des endpoints utilisés par
 * LinkStudentModal / LinkStudent. Toute URL inattendue fait échouer le test.
 */
export function installFetchMock(opts: { link: Handler; transfer?: Handler }) {
    const link = vi.fn<Handler>(opts.link);
    const transfer = vi.fn<Handler>(opts.transfer ?? notConfigured);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/students/count')) return jsonResponse(200, { count: 1 });
        if (url.includes('/api/students?')) return jsonResponse(200, { students: [STUDENT] });
        if (url.endsWith('/api/students/link')) return link(init);
        if (url.endsWith('/api/students/transfer-identity')) return transfer(init);
        throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, link, transfer };
}

export const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body));

export function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Libellés calculés exactement comme dans les composants (t(...) || fallback).
const fr = 'fr' as Language;
export const LABELS = {
    modalPlaceholder: t(fr, 'parent.enterNameOrFirstname') || "Entrez le nom ou prénom de l'élève...",
    bulkPlaceholder: t(fr, 'parent.enterName') || 'Entrez un nom...',
    linkBtn: t(fr, 'parent.linkBtn') || 'Lier',
    cancel: t(fr, 'common.cancel') || 'Annuler',
    linkSuccess: t(fr, 'parent.linkSuccess') || 'Enfant lié avec succès !',
    bulkTransferSuccess: t(fr, 'parent.linkSuccess') || 'Enfant transféré avec succès !',
    linkSelectedPrefix: t(fr, 'parent.linkSelectedPrefix') || 'Lier les',
    promptTitle: 'Enfant déjà reconnu',
    confirm: 'Confirmer le transfert',
    errRetry: 'Erreur lors du transfert. Veuillez réessayer.',
    errNotOwned: "Vous n'avez pas l'autorisation de transférer cet enfant.",
    errConflict: "Conflit d'identité. Veuillez recommencer la recherche.",
    errUnexpected: 'Erreur inattendue lors du transfert.',
};
