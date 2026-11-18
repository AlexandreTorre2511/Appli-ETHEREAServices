/* ETHEREA Board : pilotage d'ETHEREA Services (clients, contrats, planning, facturation, équipe). */
(() => {
"use strict";

/* ---------- Utilitaires ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ymd(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const num = v => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
const eur = (v, dec = 0) => num(v).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: dec, maximumFractionDigits: dec });
const eur2 = v => eur(v, Number.isInteger(num(v)) ? 0 : 2);
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const fdate = s => { const d = parse(s); return d ? `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}` : ""; };
const fdateShort = s => { const d = parse(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : ""; };
const sum = (arr, f) => arr.reduce((a, x) => a + num(f(x)), 0);
const by = f => (a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0);
const pct = v => `${Math.round(v * 100)} %`;

/* ---------- Référentiels ---------- */
const METIERS = ["Lutte anti-nuisibles", "Assainissement", "Nettoyage", "Désencombrement", "Hottes et extraction"];
const TYPES_CLIENT = ["Syndic ou agence", "Professionnel", "Particulier", "Collectivité"];
const FREQ = {
  "Ponctuel": {}, "Mensuel": { step: 1 }, "Trimestriel": { step: 3 }, "Semestriel": { step: 6 }, "Annuel": { step: 12 },
  "Mensuel (estival)": { months: [5, 6, 7, 8] }
};
const ST_INTER = { planifiee: ["Planifiée", "info"], realisee: ["Réalisée", "ok"], reportee: ["Reportée", "warn"], annulee: ["Annulée", ""] };
const ST_FACT = { en_attente: ["En attente", "warn"], payee: ["Payée", "ok"] };
const ST_DEVIS = { envoye: ["Envoyé", "info"], signe: ["Signé", "ok"], refuse: ["Refusé", ""] };
const ST_CONTRAT = { actif: ["Actif", "ok"], suspendu: ["Suspendu", "warn"], resilie: ["Résilié", ""] };
const SERVICES = ["Dératisation et désouratisation", "Désinsectisation blattes", "Désinsectisation fourmis", "Désinsectisation punaises de lit",
  "Désinsectisation insectes volants", "Démoustication", "Désinfection", "Dispositifs anti-oiseaux", "Débarras bureaux et archives",
  "Débarras logement", "Assainissement", "Nettoyage parties communes", "Nettoyage fin de chantier", "Nettoyage de hotte"];
const TABLES = ["clients", "contrats", "factures", "interventions", "devis", "techniciens", "membres", "parametres", "taches", "acces"];
const KEY = { acces: "email" };
const keyOf = t => KEY[t] || "id";
const ST_TACHE = { a_faire: ["À faire", "info"], en_cours: ["En cours", "warn"], fait: ["Fait", "ok"] };
const PRIO = { haute: ["Haute", "danger"], normale: ["Normale", "mute"], basse: ["Basse", "mute"] };
const ROLES = { direction: "Direction", admin: "Administration (Manon)", collaborateur: "Collaborateur" };
const DEFAULT_PARAMS = { urssaf: 0.26, cible_marque: 0.5, delai_paiement: 30, objectif_residences: 3, objectif_debut: "2026-10-30", objectif_fin: "2026-12-31", objectif_ca_mensuel: 0 };

/* ---------- Mouvement ---------- */
const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOTION = !REDUCED && window.Motion && window.Motion.animate ? window.Motion : null;
const EASE = [0.2, 0, 0, 1];

/* ---------- Données ---------- */
const S = Object.fromEntries(TABLES.map(t => [t, []]));
const cfg = window.ETHEREA_CONFIG || {};
const REMOTE = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
const LS_KEY = "etherea-board-v1";
let sb = null, user = null;
let ROLE = REMOTE ? null : "direction";   // direction | admin | collaborateur
let MON_NOM = "";
const AUTH_TYPE = (/[#&]type=(invite|recovery|magiclink|signup)/.exec(location.hash) || [])[1] || "";

const params = () => ({ ...DEFAULT_PARAMS, ...((S.parametres.find(p => p.id === "main") || {}).data || {}) });
const client = id => S.clients.find(c => c.id === id) || { nom: "Client inconnu" };
const contrat = id => S.contrats.find(c => c.id === id);
const me = () => {
  const a = user?.email ? S.acces.find(x => x.email && x.email.toLowerCase() === user.email.toLowerCase()) : null;
  const m = user?.email ? S.membres.find(x => x.email && x.email.toLowerCase() === user.email.toLowerCase()) : null;
  return a || m ? { nom: (m && m.nom) || (a && a.nom) || "" } : (REMOTE ? null : { nom: "" });
};
const isGestion = () => ROLE === "direction" || ROLE === "admin";
const estAssigne = (liste, nom) => !!nom && String(liste || "").split("/").some(x => x.trim().toLowerCase() === nom.trim().toLowerCase());

const store = {
  async load() {
    if (REMOTE) {
      const a = await sb.from("acces").select("*");
      if (a.error) throw a.error;
      S.acces = a.data || [];
      const moi = S.acces.find(x => x.email.toLowerCase() === (user?.email || "").toLowerCase());
      ROLE = moi ? moi.role : null; MON_NOM = moi ? moi.nom : "";
      if (!ROLE) return;
      if (ROLE === "collaborateur") {
        const [t, i] = await Promise.all([sb.from("taches").select("*"), sb.rpc("mes_interventions")]);
        if (t.error) throw t.error; if (i.error) throw i.error;
        S.taches = t.data || []; S.interventions = i.data || [];
        return;
      }
      const list = TABLES.filter(t => t !== "acces");
      const res = await Promise.all(list.map(t => sb.from(t).select("*")));
      res.forEach((r, i) => { if (r.error) throw r.error; S[list[i]] = r.data || []; });
    } else {
      try { const d = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); TABLES.forEach(t => S[t] = d[t] || []); } catch (e) { /* stockage indisponible */ }
      ROLE = localStorage.getItem("etherea-role-demo") || "direction";
      MON_NOM = ROLE === "admin" ? "Manon" : ROLE === "collaborateur" ? (localStorage.getItem("etherea-nom-demo") || "Théo") : "";
      if (ROLE === "collaborateur") S.interventions = S.interventions.filter(i => estAssigne(i.technicien, MON_NOM) && i.statut !== "annulee").map(i => ({ ...i, client_nom: client(i.client_id).nom, client_adresse: client(i.client_id).adresse, client_contact: client(i.client_id).contact, client_tel: client(i.client_id).tel }));
    }
  },
  saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { toast("Enregistrement local impossible sur ce navigateur"); } },
  async upsert(table, row) {
    const clean = {};
    Object.keys(row).forEach(k => { if (!k.startsWith("_")) clean[k] = row[k] === "" ? null : row[k]; });
    if (keyOf(table) === "id" && !clean.id) clean.id = uuid();
    clean.updated_at = new Date().toISOString();
    if (REMOTE) {
      const { data, error } = await sb.from(table).upsert(clean).select().single();
      if (error) { toast("Erreur : " + error.message); throw error; }
      apply(table, data);
      return data;
    }
    apply(table, clean); store.saveLocal(); return clean;
  },
  async remove(table, id) {
    const k = keyOf(table);
    if (REMOTE) { const { error } = await sb.from(table).delete().eq(k, id); if (error) { toast("Erreur : " + error.message); throw error; } }
    S[table] = S[table].filter(r => r[k] !== id);
    if (!REMOTE) store.saveLocal();
  }
};
function apply(table, row) {
  const k = keyOf(table);
  const i = S[table].findIndex(r => r[k] === row[k]);
  if (i >= 0) S[table][i] = { ...S[table][i], ...row }; else S[table].push(row);
}

/* ---------- Calculs métier ---------- */
const isLate = f => f.statut === "en_attente" && f.echeance && f.echeance < today();
const lateDays = f => (isLate(f) ? daysBetween(f.echeance, today()) : 0);
const annuel = c => num(c.passages_par_an) * num(c.prix_passage);
function contratDates(c) {
  if (!c.date_debut) return {};
  let ech = addMonths(c.date_debut, 12);
  while (ech <= today()) ech = addMonths(ech, 12);
  const debutPeriode = addMonths(ech, -12);
  return { echeance: ech, denonciation: addMonths(ech, -3), debutPeriode };
}
function contratStats(c) {
  const d = contratDates(c);
  const its = S.interventions.filter(i => i.contrat_id === c.id);
  const realises = its.filter(i => i.statut === "realisee" && (!d.debutPeriode || (i.date >= d.debutPeriode && i.date < d.echeance))).length;
  const prochain = its.filter(i => i.statut === "planifiee" && i.date >= today()).sort(by(i => i.date))[0];
  return { ...d, realises, prochain };
}
function nextNumero(prefix) {
  const y = new Date().getFullYear();
  if (prefix === "C") {
    const n = Math.max(0, ...S.contrats.map(c => { const m = /C\/(\d+)/.exec(c.numero || ""); return m ? +m[1] : 0; }));
    return `C/${String(n + 1).padStart(3, "0")}-ETH`;
  }
  const list = prefix === "F" ? S.factures : S.devis;
  const re = new RegExp(`^${prefix}-${y}-(\\d+)`);
  const n = Math.max(0, ...list.map(x => { const m = re.exec(x.numero || ""); return m ? +m[1] : 0; }));
  return `${prefix}-${y}-${String(n + 1).padStart(prefix === "F" ? 5 : 3, "0")}`;
}
function passagesAGenerer(c) {
  const f = FREQ[c.frequence] || {};
  const limit = addMonths(today(), 12);
  const exists = new Set(S.interventions.filter(i => i.contrat_id === c.id && i.statut !== "annulee").map(i => (i.date || "").slice(0, 7)));
  const dates = [];
  if (f.step) {
    const last = S.interventions.filter(i => i.contrat_id === c.id && i.statut !== "annulee").map(i => i.date).sort().pop();
    let d = last || c.date_debut || today();
    while (d < today()) d = addMonths(d, f.step);
    if (last && d === last) d = addMonths(d, f.step);
    while (d <= limit) { if (!exists.has(d.slice(0, 7))) dates.push(d); d = addMonths(d, f.step); }
  } else if (f.months) {
    const day = c.date_debut ? parse(c.date_debut).getDate() : 15;
    for (let k = 0; k <= 12; k++) {
      const base = addMonths(today().slice(0, 8) + "01", k);
      const m = parse(base).getMonth() + 1;
      if (!f.months.includes(m)) continue;
      const d = base.slice(0, 8) + pad(Math.min(day, 28));
      if (d >= today() && d <= limit && !exists.has(d.slice(0, 7))) dates.push(d);
    }
  }
  return dates;
}
function alerts() {
  const t = today(), list = [];
  const late = S.factures.filter(isLate);
  if (late.length) list.push({ lvl: "danger", txt: `${late.length} facture${late.length > 1 ? "s" : ""} en retard (${eur(sum(late, f => f.montant_ht))})`, go: "factures:retard" });
  const aFact = S.interventions.filter(i => i.statut === "realisee" && !i.facture_id && num(i.montant) > 0);
  if (aFact.length) list.push({ lvl: "warn", txt: `${aFact.length} intervention${aFact.length > 1 ? "s" : ""} réalisée${aFact.length > 1 ? "s" : ""} à facturer (${eur(sum(aFact, i => i.montant))})`, go: "factures:afacturer" });
  const passees = S.interventions.filter(i => i.statut === "planifiee" && i.date && i.date < t);
  if (passees.length) list.push({ lvl: "warn", txt: `${passees.length} intervention${passees.length > 1 ? "s" : ""} passée${passees.length > 1 ? "s" : ""} encore « planifiée » : statut à mettre à jour`, go: "planning:passees" });
  const certif = S.interventions.filter(i => i.statut === "realisee" && !i.certificat_envoye && i.date >= addDays(t, -60));
  if (certif.length) list.push({ lvl: "info", txt: `${certif.length} certificat${certif.length > 1 ? "s" : ""} de passage à envoyer`, go: "planning:certif" });
  const sansPlan = S.contrats.filter(c => c.statut === "actif" && c.frequence !== "Ponctuel" && !contratStats(c).prochain);
  if (sansPlan.length) list.push({ lvl: "info", txt: `${sansPlan.length} contrat${sansPlan.length > 1 ? "s" : ""} sans prochain passage planifié`, go: "clients:contrats" });
  const ech = S.contrats.filter(c => { const d = contratDates(c); return c.statut === "actif" && d.denonciation && d.denonciation >= t && d.denonciation <= addDays(t, 45); });
  const tLate = S.taches.filter(x => x.statut !== "fait" && x.echeance && x.echeance < t);
  if (tLate.length) list.push({ lvl: "warn", txt: `${tLate.length} tâche${tLate.length > 1 ? "s" : ""} d'équipe en retard`, go: "collab" });
  if (ech.length) list.push({ lvl: "info", txt: `${ech.length} contrat${ech.length > 1 ? "s" : ""} proche${ech.length > 1 ? "s" : ""} de la date limite de dénonciation`, go: "clients:contrats" });
  return list;
}

/* ---------- Icônes ---------- */
const I = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<path d="M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="10" cy="8" r="4"/><path d="M17 11a3 3 0 1 0 0-6M20 20c0-2.4-1.3-4.4-3-5.4"/>',
  euro: '<path d="M17 6.5A7 7 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>',
  team: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  inbox: '<path d="M4 13h4l1.5 3h5L16 13h4"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
  team2: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0M14 20a4 4 0 0 1 7.5-1.8"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  phone: '<path d="M6.6 3.5 9 4l1.4 4-2 1.4a12 12 0 0 0 6.2 6.2l1.4-2 4 1.4.5 2.4a2 2 0 0 1-2 2.3A17 17 0 0 1 4.3 5.5a2 2 0 0 1 2.3-2z"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;
const pill = (map, k, extra = "") => { const [l, c] = map[k] || [k || "", ""]; return `<span class="pill ${c}">${esc(l)}${extra}</span>`; };

/* ---------- État de l'interface ---------- */
const UI = {
  view: location.hash.slice(1).split(":")[0],
  planningMode: "liste", planningFilter: "", planningShowPast: false, calMonth: today().slice(0, 7),
  clientsTab: "clients", search: "", facturesTab: "attente",
};
const ALL_VIEWS = [
  ["direction", "Direction", "home", ["direction"]],
  ["manon", "Espace Manon", "inbox", ["direction", "admin"]],
  ["collab", "Collaborateurs", "team", ["direction", "admin"]],
  ["moi", "Mon espace", "home", ["collaborateur"]],
  ["planning", "Planning", "cal", ["direction", "admin"]],
  ["clients", "Clients", "users", ["direction", "admin"]],
  ["factures", "Facturation", "euro", ["direction", "admin"]],
  ["equipe", "Équipe", "team2", ["direction", "admin"]],
  ["reglages", "Réglages", "gear", ["direction", "admin", "collaborateur"]],
];
const SHORT = { manon: "Manon", collab: "Collabs", factures: "Factures", moi: "Mon espace" };
const HOME = { direction: "direction", admin: "manon", collaborateur: "moi" };
const viewsFor = () => ALL_VIEWS.filter(v => v[3].includes(ROLE));
const allowed = v => viewsFor().some(x => x[0] === v);
function fixView() { if (UI.view === "pilotage") UI.view = "direction"; if (!allowed(UI.view)) UI.view = HOME[ROLE] || "reglages"; }

/* ---------- Rendu principal ---------- */
function render() {
  const root = $("#root");
  if (REMOTE && !user) { root.innerHTML = loginView(); afterRender(); return; }
  if (!ROLE) { root.innerHTML = noAccessView(); return; }
  fixView();
  const VIEWS = viewsFor();
  const tabs = VIEWS.length <= 5 ? VIEWS : VIEWS.slice(0, 4);
  const plus = VIEWS.length <= 5 ? [] : VIEWS.slice(4);
  const lateCount = S.factures.filter(isLate).length;
  const count = v => (v === "factures" && lateCount ? `<span class="count">${lateCount}</span>` : "");
  root.innerHTML = `
  <div class="app">
    <aside class="side">
      <div class="brand"><img src="assets/emblem.svg" alt=""><div><b>ETHEREA</b><small>Services</small><em>Mon App</em></div></div>
      ${VIEWS.map(([k, l, ic]) => `<button class="nav ${UI.view === k ? "on" : ""}" data-act="go" data-v="${k}" ${UI.view === k ? 'aria-current="page"' : ""}>${icon(ic)}<span>${l}</span>${count(k)}</button>`).join("")}
      <div class="spacer"></div>
      <div class="who">${REMOTE ? `<b>${esc(me()?.nom || MON_NOM || "Connecté")}</b><span>${esc(ROLES[ROLE] || "")}</span>` : `<b>Mode local</b><span>${esc(ROLES[ROLE])}</span>`}</div>
    </aside>
    <header class="mtop"><img src="assets/emblem.svg" alt=""><b>ETHEREA <span>Mon App</span></b>${isGestion() && lateCount ? `<button class="pill danger" data-act="go" data-v="factures:retard">${lateCount} en retard</button>` : ""}</header>
    <main>${REMOTE ? "" : `<div class="banner">Mode local : les données restent dans ce navigateur. Connectez Supabase (fichier config.js) pour partager l'app avec l'équipe.</div>`}${views[UI.view]()}</main>
    <nav class="tabbar" aria-label="Navigation">
      ${tabs.map(([k, l, ic]) => `<button class="${UI.view === k ? "on" : ""}" data-act="go" data-v="${k}" aria-label="${esc(l)}">${icon(ic)}<span>${SHORT[k] || l}</span>${count(k)}</button>`).join("")}
      ${plus.length ? `<button class="${plus.some(v => v[0] === UI.view) ? "on" : ""}" data-act="plus">${icon("menu")}<span>${plus.some(v => v[0] === UI.view) ? esc(plus.find(v => v[0] === UI.view)[1]) : "Plus"}</span>${plus.some(v => v[0] === "factures") && lateCount ? `<span class="count">${lateCount}</span>` : ""}</button>` : ""}
    </nav>
  </div>`;
  // Un formulaire en cours de saisie n'est jamais redessiné : seules les fiches se mettent à jour en direct.
  if (drawerState && drawerState.mode === "detail") reopenDrawer();
  afterRender();
}
let renderTimer = null;
const scheduleRender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(render, 60); };

/* ---------- Vues ---------- */
const views = {};

views.direction = () => {
  const t = today(), P = params();
  const mStart = t.slice(0, 8) + "01", mEnd = addMonths(mStart, 1);
  const inMonth = d => d && d >= mStart && d < mEnd;
  const fMois = S.factures.filter(f => inMonth(f.date_emission));
  const caFact = sum(fMois, f => f.montant_ht);
  const encMois = S.factures.filter(f => f.statut === "payee" && inMonth(f.date_paiement));
  const caEnc = sum(encMois, f => f.montant_ht);
  const late = S.factures.filter(isLate);
  const attente = S.factures.filter(f => f.statut === "en_attente");
  const actifs = S.contrats.filter(c => c.statut === "actif");
  const recurrent = sum(actifs, annuel);
  const year = t.slice(0, 4);
  const restants = S.interventions.filter(i => i.statut === "planifiee" && i.date >= t && i.date.slice(0, 4) === year).length;
  const signes = S.contrats.filter(c => c.date_debut >= P.objectif_debut && c.date_debut <= P.objectif_fin && client(c.client_id).type === "Syndic ou agence");
  const residences = new Set(signes.map(c => c.client_id)).size;
  const joursObj = Math.max(0, daysBetween(t, P.objectif_fin));
  const devisMois = S.devis.filter(d => inMonth(d.date_envoi));
  const devisSignes = S.devis.filter(d => d.statut === "signe" && inMonth(d.date_signature));
  const taux = devisMois.length ? devisMois.filter(d => d.statut === "signe").length / devisMois.length : null;
  const prochaines = S.interventions.filter(i => i.statut === "planifiee" && i.date >= t && i.date <= addDays(t, 14)).sort(by(i => i.date + (i.heure || "")));
  const al = alerts();

  // CA facturé par mois sur l'année
  const months = Array.from({ length: 12 }, (_, m) => {
    const k = `${year}-${pad(m + 1)}`;
    return { m, v: sum(S.factures.filter(f => (f.date_emission || "").startsWith(k)), f => f.montant_ht) };
  });
  const maxM = Math.max(1, ...months.map(x => x.v));
  const caAnnee = sum(months, x => x.v);
  // Activité réalisée par métier sur l'année
  const parMetier = METIERS.map(m => ({ m, v: sum(S.interventions.filter(i => i.statut === "realisee" && (i.date || "").startsWith(year) && i.metier === m), i => i.montant) })).filter(x => x.v > 0);
  const maxMet = Math.max(1, ...parMetier.map(x => x.v));
  // Rentabilité du mois
  const mo = sum(fMois, f => f.main_oeuvre), mat = sum(fMois, f => f.materiel);
  const cot = caFact * num(P.urssaf);
  const marge = caFact - cot - mo - mat;
  const tauxMarque = caFact ? marge / caFact : null;

  // Les 7 prochains jours, posés sur la vague
  const semaine = Array.from({ length: 7 }, (_, k) => {
    const d = addDays(t, k);
    const its = S.interventions.filter(i => i.date === d && i.statut === "planifiee");
    return { d, its };
  });
  const nbSemaine = sum(semaine, x => x.its.length);
  const prenom = (me()?.nom || "").split(" ")[0];
  const heure = new Date().getHours();
  const salut = heure >= 18 ? "Bonsoir" : "Bonjour";
  const JOURS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  const lead = [
    nbSemaine ? `<b>${nbSemaine} passage${nbSemaine > 1 ? "s" : ""}</b> prévu${nbSemaine > 1 ? "s" : ""} sur les 7 prochains jours` : "Aucun passage prévu sur les 7 prochains jours",
    late.length ? `<b>${eur(sum(late, f => f.montant_ht))}</b> d'impayés à relancer` : "aucun impayé en retard",
  ].join(", ") + ".";
  const wave = "M0 23 C 58 4, 117 4, 175 23 S 292 42, 350 23 S 467 4, 525 23 S 642 42, 700 23";

  return `
  <section class="hero anim">
    <div class="hero-top">
      <div class="titles"><h1>${salut}${prenom ? " " + esc(prenom) : ""}</h1><p class="lead">${lead}</p></div>
      <div class="hero-actions"><button class="btn outline-w" data-act="new" data-t="devis">${icon("plus")}Devis</button><button class="btn onnavy" data-act="new" data-t="interventions">${icon("plus")}Intervention</button></div>
    </div>
    <div class="week">
      <svg class="wave" viewBox="0 0 700 46" preserveAspectRatio="none" aria-hidden="true"><path d="${wave}" pathLength="1"/></svg>
      <div class="days">${semaine.map(x => {
        const dd = parse(x.d);
        const n = x.its.length;
        const label = n === 1 ? esc(client(x.its[0].client_id).nom.replace(/^(Copropriété|Restaurant) /, "")) : n ? `<b>${n}</b> passages` : "";
        const act = n === 1 ? `data-act="open" data-t="interventions" data-id="${x.its[0].id}"` : `data-act="goDay" data-v="${x.d}"`;
        return `<button class="day ${n ? "busy" : ""} ${x.d === t ? "today" : ""}" ${act} aria-label="${fdate(x.d)}, ${n} passage(s)"><span class="dn">${x.d === t ? "auj." : JOURS[dd.getDay()]}</span><span class="dot">${dd.getDate()}</span><span class="dc">${label}</span></button>`;
      }).join("")}</div>
    </div>
  </section>

  <div class="grid kpis k6">
    <div class="card kpi anim"><div class="label">CA facturé ce mois</div><div class="value" data-count="${caFact}" data-fmt="eur">${eur(caFact)}</div><div class="hint">${fMois.length} facture${fMois.length > 1 ? "s" : ""}${P.objectif_ca_mensuel ? ` · objectif ${eur(P.objectif_ca_mensuel)}` : ""}</div>${P.objectif_ca_mensuel ? `<div class="progress"><i style="width:${Math.min(100, caFact / P.objectif_ca_mensuel * 100)}%"></i></div>` : ""}</div>
    <div class="card kpi anim"><div class="label">Encaissé ce mois</div><div class="value" data-count="${caEnc}" data-fmt="eur">${eur(caEnc)}</div><div class="hint">${eur(sum(attente, f => f.montant_ht))} restent à encaisser</div></div>
    <div class="card kpi anim click ${late.length ? "alert" : "good"}" data-act="go" data-v="factures:retard"><div class="label">Impayés en retard</div><div class="value" data-count="${sum(late, f => f.montant_ht)}" data-fmt="eur">${eur(sum(late, f => f.montant_ht))}</div><div class="hint">${late.length} facture${late.length > 1 ? "s" : ""} échue${late.length > 1 ? "s" : ""}</div></div>
    <div class="card kpi anim"><div class="label">CA récurrent annuel</div><div class="value" data-count="${recurrent}" data-fmt="eur">${eur(recurrent)}</div><div class="hint">${actifs.length} contrats actifs, ${restants} passages restants en ${year}</div></div>
    <div class="card kpi anim"><div class="label">Objectif résidences syndic</div><div class="value">${residences} / ${P.objectif_residences}</div><div class="hint">signées depuis le ${fdateShort(P.objectif_debut)}, J-${joursObj}</div><div class="progress"><i style="width:${Math.min(100, residences / Math.max(1, P.objectif_residences) * 100)}%"></i></div></div>
    <div class="card kpi anim"><div class="label">Devis du mois</div><div class="value">${devisMois.length}</div><div class="hint">${eur(sum(devisMois, d => d.montant_ht))} envoyés, ${devisSignes.length} signé${devisSignes.length > 1 ? "s" : ""}${taux !== null ? ` (${pct(taux)})` : ""}</div></div>
  </div>

  <div class="grid two section">
    <div class="card anim"><div class="head"><h2>À traiter</h2></div>
      <div class="rows">${al.length ? al.map(a => `<div class="row" data-act="go" data-v="${a.go}"><span class="pill ${a.lvl}">${a.lvl === "danger" ? "Urgent" : a.lvl === "warn" ? "À faire" : "À suivre"}</span><div class="main"><div class="t" style="white-space:normal">${esc(a.txt)}</div></div>${icon("right").replace("<svg", '<svg class="chev"')}</div>`).join("") : `<div class="empty">Rien d'urgent. Tout est à jour.</div>`}</div>
    </div>
    <div class="card anim"><div class="head"><h2>14 prochains jours</h2><button class="btn small ghost" data-act="go" data-v="planning">Ouvrir le planning</button></div>
      <div class="rows">${prochaines.length ? prochaines.map(interRow).join("") : `<div class="empty">Aucune intervention planifiée.</div>`}</div>
    </div>
  </div>

  <div class="grid two section">
    <div class="card anim"><div class="head"><h2>CA facturé ${year}</h2><span class="pill accent">${eur(caAnnee)}</span></div>
      <div class="bars">${months.map(x => `<div class="b ${x.v ? "has" : ""} ${x.m === +t.slice(5, 7) - 1 ? "cur" : ""}" title="${MOIS_L[x.m]} : ${eur(x.v)}"><em>${x.v ? Math.round(x.v) : ""}</em><i style="height:${x.v / maxM * 100}%"></i><span>${["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"][x.m]}</span></div>`).join("")}</div>
    </div>
    <div class="card anim"><div class="head"><h2>Rentabilité du mois</h2>${tauxMarque !== null ? `<span class="pill ${tauxMarque >= P.cible_marque ? "ok" : "warn"}">Taux de marque ${pct(tauxMarque)}</span>` : ""}</div>
      <dl class="kv money">
        <dt>CA facturé HT</dt><dd><b>${eur(caFact)}</b></dd>
        <dt>Cotisations (${pct(P.urssaf)})</dt><dd>${eur(-cot)}</dd>
        <dt>Main d'œuvre</dt><dd>${eur(-mo)}</dd>
        <dt>Matériel et déplacement</dt><dd>${eur(-mat)}</dd>
        <dt class="total">Marge</dt><dd class="total">${eur(marge)}</dd>
      </dl>
      <div class="sub">Cible de taux de marque : ${pct(P.cible_marque)}. Main d'œuvre et matériel se saisissent sur chaque facture.</div>
      ${parMetier.length ? `<h3 style="margin:16px 0 10px">Activité réalisée par métier (${year})</h3><div class="split">${parMetier.map(x => `<div><div class="l"><span>${esc(x.m)}</span><b>${eur(x.v)}</b></div><div class="progress" style="margin:0"><i style="width:${x.v / maxMet * 100}%"></i></div></div>`).join("")}</div>` : ""}
    </div>
  </div>`;
};

function interRow(i) {
  const d = parse(i.date);
  const c = client(i.client_id);
  return `<div class="row" data-act="open" data-t="interventions" data-id="${i.id}">
    <div class="date"><b>${d ? d.getDate() : "?"}</b><span>${d ? MOIS[d.getMonth()].replace(".", "") : ""}</span></div>
    <div class="main"><div class="t">${esc(c.nom)}</div><div class="s">${esc(i.prestation || i.metier || "")}${i.technicien ? ", " + esc(i.technicien) : ""}${i.heure ? ", " + esc(i.heure) : ""}</div></div>
    ${pill(ST_INTER, i.statut)}</div>`;
}

views.planning = () => {
  const t = today();
  const techs = [...new Set(S.interventions.flatMap(i => (i.technicien || "").split("/").map(s => s.trim())).filter(Boolean))].sort();
  const f = UI.planningFilter;
  let list = S.interventions.filter(i => !f || (i.technicien || "").includes(f));
  const special = UI.planningSpecial;
  let title = "";
  if (special === "passees") { list = list.filter(i => i.statut === "planifiee" && i.date < t); title = "Interventions passées à mettre à jour"; }
  else if (special === "certif") { list = list.filter(i => i.statut === "realisee" && !i.certificat_envoye); title = "Certificats de passage à envoyer"; }
  let body;
  if (UI.planningMode === "calendrier" && !special) body = calendar(list);
  else {
    if (!special && !UI.planningShowPast) list = list.filter(i => i.date >= t || i.statut === "planifiee");
    list.sort(by(i => (i.date || "") + (i.heure || "")));
    if (UI.planningShowPast && !special) list.reverse();
    const groups = {};
    list.forEach(i => { const k = (i.date || "").slice(0, 7); (groups[k] = groups[k] || []).push(i); });
    body = Object.keys(groups).length ? Object.entries(groups).map(([k, arr]) => `<div class="card section anim"><div class="head"><h2>${k ? MOIS_L[+k.slice(5) - 1] + " " + k.slice(0, 4) : "Sans date"}</h2><span class="pill">${arr.length}</span><span class="pill accent">${eur(sum(arr, i => i.montant))}</span></div><div class="rows">${arr.map(interRow).join("")}</div></div>`).join("")
      : `<div class="card anim"><div class="empty">Aucune intervention ${special ? "dans cette liste" : "à venir"}.</div></div>`;
  }
  return `
  <div class="top"><div class="titles"><h1>Planning</h1><div class="sub">${title || "Passages sous contrat et interventions ponctuelles"}</div></div>
    <button class="btn" data-act="genAll">Générer les passages des contrats</button>
    <button class="btn primary" data-act="new" data-t="interventions">${icon("plus")}Intervention</button></div>
  <div class="toolbar">
    ${special ? `<button class="btn small" data-act="planSpecial" data-v="">${icon("left")}Tout le planning</button>` : `<div class="seg"><span class="thumb"></span><button class="${UI.planningMode === "liste" ? "on" : ""}" data-act="planMode" data-v="liste">Liste</button><button class="${UI.planningMode === "calendrier" ? "on" : ""}" data-act="planMode" data-v="calendrier">Calendrier</button></div>`}
    <select class="search" style="max-width:220px" data-on="planFilter"><option value="">Tous les intervenants</option>${techs.map(x => `<option ${x === f ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
    ${UI.planningMode === "liste" && !special ? `<label class="chk"><input type="checkbox" data-on="planPast" ${UI.planningShowPast ? "checked" : ""}> Afficher l'historique</label>` : ""}
  </div>
  ${body}`;
};

function calendar(list) {
  const [y, m] = UI.calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = [];
  for (let k = 0; k < 42; k++) {
    const d = new Date(start); d.setDate(start.getDate() + k);
    const s = ymd(d);
    const evs = list.filter(i => i.date === s).sort(by(i => i.heure || ""));
    cells.push(`<div class="cd ${d.getMonth() !== m - 1 ? "out" : ""} ${s === today() ? "today" : ""}"><span class="n">${d.getDate()}</span>${evs.map(i => `<span class="ev ${i.statut}" data-act="open" data-t="interventions" data-id="${i.id}" title="${esc(client(i.client_id).nom)}">${esc(client(i.client_id).nom)}</span>`).join("")}</div>`);
    if (k >= 34 && d.getMonth() !== m - 1 && d.getDay() === 0) break;
  }
  return `<div class="card anim"><div class="head"><button class="btn small icon" data-act="calNav" data-v="-1" aria-label="Mois précédent">${icon("left")}</button><h2 style="text-align:center;margin:0 auto">${MOIS_L[m - 1]} ${y}</h2><button class="btn small icon" data-act="calNav" data-v="1" aria-label="Mois suivant">${icon("right")}</button></div>
  <div class="cal">${["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(d => `<div class="dow">${d}</div>`).join("")}${cells.join("")}</div></div>`;
}

views.clients = () => {
  const tab = UI.clientsTab, q = UI.search.toLowerCase();
  const match = (...xs) => !q || xs.join(" ").toLowerCase().includes(q);
  let body = "", btn = "";
  if (tab === "clients") {
    btn = `<button class="btn primary" data-act="new" data-t="clients">${icon("plus")}Client</button>`;
    const rows = S.clients.filter(c => match(c.nom, c.syndic, c.contact, c.adresse, c.type)).sort(by(c => c.nom.toLowerCase())).map(c => {
      const ks = S.contrats.filter(k => k.client_id === c.id && k.statut === "actif");
      const du = sum(S.factures.filter(f => f.client_id === c.id && f.statut === "en_attente"), f => f.montant_ht);
      const late = S.factures.some(f => f.client_id === c.id && isLate(f));
      return `<tr class="click" data-act="open" data-t="clients" data-id="${c.id}"><td><b>${esc(c.nom)}</b><div class="sub">${esc(c.adresse || "")}</div></td><td class="hide-m">${esc(c.type || "")}</td><td class="hide-m">${esc(c.syndic || "")}</td><td class="num">${ks.length}</td><td class="num hide-m">${eur(sum(ks, annuel))}</td><td class="num">${du ? `<span class="pill ${late ? "danger" : "warn"}">${eur(du)}</span>` : ""}</td></tr>`;
    }).join("");
    body = `<div class="card anim"><div class="tablewrap"><table><thead><tr><th>Client</th><th class="hide-m">Type</th><th class="hide-m">Syndic</th><th class="num">Contrats</th><th class="num hide-m">Annuel HT</th><th class="num">À encaisser</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty">Aucun client.</td></tr>`}</tbody></table></div></div>`;
  } else if (tab === "contrats") {
    btn = `<button class="btn primary" data-act="new" data-t="contrats">${icon("plus")}Contrat</button>`;
    const list = S.contrats.filter(k => match(k.numero, client(k.client_id).nom, k.prestation, k.technicien)).sort(by(k => (k.statut === "actif" ? "0" : "1") + client(k.client_id).nom));
    const rows = list.map(k => {
      const st = contratStats(k);
      const denProche = st.denonciation && st.denonciation >= today() && st.denonciation <= addDays(today(), 45);
      return `<tr class="click" data-act="open" data-t="contrats" data-id="${k.id}"><td><b>${esc(client(k.client_id).nom)}</b><div class="sub">${esc(k.numero || "Sans numéro")} · ${esc(k.prestation || "")}</div></td><td class="hide-m">${esc(k.frequence || "")}</td><td class="num hide-m">${eur2(k.prix_passage)}</td><td class="num">${eur(annuel(k))}</td><td class="num">${st.realises}/${num(k.passages_par_an)}</td><td>${st.prochain ? fdateShort(st.prochain.date) : k.statut === "actif" && k.frequence !== "Ponctuel" ? `<span class="pill warn">À planifier</span>` : ""}</td><td class="hide-m">${st.echeance ? `${fdate(st.echeance)}<div class="sub ${denProche ? "" : ""}" style="${denProche ? "color:var(--warn);font-weight:700" : ""}">dénoncer avant ${fdateShort(st.denonciation)}</div>` : ""}</td><td>${pill(ST_CONTRAT, k.statut)}</td></tr>`;
    }).join("");
    body = `<div class="card anim"><div class="tablewrap"><table><thead><tr><th>Contrat</th><th class="hide-m">Fréquence</th><th class="num hide-m">Par passage</th><th class="num">Annuel HT</th><th class="num">Réalisés</th><th>Prochain</th><th class="hide-m">Échéance</th><th>Statut</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="empty">Aucun contrat.</td></tr>`}</tbody></table></div></div>`;
  } else {
    btn = `<button class="btn primary" data-act="new" data-t="devis">${icon("plus")}Devis</button>`;
    const list = S.devis.filter(d => match(d.numero, client(d.client_id).nom, d.service, d.metier)).sort(by(d => d.date_envoi || "")).reverse();
    const rows = list.map(d => `<tr class="click" data-act="open" data-t="devis" data-id="${d.id}"><td><b>${esc(client(d.client_id).nom)}</b><div class="sub">${esc(d.numero || "")} · ${esc(d.service || d.metier || "")}</div></td><td class="hide-m">${fdate(d.date_envoi)}</td><td class="num">${eur2(d.montant_ht)}</td><td>${pill(ST_DEVIS, d.statut)}</td></tr>`).join("");
    const env = S.devis.length, sig = S.devis.filter(d => d.statut === "signe");
    body = `<div class="grid kpis" style="margin-bottom:16px"><div class="card kpi anim"><div class="label">Devis envoyés</div><div class="value">${env}</div><div class="hint">${eur(sum(S.devis, d => d.montant_ht))}</div></div><div class="card kpi anim"><div class="label">Signés</div><div class="value">${sig.length}</div><div class="hint">${eur(sum(sig, d => d.montant_ht))}${env ? ` · ${pct(sig.length / env)}` : ""}</div></div></div>
    <div class="card anim"><div class="tablewrap"><table><thead><tr><th>Devis</th><th class="hide-m">Envoyé le</th><th class="num">Montant HT</th><th>Statut</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="empty">Aucun devis.</td></tr>`}</tbody></table></div></div>`;
  }
  return `
  <div class="top"><div class="titles"><h1>Clients</h1><div class="sub">${S.clients.length} clients, ${S.contrats.filter(c => c.statut === "actif").length} contrats actifs</div></div>${btn}</div>
  <div class="toolbar"><div class="seg"><span class="thumb"></span>${[["clients", "Clients"], ["contrats", "Contrats"], ["devis", "Devis"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="clientsTab" data-v="${k}">${l}</button>`).join("")}</div>
  <input class="search" placeholder="Rechercher" value="${esc(UI.search)}" data-on="search"></div>
  ${body}`;
};

views.factures = () => {
  const tab = UI.facturesTab;
  const aFact = S.interventions.filter(i => i.statut === "realisee" && !i.facture_id && num(i.montant) > 0).sort(by(i => i.date));
  let list = S.factures.slice();
  if (tab === "attente") list = list.filter(f => f.statut === "en_attente");
  if (tab === "retard") list = list.filter(isLate);
  if (tab === "payees") list = list.filter(f => f.statut === "payee");
  list.sort(by(f => f.date_emission || "")).reverse();
  const attente = S.factures.filter(f => f.statut === "en_attente"), late = S.factures.filter(isLate);
  const year = today().slice(0, 4);
  const rows = list.map(f => `<tr class="click" data-act="open" data-t="factures" data-id="${f.id}"><td><b>${esc(client(f.client_id).nom)}</b><div class="sub">${esc(f.numero || "")}${f.nb_relances ? ` · ${f.nb_relances} relance${f.nb_relances > 1 ? "s" : ""}, dernière le ${fdateShort(f.derniere_relance)}` : ""}</div></td><td class="hide-m">${fdate(f.date_emission)}</td><td class="hide-m">${fdate(f.echeance)}</td><td class="num">${eur2(f.montant_ht)}</td><td>${isLate(f) ? `<span class="pill danger">Retard ${lateDays(f)} j</span>` : pill(ST_FACT, f.statut)}</td></tr>`).join("");
  return `
  <div class="top"><div class="titles"><h1>Facturation</h1><div class="sub">Suivi des factures émises dans Qonto, encaissements et relances</div></div>
    <button class="btn primary" data-act="new" data-t="factures">${icon("plus")}Facture</button></div>
  <div class="grid kpis">
    <div class="card kpi anim"><div class="label">À encaisser</div><div class="value">${eur(sum(attente, f => f.montant_ht))}</div><div class="hint">${attente.length} facture${attente.length > 1 ? "s" : ""}</div></div>
    <div class="card kpi ${late.length ? "alert" : "good"}"><div class="label">En retard</div><div class="value">${eur(sum(late, f => f.montant_ht))}</div><div class="hint">${late.length} facture${late.length > 1 ? "s" : ""}</div></div>
    <div class="card kpi anim"><div class="label">À facturer</div><div class="value">${eur(sum(aFact, i => i.montant))}</div><div class="hint">${aFact.length} intervention${aFact.length > 1 ? "s" : ""} réalisée${aFact.length > 1 ? "s" : ""}</div></div>
    <div class="card kpi anim"><div class="label">Encaissé ${year}</div><div class="value">${eur(sum(S.factures.filter(f => f.statut === "payee" && (f.date_paiement || "").startsWith(year)), f => f.montant_ht))}</div><div class="hint">factures payées</div></div>
  </div>
  ${aFact.length ? `<div class="card section anim" id="afacturer"><div class="head"><h2>Interventions à facturer</h2></div><div class="rows">${aFact.map(i => `<div class="row" data-act="open" data-t="interventions" data-id="${i.id}"><div class="date"><b>${parse(i.date).getDate()}</b><span>${MOIS[parse(i.date).getMonth()].replace(".", "")}</span></div><div class="main"><div class="t">${esc(client(i.client_id).nom)}</div><div class="s">${esc(i.prestation || "")}${i.notes ? " · " + esc(i.notes) : ""}</div></div><span class="amt">${eur2(i.montant)}</span><button class="btn small primary" data-act="facturer" data-id="${i.id}">Créer la facture</button></div>`).join("")}</div></div>` : ""}
  <div class="toolbar section"><div class="seg"><span class="thumb"></span>${[["attente", "À encaisser"], ["retard", "En retard"], ["payees", "Payées"], ["toutes", "Toutes"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="factTab" data-v="${k}">${l}</button>`).join("")}</div></div>
  <div class="card anim"><div class="tablewrap"><table><thead><tr><th>Facture</th><th class="hide-m">Émise le</th><th class="hide-m">Échéance</th><th class="num">Montant HT</th><th>Statut</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="empty">Aucune facture dans cette liste.</td></tr>`}</tbody></table></div></div>`;
};

/* ---------- Espace Manon : la file du jour, action par action ---------- */
function bloc(id, titre, items, rowFn, vide, extra = "") {
  return `<div class="card anim" id="${id}"><div class="head"><h2>${titre}</h2>${items.length ? `<span class="pill ${id === "m-relances" ? "danger" : "info"}">${items.length}</span>` : `<span class="pill ok">À jour</span>`}${extra}</div>
  <div class="rows">${items.length ? items.map(rowFn).join("") : `<div class="empty">${vide}</div>`}</div></div>`;
}
const dateBox = s => { const d = parse(s); return `<div class="date"><b>${d ? d.getDate() : "?"}</b><span>${d ? MOIS[d.getMonth()].replace(".", "") : ""}</span></div>`; };
function tacheRow(x, opts = {}) {
  const late = x.statut !== "fait" && x.echeance && x.echeance < today();
  const c = x.client_id && S.clients.length ? client(x.client_id).nom : "";
  return `<div class="row task ${x.statut === "fait" ? "done" : ""}" ${opts.readonly ? "" : `data-act="open" data-t="taches" data-id="${x.id}"`}>
    <button class="tick" data-act="toggleTache" data-id="${x.id}" aria-label="${x.statut === "fait" ? "Rouvrir" : "Marquer faite"} : ${esc(x.titre)}" aria-pressed="${x.statut === "fait"}">${icon("check")}</button>
    <div class="main"><div class="t">${esc(x.titre)}</div><div class="s">${[opts.showAssigne && x.assigne ? esc(x.assigne) : "", c ? esc(c) : "", x.echeance ? `pour le ${fdateShort(x.echeance)}` : ""].filter(Boolean).join(", ") || "&nbsp;"}</div></div>
    ${late ? `<span class="pill danger">En retard</span>` : x.priorite === "haute" && x.statut !== "fait" ? `<span class="pill danger plain">Prioritaire</span>` : x.statut === "en_cours" ? pill(ST_TACHE, "en_cours") : ""}</div>`;
}
const ouvertes = list => list.filter(x => x.statut !== "fait").sort(by(x => (x.priorite === "haute" ? "0" : "1") + (x.echeance || "9999")));

views.manon = () => {
  const t = today(), nom = ROLE === "admin" ? MON_NOM : "Manon";
  const aFact = S.interventions.filter(i => i.statut === "realisee" && !i.facture_id && num(i.montant) > 0).sort(by(i => i.date));
  const relances = S.factures.filter(isLate).sort(by(f => f.echeance));
  const certif = S.interventions.filter(i => i.statut === "realisee" && !i.certificat_envoye).sort(by(i => i.date)).reverse();
  const cloturer = S.interventions.filter(i => i.statut === "planifiee" && i.date < t).sort(by(i => i.date));
  const semaine = S.interventions.filter(i => i.statut === "planifiee" && i.date >= t && i.date <= addDays(t, 7)).sort(by(i => i.date + (i.heure || "")));
  const sansInterv = semaine.filter(i => !i.technicien);
  const aPlanifier = S.contrats.filter(c => c.statut === "actif" && c.frequence !== "Ponctuel" && !contratStats(c).prochain);
  const mesTaches = ouvertes(S.taches.filter(x => estAssigne(x.assigne, nom)));
  const total = aFact.length + relances.length + certif.length + cloturer.length + sansInterv.length + aPlanifier.length + mesTaches.length;
  const prenom = ROLE === "admin" ? (MON_NOM || "").split(" ")[0] : "";
  return `
  <section class="hero slim anim">
    <div class="hero-top"><div class="titles"><h1>${ROLE === "admin" ? `Bonjour${prenom ? " " + esc(prenom) : ""}` : "Espace Manon"}</h1>
      <p class="lead">${total ? `<b>${total} action${total > 1 ? "s" : ""}</b> en attente : facturation, relances, certificats et planning.` : "Tout est à jour. Rien à traiter pour le moment."}</p></div>
      <div class="hero-actions"><button class="btn outline-w" data-act="new" data-t="factures">${icon("plus")}Facture</button><button class="btn onnavy" data-act="new" data-t="interventions">${icon("plus")}Intervention</button></div></div>
    <div class="chips">
      <a class="chip" href="#m-facturer"><b>${aFact.length}</b>à facturer</a>
      <a class="chip ${relances.length ? "hot" : ""}" href="#m-relances"><b>${relances.length}</b>relances</a>
      <a class="chip" href="#m-certif"><b>${certif.length}</b>certificats</a>
      <a class="chip" href="#m-planning"><b>${cloturer.length + sansInterv.length}</b>planning</a>
    </div>
  </section>
  <div class="grid wide">
    ${bloc("m-facturer", "À facturer", aFact, i => `<div class="row" data-act="open" data-t="interventions" data-id="${i.id}">${dateBox(i.date)}<div class="main"><div class="t">${esc(client(i.client_id).nom)}</div><div class="s">${esc(i.prestation || i.metier || "")}</div></div><span class="amt">${eur2(i.montant)}</span><button class="btn small primary" data-act="facturer" data-id="${i.id}">Facturer</button></div>`, "Toutes les interventions réalisées sont facturées.")}
    ${bloc("m-relances", "Relances", relances, f => `<div class="row" data-act="open" data-t="factures" data-id="${f.id}"><div class="main"><div class="t">${esc(client(f.client_id).nom)}</div><div class="s">${esc(f.numero || "")}, ${f.nb_relances ? `relancée ${f.nb_relances} fois, dernière le ${fdateShort(f.derniere_relance)}` : "jamais relancée"}</div></div><span class="pill danger">${lateDays(f)} j</span><span class="amt hide-s">${eur2(f.montant_ht)}</span><button class="btn small" data-act="relancer" data-id="${f.id}">${icon("mail")}<span class="hide-s">Relancer</span></button></div>`, "Aucune facture en retard.")}
    ${bloc("m-certif", "Certificats de passage à envoyer", certif, i => `<div class="row" data-act="open" data-t="interventions" data-id="${i.id}">${dateBox(i.date)}<div class="main"><div class="t">${esc(client(i.client_id).nom)}</div><div class="s">${esc(i.prestation || "")}${i.rapport_risque ? ", rapport de constat à joindre" : ""}</div></div><button class="btn small" data-act="certif" data-id="${i.id}">Envoyé</button></div>`, "Tous les certificats sont partis.")}
    ${bloc("m-planning", "Planning à mettre à jour", [...cloturer.map(i => ({ ...i, _k: "passee" })), ...sansInterv.map(i => ({ ...i, _k: "sans" }))], i => `<div class="row" data-act="open" data-t="interventions" data-id="${i.id}">${dateBox(i.date)}<div class="main"><div class="t">${esc(client(i.client_id).nom)}</div><div class="s">${i._k === "passee" ? "Date passée, statut à confirmer" : "Aucun intervenant attribué"}</div></div>${i._k === "passee" ? `<button class="btn small primary" data-act="realiser" data-id="${i.id}">Réalisée</button>` : `<button class="btn small" data-act="openEdit" data-t="interventions" data-id="${i.id}">Attribuer</button>`}</div>`, "Le planning est à jour.")}
    ${bloc("m-contrats", "Contrats sans prochain passage", aPlanifier, c => `<div class="row" data-act="open" data-t="contrats" data-id="${c.id}"><div class="main"><div class="t">${esc(client(c.client_id).nom)}</div><div class="s">${esc(c.prestation || "")}, ${esc(c.frequence || "")}</div></div><button class="btn small" data-act="gen" data-id="${c.id}">Planifier</button></div>`, "Chaque contrat a son prochain passage.")}
    ${bloc("m-taches", "Mes tâches", mesTaches, x => tacheRow(x), "Aucune tâche en cours.", `<button class="btn small ghost" data-act="newTache" data-v="${esc(nom)}">${icon("plus")}Tâche</button>`)}
  </div>
  <div class="card section anim"><div class="head"><h2>7 prochains jours</h2><button class="btn small ghost" data-act="go" data-v="planning">Ouvrir le planning</button></div>
    <div class="rows">${semaine.length ? semaine.map(interRow).join("") : `<div class="empty">Aucune intervention planifiée cette semaine.</div>`}</div></div>`;
};

/* ---------- Collaborateurs (vue Direction et Manon) ---------- */
function collaborateurs() {
  const names = new Map();
  const add = (nom, type, extra = {}) => { if (!nom) return; const k = nom.trim().toLowerCase(); names.set(k, { ...(names.get(k) || { nom: nom.trim(), types: new Set() }), ...extra }); names.get(k).types.add(type); };
  S.acces.filter(a => a.role === "collaborateur").forEach(a => add(a.nom, "compte", { email: a.email }));
  S.techniciens.filter(x => x.actif !== false).forEach(x => add(x.nom, "Intervenant", { tel: x.tel }));
  S.membres.filter(m => !/gérant|administration/i.test(m.role || "")).forEach(m => add(m.nom, "Équipe"));
  S.taches.forEach(x => String(x.assigne || "").split("/").forEach(n => { const k = n.trim().toLowerCase(); if (k && names.has(k)) return; }));
  return [...names.values()].sort(by(x => x.nom.toLowerCase()));
}
views.collab = () => {
  const t = today(), list = collaborateurs();
  const toutes = S.taches.slice();
  const filt = UI.tachesTab || "ouvertes";
  const shown = filt === "faites" ? toutes.filter(x => x.statut === "fait").sort(by(x => x.updated_at || "")).reverse() : ouvertes(toutes);
  return `
  <div class="top"><div class="titles"><h1>Collaborateurs</h1><div class="sub">Équipe interne et intervenants terrain : tâches, interventions et accès à l'app</div></div>
    <button class="btn primary" data-act="newTache" data-v="">${icon("plus")}Tâche</button></div>
  <div class="grid people">${list.map(p => {
    const k = p.nom.toLowerCase();
    const its = S.interventions.filter(i => i.statut === "planifiee" && i.date >= t && i.date <= addDays(t, 7) && estAssigne(i.technicien, p.nom));
    const tch = ouvertes(S.taches.filter(x => estAssigne(x.assigne, p.nom)));
    const lateT = tch.filter(x => x.echeance && x.echeance < t).length;
    const types = [...p.types].filter(x => x !== "compte");
    return `<div class="card person anim click" data-act="person" data-v="${esc(p.nom)}">
      <div class="ph"><span class="avatar" aria-hidden="true">${esc(p.nom.slice(0, 1).toUpperCase())}</span><div class="main"><h3>${esc(p.nom)}</h3><div class="s">${esc(types.join(" et ") || "Collaborateur")}${p.types.has("compte") ? `, <span class="ok-t">accès actif</span>` : ""}</div></div></div>
      <div class="pstats"><div><b>${its.length}</b><span>intervention${its.length > 1 ? "s" : ""} (7 j)</span></div><div><b class="${lateT ? "bad" : ""}">${tch.length}</b><span>tâche${tch.length > 1 ? "s" : ""}${lateT ? `, ${lateT} en retard` : ""}</span></div></div>
    </div>`;
  }).join("") || `<div class="card empty">Aucun collaborateur. Ajoute un intervenant ou un membre dans Équipe.</div>`}</div>
  <div class="card section anim"><div class="head"><h2>Tâches de l'équipe</h2>
    <div class="seg"><span class="thumb"></span><button class="${filt === "ouvertes" ? "on" : ""}" data-act="tachesTab" data-v="ouvertes">En cours</button><button class="${filt === "faites" ? "on" : ""}" data-act="tachesTab" data-v="faites">Terminées</button></div></div>
    <div class="rows">${shown.length ? shown.slice(0, 60).map(x => tacheRow(x, { showAssigne: true })).join("") : `<div class="empty">${filt === "faites" ? "Aucune tâche terminée." : "Aucune tâche en cours. Crée une tâche pour un collaborateur."}</div>`}</div></div>`;
};

/* ---------- Mon espace (collaborateur) ---------- */
views.moi = () => {
  const t = today(), nom = MON_NOM;
  const its = S.interventions.filter(i => i.statut !== "annulee");
  const auj = its.filter(i => i.date === t);
  const avenir = its.filter(i => i.date > t && i.statut === "planifiee").sort(by(i => i.date + (i.heure || "")));
  const enAttente = its.filter(i => i.date < t && i.statut === "planifiee");
  const faites = its.filter(i => i.statut === "realisee" && i.date < t).sort(by(i => i.date)).reverse().slice(0, 6);
  const mesT = ouvertes(S.taches);
  const fini = S.taches.filter(x => x.statut === "fait").sort(by(x => x.updated_at || "")).reverse().slice(0, 5);
  const card = i => {
    const adr = i.client_adresse || "";
    return `<article class="card job anim ${i.statut}">
      <div class="jh">${dateBox(i.date)}<div class="main"><h3>${esc(i.client_nom || "Client")}</h3><div class="s">${esc(i.prestation || i.metier || "")}${i.heure ? `, ${esc(i.heure)}` : ""}</div></div>${pill(ST_INTER, i.statut)}</div>
      ${adr || i.client_tel || i.client_contact ? `<div class="jinfo">${adr ? `<a class="btn small" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adr)}" target="_blank" rel="noopener">${icon("pin")}<span>${esc(adr)}</span></a>` : ""}${i.client_tel ? `<a class="btn small" href="tel:${esc(i.client_tel.split("/")[0].replace(/[^\d+]/g, ""))}">${icon("phone")}<span>${esc(i.client_contact || "Appeler")}</span></a>` : i.client_contact ? `<span class="sub">Contact : ${esc(i.client_contact)}</span>` : ""}</div>` : ""}
      ${i.notes ? `<p class="jnotes">${esc(i.notes)}</p>` : ""}
      <div class="actions">${i.statut !== "realisee" ? `<button class="btn primary" data-act="collabFait" data-id="${i.id}">${icon("check")}Intervention réalisée</button>` : `<button class="btn" data-act="collabAnnulerFait" data-id="${i.id}">Remettre à faire</button>`}
        <button class="btn ${i.rapport_risque ? "danger" : ""}" data-act="collabRisque" data-id="${i.id}">${i.rapport_risque ? "Constat signalé" : "Signaler un constat à risque"}</button>
        <button class="btn ghost" data-act="collabNote" data-id="${i.id}">Ajouter une note</button></div>
    </article>`;
  };
  return `
  <section class="hero slim anim">
    <div class="hero-top"><div class="titles"><h1>Bonjour${nom ? " " + esc(nom.split(" ")[0]) : ""}</h1>
      <p class="lead">${auj.length ? `<b>${auj.length} intervention${auj.length > 1 ? "s" : ""}</b> aujourd'hui` : "Aucune intervention aujourd'hui"}${mesT.length ? `, <b>${mesT.length} tâche${mesT.length > 1 ? "s" : ""}</b> à faire` : ""}.</p></div></div>
  </section>
  ${enAttente.length ? `<div class="banner anim">${enAttente.length} intervention${enAttente.length > 1 ? "s passées attendent" : " passée attend"} ta confirmation.</div><div class="jobs">${enAttente.map(card).join("")}</div>` : ""}
  <h2 class="sect anim">Aujourd'hui</h2>
  <div class="jobs">${auj.length ? auj.map(card).join("") : `<div class="card empty anim">Rien de prévu aujourd'hui.</div>`}</div>
  <div class="grid two section">
    <div class="card anim"><div class="head"><h2>Mes tâches</h2>${mesT.length ? `<span class="pill info">${mesT.length}</span>` : ""}</div>
      <div class="rows">${mesT.length ? mesT.map(x => tacheRow(x, { readonly: true })).join("") : `<div class="empty">Aucune tâche en cours.</div>`}${fini.length ? fini.map(x => tacheRow(x, { readonly: true })).join("") : ""}</div></div>
    <div class="card anim"><div class="head"><h2>À venir</h2></div>
      <div class="rows">${avenir.length ? avenir.slice(0, 12).map(i => `<div class="row" data-act="jobOpen" data-id="${i.id}">${dateBox(i.date)}<div class="main"><div class="t">${esc(i.client_nom || "")}</div><div class="s">${esc(i.prestation || "")}${i.heure ? ", " + esc(i.heure) : ""}</div></div></div>`).join("") : `<div class="empty">Aucune intervention à venir.</div>`}</div></div>
  </div>
  ${faites.length ? `<div class="card section anim"><div class="head"><h2>Dernières interventions réalisées</h2></div><div class="rows">${faites.map(i => `<div class="row" data-act="jobOpen" data-id="${i.id}">${dateBox(i.date)}<div class="main"><div class="t">${esc(i.client_nom || "")}</div><div class="s">${esc(i.prestation || "")}</div></div>${pill(ST_INTER, i.statut)}</div>`).join("")}</div></div>` : ""}`;
};

views.equipe = () => {
  const t = today(), horizon = addDays(t, 30);
  const charge = name => S.interventions.filter(i => i.statut === "planifiee" && i.date >= t && i.date <= horizon && estAssigne(i.technicien, name.split(" ")[0])).length;
  const membres = S.membres.slice().sort(by(m => m.nom));
  const techs = S.techniciens.slice().sort(by(x => (x.actif === false ? "1" : "0") + x.nom));
  const acces = S.acces.slice().sort(by(a => a.role + a.nom));
  return `
  <div class="top"><div class="titles"><h1>Équipe</h1><div class="sub">Rôles de la structure, réseau d'intervenants et accès à l'app</div></div>
    <button class="btn" data-act="new" data-t="membres">${icon("plus")}Membre</button>
    <button class="btn primary" data-act="new" data-t="techniciens">${icon("plus")}Intervenant</button></div>
  <div class="grid kpis">${membres.map(m => `<div class="card kpi anim click" data-act="open" data-t="membres" data-id="${m.id}"><h3>${esc(m.nom)}</h3><div class="pill info plain" style="margin:8px 0 10px">${esc(m.role || "")}</div><div class="sub">${esc(m.missions || "")}</div>${m.email ? `<div class="sub clip" style="margin-top:6px">${esc(m.email)}</div>` : ""}</div>`).join("") || `<div class="card empty">Aucun membre.</div>`}</div>
  <div class="card section anim"><div class="head"><h2>Accès à l'application</h2>${ROLE === "direction" ? `<button class="btn small primary" data-act="newAcces">${icon("plus")}Donner un accès</button>` : ""}</div>
    <p class="sub" style="margin:-6px 0 12px">Direction : tout. Manon : gestion sans l'espace Direction. Collaborateur : ses interventions et ses tâches uniquement, sans montants ni factures. Le nom doit correspondre à celui du planning.</p>
    <div class="rows">${acces.length ? acces.map(a => `<div class="row" ${ROLE === "direction" ? `data-act="editAcces" data-v="${esc(a.email)}"` : ""}><span class="avatar sm" aria-hidden="true">${esc((a.nom || "?").slice(0, 1).toUpperCase())}</span><div class="main"><div class="t">${esc(a.nom)}</div><div class="s">${esc(a.email)}</div></div><span class="pill ${a.role === "direction" ? "accent" : a.role === "admin" ? "info" : "mute"}">${esc(ROLES[a.role] || a.role)}</span></div>`).join("") : `<div class="empty">Aucun accès enregistré.</div>`}</div></div>
  <div class="card section anim"><div class="head"><h2>Intervenants terrain</h2><span class="pill">${techs.filter(x => x.actif !== false).length} actifs</span></div>
    <div class="tablewrap"><table><thead><tr><th>Nom</th><th>Téléphone</th><th class="hide-m">Secteur</th><th>Fiabilité</th><th class="hide-m">Compétences</th><th class="num hide-s">30 j</th></tr></thead><tbody>
    ${techs.map(x => `<tr class="click" data-act="open" data-t="techniciens" data-id="${x.id}" style="${x.actif === false ? "opacity:.55" : ""}"><td><b>${esc(x.nom)}</b></td><td class="nowrap">${x.tel ? `<a href="tel:${esc(x.tel.replace(/\s/g, ""))}" onclick="event.stopPropagation()">${esc(x.tel)}</a>` : ""}</td><td class="hide-m">${esc(x.secteur || "")}</td><td style="min-width:84px">${x.fiabilite != null ? `<div class="sub">${x.fiabilite} %</div><div class="progress" style="margin:2px 0 0"><i style="width:${num(x.fiabilite)}%;background:${num(x.fiabilite) >= 70 ? "var(--ok)" : num(x.fiabilite) >= 50 ? "var(--warn)" : "var(--error)"}"></i></div>` : ""}</td><td class="hide-m sub" style="white-space:normal">${esc(x.competences || "")}</td><td class="num hide-s">${charge(x.nom)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Aucun intervenant.</td></tr>`}
    </tbody></table></div></div>`;
};

views.reglages = () => {
  const P = params();
  const compte = REMOTE ? `<div class="card anim"><h2>Mon compte</h2>
      <p class="sub" style="margin:-6px 0 14px">${esc(user?.email || "")}, ${esc(ROLES[ROLE] || "")}</p>
      <form class="form" data-form="password"><div class="field full"><label for="pw-new">Nouveau mot de passe (8 caractères minimum)</label><input id="pw-new" type="password" name="pw" minlength="8" autocomplete="new-password" required></div><div class="full"><button class="btn" type="submit">Changer le mot de passe</button></div></form>
      <div class="actions"><button class="btn danger" data-act="logout">Se déconnecter</button></div></div>` : `<div class="card anim"><h2>Aperçu des rôles (mode local)</h2><p class="sub" style="margin:-6px 0 14px">Pour tester ce que voit chaque rôle.</p><div class="actions" style="margin:0">${Object.entries(ROLES).map(([k, l]) => `<button class="btn small ${ROLE === k ? "primary" : ""}" data-act="demoRole" data-v="${k}">${esc(l)}</button>`).join("")}</div></div>`;
  if (ROLE === "collaborateur") return `<div class="top"><div class="titles"><h1>Réglages</h1></div></div><div class="grid two">${compte}</div>`;
  return `
  <div class="top"><div class="titles"><h1>Réglages</h1><div class="sub">${REMOTE ? "Données partagées en temps réel" : "Mode local, données dans ce navigateur"}</div></div></div>
  <div class="grid two">
    ${ROLE === "direction" ? `<div class="card anim"><h2>Paramètres de pilotage</h2>
      <form class="form" data-form="params">
        ${field({ k: "urssaf", l: "Taux de cotisations (ex. 0,26)", t: "number", step: "0.01" }, P)}
        ${field({ k: "cible_marque", l: "Cible de taux de marque (ex. 0,5)", t: "number", step: "0.01" }, P)}
        ${field({ k: "delai_paiement", l: "Délai de paiement (jours)", t: "number" }, P)}
        ${field({ k: "objectif_ca_mensuel", l: "Objectif CA mensuel HT", t: "number" }, P)}
        ${field({ k: "objectif_residences", l: "Objectif résidences syndic", t: "number" }, P)}
        ${field({ k: "objectif_debut", l: "Comptées à partir du", t: "date" }, P)}
        ${field({ k: "objectif_fin", l: "Date limite de l'objectif", t: "date" }, P)}
        <div class="full actions"><button class="btn primary" type="submit">Enregistrer</button></div>
      </form>
    </div>` : ""}
    ${compte}
    <div class="card anim"><h2>Données</h2>
      <p class="sub">Export complet en JSON pour sauvegarde. L'import ajoute ou met à jour les lignes du fichier sans rien supprimer.</p>
      <div class="actions"><button class="btn" data-act="export">Exporter (JSON)</button>${ROLE === "direction" ? `<label class="btn">Importer (JSON)<input type="file" accept="application/json" data-on="import" hidden></label>` : ""}</div>
    </div>
  </div>`;
};

function noAccessView() {
  return `<div class="login"><div><div class="card anim"><div class="brandline"><img src="assets/emblem.svg" alt=""><div><b>ETHEREA</b><small>Services</small></div></div>
    <h1>Accès en attente</h1><p class="sub">Le compte ${esc(user?.email || "")} n'a pas encore de rôle dans Mon App. Demande à la Direction de t'ajouter dans Équipe, Accès à l'application.</p>
    <button class="btn" data-act="logout">Se déconnecter</button></div></div></div>`;
}

/* ---------- Connexion ---------- */
function loginView() {
  return `<div class="login"><div><form class="card anim" data-form="login">
    <div class="brandline"><img src="assets/emblem.svg" alt=""><div><b>ETHEREA</b><small>Services</small></div></div>
    <h1>Mon App</h1><div class="sub">Pilotage, planning et facturation d'ETHEREA Services.</div>
    <div class="field"><label>Email</label><input type="email" name="email" autocomplete="email" required></div>
    <div class="field"><label>Mot de passe</label><input type="password" name="pw" autocomplete="current-password"></div>
    <button class="btn primary" type="submit">Se connecter</button>
    <button class="btn ghost" type="button" data-act="magic">Recevoir un lien de connexion par email</button>
    <button class="linkbtn" type="button" data-act="forgot">Mot de passe oublié</button>
    <div class="err" id="loginErr" role="alert"></div></form><p class="tag">La qualité au service d'un environnement sain</p></div></div>`;
}

/* ---------- Formulaires ---------- */
const clientOpts = () => S.clients.slice().sort(by(c => c.nom.toLowerCase())).map(c => [c.id, c.nom]);
const FIELDS = {
  clients: [
    { k: "nom", l: "Nom", req: 1, full: 1 }, { k: "type", l: "Type de client", t: "select", opts: TYPES_CLIENT },
    { k: "syndic", l: "Syndic ou gestionnaire" }, { k: "contact", l: "Contact" }, { k: "tel", l: "Téléphone" },
    { k: "email", l: "Email (plusieurs : séparer par ;)", full: 1 }, { k: "adresse", l: "Adresse", full: 1 }, { k: "notes", l: "Notes", t: "textarea", full: 1 }],
  contrats: [
    { k: "client_id", l: "Client", t: "select", opts: clientOpts, req: 1, full: 1 }, { k: "numero", l: "N° de contrat" },
    { k: "statut", l: "Statut", t: "select", opts: Object.entries(ST_CONTRAT).map(([k, v]) => [k, v[0]]) },
    { k: "metier", l: "Métier", t: "select", opts: METIERS }, { k: "prestation", l: "Prestation", list: SERVICES },
    { k: "frequence", l: "Fréquence", t: "select", opts: Object.keys(FREQ) }, { k: "passages_par_an", l: "Passages par an", t: "number" },
    { k: "prix_passage", l: "Prix par passage HT", t: "number", step: "0.01" }, { k: "date_debut", l: "Date de début", t: "date" },
    { k: "technicien", l: "Intervenant(s)", full: 1, list: () => S.techniciens.map(x => x.nom) }, { k: "notes", l: "Notes", t: "textarea", full: 1 }],
  interventions: [
    { k: "client_id", l: "Client", t: "select", opts: clientOpts, req: 1, full: 1 },
    { k: "contrat_id", l: "Contrat lié", t: "select", opts: r => [["", "Aucun (ponctuel)"], ...S.contrats.filter(k => !r.client_id || k.client_id === r.client_id).map(k => [k.id, `${client(k.client_id).nom} · ${k.prestation || ""} ${k.numero ? "(" + k.numero + ")" : ""}`])], full: 1 },
    { k: "date", l: "Date", t: "date", req: 1 }, { k: "heure", l: "Heure", t: "time" },
    { k: "metier", l: "Métier", t: "select", opts: METIERS }, { k: "prestation", l: "Prestation", list: SERVICES },
    { k: "technicien", l: "Intervenant(s)", list: () => S.techniciens.map(x => x.nom) },
    { k: "statut", l: "Statut", t: "select", opts: Object.entries(ST_INTER).map(([k, v]) => [k, v[0]]) },
    { k: "montant", l: "Montant HT", t: "number", step: "0.01" },
    { k: "facture_id", l: "Facture liée", t: "select", opts: r => [["", "Aucune"], ...S.factures.filter(f => !r.client_id || f.client_id === r.client_id).map(f => [f.id, `${f.numero || "Sans n°"} · ${eur2(f.montant_ht)}`])] },
    { k: "certificat_envoye", l: "Certificat de passage envoyé", t: "check" }, { k: "rapport_risque", l: "Constat à risque (rapport)", t: "check" },
    { k: "notes", l: "Notes", t: "textarea", full: 1 }],
  factures: [
    { k: "client_id", l: "Client", t: "select", opts: clientOpts, req: 1, full: 1 }, { k: "numero", l: "N° de facture" },
    { k: "montant_ht", l: "Montant HT", t: "number", step: "0.01", req: 1 }, { k: "date_emission", l: "Date d'émission", t: "date" },
    { k: "echeance", l: "Échéance", t: "date" }, { k: "statut", l: "Statut", t: "select", opts: Object.entries(ST_FACT).map(([k, v]) => [k, v[0]]) },
    { k: "date_paiement", l: "Date de paiement", t: "date" }, { k: "main_oeuvre", l: "Main d'œuvre", t: "number", step: "0.01" },
    { k: "materiel", l: "Matériel et déplacement", t: "number", step: "0.01" }, { k: "derniere_relance", l: "Dernière relance", t: "date" },
    { k: "nb_relances", l: "Nombre de relances", t: "number" }, { k: "notes", l: "Notes", t: "textarea", full: 1 }],
  devis: [
    { k: "client_id", l: "Client", t: "select", opts: clientOpts, req: 1, full: 1 }, { k: "numero", l: "N° de devis" },
    { k: "montant_ht", l: "Montant HT", t: "number", step: "0.01" }, { k: "metier", l: "Métier", t: "select", opts: METIERS },
    { k: "service", l: "Service", list: SERVICES }, { k: "date_envoi", l: "Envoyé le", t: "date" },
    { k: "statut", l: "Statut", t: "select", opts: Object.entries(ST_DEVIS).map(([k, v]) => [k, v[0]]) },
    { k: "date_signature", l: "Signé le", t: "date" }, { k: "notes", l: "Notes", t: "textarea", full: 1 }],
  techniciens: [
    { k: "nom", l: "Nom", req: 1 }, { k: "tel", l: "Téléphone" }, { k: "secteur", l: "Secteur géographique" },
    { k: "fiabilite", l: "Relation et fiabilité (%)", t: "number" }, { k: "competences", l: "Compétences", t: "textarea", full: 1 },
    { k: "actif", l: "Actif", t: "check" }, { k: "notes", l: "Notes", t: "textarea", full: 1 }],
  membres: [
    { k: "nom", l: "Nom", req: 1 }, { k: "role", l: "Rôle" }, { k: "email", l: "Email de connexion", full: 1 },
    { k: "missions", l: "Missions", t: "textarea", full: 1 }],
};
FIELDS.taches = [
  { k: "titre", l: "Tâche", req: 1, full: 1 },
  { k: "assigne", l: "Pour", list: () => [...new Set([...collaborateurs().map(x => x.nom), ...S.acces.map(a => a.nom), "Manon"])] },
  { k: "echeance", l: "Pour le", t: "date" },
  { k: "priorite", l: "Priorité", t: "select", opts: Object.entries(PRIO).map(([k, v]) => [k, v[0]]) },
  { k: "statut", l: "Statut", t: "select", opts: Object.entries(ST_TACHE).map(([k, v]) => [k, v[0]]) },
  { k: "client_id", l: "Client concerné", t: "select", opts: () => [["", "Aucun"], ...clientOpts()], full: 1 },
  { k: "notes", l: "Détails", t: "textarea", full: 1 }];
FIELDS.acces = [
  { k: "email", l: "Email de connexion", t: "email", req: 1, full: 1 },
  { k: "nom", l: "Nom (identique au planning, ex. Théo)", req: 1, list: () => [...new Set([...collaborateurs().map(x => x.nom), ...S.membres.map(m => m.nom)])] },
  { k: "role", l: "Rôle", t: "select", opts: Object.entries(ROLES), req: 1 }];
const TITLES = { clients: "client", contrats: "contrat", interventions: "intervention", factures: "facture", devis: "devis", techniciens: "intervenant", membres: "membre", taches: "tâche", acces: "accès" };

function field(f, row) {
  const v = row[f.k] ?? "";
  const id = "f_" + f.k;
  const cls = `field ${f.full ? "full" : ""} ${f.t === "check" ? "check" : ""}`;
  if (f.t === "check") return `<div class="${cls}"><input type="checkbox" id="${id}" name="${f.k}" ${v ? "checked" : ""}><label for="${id}">${esc(f.l)}</label></div>`;
  if (f.t === "textarea") return `<div class="${cls}"><label for="${id}">${esc(f.l)}</label><textarea id="${id}" name="${f.k}">${esc(v)}</textarea></div>`;
  if (f.t === "select") {
    const opts = (typeof f.opts === "function" ? f.opts(row) : f.opts).map(o => Array.isArray(o) ? o : [o, o]);
    const has = opts.some(o => o[0] === v);
    return `<div class="${cls}"><label for="${id}">${esc(f.l)}</label><select id="${id}" name="${f.k}" ${f.req ? "required" : ""} ${f.k === "client_id" ? 'data-on="refreshForm"' : ""}>${!has && v ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : ""}${f.req && !v ? `<option value="">Choisir</option>` : ""}${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
  }
  const list = f.list ? (typeof f.list === "function" ? f.list() : f.list) : null;
  return `<div class="${cls}"><label for="${id}">${esc(f.l)}</label><input id="${id}" name="${f.k}" type="${f.t || "text"}" ${f.step ? `step="${f.step}"` : ""} value="${esc(v)}" ${f.req ? "required" : ""} ${list ? `list="${id}_l"` : ""}>${list ? `<datalist id="${id}_l">${list.map(x => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}</div>`;
}
function readForm(form, specs) {
  const out = {};
  specs.forEach(f => {
    const el = form.elements[f.k]; if (!el) return;
    if (f.t === "check") out[f.k] = el.checked;
    else if (f.t === "number") out[f.k] = el.value === "" ? null : Number(el.value);
    else out[f.k] = el.value.trim() === "" ? null : el.value.trim();
  });
  return out;
}

/* ---------- Tiroir (détail / édition) ---------- */
let drawerState = null;
function openDrawer(state) { const fresh = !drawerState || !$("#drawer .drawer"); drawerState = state; reopenDrawer(fresh ? "open" : "swap"); }
function closeDrawer() {
  drawerState = null;
  const d = $("#drawer"); if (!d || !d.innerHTML) return;
  const dr = d.querySelector(".drawer"), ov = d.querySelector(".overlay");
  if (!MOTION || !dr) { d.innerHTML = ""; return; }
  // Sortie plus douce que l'entrée : courte, petit déplacement
  MOTION.animate(dr, { x: [0, 32], opacity: [1, 0] }, { duration: 0.16, ease: "easeIn" });
  MOTION.animate(ov, { opacity: [1, 0] }, { duration: 0.18 }).then(() => { if (!drawerState) d.innerHTML = ""; });
}
function reopenDrawer(mode) {
  const d = $("#drawer"); if (!d || !drawerState) return;
  const st = drawerState;
  let html = "";
  if (st.mode === "form") html = formDrawer(st);
  else if (SPECIAL[st.mode]) html = SPECIAL[st.mode](st);
  else html = detailDrawer(st);
  if (!html) { closeDrawer(); return; }
  const scroll = d.querySelector(".drawer")?.scrollTop || 0;
  d.innerHTML = `<div class="overlay" data-act="closeOverlay"><div class="drawer" role="dialog" aria-modal="true">${html}</div></div></div>`;
  const dr = d.querySelector(".drawer");
  dr.scrollTop = mode ? 0 : scroll;
  if (MOTION && mode === "open") {
    MOTION.animate(d.querySelector(".overlay"), { opacity: [0, 1] }, { duration: 0.2 });
    MOTION.animate(dr, { x: [48, 0], opacity: [0.4, 1] }, { type: "spring", bounce: 0, duration: 0.35 });
    MOTION.animate(dr.querySelectorAll(".body > *"), { opacity: [0, 1], y: [10, 0] }, { duration: 0.3, delay: MOTION.stagger(0.04, { startDelay: 0.08 }), ease: EASE });
  } else if (MOTION && mode === "swap") {
    MOTION.animate(dr.querySelectorAll(".dh > *, .body > *"), { opacity: [0, 1], y: [8, 0] }, { duration: 0.25, delay: MOTION.stagger(0.03), ease: EASE });
  }
  if (mode === "open") setTimeout(() => dr.querySelector("form input:not([type=checkbox]),form select,form textarea")?.focus({ preventScroll: true }), 60);
}
function formDrawer(st) {
  const row = st.row;
  const fem = ["interventions", "factures", "taches"].includes(st.table);
  const k = keyOf(st.table), exists = !row._new && !!row[k] && S[st.table].some(r => r[k] === row[k]);
  return `<div class="dh"><div style="margin-right:auto"><h2>${st.table === "acces" ? (exists ? "Modifier l'accès" : "Donner un accès") : `${exists ? "Modifier" : fem ? "Nouvelle" : "Nouveau"} ${TITLES[st.table]}`}</h2></div><button class="btn outline-w small icon" data-act="close" aria-label="Fermer">${icon("x")}</button></div><div class="body">
  <form class="form" data-form="edit">${FIELDS[st.table].map(f => field(f, row)).join("")}
    ${st.table === "acces" && !exists ? `<p class="sub full" style="margin:0">Un email d'invitation part à cette adresse : la personne clique sur le lien et choisit son mot de passe.</p>` : ""}
    <div class="full actions"><button class="btn primary" type="submit">${st.table === "acces" && !exists && REMOTE ? "Envoyer l'invitation" : "Enregistrer"}</button><button class="btn" type="button" data-act="close">Annuler</button><span class="grow"></span>${exists ? `<button class="btn danger" type="button" data-act="del">${st.table === "acces" ? "Retirer l'accès" : "Supprimer"}</button>` : ""}</div>
  </form>`;
}
function kv(pairs) { return `<dl class="kv">${pairs.filter(p => p[1] !== null && p[1] !== undefined && p[1] !== "").map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`; }
const mailLinks = s => (s || "").split(/[;,]/).map(x => x.trim()).filter(Boolean).map(x => `<a href="mailto:${esc(x)}">${esc(x)}</a>`).join("<br>");

function detailDrawer(st) {
  const r = S[st.table].find(x => x.id === st.id);
  if (!r) return "";
  const head = (title, sub) => `<div class="dh"><div style="margin-right:auto"><h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}</div><button class="btn onnavy small" data-act="edit">Modifier</button><button class="btn outline-w small icon" data-act="close" aria-label="Fermer">${icon("x")}</button></div><div class="body">`;
  if (st.table === "clients") {
    const ks = S.contrats.filter(k => k.client_id === r.id);
    const its = S.interventions.filter(i => i.client_id === r.id).sort(by(i => i.date || "")).reverse();
    const fs = S.factures.filter(f => f.client_id === r.id).sort(by(f => f.date_emission || "")).reverse();
    return head(r.nom, esc(r.type || "")) + kv([["Syndic", esc(r.syndic)], ["Contact", esc(r.contact)], ["Téléphone", r.tel ? esc(r.tel) : ""], ["Email", mailLinks(r.email)], ["Adresse", esc(r.adresse)], ["Notes", esc(r.notes)]]) + `
    <div class="actions" style="margin:0 0 18px"><button class="btn small" data-act="newFor" data-t="contrats">${icon("plus")}Contrat</button><button class="btn small" data-act="newFor" data-t="interventions">${icon("plus")}Intervention</button><button class="btn small" data-act="newFor" data-t="factures">${icon("plus")}Facture</button><button class="btn small" data-act="newFor" data-t="devis">${icon("plus")}Devis</button></div>
    <h3>Contrats</h3><div class="rows" style="margin-bottom:16px">${ks.map(k => `<div class="row" data-act="open" data-t="contrats" data-id="${k.id}"><div class="main"><div class="t">${esc(k.prestation || "")}</div><div class="s">${esc(k.numero || "Sans numéro")} · ${esc(k.frequence || "")} · ${eur2(k.prix_passage)} par passage</div></div><span class="amt">${eur(annuel(k))}</span>${pill(ST_CONTRAT, k.statut)}</div>`).join("") || `<div class="empty">Aucun contrat.</div>`}</div>
    <h3>Interventions</h3><div class="rows" style="margin-bottom:16px">${its.slice(0, 12).map(interRow).join("") || `<div class="empty">Aucune intervention.</div>`}</div>
    <h3>Factures</h3><div class="rows">${fs.map(factRow).join("") || `<div class="empty">Aucune facture.</div>`}</div>`;
  }
  if (st.table === "contrats") {
    const s = contratStats(r);
    const its = S.interventions.filter(i => i.contrat_id === r.id).sort(by(i => i.date || "")).reverse();
    const gen = r.statut === "actif" ? passagesAGenerer(r) : [];
    return head(`${client(r.client_id).nom}`, `${esc(r.numero || "Sans numéro")} · ${esc(r.prestation || "")}`) + kv([
      ["Statut", pill(ST_CONTRAT, r.statut)], ["Métier", esc(r.metier)], ["Fréquence", esc(r.frequence)], ["Prix par passage", eur2(r.prix_passage)],
      ["Montant annuel", `<b>${eur(annuel(r))}</b>`], ["Début", fdate(r.date_debut)], ["Prochaine échéance", s.echeance ? fdate(s.echeance) : ""],
      ["Dénoncer avant", s.denonciation ? fdate(s.denonciation) : ""], ["Réalisés (période)", `${s.realises} / ${num(r.passages_par_an)}`],
      ["Intervenant(s)", esc(r.technicien)], ["Notes", esc(r.notes)]]) + `
    <div class="actions" style="margin:0 0 18px">${gen.length ? `<button class="btn primary small" data-act="gen" data-id="${r.id}">Planifier ${gen.length} passage${gen.length > 1 ? "s" : ""} (12 mois)</button>` : ""}<button class="btn small" data-act="openClient" data-id="${r.client_id}">Fiche client</button></div>
    <h3>Passages</h3><div class="rows">${its.map(interRow).join("") || `<div class="empty">Aucun passage enregistré.</div>`}</div>`;
  }
  if (st.table === "interventions") {
    const k = r.contrat_id ? contrat(r.contrat_id) : null, f = r.facture_id ? S.factures.find(x => x.id === r.facture_id) : null;
    const c = client(r.client_id);
    return head(c.nom, `${fdate(r.date)}${r.heure ? " · " + esc(r.heure) : ""}`) + kv([
      ["Statut", pill(ST_INTER, r.statut)], ["Prestation", esc(r.prestation)], ["Métier", esc(r.metier)], ["Intervenant(s)", esc(r.technicien)],
      ["Adresse", esc(c.adresse)], ["Contrat", k ? `${esc(k.numero || "Sans numéro")} · ${esc(k.frequence || "")}` : "Ponctuel"], ["Montant HT", r.montant != null ? eur2(r.montant) : ""],
      ["Facture", f ? `${esc(f.numero || "")} · ${pill(ST_FACT, f.statut)}` : ""], ["Certificat", r.statut === "realisee" ? (r.certificat_envoye ? pill({ a: ["Envoyé", "ok"] }, "a") : pill({ a: ["À envoyer", "warn"] }, "a")) : ""],
      ["Constat à risque", r.rapport_risque ? pill({ a: ["Rapport à faire", "danger"] }, "a") : ""], ["Notes", esc(r.notes)]]) + `
    <div class="actions">
      ${r.statut !== "realisee" ? `<button class="btn primary" data-act="realiser" data-id="${r.id}">${icon("check")}Marquer réalisée</button>` : ""}
      ${r.statut === "realisee" && !r.certificat_envoye ? `<button class="btn" data-act="certif" data-id="${r.id}">Certificat envoyé</button>` : ""}
      ${r.statut === "realisee" && !r.facture_id ? `<button class="btn primary" data-act="facturer" data-id="${r.id}">Créer la facture</button>` : ""}
      ${r.statut === "planifiee" ? `<button class="btn" data-act="reporter" data-id="${r.id}">Reporter</button>` : ""}
      ${f ? `<button class="btn" data-act="open" data-t="factures" data-id="${f.id}">Voir la facture</button>` : ""}
      <button class="btn" data-act="openClient" data-id="${r.client_id}">Fiche client</button>
    </div>`;
  }
  if (st.table === "factures") {
    const c = client(r.client_id);
    const its = S.interventions.filter(i => i.facture_id === r.id);
    return head(c.nom, `${esc(r.numero || "Sans numéro")}`) + kv([
      ["Statut", isLate(r) ? `<span class="pill danger">En retard de ${lateDays(r)} jours</span>` : pill(ST_FACT, r.statut)], ["Montant HT", `<b>${eur2(r.montant_ht)}</b>`],
      ["Émise le", fdate(r.date_emission)], ["Échéance", fdate(r.echeance)], ["Payée le", fdate(r.date_paiement)],
      ["Relances", r.nb_relances ? `${r.nb_relances}, dernière le ${fdate(r.derniere_relance)}` : ""], ["Main d'œuvre", r.main_oeuvre != null ? eur2(r.main_oeuvre) : ""],
      ["Matériel", r.materiel != null ? eur2(r.materiel) : ""], ["Email client", mailLinks(c.email)], ["Interventions", its.map(i => fdate(i.date) + " · " + esc(i.prestation || "")).join("<br>")], ["Notes", esc(r.notes)]]) + `
    <div class="actions">
      ${r.statut !== "payee" ? `<button class="btn primary" data-act="payer" data-id="${r.id}">${icon("check")}Marquer payée</button><button class="btn" data-act="relancer" data-id="${r.id}">${icon("mail")}Relancer par email</button>` : ""}
      <button class="btn" data-act="openClient" data-id="${r.client_id}">Fiche client</button>
    </div>`;
  }
  if (st.table === "devis") {
    return head(client(r.client_id).nom, esc(r.numero || "")) + kv([["Statut", pill(ST_DEVIS, r.statut)], ["Montant HT", `<b>${eur2(r.montant_ht)}</b>`], ["Métier", esc(r.metier)], ["Service", esc(r.service)], ["Envoyé le", fdate(r.date_envoi)], ["Signé le", fdate(r.date_signature)], ["Notes", esc(r.notes)]]) + `
    <div class="actions">${r.statut === "envoye" ? `<button class="btn primary" data-act="signer" data-id="${r.id}">${icon("check")}Devis signé</button><button class="btn" data-act="refuser" data-id="${r.id}">Refusé</button>` : ""}<button class="btn" data-act="openClient" data-id="${r.client_id}">Fiche client</button></div>`;
  }
  if (st.table === "techniciens") {
    const its = S.interventions.filter(i => (i.technicien || "").toLowerCase().includes(r.nom.toLowerCase())).sort(by(i => i.date || "")).reverse();
    return head(r.nom, esc(r.secteur || "")) + kv([["Téléphone", r.tel ? `<a href="tel:${esc(r.tel.replace(/\s/g, ""))}">${esc(r.tel)}</a>` : ""], ["Fiabilité", r.fiabilite != null ? r.fiabilite + " %" : ""], ["Compétences", esc(r.competences)], ["Statut", r.actif === false ? "Inactif" : "Actif"], ["Notes", esc(r.notes)]]) +
      `<h3>Interventions</h3><div class="rows">${its.slice(0, 15).map(interRow).join("") || `<div class="empty">Aucune intervention.</div>`}</div>`;
  }
  if (st.table === "taches") {
    const c = r.client_id && S.clients.length ? client(r.client_id) : null;
    return head(r.titre, r.assigne ? "Pour " + esc(r.assigne) : "Non attribuée") + kv([["Statut", pill(ST_TACHE, r.statut)], ["Priorité", pill(PRIO, r.priorite)], ["Pour le", r.echeance ? fdate(r.echeance) + (r.statut !== "fait" && r.echeance < today() ? ` <span class="pill danger">En retard</span>` : "") : ""], ["Client", c ? `<button class="linkbtn" data-act="openClient" data-id="${r.client_id}">${esc(c.nom)}</button>` : ""], ["Créée par", esc(r.cree_par)], ["Détails", esc(r.notes)]]) +
      `<div class="actions"><button class="btn primary" data-act="toggleTache" data-id="${r.id}">${icon("check")}${r.statut === "fait" ? "Rouvrir la tâche" : "Marquer faite"}</button></div>`;
  }
  if (st.table === "membres") {
    return head(r.nom, esc(r.role || "")) + kv([["Email", mailLinks(r.email)], ["Missions", esc(r.missions)]]);
  }
  return "";
}
function factRow(f) {
  return `<div class="row" data-act="open" data-t="factures" data-id="${f.id}"><div class="main"><div class="t">${esc(f.numero || "Sans numéro")}</div><div class="s">émise le ${fdate(f.date_emission)}</div></div><span class="amt">${eur2(f.montant_ht)}</span>${isLate(f) ? `<span class="pill danger">Retard ${lateDays(f)} j</span>` : pill(ST_FACT, f.statut)}</div>`;
}

async function majCollab(id, patch, msg) {
  const i = S.interventions.find(x => x.id === id); if (!i) return;
  if (REMOTE && ROLE === "collaborateur") {
    const { error } = await sb.rpc("maj_mon_intervention", { p_id: id, p_statut: null, p_risque: null, p_notes: null, ...patch });
    if (error) { toast("Erreur : " + error.message); return; }
  } else if (!REMOTE) {
    const base = { ...i }; ["client_nom", "client_adresse", "client_contact", "client_tel"].forEach(k => delete base[k]);
    const next = { ...base };
    if (patch.p_statut) next.statut = patch.p_statut;
    if (patch.p_risque !== undefined) next.rapport_risque = patch.p_risque;
    if (patch.p_notes !== undefined) next.notes = patch.p_notes;
    const d = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    d.interventions = (d.interventions || []).map(x => x.id === id ? { ...x, ...next } : x);
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  }
  Object.assign(i, patch.p_statut ? { statut: patch.p_statut } : {}, patch.p_risque !== undefined ? { rapport_risque: patch.p_risque } : {}, patch.p_notes !== undefined ? { notes: patch.p_notes } : {});
  toast(msg); render(); if (drawerState?.mode === "job") reopenDrawer();
}

/* ---------- Tiroirs spéciaux ---------- */
const closeBtn = `<button class="btn outline-w small icon" data-act="close" aria-label="Fermer">${icon("x")}</button>`;
const SPECIAL = {
  password: () => `<div class="dh"><div style="margin-right:auto"><h2>Choisis ton mot de passe</h2><div class="sub">Tu pourras ensuite te connecter avec ton email et ce mot de passe.</div></div>${closeBtn}</div><div class="body">
    <form class="form" data-form="setpw"><div class="field full"><label for="pw1">Mot de passe (8 caractères minimum)</label><input id="pw1" type="password" name="pw" minlength="8" autocomplete="new-password" required></div>
    <div class="field full"><label for="pw2">Confirmation</label><input id="pw2" type="password" name="pw2" minlength="8" autocomplete="new-password" required></div>
    <div class="full actions"><button class="btn primary" type="submit">Enregistrer le mot de passe</button></div><div class="err full" id="pwErr" role="alert"></div></form>`,
  plus: () => {
    const VIEWS = viewsFor();
    const late = S.factures.filter(isLate).length;
    return `<div class="dh"><div style="margin-right:auto"><h2>Menu</h2></div>${closeBtn}</div><div class="body"><div class="menu">${VIEWS.map(([k, l, ic]) => `<button class="nav-l ${UI.view === k ? "on" : ""}" data-act="go" data-v="${k}">${icon(ic)}<span>${esc(l)}</span>${k === "factures" && late ? `<span class="pill danger">${late}</span>` : ""}</button>`).join("")}</div>`;
  },
  person: st => {
    const nom = st.nom, t = today();
    const its = S.interventions.filter(i => estAssigne(i.technicien, nom) && i.statut !== "annulee");
    const next = its.filter(i => i.date >= t && i.statut === "planifiee").sort(by(i => i.date));
    const done = its.filter(i => i.statut === "realisee").sort(by(i => i.date)).reverse().slice(0, 5);
    const tch = S.taches.filter(x => estAssigne(x.assigne, nom));
    const acc = S.acces.find(a => a.nom.toLowerCase() === nom.toLowerCase());
    const tech = S.techniciens.find(x => x.nom.toLowerCase() === nom.toLowerCase());
    return `<div class="dh"><div style="margin-right:auto"><h2>${esc(nom)}</h2><div class="sub">${acc ? `Accès : ${esc(acc.email)}` : "Pas encore d'accès à l'app"}</div></div>${closeBtn}</div><div class="body">
      <div class="actions" style="margin:0 0 6px"><button class="btn small primary" data-act="newTache" data-v="${esc(nom)}">${icon("plus")}Tâche</button>${!acc && ROLE === "direction" ? `<button class="btn small" data-act="newAcces" data-v="${esc(nom)}">Donner un accès</button>` : ""}${tech?.tel ? `<a class="btn small" href="tel:${esc(tech.tel.replace(/\s/g, ""))}">${icon("phone")}Appeler</a>` : ""}${tech ? `<button class="btn small ghost" data-act="open" data-t="techniciens" data-id="${tech.id}">Fiche intervenant</button>` : ""}</div>
      <h3>Tâches</h3><div class="rows">${tch.length ? [...ouvertes(tch), ...tch.filter(x => x.statut === "fait")].map(x => tacheRow(x)).join("") : `<div class="empty">Aucune tâche.</div>`}</div>
      <h3>Prochaines interventions</h3><div class="rows">${next.length ? next.slice(0, 10).map(interRow).join("") : `<div class="empty">Aucune intervention planifiée.</div>`}</div>
      ${done.length ? `<h3>Dernières réalisées</h3><div class="rows">${done.map(interRow).join("")}</div>` : ""}`;
  },
  job: st => {
    const i = S.interventions.find(x => x.id === st.id); if (!i) return "";
    return `<div class="dh"><div style="margin-right:auto"><h2>${esc(i.client_nom || "")}</h2><div class="sub">${fdate(i.date)}${i.heure ? ", " + esc(i.heure) : ""}</div></div>${closeBtn}</div><div class="body">` +
      kv([["Prestation", esc(i.prestation || i.metier)], ["Statut", pill(ST_INTER, i.statut)], ["Adresse", i.client_adresse ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.client_adresse)}" target="_blank" rel="noopener">${esc(i.client_adresse)}</a>` : ""], ["Contact", esc(i.client_contact)], ["Téléphone", i.client_tel ? `<a href="tel:${esc(i.client_tel.split("/")[0].replace(/[^\d+]/g, ""))}">${esc(i.client_tel)}</a>` : ""], ["Avec", esc(i.technicien)], ["Notes", esc(i.notes)]]) +
      `<div class="actions">${i.statut !== "realisee" ? `<button class="btn primary" data-act="collabFait" data-id="${i.id}">${icon("check")}Intervention réalisée</button>` : ""}<button class="btn" data-act="collabNote" data-id="${i.id}">Ajouter une note</button></div>`;
  },
};

/* ---------- Actions ---------- */
function defaults(table, extra = {}) {
  const P = params(), t = today();
  const base = {
    clients: { type: "Syndic ou agence" },
    contrats: { statut: "actif", frequence: "Trimestriel", passages_par_an: 4, metier: METIERS[0], date_debut: t, numero: nextNumero("C") },
    interventions: { statut: "planifiee", date: t, metier: METIERS[0] },
    factures: { statut: "en_attente", date_emission: t, echeance: addDays(t, num(P.delai_paiement) || 30), numero: nextNumero("F"), nb_relances: 0 },
    devis: { statut: "envoye", date_envoi: t, metier: METIERS[0], numero: nextNumero("D") },
    techniciens: { actif: true }, membres: {},
    taches: { statut: "a_faire", priorite: "normale", cree_par: MON_NOM || me()?.nom || "" },
  }[table] || {};
  return { id: uuid(), ...base, ...extra };
}
async function save(table, row) { const r = await store.upsert(table, row); scheduleRender(); return r; }

async function creerFacture(inter) {
  const P = params(), t = today();
  const f = await save("factures", { ...defaults("factures"), client_id: inter.client_id, montant_ht: num(inter.montant), date_emission: t, echeance: addDays(t, num(P.delai_paiement) || 30), notes: `${inter.prestation || inter.metier || "Intervention"} du ${fdate(inter.date)}` });
  await save("interventions", { ...inter, facture_id: f.id });
  toast(`Facture ${f.numero} créée. Après émission dans Qonto, reporte ici le numéro Qonto s'il diffère.`);
  openDrawer({ mode: "detail", table: "factures", id: f.id });
}

const actions = {
  go(el) {
    const [v, sub] = el.dataset.v.split(":");
    if (!allowed(v)) return;
    UI.view = v; UI.planningSpecial = "";
    if (v === "factures" && sub) UI.facturesTab = sub === "retard" ? "retard" : "attente";
    if (v === "planning" && sub) UI.planningSpecial = sub;
    if (v === "clients" && sub) UI.clientsTab = sub;
    history.replaceState(null, "", "#" + v);
    closeDrawer(); render(); window.scrollTo(0, 0);
    if (sub === "afacturer") setTimeout(() => $("#afacturer")?.scrollIntoView({ behavior: "smooth" }), 50);
  },
  new(el) { openDrawer({ mode: "form", table: el.dataset.t, row: defaults(el.dataset.t) }); },
  newFor(el) {
    const cid = drawerState?.id;
    const extra = { client_id: cid };
    if (el.dataset.t === "contrats") extra.technicien = "";
    openDrawer({ mode: "form", table: el.dataset.t, row: defaults(el.dataset.t, extra) });
  },
  open(el) { openDrawer({ mode: "detail", table: el.dataset.t, id: el.dataset.id }); },
  openClient(el) { openDrawer({ mode: "detail", table: "clients", id: el.dataset.id }); },
  edit() { const st = drawerState; const r = S[st.table].find(x => x.id === st.id); openDrawer({ mode: "form", table: st.table, row: { ...r } }); },
  close() { closeDrawer(); },
  closeOverlay(el, ev) { if (ev.target === el) closeDrawer(); },
  async del() {
    const st = drawerState;
    if (st.table === "acces" && user?.email && st.row.email === user.email.toLowerCase()) { toast("Tu ne peux pas retirer ton propre accès"); return; }
    const extra = st.table === "clients" ? " Ses contrats et interventions seront aussi supprimés." : "";
    if (!confirm(st.table === "acces" ? `Retirer l'accès de ${st.row.nom} ? La personne ne pourra plus rien voir dans l'app.` : `Supprimer définitivement ${["interventions", "factures", "taches"].includes(st.table) ? "cette" : "ce"} ${TITLES[st.table]} ?${extra}`)) return;
    await store.remove(st.table, st.row[keyOf(st.table)]);
    if (st.table === "clients") { S.contrats = S.contrats.filter(k => k.client_id !== st.row.id); S.interventions = S.interventions.filter(i => i.client_id !== st.row.id); if (!REMOTE) store.saveLocal(); }
    closeDrawer(); render(); toast("Supprimé");
  },
  async realiser(el) {
    const i = S.interventions.find(x => x.id === el.dataset.id);
    const r = await save("interventions", { ...i, statut: "realisee", date: i.date > today() ? today() : i.date });
    if (!r.facture_id && num(r.montant) > 0 && confirm(`Intervention réalisée. Créer la facture de ${eur2(r.montant)} maintenant ?`)) return creerFacture(r);
    toast("Intervention réalisée"); reopenDrawer();
  },
  async certif(el) { const i = S.interventions.find(x => x.id === el.dataset.id); await save("interventions", { ...i, certificat_envoye: true }); toast("Certificat noté comme envoyé"); },
  async reporter(el) {
    const i = S.interventions.find(x => x.id === el.dataset.id);
    const d = prompt("Nouvelle date (AAAA-MM-JJ)", addDays(i.date > today() ? i.date : today(), 7));
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    await save("interventions", { ...i, date: d, notes: [i.notes, `Reportée du ${fdate(i.date)}`].filter(Boolean).join(" · ") });
    toast("Intervention reportée au " + fdate(d));
  },
  facturer(el) { const i = S.interventions.find(x => x.id === el.dataset.id); return creerFacture(i); },
  async payer(el) {
    const f = S.factures.find(x => x.id === el.dataset.id);
    const d = prompt("Date de paiement (AAAA-MM-JJ)", today());
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    await save("factures", { ...f, statut: "payee", date_paiement: d }); toast("Facture payée");
  },
  async relancer(el) {
    const f = S.factures.find(x => x.id === el.dataset.id);
    const c = client(f.client_id);
    const moi = me();
    const sign = moi ? moi.nom.split(" ")[0] : "L'équipe ETHEREA";
    const subject = `Facture ${f.numero || ""} ETHEREA Services`;
    const body = `Bonjour,\n\nJ'espère que vous allez bien.\n\nSauf erreur de notre part, la facture ${f.numero || ""} du ${fdate(f.date_emission)}, d'un montant de ${eur2(f.montant_ht)} HT, n'a pas encore été réglée. Pourriez-vous nous indiquer la date de règlement prévue ?\n\nSi le paiement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\nBonne journée,\n\n${sign}\nETHEREA Services\n07 44 84 42 93`;
    const to = (c.email || "").split(/[;,]/).map(x => x.trim()).filter(Boolean).join(",");
    window.location.href = `mailto:${encodeURIComponent(to).replace(/%2C/g, ",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await save("factures", { ...f, derniere_relance: today(), nb_relances: num(f.nb_relances) + 1 });
    toast("Relance préparée dans ta messagerie");
  },
  async signer(el) { const d = S.devis.find(x => x.id === el.dataset.id); await save("devis", { ...d, statut: "signe", date_signature: today() }); toast("Devis signé. Pense à créer le contrat ou l'intervention."); },
  async refuser(el) { const d = S.devis.find(x => x.id === el.dataset.id); await save("devis", { ...d, statut: "refuse" }); },
  async gen(el) {
    const k = contrat(el.dataset.id), dates = passagesAGenerer(k);
    if (!dates.length) return;
    if (!confirm(`Planifier ${dates.length} passage(s) : ${dates.map(fdateShort).join(", ")} ?`)) return;
    for (const d of dates) await store.upsert("interventions", { id: uuid(), date: d, client_id: k.client_id, contrat_id: k.id, metier: k.metier, prestation: k.prestation, technicien: k.technicien, statut: "planifiee", montant: k.prix_passage });
    render(); toast(`${dates.length} passage(s) planifié(s)`);
  },
  async genAll() {
    const plan = S.contrats.filter(k => k.statut === "actif").map(k => [k, passagesAGenerer(k)]).filter(([, d]) => d.length);
    const n = sum(plan, p => p[1].length);
    if (!n) { toast("Tous les passages des 12 prochains mois sont déjà planifiés"); return; }
    if (!confirm(`Planifier ${n} passage(s) sur ${plan.length} contrat(s) pour les 12 prochains mois ? Les dates sont calculées depuis le dernier passage, à ajuster ensuite si besoin.`)) return;
    for (const [k, dates] of plan) for (const d of dates) await store.upsert("interventions", { id: uuid(), date: d, client_id: k.client_id, contrat_id: k.id, metier: k.metier, prestation: k.prestation, technicien: k.technicien, statut: "planifiee", montant: k.prix_passage });
    render(); toast(`${n} passage(s) planifié(s)`);
  },
  goDay(el) { UI.view = "planning"; UI.planningSpecial = ""; UI.planningMode = "calendrier"; UI.calMonth = el.dataset.v.slice(0, 7); history.replaceState(null, "", "#planning"); closeDrawer(); render(); window.scrollTo(0, 0); },
  plus() { openDrawer({ mode: "plus" }); },
  person(el) { openDrawer({ mode: "person", nom: el.dataset.v }); },
  jobOpen(el) { openDrawer({ mode: "job", id: el.dataset.id }); },
  openEdit(el) { const r = S[el.dataset.t].find(x => x.id === el.dataset.id); if (r) openDrawer({ mode: "form", table: el.dataset.t, row: { ...r } }); },
  newTache(el) { openDrawer({ mode: "form", table: "taches", row: defaults("taches", { assigne: el.dataset.v || "", client_id: drawerState?.table === "clients" ? drawerState.id : null }) }); },
  tachesTab(el) { UI.tachesTab = el.dataset.v; render(); },
  async toggleTache(el) {
    const x = S.taches.find(t => t.id === el.dataset.id); if (!x) return;
    const statut = x.statut === "fait" ? "a_faire" : "fait";
    if (REMOTE && ROLE === "collaborateur") {
      const { data, error } = await sb.from("taches").update({ statut, updated_at: new Date().toISOString() }).eq("id", x.id).select().single();
      if (error) { toast("Erreur : " + error.message); return; }
      apply("taches", data); render();
    } else await save("taches", { ...x, statut });
    if (drawerState?.mode === "detail" || drawerState?.mode === "person") reopenDrawer();
    toast(statut === "fait" ? "Tâche faite" : "Tâche rouverte");
  },
  newAcces(el) { openDrawer({ mode: "form", table: "acces", row: { email: "", nom: el.dataset.v || "", role: "collaborateur", _new: true } }); },
  editAcces(el) { const a = S.acces.find(x => x.email === el.dataset.v); if (a) openDrawer({ mode: "form", table: "acces", row: { ...a } }); },
  demoRole(el) { localStorage.setItem("etherea-role-demo", el.dataset.v); location.hash = ""; location.reload(); },
  async collabFait(el) { await majCollab(el.dataset.id, { p_statut: "realisee" }, "Intervention marquée réalisée. Merci !"); },
  async collabAnnulerFait(el) { await majCollab(el.dataset.id, { p_statut: "planifiee" }, "Intervention remise à faire"); },
  async collabRisque(el) {
    const i = S.interventions.find(x => x.id === el.dataset.id);
    if (i.rapport_risque) { await majCollab(i.id, { p_risque: false }, "Signalement retiré"); return; }
    const txt = prompt("Décris le constat à risque (il sera transmis à Manon pour le rapport) :", "");
    if (txt === null) return;
    await majCollab(i.id, { p_risque: true, p_notes: [i.notes, txt.trim() && `Constat : ${txt.trim()}`].filter(Boolean).join(" · ") }, "Constat signalé à l'administration");
  },
  async collabNote(el) {
    const i = S.interventions.find(x => x.id === el.dataset.id);
    const txt = prompt("Note pour cette intervention :", "");
    if (!txt || !txt.trim()) return;
    await majCollab(i.id, { p_notes: [i.notes, `${MON_NOM || "Note"} : ${txt.trim()}`].filter(Boolean).join(" · ") }, "Note ajoutée");
  },
  async forgot() {
    const email = $('[data-form="login"] [name=email]').value.trim();
    if (!email) { $("#loginErr").textContent = "Indique ton email, puis clique à nouveau."; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
    $("#loginErr").textContent = error ? "Envoi impossible : " + error.message : "Email envoyé : ouvre le lien pour choisir un nouveau mot de passe.";
  },
  planMode(el) { UI.planningMode = el.dataset.v; render(); },
  planSpecial(el) { UI.planningSpecial = el.dataset.v; render(); },
  calNav(el) { UI.calMonth = addMonths(UI.calMonth + "-01", +el.dataset.v).slice(0, 7); render(); },
  clientsTab(el) { UI.clientsTab = el.dataset.v; UI.search = ""; render(); },
  factTab(el) { UI.facturesTab = el.dataset.v; render(); },
  export() {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `etherea-board-${today()}.json`; a.click();
  },
  async logout() { await sb.auth.signOut(); user = null; render(); },
  async magic() {
    const email = $('[data-form="login"] [name=email]').value.trim();
    if (!email) { $("#loginErr").textContent = "Indique ton email."; return; }
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.href.split("#")[0] } });
    $("#loginErr").textContent = error ? "Envoi impossible : " + error.message : "Lien envoyé. Ouvre l'email sur cet appareil.";
  },
};

async function saveAcces(form) {
  const st = drawerState;
  const d = readForm(form, FIELDS.acces);
  d.email = (d.email || "").toLowerCase();
  if (!d.email || !d.nom || !d.role) return;
  const btn = form.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Envoi en cours…";
  try {
    if (st.row.email && st.row.email !== d.email) await store.remove("acces", st.row.email);
    if (REMOTE) {
      const existe = S.acces.some(a => a.email === d.email) && !st.row._new;
      if (existe) { await store.upsert("acces", d); toast("Accès mis à jour"); }
      else {
        const { data, error } = await sb.functions.invoke("inviter", { body: { ...d, redirectTo: location.href.split("#")[0] } });
        if (error || data?.error) { toast("Erreur : " + (data?.error || error.message)); btn.disabled = false; btn.textContent = "Enregistrer"; return; }
        apply("acces", { ...d, updated_at: new Date().toISOString() });
        toast(data.message || "Accès enregistré");
      }
    } else { await store.upsert("acces", d); toast("Accès enregistré"); }
    closeDrawer(); render();
  } catch (e) { btn.disabled = false; btn.textContent = "Enregistrer"; }
}

const forms = {
  async edit(form) {
    const st = drawerState;
    if (st.table === "acces") return saveAcces(form);
    const data = readForm(form, FIELDS[st.table]);
    const row = { ...st.row, ...data };
    const saved = await save(st.table, row);
    toast("Enregistré");
    openDrawer({ mode: "detail", table: st.table, id: saved.id });
  },
  async params(form) {
    const specs = ["urssaf", "cible_marque", "delai_paiement", "objectif_ca_mensuel", "objectif_residences"].map(k => ({ k, t: "number" })).concat([{ k: "objectif_debut", t: "date" }, { k: "objectif_fin", t: "date" }]);
    const data = { ...params(), ...readForm(form, specs) };
    await save("parametres", { id: "main", data }); toast("Paramètres enregistrés");
  },
  async setpw(form) {
    if (form.elements.pw.value !== form.elements.pw2.value) { $("#pwErr").textContent = "Les deux mots de passe sont différents."; return; }
    const { error } = await sb.auth.updateUser({ password: form.elements.pw.value });
    if (error) { $("#pwErr").textContent = "Erreur : " + error.message; return; }
    closeDrawer(); toast("Mot de passe enregistré");
  },
  async password(form) {
    const { error } = await sb.auth.updateUser({ password: form.elements.pw.value });
    toast(error ? "Erreur : " + error.message : "Mot de passe modifié"); form.reset();
  },
  async login(form) {
    const email = form.elements.email.value.trim(), password = form.elements.pw.value;
    if (!password) { actions.magic(); return; }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) $("#loginErr").textContent = "Connexion refusée : email ou mot de passe incorrect.";
  },
};

/* ---------- Événements ---------- */
document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const a = actions[el.dataset.act];
  if (!a) return;
  if (el.dataset.act === "closeOverlay") { a(el, ev); return; }
  ev.stopPropagation();
  Promise.resolve(a(el, ev)).catch(e => console.error(e));
});
document.addEventListener("submit", ev => {
  const f = ev.target.closest("[data-form]");
  if (!f) return;
  ev.preventDefault();
  Promise.resolve(forms[f.dataset.form](f)).catch(e => console.error(e));
});
document.addEventListener("input", ev => {
  const on = ev.target.dataset.on;
  if (on === "search") { UI.search = ev.target.value; const pos = ev.target.selectionStart; render(); const s = $(".search[data-on=search]"); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }
});
document.addEventListener("change", ev => {
  const on = ev.target.dataset.on;
  if (on === "planFilter") { UI.planningFilter = ev.target.value; render(); }
  if (on === "planPast") { UI.planningShowPast = ev.target.checked; render(); }
  if (on === "refreshForm" && drawerState?.mode === "form") {
    const form = ev.target.closest("form");
    drawerState.row = { ...drawerState.row, ...readForm(form, FIELDS[drawerState.table]) };
    if (drawerState.table === "interventions") {
      const ks = S.contrats.filter(k => k.client_id === drawerState.row.client_id && k.statut === "actif");
      if (ks.length === 1 && !drawerState.row.contrat_id) Object.assign(drawerState.row, { contrat_id: ks[0].id, prestation: ks[0].prestation, metier: ks[0].metier, technicien: ks[0].technicien, montant: ks[0].prix_passage });
    }
    reopenDrawer();
  }
  if (on === "import") {
    const file = ev.target.files[0]; if (!file) return;
    file.text().then(async txt => {
      const d = JSON.parse(txt); let n = 0;
      const order = ["clients", "contrats", "factures", "interventions", "devis", "techniciens", "membres", "parametres"];
      for (const t of order) for (const row of (d[t] || [])) { await store.upsert(t, row); n++; }
      render(); toast(`${n} lignes importées`);
    }).catch(e => toast("Import impossible : " + e.message));
  }
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && drawerState) closeDrawer(); });
window.addEventListener("hashchange", () => { const v = location.hash.slice(1).split(":")[0]; if (v && v !== UI.view && ROLE && allowed(v)) { UI.view = v; render(); } });

function toast(msg) {
  document.querySelectorAll(".toast").forEach(x => x.remove());
  const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t);
  if (MOTION) MOTION.animate(t, { opacity: [0, 1], y: [12, 0] }, { duration: 0.25, ease: EASE });
  setTimeout(() => {
    if (!MOTION) { t.remove(); return; }
    MOTION.animate(t, { opacity: 0, y: -8 }, { duration: 0.15 }).then(() => t.remove());
  }, 3400);
}

/* ---------- Mouvement (Motion, l'équivalent JavaScript de Framer Motion) ---------- */
let lastAnimKey = null;
const segPos = {};
function placeThumbs() {
  document.querySelectorAll(".seg").forEach((seg, i) => {
    const th = seg.querySelector(".thumb"), on = seg.querySelector("button.on");
    if (!th || !on) return;
    const key = UI.view + i, next = { left: on.offsetLeft, width: on.offsetWidth }, prev = segPos[key];
    if (prev && (prev.left !== next.left || prev.width !== next.width) && MOTION) {
      th.style.transition = "none"; th.style.left = prev.left + "px"; th.style.width = prev.width + "px";
      th.getBoundingClientRect();
      th.style.transition = ""; th.style.left = next.left + "px"; th.style.width = next.width + "px";
    } else { th.style.left = next.left + "px"; th.style.width = next.width + "px"; }
    segPos[key] = next;
  });
}
function afterRender() {
  placeThumbs();
  const key = [UI.view, UI.clientsTab, UI.facturesTab, UI.planningMode, UI.planningSpecial, UI.calMonth].join("|");
  if (!MOTION || key === lastAnimKey) { lastAnimKey = key; return; }
  const firstEntry = lastAnimKey === null || lastAnimKey.split("|")[0] !== UI.view;
  lastAnimKey = key;
  const items = [...document.querySelectorAll("main .anim, .login .anim")];
  // Entrée découpée : chaque bloc arrive à son tour (opacité, 12 px, flou léger), sans rebond
  MOTION.animate(items, { opacity: [0, 1], y: [12, 0], filter: ["blur(4px)", "blur(0px)"] }, { duration: 0.35, delay: MOTION.stagger(0.06, { startDelay: 0 }), ease: EASE });
  if (!firstEntry) return;
  // Le moment fort du Pilotage : la vague se trace, puis les jours se posent dessus
  const wave = document.querySelector(".hero .wave path");
  if (wave) {
    wave.style.strokeDasharray = "1";
    MOTION.animate(wave, { strokeDashoffset: [1, 0] }, { duration: 1.1, delay: 0.15, ease: EASE });
    MOTION.animate(".hero .day .dot", { opacity: [0, 1], scale: [0.6, 1] }, { duration: 0.35, delay: MOTION.stagger(0.07, { startDelay: 0.3 }), ease: EASE });
    MOTION.animate(".hero .day .dc", { opacity: [0, 1] }, { duration: 0.3, delay: MOTION.stagger(0.07, { startDelay: 0.5 }) });
  }
  document.querySelectorAll("main [data-count]").forEach(el => {
    const target = Number(el.dataset.count) || 0;
    if (!target) return;
    MOTION.animate(0, target, { duration: 0.9, delay: 0.15, ease: EASE, onUpdate: v => { el.textContent = el.dataset.fmt === "eur" ? eur(v) : Math.round(v); } });
  });
  const bars = document.querySelectorAll("main .bars .b i");
  if (bars.length) MOTION.animate(bars, { scaleY: [0, 1] }, { duration: 0.5, delay: MOTION.stagger(0.035, { startDelay: 0.25 }), ease: EASE });
  const prog = document.querySelectorAll("main .progress i");
  if (prog.length) MOTION.animate(prog, { scaleX: [0, 1] }, { duration: 0.6, delay: 0.3, ease: EASE });
}

/* ---------- Démarrage ---------- */
async function boot() {
  if (REMOTE) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    sb.auth.onAuthStateChange(async (_e, session) => {
      const was = user; user = session?.user || null;
      if (user && !was) { await start(); } else if (!user) render();
    });
    if (!user) { render(); return; }
  }
  await start();
}
let started = false;
async function start() {
  try { await store.load(); } catch (e) { $("#root").innerHTML = `<div class="login"><div class="card"><h2>Chargement impossible</h2><p class="sub">${esc(e.message || e)}</p><p class="sub">Vérifie ta connexion internet puis recharge la page.</p><button class="btn primary" onclick="location.reload()">Recharger</button></div></div>`; return; }
  if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname + "#" + (HOME[ROLE] || ""));
  render();
  if (REMOTE && (AUTH_TYPE === "invite" || AUTH_TYPE === "recovery")) openDrawer({ mode: "password" });
  if (REMOTE && !started && ROLE) {
    started = true;
    sb.channel("etherea").on("postgres_changes", { event: "*", schema: "public" }, p => {
      if (!TABLES.includes(p.table)) return;
      if (ROLE === "collaborateur" && p.table === "interventions") { refreshCollab(); return; }
      const k = keyOf(p.table);
      if (p.eventType === "DELETE") S[p.table] = S[p.table].filter(r => r[k] !== p.old[k]); else apply(p.table, p.new);
      scheduleRender();
    }).subscribe();
    if (ROLE === "collaborateur") {
      setInterval(refreshCollab, 60000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCollab(); });
    }
  }
}
async function refreshCollab() {
  if (!REMOTE || ROLE !== "collaborateur") return;
  const [t, i] = await Promise.all([sb.from("taches").select("*"), sb.rpc("mes_interventions")]);
  if (!t.error) S.taches = t.data || [];
  if (!i.error) S.interventions = i.data || [];
  scheduleRender();
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
boot();
})();
