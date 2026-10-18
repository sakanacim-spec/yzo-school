# Manuel de Procédure YZIOW

## Table des Matières
1. [Présentation et Objectifs](#1-présentation-et-objectifs)
2. [Prérequis](#2-prérequis)
3. [Procédures Utilisateurs](#3-procédures-utilisateurs)
   - [Inscription et Connexion](#inscription-et-connexion)
4. [Espace Établissement (Direction)](#4-espace-établissement-direction)
   - [Gestion des Élèves](#gestion-des-élèves)
5. [Partenariats, Dons et Mécénat](#5-partenariats-dons-et-mécénat)
   - [Demandes de partenariat commercial](#demandes-de-partenariat-commercial)
   - [Propositions de Dons et mécénat](#propositions-de-dons-et-mécénat)
6. [Fonctions visibles mais non détaillées](#6-fonctions-visibles-mais-non-détaillées)
7. [Traçabilité des fonctionnalités](#7-traçabilité-des-fonctionnalités)

---

## 1. Présentation et Objectifs
**YZIOW** est une plateforme de gestion scolaire centralisant les opérations des établissements éducatifs pour la direction, les enseignants, les parents et les élèves.

---

## 2. Prérequis
- **Navigateur** : Un navigateur web récent.
- **Connexion Internet** : Nécessaire pour la synchronisation.

---

## 3. Procédures Utilisateurs

### Inscription et Connexion

#### Inscription d'un établissement
- **Point de départ** : Page publique d'inscription (`/register`).
- **Étapes** :
  1. Remplir la section *Établissement*.
  2. Remplir la section *Directeur*.
  3. Accepter les conditions générales et la politique de confidentialité, puis cliquer sur le bouton de création.
- **Champs visibles** :
  - Établissement : Nom de l'école, Type d'école, Pays, Ville, Adresse, Téléphone, Email, Ministère de tutelle, Slogan.
  - Directeur : Nom complet, Téléphone, Mot de passe.
- **Résultat confirmé** : Création du compte administrateur.

#### Connexion
- **Point de départ** : Page publique de connexion (`/login`).
- **Étapes** : Saisir les identifiants et valider.
- **Champs visibles** : Numéro de téléphone, Mot de passe.
- **Résultat confirmé** : Accès au tableau de bord.

---

## 4. Espace Établissement (Direction)

### Gestion des Élèves
- **Point de départ** : Page Registre des Élèves.
- **Étapes** :
  1. Cliquer sur le bouton **Nouvelle Inscription**.
  2. **Étape 1 (Identité)** : Remplir les informations de l'élève et du parent, puis continuer.
  3. **Étape 2 (Scolarité & Finance)** : Sélectionner la classe, l'écolage et le premier versement éventuel, puis valider.
- **Champs visibles** :
  - Identité : Nom de l'élève, Prénoms, Sexe, Téléphone Parent (avec indicatif pays).
  - Scolarité : Classe, Frais de scolarité à payer, École de provenance, Élève redoublant, Montant payé (1er versement), N° Reçu associé.
  - Recherche : Barre de recherche par nom, prénom, classe ou téléphone.
- **Résultat confirmé** : L'élève est inscrit et la liste est mise à jour.

---

## 5. Partenariats, Dons et Mécénat

### Demandes de partenariat commercial
- **Point de départ** : Page publique des partenaires (`/partenaires`).
- **Action** : Remplir et soumettre le formulaire de partenariat.
- **Limites connues** : Le message structuré est strictement limité à 5000 caractères.

### Propositions de Dons et mécénat
- **Point de départ** : Page publique des partenaires (`/partenaires`), via l'option dédiée aux dons.
- **Action** : Soumettre une proposition de soutien.
- **Choix visibles** : Sélection parmi 6 types de soutien au don (`supportType`).
- **Résultat confirmé** : Enregistrement de la proposition, confirmée après l’appel de soumission `submitDonationProposal`, avec un statut `pending` (en attente) et une référence retournés par l’API.
- **Limites connues** : Le formulaire ne collecte aucun paiement en ligne (pas de paiement direct, pas de génération de reçu à ce stade).

### Portail Dons (Campagnes et Retraits)
- **Point de départ** : Portail de Dons (route `/d/...`).
- **Fonctionnalités observées** :
  - Création d'une nouvelle campagne (Titre, Objectif financier, Description).
  - Affichage des statistiques (Solde disponible, Total récolté, Donateurs uniques, Campagnes actives).
  - Demande de retrait des fonds (Choix entre Mobile Money et Virement Bancaire).
- **Attention** : Ce portail est dédié à la gestion et au suivi des campagnes par l'établissement, il est distinct du formulaire public de proposition de don.

---

## 6. Fonctions visibles mais non détaillées
Les écrans et fonctionnalités suivants sont présents dans l'application, mais leur comportement détaillé n'a pas été inspecté.

- **Espace Direction** :
  - Accédez à la page *Gestion Académique*.
  - Accédez à la page *Liste des parents*.
  - Accédez à la page *Gestion du personnel*.
  - Accédez à la page *Paramètres*.
- **Espace Enseignant** :
  - Accédez à la page *Saisie des présences*.
  - Accédez à la page *Saisie des notes*.
- **Espace Parent / Élève** :
  - Accédez au *Tableau de bord parent*.
  - Accédez à la page *Consultation des notes*.
  - Accédez à la page *Devoirs et présences*.
- **Communication** :
  - Accédez à la page *Annonces*.
  - Accédez à la fenêtre *Chat / Messages*.

---

## 7. Traçabilité des fonctionnalités

| Rubrique du manuel | Fonctionnalité affirmée | Fichier source | Preuve exacte |
| --- | --- | --- | --- |
| Inscription | Page et formulaire d'inscription | `src/components/Register.tsx` | Champs exacts, conditions et étapes `modalStep` |
| Connexion | Connexion avec identifiants | `src/components/Login.tsx` | Formulaire existant pour le login |
| Direction | Registre des élèves | `src/pages/Eleves.tsx` | Modale `StudentModal` avec les étapes Identité / Scolarité |
| Direction | Gestion académique | `src/pages/GestionAcademique.tsx` | Composant `<GestionAcademique />` (présence confirmée) |
| Direction | Liste des parents | `src/pages/ParentsList.tsx` | Composant `<ParentsList />` (présence confirmée) |
| Direction | Gestion du personnel | `src/pages/GestionPersonnel.tsx` | Composant `<GestionPersonnel />` (présence confirmée) |
| Direction | Paramètres | `src/pages/Parametres.tsx` | Composant `<Parametres />` (présence confirmée) |
| Enseignant | Saisie des présences | `src/pages/professeur/SaisiePresence.tsx` | Composant `<SaisiePresence />` (présence confirmée) |
| Enseignant | Saisie des notes | `src/pages/SaisieNotes.tsx` | Composant `<SaisieNotes />` (présence confirmée) |
| Parent / Élève | Tableau de bord parent | `src/pages/parent/ParentDashboard.tsx` | Composant `<ParentDashboard />` (présence confirmée) |
| Parent / Élève | Consultation des notes | `src/pages/parent/ParentNotes.tsx` | Composant `<ParentNotes />` (présence confirmée) |
| Parent / Élève | Devoirs et présences | `src/pages/parent/ParentDevoirsPresence.tsx` | Composant `<ParentDevoirsPresence />` (présence confirmée) |
| Communication | Annonces | `src/pages/Annonces.tsx` | Composant `<Annonces />` (présence confirmée) |
| Communication | Chat / Messages | `src/components/ChatWindow.tsx` | Composant `<ChatWindow />` (présence confirmée) |
| Communication | Chat / Messages | `src/components/ChatWindow.tsx` | Composant `<ChatWindow />` (présence confirmée) |
| Partenaires : proposition de don/mécénat | Formulaire public avec 6 types de soutien et statut pending | `src/pages/public/Partners.tsx` | Choix intent don/mécénat, appel à `submitDonationProposal` |
| Portail Dons : route /d/... | Administration des campagnes de dons | `src/pages/Dons.tsx` | Composant `<Dons />` avec ses modales de création et retrait |
