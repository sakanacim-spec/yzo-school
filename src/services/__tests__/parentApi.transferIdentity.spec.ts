import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parentApi } from '../parentApi';

const res = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
});

describe('parentApi.transferIdentity (exécution réelle, fetch simulé)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        localStorage.clear();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('envoie un POST vers /api/students/transfer-identity avec le body exact et le jeton', async () => {
        localStorage.setItem('parent_token', 'tok-parent');
        fetchMock.mockResolvedValueOnce(res(200, { status: 'created' }));

        const out = await parentApi.transferIdentity('stu-001', 'global-abc-123');

        expect(out).toEqual({ status: 'created' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url).endsWith('/api/students/transfer-identity')).toBe(true);
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({
            studentId: 'stu-001',
            target_student_global_id: 'global-abc-123',
        });
        expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(['studentId', 'target_student_global_id']);
        expect(init.headers['Content-Type']).toBe('application/json');
        expect(init.headers.Authorization).toBe('Bearer tok-parent');
    });

    it("n'envoie pas d'en-tête Authorization sans jeton", async () => {
        fetchMock.mockResolvedValueOnce(res(200, { status: 'already_mapped' }));
        const out = await parentApi.transferIdentity('stu-001', 'global-abc-123');
        expect(out).toEqual({ status: 'already_mapped' });
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it('rejette avec le payload backend en cas de 403 TARGET_NOT_OWNED', async () => {
        fetchMock.mockResolvedValueOnce(res(403, { error: 'TARGET_NOT_OWNED' }));
        await expect(parentApi.transferIdentity('stu-001', 'global-abc-123')).rejects.toEqual({
            error: 'TARGET_NOT_OWNED',
        });
    });

    it('rejette avec le payload backend en cas de 409 IDENTITY_CONFLICT', async () => {
        fetchMock.mockResolvedValueOnce(res(409, { error: 'IDENTITY_CONFLICT' }));
        await expect(parentApi.transferIdentity('stu-001', 'global-abc-123')).rejects.toEqual({
            error: 'IDENTITY_CONFLICT',
        });
    });

    it('propage une erreur réseau', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(parentApi.transferIdentity('stu-001', 'global-abc-123')).rejects.toThrow('Failed to fetch');
    });
});
