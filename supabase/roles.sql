-- Mon App ETHEREA : rôles et cloisonnement (appliqué le 19/11/2026, migration "roles_espaces").
-- direction : tout ; admin (Manon) : gestion complète ; collaborateur : ses interventions (sans montant) et ses tâches.
-- Les comptes se créent depuis l'app (Équipe > Accès à l'application) via la fonction Edge "inviter".

create table if not exists public.acces (
  email text primary key,
  nom text not null,
  role text not null check (role in ('direction','admin','collaborateur')),
  updated_at timestamptz default now()
);
create table if not exists public.taches (
  id uuid primary key default gen_random_uuid(),
  titre text not null, assigne text, echeance date, priorite text default 'normale', statut text default 'a_faire',
  client_id uuid references public.clients(id) on delete set null, notes text, cree_par text, updated_at timestamptz default now()
);

-- Fonctions de rôle, politiques de sécurité, fonctions mes_interventions et maj_mon_intervention :
-- voir le détail dans durcissement.sql, qui en est la version finale (fonctions d'aide dans un schéma privé).
