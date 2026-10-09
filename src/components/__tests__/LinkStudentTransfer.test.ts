import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('LinkStudentModal et LinkStudent - P25-T.4b Transfer Frontend Implementation', () => {
    const modalPath = path.resolve(process.cwd(), 'src/components/LinkStudentModal.tsx');
    const linkPath = path.resolve(process.cwd(), 'src/components/LinkStudent.tsx');

    const modalSource = fs.readFileSync(modalPath, 'utf8');
    const linkSource = fs.readFileSync(linkPath, 'utf8');

    describe('LinkStudentModal - Flux de Transfert', () => {
        it('1. Validation de TRANSFER_REQUIRED et confirmation affichée', () => {
            assert.ok(modalSource.includes("err.error === 'TRANSFER_REQUIRED'"), "Doit intercepter l'erreur 409 TRANSFER_REQUIRED");
            assert.ok(modalSource.includes("setTransferPrompt({ studentId: err.studentId, globalId: err.target_student_global_id })"), "Doit alimenter l'état avec les identifiants requis");
            assert.ok(modalSource.includes("Enfant déjà reconnu"), "Doit afficher le message de l'UI");
        });

        it('2. TRANSFER_REQUIRED incomplet -> pas de transfert (validation champs)', () => {
            assert.ok(modalSource.includes("&& err.studentId && err.target_student_global_id"), "Doit exiger l'intégrité des champs pour afficher le prompt");
        });

        it('3. Annulation -> aucun appel', () => {
            assert.ok(modalSource.includes("handleTransferCancel"), "La méthode d'annulation doit exister");
            assert.ok(modalSource.includes("setTransferPrompt(null)"), "L'annulation doit purger l'état");
        });

        it('4. Confirmation -> body exact', () => {
            assert.ok(modalSource.includes("parentApi.transferIdentity(transferPrompt.studentId, transferPrompt.globalId)"), "Doit appeler la bonne API avec les bons champs de la modale");
        });

        it('5. Double clic protégé', () => {
            assert.ok(modalSource.includes("if (!transferPrompt || isTransferring) return;"), "Protection initiale");
            assert.ok(modalSource.includes("setIsTransferring(true)"), "Doit activer le verrou");
            assert.ok(modalSource.includes("disabled={isTransferring}"), "Le bouton doit être verrouillé");
        });

        it('6. Succès et comportements existants', () => {
            assert.ok(modalSource.includes("res.status === 'created' || res.status === 'already_mapped'"), "Doit accepter 'created' ou 'already_mapped'");
            assert.ok(modalSource.includes("onSuccess()"), "Doit appeler le callback success");
        });

        it('7. Erreurs (Network, conflit, cible non possédée)', () => {
            assert.ok(modalSource.includes("IDENTITY_CONFLICT"), "Doit traiter les conflits");
            assert.ok(modalSource.includes("TARGET_NOT_OWNED"), "Doit gérer les erreurs de propriété");
            assert.ok(modalSource.includes("setTransferPrompt(null)"), "Doit annuler le prompt en cas de conflit ou de refus d'autorisation");
        });
    });

    describe('LinkStudent - Flux de Transfert', () => {
        it('1. Copie des mêmes logiques de transfert', () => {
            assert.ok(linkSource.includes("err.error === 'TRANSFER_REQUIRED'"));
            assert.ok(linkSource.includes("setTransferPrompt({ studentId: err.studentId, globalId: err.target_student_global_id })"));
            assert.ok(linkSource.includes("parentApi.transferIdentity("));
            assert.ok(linkSource.includes("Enfant déjà reconnu"));
        });
    });

    describe('parentApi.ts - Endpoint de Transfert', () => {
        it('1. Présence de la méthode transferIdentity', () => {
            const apiPath = path.resolve(process.cwd(), 'src/services/parentApi.ts');
            const apiSource = fs.readFileSync(apiPath, 'utf8');
            assert.ok(apiSource.includes("transferIdentity: async (studentId: string, target_student_global_id: string)"));
            assert.ok(apiSource.includes("fetch(`${API_URL}/students/transfer-identity`"));
            assert.ok(apiSource.includes("method: 'POST'"));
        });
    });
});
