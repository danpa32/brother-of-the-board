import { JOUEURS } from "./config.js";
import * as store from "./store.js";

const PERS = Object.keys(JOUEURS);           // ["daniel", "mathieu"]
const JOURS_APPRENTISSAGE = 75;              // un nouveau jeu reste « à se remettre en tête » ce temps-là…
const PARTIES_APPRENTISSAGE = 3;             // …jusqu'à ce nombre de parties
const RAPPEL_JOURS = 21;                     // 2e partie proposée 3 semaines après la première

let jeux = [], parId = {}, st = { avis: {}, soirees: [], joueur: null };
const ui = { q: "", style: "", tri: "envie", filtres: new Set(), aDeux: true, proposition: null };
const $ = (s, el = document) => el.querySelector(s);
const vue = $("#vue");

/* ---------- utilitaires ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const auj = () => new Date().toISOString().slice(0, 10);
const plusJours = (iso, n) => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ecartJours = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);
const fmtDate = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("fr-CH", opts).format(new Date(iso + "T12:00"));
const fmtMois = iso => fmtDate(iso, { month: "long", year: "numeric" });

const plage = (a, b, unite) => !a && !b ? "?" : (!b || a === b ? `${a || b}` : `${a}–${b}`) + unite;
const joueursTxt = g => plage(g.joueurs.min, g.joueurs.max, " j.");
const dureeTxt = g => plage(g.duree.min, g.duree.max, " min");
function niveau(w) {
  if (!w) return null;
  return w < 1.8 ? "Facile" : w < 2.6 ? "Moyen" : w < 3.4 ? "Exigeant" : "Expert";
}
const jouableADeux = g => !g.joueurs.min || (g.joueurs.min <= 2 && (g.joueurs.max || 9) >= 2);

/* ---------- avis & historique ---------- */
function avis(g, p) {
  const a = st.avis[g.id]?.[p] || {};
  return { envie: a.envie || 0, rejouer: a.rejouer || 0, decouvrir: a.decouvrir ?? (g.parties[p] === 0) };
}
const aDecouvrir = g => PERS.some(p => avis(g, p).decouvrir);
const moyenne = (g, cle) => {
  const v = PERS.map(p => avis(g, p)[cle]).filter(Boolean);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};
const jouees = id => st.soirees.filter(s => s.jeu === id && s.statut === "jouee").sort((a, b) => a.date.localeCompare(b.date));
const prevues = () => st.soirees.filter(s => s.statut !== "jouee").sort((a, b) => a.date.localeCompare(b.date));
const prochaine = id => prevues().find(s => s.jeu === id);
function derniereFois(g) {
  const j = jouees(g.id).at(-1)?.date;
  return [j, g.derniereFois].filter(Boolean).sort().at(-1) || null;
}
// Un jeu découvert récemment qu'on veut rejouer pour bien l'assimiler.
function enApprentissage(g) {
  const j = jouees(g.id);
  return j.length > 0 && j.length < PARTIES_APPRENTISSAGE && ecartJours(j[0].date, auj()) <= JOURS_APPRENTISSAGE
    && g.parties.daniel + g.parties.mathieu === 0 ? j.length : 0;
}

/* ---------- suggestions ---------- */
function suggestions() {
  const dejaPrevus = new Set(prevues().map(s => s.jeu));
  return jeux
    .filter(g => !dejaPrevus.has(g.id) && (!ui.aDeux || jouableADeux(g)))
    .map(g => {
      const raisons = [];
      const envie = moyenne(g, "envie"), rejouer = moyenne(g, "rejouer");
      let score = (envie || 2.5) * 2 + (rejouer || 2.5) * 0.6;
      if (PERS.every(p => avis(g, p).envie >= 4)) raisons.push("Vous en avez tous les deux envie");
      else if (envie >= 4) raisons.push("Grosse envie");
      if (PERS.some(p => avis(g, p).envie === 1)) score -= 2;
      const n = enApprentissage(g);
      if (n) { score += 3; raisons.push(`À rejouer pour s'en souvenir (${n} partie${n > 1 ? "s" : ""})`); }
      else if (aDecouvrir(g)) { score += 2; raisons.push("À découvrir"); }
      const der = derniereFois(g);
      if (der && !n && ecartJours(der, auj()) < 21) score -= 3;
      else if (der && ecartJours(der, auj()) > 365 && rejouer >= 3) { score += 1; raisons.push("Pas joué depuis plus d'un an"); }
      if (ui.aDeux && g.aDeux === "meilleur") { score += 0.5; raisons.push("Top à 2"); }
      return { g, score, raisons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

/* ---------- petits composants ---------- */
const vignette = (g, cls = "vign") => g.vignette || g.image
  ? `<img class="${cls}" src="${esc(g.vignette || g.image)}" alt="" loading="lazy">`
  : `<span class="${cls} vide" aria-hidden="true">🎲</span>`;

function pastilles(valeur, { p, jeu, cle } = {}) {
  const modifiable = p && p === st.joueur;
  let h = `<span class="pips${modifiable ? " edit" : ""}" ${modifiable ? `data-jeu="${jeu}" data-cle="${cle}"` : ""}>`;
  for (let i = 1; i <= 5; i++) {
    h += modifiable
      ? `<button type="button" class="pip${i <= valeur ? " on" : ""}" data-v="${i}" aria-label="${i} sur 5"></button>`
      : `<i class="pip${i <= valeur ? " on" : ""}"></i>`;
  }
  return h + "</span>";
}

function badges(g) {
  const b = [];
  const n = enApprentissage(g);
  if (n) b.push(`<span class="badge chaud">À rejouer</span>`);
  else if (aDecouvrir(g)) b.push(`<span class="badge neuf">À découvrir</span>`);
  if (g.aDeux === "meilleur") b.push(`<span class="badge deux">Top à 2</span>`);
  const pr = prochaine(g.id);
  if (pr) b.push(`<span class="badge prevu">📅 ${esc(fmtDate(pr.date))}</span>`);
  return b.join("");
}

const besoinJoueur = () => st.joueur ? "" : `disabled title="Identifie-toi en haut à droite"`;

/* ---------- vue : planning ---------- */
function vuePlanning() {
  const liste = prevues();
  let html = "";

  if (ui.proposition) {
    const g = parId[ui.proposition.jeu];
    html += `<div class="callout">
      <p><b>Première partie de ${esc(g.nom)} !</b> Une 2<sup>e</sup> partie d'ici trois semaines aide à bien retenir les règles.</p>
      <div><button class="btn" data-action="rappel">Planifier le ${esc(fmtDate(ui.proposition.date))}</button>
      <button class="btn ghost" data-action="pas-rappel">Non merci</button></div></div>`;
  }

  html += `<section class="bloc"><div class="bloc-tete"><h1>Prochaines soirées</h1>
    <button class="btn" data-action="planifier" ${besoinJoueur()}>+ Planifier</button></div>`;
  if (!liste.length) {
    html += `<p class="vide-txt">Rien de prévu pour l'instant. Choisis une idée ci-dessous ou planifie un jeu depuis la ludothèque.</p>`;
  } else {
    let mois = "";
    for (const s of liste) {
      const g = parId[s.jeu];
      if (!g) continue;
      const m = fmtMois(s.date);
      if (m !== mois) { html += `<h3 class="mois">${esc(m)}</h3>`; mois = m; }
      const passe = s.date < auj();
      html += `<div class="soiree${passe ? " passee" : ""}">
        <div class="date"><b>${new Date(s.date + "T12:00").getDate()}</b><span>${esc(fmtDate(s.date, { weekday: "short" }))}</span></div>
        <a href="#/jeu/${g.id}" class="soiree-jeu">${vignette(g)}<span><b>${esc(g.nom)}</b>
          <small>${esc(joueursTxt(g))} · ${esc(dureeTxt(g))}${s.note ? ` · ${esc(s.note)}` : ""}</small></span></a>
        <div class="soiree-act">
          <button class="btn petit" data-action="jouee" data-id="${s.id}" ${besoinJoueur()}>Jouée ✓</button>
          <button class="btn petit ghost" data-action="modifier" data-id="${s.id}" ${besoinJoueur()} aria-label="Modifier">✎</button>
          <button class="btn petit ghost" data-action="supprimer" data-id="${s.id}" ${besoinJoueur()} aria-label="Supprimer">✕</button>
        </div></div>`;
    }
  }
  html += `</section>`;

  html += `<section class="bloc"><div class="bloc-tete"><h2>Idées pour les prochaines soirées</h2>
    <div class="seg" role="group" aria-label="Nombre de joueurs">
      <button class="${ui.aDeux ? "on" : ""}" data-action="adeux" data-v="1">À deux</button>
      <button class="${ui.aDeux ? "" : "on"}" data-action="adeux" data-v="0">À plusieurs</button></div></div>
    <p class="aide">Classées selon vos envies, les jeux à découvrir et ceux à rejouer pour s'en souvenir.</p>
    <div class="idees">`;
  for (const { g, raisons } of suggestions()) {
    html += `<div class="idee">
      <a href="#/jeu/${g.id}">${vignette(g)}</a>
      <div class="idee-txt"><a href="#/jeu/${g.id}"><b>${esc(g.nom)}</b></a>
        <small>${esc(joueursTxt(g))} · ${esc(dureeTxt(g))}${niveau(g.difficulte) ? " · " + niveau(g.difficulte) : ""}</small>
        <div class="raisons">${raisons.map(r => `<span>${esc(r)}</span>`).join("")}</div>
        <div class="envies">${PERS.map(p => `<span title="Envie de ${JOUEURS[p].nom}">${JOUEURS[p].nom[0]} ${pastilles(avis(g, p).envie)}</span>`).join("")}</div>
      </div>
      <button class="btn petit" data-action="planifier" data-jeu="${g.id}" ${besoinJoueur()}>Planifier</button>
    </div>`;
  }
  html += `</div></section>`;

  const histo = st.soirees.filter(s => s.statut === "jouee").sort((a, b) => b.date.localeCompare(a.date));
  if (histo.length) {
    html += `<section class="bloc"><details><summary><h2>Soirées passées (${histo.length})</h2></summary><ul class="histo">`;
    for (const s of histo) {
      const g = parId[s.jeu];
      if (g) html += `<li><span>${esc(fmtDate(s.date, { day: "numeric", month: "short", year: "numeric" }))}</span> <a href="#/jeu/${g.id}">${esc(g.nom)}</a>${s.note ? ` <small>${esc(s.note)}</small>` : ""}</li>`;
    }
    html += `</ul></details></section>`;
  }
  vue.innerHTML = html;
}

/* ---------- vue : ludothèque ---------- */
const FILTRES = {
  decouvrir: ["À découvrir", g => aDecouvrir(g)],
  deux: ["Jouable à 2", g => jouableADeux(g)],
  top2: ["Top à 2", g => g.aDeux === "meilleur"],
  court: ["≤ 45 min", g => (g.duree.max || g.duree.min || 0) <= 45],
  envie: ["Envie ≥ 4", g => PERS.some(p => avis(g, p).envie >= 4)],
};
const TRIS = {
  envie: ["Envie commune", (a, b) => moyenne(b, "envie") - moyenne(a, "envie") || moyenne(b, "rejouer") - moyenne(a, "rejouer")],
  nom: ["Nom", (a, b) => norm(a.nom).localeCompare(norm(b.nom))],
  duree: ["Durée", (a, b) => (a.duree.max || 999) - (b.duree.max || 999)],
  difficulte: ["Difficulté", (a, b) => (a.difficulte || 0) - (b.difficulte || 0)],
  oubli: ["Pas joué depuis longtemps", (a, b) => (derniereFois(a) || "").localeCompare(derniereFois(b) || "")],
};

function vueJeux() {
  if (!$("#grille")) {
    const styles = [...new Set(jeux.flatMap(g => g.categories))].sort((a, b) => a.localeCompare(b, "fr"));
    vue.innerHTML = `<section class="bloc">
      <div class="outils">
        <input type="search" id="q" placeholder="Rechercher un jeu, un style, une mécanique…" value="${esc(ui.q)}" autocomplete="off">
        <select id="style" aria-label="Style"><option value="">Tous les styles</option>
          ${styles.map(s => `<option ${s === ui.style ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
        <select id="tri" aria-label="Trier par">${Object.entries(TRIS).map(([k, [l]]) => `<option value="${k}" ${k === ui.tri ? "selected" : ""}>Tri : ${l}</option>`).join("")}</select>
      </div>
      <div class="chips">${Object.entries(FILTRES).map(([k, [l]]) => `<button class="chip${ui.filtres.has(k) ? " on" : ""}" data-filtre="${k}">${l}</button>`).join("")}</div>
      <p class="compte" id="compte"></p>
      <div class="grille" id="grille"></div></section>`;
  }
  const q = norm(ui.q);
  const liste = jeux.filter(g =>
    (!q || norm([g.nom, g.nomOriginal, g.resume, ...g.categories, ...g.mecaniques, ...g.extensions.map(x => x.nom)].join(" ")).includes(q)) &&
    (!ui.style || g.categories.includes(ui.style)) &&
    [...ui.filtres].every(f => FILTRES[f][1](g))
  ).sort(TRIS[ui.tri][1]);

  $("#compte").textContent = `${liste.length} jeu${liste.length > 1 ? "x" : ""}`;
  $("#grille").innerHTML = liste.map(g => `
    <a class="carte" href="#/jeu/${g.id}">
      <div class="carte-img">${g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : `<span class="vide">🎲</span>`}
        <div class="carte-badges">${badges(g)}</div></div>
      <div class="carte-txt">
        <h3>${esc(g.nom)}</h3>
        <p class="meta">${esc(joueursTxt(g))} · ${esc(dureeTxt(g))}${niveau(g.difficulte) ? " · " + niveau(g.difficulte) : ""}</p>
        <p class="resume">${esc(g.resume)}</p>
        <div class="envies">${PERS.map(p => `<span title="Envie de ${JOUEURS[p].nom}">${JOUEURS[p].nom[0]} ${pastilles(avis(g, p).envie)}</span>`).join("")}</div>
      </div></a>`).join("") || `<p class="vide-txt">Aucun jeu ne correspond.</p>`;
}

/* ---------- vue : fiche jeu ---------- */
function vueFiche(id) {
  const g = parId[id];
  if (!g) { vue.innerHTML = `<p class="vide-txt">Jeu introuvable. <a href="#/jeux">Retour à la ludothèque</a></p>`; return; }
  const lie = g.lie && parId[g.lie];
  const histo = jouees(g.id);
  const ligne = (titre, cle) => `<tr><th>${titre}</th>${PERS.map(p => `<td>${pastilles(avis(g, p)[cle], { p, jeu: g.id, cle })}</td>`).join("")}</tr>`;

  vue.innerHTML = `<article class="fiche">
    <a class="retour" href="#/jeux">← Ludothèque</a>
    <header class="fiche-tete">
      ${g.image ? `<img class="couv" src="${esc(g.image)}" alt="">` : ""}
      <div>
        <h1>${esc(g.nom)}</h1>
        ${g.nomOriginal !== g.nom ? `<p class="sous">${esc(g.nomOriginal)}</p>` : ""}
        <p class="resume-grand">${esc(g.resume)}</p>
        <dl class="infos">
          <div><dt>Joueurs</dt><dd>${esc(joueursTxt(g))}${g.aDeux === "meilleur" ? " <span class='badge deux'>Top à 2</span>" : g.aDeux === "recommande" ? " <small>(bien à 2)</small>" : ""}</dd></div>
          <div><dt>Durée</dt><dd>${esc(dureeTxt(g))}</dd></div>
          ${g.age ? `<div><dt>Âge</dt><dd>${g.age}+</dd></div>` : ""}
          ${g.difficulte ? `<div><dt>Difficulté</dt><dd>${niveau(g.difficulte)} <small>(${String(g.difficulte).replace(".", ",")}/5)</small></dd></div>` : ""}
          ${g.noteBgg ? `<div><dt>Note BGG</dt><dd>${String(g.noteBgg).replace(".", ",")}/10</dd></div>` : ""}
          ${g.annee ? `<div><dt>Année</dt><dd>${g.annee}</dd></div>` : ""}
        </dl>
        <div class="fiche-act">
          <button class="btn" data-action="planifier" data-jeu="${g.id}" ${besoinJoueur()}>📅 Planifier</button>
          ${badges(g)}
        </div>
      </div>
    </header>

    <section class="bloc">
      <h2>Nos avis</h2>
      ${st.joueur ? "" : `<p class="aide">Identifie-toi en haut à droite pour noter.</p>`}
      <table class="avis">
        <thead><tr><th></th>${PERS.map(p => `<th class="${p === st.joueur ? "moi-col" : ""}">${JOUEURS[p].nom}</th>`).join("")}</tr></thead>
        <tbody>
          ${ligne("Envie d'y jouer bientôt", "envie")}
          ${ligne("Plaisir à y rejouer", "rejouer")}
          <tr><th>Pas encore joué</th>${PERS.map(p => {
            const v = avis(g, p).decouvrir;
            return `<td>${p === st.joueur
              ? `<button class="toggle${v ? " on" : ""}" data-action="decouvrir" data-jeu="${g.id}" aria-pressed="${v}">${v ? "À découvrir" : "Déjà joué"}</button>`
              : `<span class="etat">${v ? "À découvrir" : "Déjà joué"}</span>`}</td>`;
          }).join("")}</tr>
        </tbody>
      </table>
    </section>

    <section class="bloc">
      <h2>Le jeu</h2>
      ${lie ? `<p class="aide">Se joue avec <a href="#/jeu/${lie.id}">${esc(lie.nom)}</a>.</p>` : ""}
      <div class="texte">${(g.description || "Description à venir.").split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join("")}</div>
      ${g.categories.length || g.mecaniques.length ? `<h3>Style</h3><div class="tags">
        ${g.categories.map(c => `<a class="tag" href="#/jeux" data-style="${esc(c)}">${esc(c)}</a>`).join("")}
        ${g.mecaniques.map(m => `<span class="tag meca">${esc(m)}</span>`).join("")}</div>` : ""}
      ${g.auteurs.length ? `<p class="credits">Auteurs : ${esc(g.auteurs.join(", "))}${g.editeurs.length ? ` · Éditeurs : ${esc(g.editeurs.join(", "))}` : ""}</p>` : ""}
    </section>

    ${g.extensions.length ? `<section class="bloc"><h2>Extensions (${g.extensions.length})</h2><ul class="extensions">
      ${g.extensions.map(x => `<li>${x.vignette ? `<img src="${esc(x.vignette)}" alt="" loading="lazy">` : ""}<div><b>${esc(x.nom)}</b><p>${esc(x.resume)}</p></div></li>`).join("")}
    </ul></section>` : ""}

    <section class="bloc"><h2>Règles</h2>
      ${g.regles.length ? `<ul class="regles">${g.regles.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">📄 ${esc(r.titre)}</a> <small>${esc(r.source)}</small></li>`).join("")}</ul>`
        : `<p class="aide">Pas encore de PDF des règles en français.</p>`}
      ${g.bgg ? `<p><a href="https://boardgamegeek.com/boardgame/${g.bgg}" target="_blank" rel="noopener">Voir la fiche sur BoardGameGeek ↗</a></p>` : ""}
    </section>

    <section class="bloc"><h2>Historique</h2>
      <p>Parties enregistrées dans BG Stats : Daniel ${g.parties.daniel}, Mathieu ${g.parties.mathieu}${g.derniereFois ? ` · dernière le ${esc(fmtDate(g.derniereFois, { day: "numeric", month: "long", year: "numeric" }))}` : ""}.</p>
      ${histo.length ? `<ul class="histo">${histo.map(s => `<li><span>${esc(fmtDate(s.date, { day: "numeric", month: "short", year: "numeric" }))}</span> Soirée jouée${s.note ? ` <small>${esc(s.note)}</small>` : ""}</li>`).join("")}</ul>` : ""}
    </section>
  </article>`;
}

/* ---------- en-tête : identité ---------- */
function rendreMoi() {
  const el = $("#moi");
  if (st.joueur) {
    el.innerHTML = `<span class="qui">${JOUEURS[st.joueur].nom}</span><button class="lien" data-action="deco">${store.modeLocal ? "changer" : "déconnexion"}</button>`;
  } else if (store.modeLocal) {
    el.innerHTML = `<span class="qui-label">Je suis</span>${PERS.map(p => `<button class="btn petit ghost" data-action="co" data-p="${p}">${JOUEURS[p].nom}</button>`).join("")}`;
  } else {
    el.innerHTML = `<button class="btn petit" data-action="co">Se connecter</button>`;
  }
  const bandeau = $("#bandeau");
  const msg = store.modeLocal
    ? "Mode local : les notes et le planning sont enregistrés seulement dans ce navigateur, tant que Firebase n'est pas configuré."
    : st.emailInconnu ? `Le compte ${st.emailInconnu} n'est pas autorisé à modifier. Ajoute-le dans js/config.js et firestore.rules.` : "";
  bandeau.hidden = !msg;
  bandeau.textContent = msg;
}

/* ---------- routeur ---------- */
function route() {
  const [, page, id] = location.hash.split("/");
  return { page: page || "planning", id: id && decodeURIComponent(id) };
}
let pageCourante = "";
function rendre() {
  const { page, id } = route();
  const cle = page + (id || "");
  if (cle !== pageCourante) { vue.innerHTML = ""; pageCourante = cle; window.scrollTo(0, 0); }
  document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === (page === "jeu" ? "jeux" : page)));
  rendreMoi();
  if (page === "jeux") vueJeux();
  else if (page === "jeu") vueFiche(id);
  else vuePlanning();
}

/* ---------- dialogue soirée ---------- */
const dlg = $("#dlgSoiree"), form = $("#formSoiree");
function prochainVendrediLibre() {
  const pris = new Set(st.soirees.map(s => s.date));
  let d = auj();
  while (new Date(d + "T12:00").getDay() !== 5 || pris.has(d)) d = plusJours(d, 1);
  return d;
}
function ouvrirDialogue({ jeu, soiree } = {}) {
  form.reset();
  $("#dlgErreur").textContent = "";
  $("#dlgTitre").textContent = soiree ? "Modifier la soirée" : "Planifier une soirée";
  form.dataset.id = soiree?.id || "";
  form.date.value = soiree?.date || prochainVendrediLibre();
  form.jeu.value = parId[soiree?.jeu || jeu]?.nom || "";
  form.note.value = soiree?.note || "";
  dlg.showModal();
  if (!form.jeu.value) form.jeu.focus();
}
$("#dlgAnnuler").onclick = () => dlg.close();
form.addEventListener("submit", async e => {
  e.preventDefault();
  const g = jeux.find(x => norm(x.nom) === norm(form.jeu.value.trim()));
  if (!g) { $("#dlgErreur").textContent = "Choisis un jeu de la liste."; return; }
  const data = { date: form.date.value, jeu: g.id, note: form.note.value.trim() };
  try {
    if (form.dataset.id) await store.majSoiree(form.dataset.id, data);
    else await store.ajouterSoiree(data);
    dlg.close();
  } catch (err) {
    $("#dlgErreur").textContent = "Enregistrement impossible : " + err.message;
  }
});

/* ---------- actions ---------- */
async function marquerJouee(id) {
  const s = st.soirees.find(x => x.id === id);
  const g = parId[s.jeu];
  const premiere = jouees(g.id).length === 0 && aDecouvrir(g);
  await store.majSoiree(id, { statut: "jouee" });
  for (const p of PERS) if (avis(g, p).decouvrir) await store.majAvis(g.id, p, { decouvrir: false });
  if (premiere) ui.proposition = { jeu: g.id, date: plusJours(s.date < auj() ? auj() : s.date, RAPPEL_JOURS) };
  rendre();
}

document.addEventListener("click", async e => {
  const pip = e.target.closest(".pips.edit .pip");
  if (pip) {
    const box = pip.parentElement, v = Number(pip.dataset.v);
    const actuel = avis(parId[box.dataset.jeu], st.joueur)[box.dataset.cle];
    await store.majAvis(box.dataset.jeu, st.joueur, { [box.dataset.cle]: actuel === v ? 0 : v });
    return;
  }
  const tag = e.target.closest("[data-style]");
  if (tag) { ui.style = tag.dataset.style; ui.q = ""; return; }   // le lien mène ensuite à #/jeux
  const chip = e.target.closest("[data-filtre]");
  if (chip) {
    const f = chip.dataset.filtre;
    ui.filtres.has(f) ? ui.filtres.delete(f) : ui.filtres.add(f);
    chip.classList.toggle("on");
    vueJeux();
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const { action, id, jeu } = el.dataset;
  try {
    if (action === "planifier") ouvrirDialogue({ jeu });
    else if (action === "modifier") ouvrirDialogue({ soiree: st.soirees.find(s => s.id === id) });
    else if (action === "supprimer") { if (confirm("Supprimer cette soirée ?")) await store.supprimerSoiree(id); }
    else if (action === "jouee") await marquerJouee(id);
    else if (action === "rappel") {
      const { jeu: j, date } = ui.proposition;
      ui.proposition = null;
      await store.ajouterSoiree({ jeu: j, date, note: "2e partie pour s'en souvenir" });
    }
    else if (action === "pas-rappel") { ui.proposition = null; rendre(); }
    else if (action === "adeux") { ui.aDeux = el.dataset.v === "1"; rendre(); }
    else if (action === "decouvrir") await store.majAvis(jeu, st.joueur, { decouvrir: !avis(parId[jeu], st.joueur).decouvrir });
    else if (action === "co") await store.connexion(el.dataset.p);
    else if (action === "deco") await store.deconnexion();
  } catch (err) {
    alert("Oups : " + err.message);
  }
});

document.addEventListener("input", e => {
  if (e.target.id === "q") { ui.q = e.target.value; vueJeux(); }
});
document.addEventListener("change", e => {
  if (e.target.id === "style") { ui.style = e.target.value; vueJeux(); }
  if (e.target.id === "tri") { ui.tri = e.target.value; vueJeux(); }
});
window.addEventListener("hashchange", rendre);

/* ---------- démarrage ---------- */
jeux = await fetch("data/games.json?v=1").then(r => r.json());
parId = Object.fromEntries(jeux.map(g => [g.id, g]));
$("#listeJeux").innerHTML = jeux.map(g => `<option value="${esc(g.nom)}">`).join("");
store.ecouter(s => { st = s; rendre(); });
store.demarrer().catch(err => {
  console.error(err);
  $("#bandeau").hidden = false;
  $("#bandeau").textContent = "Connexion à la base impossible : " + err.message;
});
