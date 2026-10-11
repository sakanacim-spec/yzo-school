import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('P26-A.2: Autocomplétion Établissements & Visibilité Mot de passe', () => {
    const parentRegisterPath = path.resolve(process.cwd(), 'src/components/ParentRegister.tsx');
    const parentApiPath = path.resolve(process.cwd(), 'src/services/parentApi.ts');

    const parentRegisterSource = fs.readFileSync(parentRegisterPath, 'utf8');
    const parentApiSource = fs.readFileSync(parentApiPath, 'utf8');

    describe('1. Service API - searchSchools (parentApi.ts)', () => {
        it('1.1. Déclare et exporte la méthode searchSchools avec support signal AbortSignal', () => {
            assert.ok(parentApiSource.includes('searchSchools: async (query: string, signal?: AbortSignal)'), 'searchSchools doit accepter query et signal');
            assert.ok(parentApiSource.includes('/public/schools/search?q='), 'searchSchools doit appeler l\'API de recherche publique');
        });

        it('1.2. Applique le seuil de 3 caractères minimum au niveau de l\'API frontend', () => {
            assert.ok(parentApiSource.includes('if (trimmed.length < 3) return [];'), 'Retourne tableau vide si moins de 3 caractères');
        });

        it('1.3. Encode correctement la requête de recherche URI', () => {
            assert.ok(parentApiSource.includes('encodeURIComponent(trimmed)'), 'La requête doit être URI-encodée');
        });
    });

    describe('2. Formulaire ParentRegister.tsx - Comportement Autocomplétion', () => {
        it('2.1. Initialise les états nécessaires à l\'autocomplétion', () => {
            assert.ok(parentRegisterSource.includes('selectedSchool, setSelectedSchool'), 'État selectedSchool requis');
            assert.ok(parentRegisterSource.includes('schoolSearchTerm, setSchoolSearchTerm'), 'État schoolSearchTerm requis');
            assert.ok(parentRegisterSource.includes('schoolSuggestions, setSchoolSuggestions'), 'État schoolSuggestions requis');
            assert.ok(parentRegisterSource.includes('isSearchingSchools, setIsSearchingSchools'), 'État isSearchingSchools requis');
            assert.ok(parentRegisterSource.includes('showSchoolDropdown, setShowSchoolDropdown'), 'État showSchoolDropdown requis');
            assert.ok(parentRegisterSource.includes('highlightedIndex, setHighlightedIndex'), 'État highlightedIndex requis');
        });

        it('2.2. Configure un debounce entre 300 et 400 ms (350 ms)', () => {
            assert.ok(parentRegisterSource.includes('debounceTimerRef'), 'Un ref pour le debounce timer doit exister');
            assert.ok(parentRegisterSource.includes('350'), 'Le délai de debounce de 350ms doit être configuré');
        });

        it('2.3. Annule immédiatement les requêtes en vol avec AbortController pour éviter les réponses obsolètes', () => {
            assert.ok(parentRegisterSource.includes('abortControllerRef'), 'Un ref pour AbortController doit exister');
            assert.ok(parentRegisterSource.includes('abortControllerRef.current.abort()'), 'Doit appeler abort() pour invalider les réponses en vol');
            assert.ok(parentRegisterSource.includes("err.name === 'AbortError'"), 'Doit ignorer proprement les erreurs AbortError');
        });

        it('2.4. Intègre un compteur de séquence de requête (latestRequestIdRef) contre les réponses réseau désordonnées', () => {
            assert.ok(parentRegisterSource.includes('latestRequestIdRef'), 'Un ref latestRequestIdRef doit exister');
            assert.ok(parentRegisterSource.includes('requestId !== latestRequestIdRef.current'), 'Rejette les réponses réseau arrivant hors séquence');
            assert.ok(parentRegisterSource.includes('latestRequestIdRef.current++'), 'Incrémente la séquence dès la frappe pour invalider immédiatement');
        });

        it('2.5. Invalidation stricte : annule la recherche en cours et n\'invalide l\'école que si la valeur change réellement', () => {
            assert.ok(parentRegisterSource.includes('handleSchoolInputChange'), 'La méthode de saisie doit exister');
            assert.ok(parentRegisterSource.includes('if (val === schoolSearchTerm)'), 'Ne fait rien si la valeur est identique');
            assert.ok(parentRegisterSource.includes('val.trim().toLowerCase() !== selectedSchool.name.trim().toLowerCase()'), 'Vérifie si le texte diffère du nom de l\'école');
            assert.ok(parentRegisterSource.includes("setSelectedSchool(null)"), 'Réinitialise selectedSchool à null si le nom diffère');
            assert.ok(parentRegisterSource.includes("setSchoolSlug('')"), 'Réinitialise schoolSlug à vide si le nom diffère');
        });

        it('2.6. Sélection explicite d\'un établissement dans la liste', () => {
            assert.ok(parentRegisterSource.includes('handleSelectSchool'), 'handleSelectSchool doit exister');
            assert.ok(parentRegisterSource.includes('setSelectedSchool(school)'), 'Enregistre l\'école sélectionnée');
            assert.ok(parentRegisterSource.includes('setSchoolSlug(school.slug)'), 'Affecte exclusivement le slug de l\'école');
            assert.ok(parentRegisterSource.includes('setSchoolSearchTerm(school.name)'), 'Met à jour le texte du champ avec le nom de l\'école');
        });

        it('2.7. handleSelectSchool annule et invalide explicitement toute recherche en vol ou en attente', () => {
            const selectMatch = parentRegisterSource.match(/const handleSelectSchool = \([\s\S]*?setSelectedSchool\(school\);/);
            assert.ok(selectMatch, 'handleSelectSchool doit être présent');
            const selectBody = selectMatch[0];
            assert.ok(selectBody.includes('debounceTimerRef.current'), 'Doit vider le debounce timer lors de la sélection');
            assert.ok(selectBody.includes('abortControllerRef.current.abort()'), 'Doit appeler abort() lors de la sélection');
            assert.ok(selectBody.includes('latestRequestIdRef.current++'), 'Doit incrémenter latestRequestIdRef pour rejeter toute réponse tardive');
        });

        it('2.8. Blocage de la soumission si aucun établissement valide n\'a été sélectionné', () => {
            assert.ok(parentRegisterSource.includes('if (!selectedSchool || !schoolSlug) {'), 'Bloque handleSubmit sans sélection valide');
            assert.ok(parentRegisterSource.includes("setErrorField('school')"), 'Cible le champ school');
            assert.ok(parentRegisterSource.includes('schoolInputRef.current.focus()'), 'Replace le focus sur le champ école');
        });

        it('2.9. Soumission avec le school_slug exclusif de l\'école sélectionnée', () => {
            assert.ok(parentRegisterSource.includes('school_slug: schoolSlug'), 'Transmet le school_slug à parentApi.register');
        });

        it('2.10. Maintien du mode de recommandation d\'école non listée', () => {
            assert.ok(parentRegisterSource.includes('isRecommendMode'), 'Le mode recommendation doit être préservé');
            assert.ok(parentRegisterSource.includes('handleRecommendSubmit'), 'Le handler de recommandation doit être conservé');
            assert.ok(parentRegisterSource.includes("Pas dans la liste ?"), 'Le bouton de bascule vers le mode recommandation doit être présent');
        });

        it('2.11. Non-régression Vercel : Empêche toute réouverture du menu lors du focus si un établissement est déjà sélectionné', () => {
            assert.ok(parentRegisterSource.includes('!selectedSchool && schoolSearchTerm.trim().length >= 3'), 'onFocus ne doit pas réouvrir le dropdown si selectedSchool existe');
            assert.ok(parentRegisterSource.includes('!selectedSchool && showSchoolDropdown'), 'Le rendu du dropdown est strictement conditionné par !selectedSchool');
        });

        it('2.12. Non-régression Vercel : Ne jamais afficher "Aucun établissement trouvé" lorsque selectedSchool est présent', () => {
            assert.ok(parentRegisterSource.includes('!selectedSchool && schoolSuggestions.length === 0 && hasSearchedSchools'), 'Le message aucun établissement est protégé par !selectedSchool');
        });
    });

    describe('3. Formulaire ParentRegister.tsx - Accessibilité clavier et ARIA', () => {
        it('3.1. Attributs ARIA pour le combobox et la liste déroulante', () => {
            assert.ok(parentRegisterSource.includes('role="combobox"'), 'Le champ doit avoir role="combobox"');
            assert.ok(parentRegisterSource.includes('aria-expanded={showSchoolDropdown}'), 'Doit indiquer si le menu est déployé');
            assert.ok(parentRegisterSource.includes('aria-autocomplete="list"'), 'Doit déclarer aria-autocomplete');
            assert.ok(parentRegisterSource.includes('role="listbox"'), 'La liste doit avoir role="listbox"');
            assert.ok(parentRegisterSource.includes('role="option"'), 'Chaque élément doit avoir role="option"');
            assert.ok(parentRegisterSource.includes('aria-selected='), 'Chaque élément doit déclarer aria-selected');
        });

        it('3.2. aria-activedescendant pointe uniquement vers une option du menu ouvert', () => {
            assert.ok(parentRegisterSource.includes('showSchoolDropdown && highlightedIndex >= 0 && schoolSuggestions[highlightedIndex]'), 'aria-activedescendant lié à l\'ouverture du menu et à l\'index survolé');
        });

        it('3.3. Navigation au clavier et protection contre la soumission accidentelle par Entrée', () => {
            assert.ok(parentRegisterSource.includes("e.key === 'ArrowDown'"), 'Support de la flèche bas');
            assert.ok(parentRegisterSource.includes("e.key === 'ArrowUp'"), 'Support de la flèche haut');
            assert.ok(parentRegisterSource.includes("e.key === 'Enter'"), 'Support de la touche Entrée');
            assert.ok(parentRegisterSource.includes("e.preventDefault()"), 'Empêche la soumission accidentelle lors de la sélection');
            assert.ok(parentRegisterSource.includes("e.key === 'Escape'"), 'Support de la touche Échap pour fermer');
        });

    });

    describe('4. Contrôle d\'affichage et masquage du mot de passe', () => {
        it('4.1. État showPassword et bascule de type', () => {
            assert.ok(parentRegisterSource.includes('showPassword, setShowPassword'), 'État showPassword requis');
            assert.ok(parentRegisterSource.includes("type={showPassword ? 'text' : 'password'}"), 'Bascule dynamique entre text et password');
        });

        it('4.2. Bouton accessible avec aria-label et icônes Eye/EyeOff', () => {
            assert.ok(parentRegisterSource.includes('aria-label='), 'Bouton avec aria-label accessible');
            assert.ok(parentRegisterSource.includes('<Eye'), 'Composant icône Eye utilisé');
            assert.ok(parentRegisterSource.includes('<EyeOff'), 'Composant icône EyeOff utilisé');
            assert.ok(parentRegisterSource.includes('minLength={6}'), 'Les règles de validation du mot de passe sont inchangées');
        });
    });

    describe('5. Préservation des données du formulaire en cas d\'erreur', () => {
        it('5.1. Ne purge pas les champs locaux en cas d\'erreur API', () => {
            // Le bloc catch dans handleSubmit se contente de positionner setErrorMsg sans réinitialiser nom, telephone, password, schoolSlug
            const submitMatch = parentRegisterSource.match(/const handleSubmit = async[\s\S]*?finally\s*\{[\s\S]*?\};/);
            assert.ok(submitMatch, 'handleSubmit doit être présent');
            const submitBody = submitMatch[0];
            assert.ok(!submitBody.includes('setNom(\'\')'), 'nom ne doit pas être réinitialisé en cas d\'erreur');
            assert.ok(!submitBody.includes('setTelephone(\'\')'), 'telephone ne doit pas être réinitialisé');
            assert.ok(!submitBody.includes('setPassword(\'\')'), 'password ne doit pas être réinitialisé');
            assert.ok(!submitBody.includes('setSelectedSchool(null)'), 'selectedSchool ne doit pas être réinitialisé en cas d\'erreur');
        });
    });
});
