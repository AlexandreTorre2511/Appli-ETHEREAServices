# ETHEREA Services - Mon App

Board de gestion d'ETHEREA Services pour toute l'équipe : pilotage, planning des interventions, clients et contrats, devis, facturation et relances, équipe et intervenants.

App web installable sur téléphone (Safari : Partager > Sur l'écran d'accueil ; Chrome : Installer l'application).
Données partagées en temps réel via Supabase, accès réservé aux comptes créés pour l'équipe.

## Mise en route (une seule fois)

1. Projet Supabase : `irfemouegnpowseqavfd` (déjà créé).
2. SQL Editor > New query : coller `supabase/schema.sql`, cliquer Run.
3. Nouvelle requête : coller le fichier de données initiales (transmis à part, jamais dans ce dépôt public), cliquer Run.
4. Authentication > Sign In / Providers : désactiver "Allow new users to sign up".
5. Authentication > URL Configuration : Site URL = `https://alexandretorre2511.github.io/Appli-ETHEREAServices/`.
6. Authentication > Users > Add user : créer un compte par membre (Alex, Corentin, Manon, Lilou), avec "Auto Confirm User".
7. Project Settings > API Keys : copier la clé anon public (ou publishable) dans `config.js`, puis pousser sur `main`.
8. GitHub > Settings > Pages : Source = Deploy from a branch, branche `main`, dossier `/ (root)`.

Sans `config.js` renseigné, l'app tourne en mode local (données dans le navigateur uniquement).

## Ce que fait le board

- Pilotage : CA facturé et encaissé du mois, impayés en retard, CA récurrent, objectif résidences syndic, devis, rentabilité (cotisations, main d'œuvre, matériel, taux de marque), liste « À traiter ».
- Planning : liste ou calendrier, filtre par intervenant, génération automatique des passages de chaque contrat sur 12 mois, statut réalisé, certificat de passage, report.
- Clients : fiches clients, contrats (échéance, date limite de dénonciation, passages réalisés), devis.
- Facturation : interventions réalisées à facturer, factures en attente, en retard, payées, relance par email pré-rédigée.
- Équipe : rôles de la structure, intervenants terrain (fiabilité, compétences, charge sur 30 jours).
- Réglages : paramètres de pilotage, export et import JSON.

Les devis et factures restent émis dans Qonto ; le board en assure le suivi.
