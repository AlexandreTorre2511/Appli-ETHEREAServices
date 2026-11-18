// Connexion Supabase de l'ETHEREA Board.
// Renseigner les deux valeurs depuis Supabase > Project Settings > API.
// La clé "anon public" est faite pour être visible : les données restent protégées
// par la connexion de l'équipe (règles de sécurité du fichier supabase/schema.sql).
// Laisser vide pour utiliser l'app en mode local (données dans ce navigateur uniquement).
window.ETHEREA_CONFIG = {
  supabaseUrl: "https://irfemouegnpowseqavfd.supabase.co",
  supabaseAnonKey: "sb_publishable_fUaiZNNF97QXe7xYRQ4gsQ_cMbauUkV"
};
