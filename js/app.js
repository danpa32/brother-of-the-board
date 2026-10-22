import { JOUEURS } from "./config.js?v=3";
import * as store from "./store.js?v=3";

const PERS = Object.keys(JOUEURS);           // ["daniel", "mathieu"]
const JOURS_APPRENTISSAGE = 75;              // un nouveau jeu reste « à se remettre en tête » ce temps-là…
const PARTIES_APPRENTISSAGE = 3;             // …jusqu'à ce nombre de parties
const RAPPEL_PLACE = 3;                      // 2e partie proposée environ 3 jeux plus loin dans la liste

let jeux = [], parId = {}, st = { avis: {}, soirees: [], joueur: null };
const GENRES = ["Coopératif", "Réflexion & stratégie", "Ambiance & déconnade", "Familial & léger"];
const ui = { q: "", genre: "", tri: "envie", filtres: new Set(), aDeux: true, proposition: null };
const $ = (s, el = document) => el.querySelector(s);
const vue = $("#vue");

/* ---------- utilitaires ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const auj = () => new Date().toISOString().slice(0, 10);
const ecartJours = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);
const fmtDate = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("fr-CH", opts).format(new Date(iso + "T12:00"));

const plage = (a, b, unite) => !a && !b ? "?" : (!b || a === b ? `${a || b}` : `${a}–${b}`) + unite;
const joueursTxt = g => plage(g.joueurs.min, g.joueurs.max, " j.");
const dureeTxt = g => plage(g.duree.min, g.duree.max, " min");
function niveau(w) {
  if (!w) return null;
  return w < 1.8 ? "Facile" : w < 2.6 ? "Moyen" : w < 3.4 ? "Exigeant" : "Expert";
}
// { deux: bien à 2, plus: mieux à 3+ }, les deux peuvent être vrais. Notre choix, sinon l'avis des joueurs BGG.
const idealBgg = g => ({ deux: !!g.aDeux, plus: (g.joueurs.max || 0) >= 3 && g.aDeux !== "meilleur" });
const idealChoisi = g => typeof st.avis[g.id]?.ideal === "object";
const ideal = g => idealChoisi(g) ? st.avis[g.id].ideal : idealBgg(g);
const jouableADeux = g => !g.joueurs.min || (g.joueurs.min <= 2 && (g.joueurs.max || 9) >= 2);

/* ---------- avis & historique ---------- */
function avis(g, p) {
  const a = st.avis[g.id]?.[p] || {};
  return { envie: a.envie || 0, rejouer: a.rejouer || 0, decouvrir: !!a.decouvrir };
}
const aDecouvrir = g => PERS.some(p => avis(g, p).decouvrir);
const moyenne = (g, cle) => {
  const v = PERS.map(p => avis(g, p)[cle]).filter(Boolean);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};
const jouees = id => st.soirees.filter(s => s.jeu === id && s.statut === "jouee").sort((a, b) => a.date.localeCompare(b.date));
// Les prochains jeux forment une liste ordonnée (champ `ordre`) ; la date est facultative.
const ordre = s => s.ordre ?? 0;
const prevues = () => st.soirees.filter(s => s.statut !== "jouee")
  .sort((a, b) => ordre(a) - ordre(b) || (a.date || "").localeCompare(b.date || ""));
const rang = id => prevues().findIndex(s => s.jeu === id) + 1;   // 0 = pas dans la liste
// Valeur d'ordre pour insérer à la position `i` (0 = en tête) ; au-delà de la liste = à la fin.
function ordrePour(i = Infinity) {
  const l = prevues();
  if (!l.length) return 1;
  if (i >= l.length) return ordre(l.at(-1)) + 1;
  if (i <= 0) return ordre(l[0]) - 1;
  return (ordre(l[i - 1]) + ordre(l[i])) / 2;
}
// Les dates BG Stats ne sont plus à jour : seules les soirées du site comptent.
function derniereFois(g) {
  const j = jouees(g.id).at(-1)?.date;
  return j || null;
}
// Un jeu découvert récemment (soirée marquée « decouverte ») qu'on veut rejouer pour bien l'assimiler.
// Renvoie le nombre de parties depuis la découverte, ou 0.
function enApprentissage(g) {
  const j = jouees(g.id);
  const debut = j.findLastIndex(s => s.decouverte);
  if (debut < 0) return 0;
  const n = j.length - debut;
  return n < PARTIES_APPRENTISSAGE && ecartJours(j[debut].date, auj()) <= JOURS_APPRENTISSAGE ? n : 0;
}

/* ---------- suggestions ---------- */
function suggestions(nombre = 8) {
  const dejaPrevus = new Set(prevues().map(s => s.jeu));
  return jeux
    .filter(g => !dejaPrevus.has(g.id) && !st.prets[g.id] && (!ui.aDeux || (jouableADeux(g) && ideal(g).deux)))
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
      if (ui.aDeux && g.aDeux === "meilleur") { score += 0.5; raisons.push("Très bien à 2"); }
      if (!ui.aDeux && ideal(g).plus) { score += 1; raisons.push("Mieux à 3+"); }
      return { g, score, raisons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, nombre);
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
  if (ideal(g).plus && !ideal(g).deux) b.push(`<span class="badge plus">Mieux à 3+</span>`);
  const r = rang(g.id);
  if (r) b.push(`<span class="badge prevu">${r === 1 ? "▶ Prochain jeu" : `▶ N° ${r}`}</span>`);
  if (st.prets[g.id]) b.push(`<span class="badge prete">Prêté</span>`);
  return b.join("");
}

const telLien = tel => `<a href="tel:${esc(tel.replace(/[^\d+]/g, ""))}">${esc(tel)}</a>`;
const avecExt = s => s.extensions?.length ? `avec ${s.extensions.join(", ")}` : "";

const besoinJoueur = () => st.joueur ? "" : `disabled title="Identifie-toi en haut à droite"`;

/* ---------- vue : planning ---------- */
function vuePlanning() {
  const liste = prevues();
  let html = "";

  if (ui.proposition) {
    const g = parId[ui.proposition.jeu];
    html += `<div class="callout">
      <p><b>Première partie de ${esc(g.nom)} !</b> Le rejouer d'ici quelques semaines aide à bien retenir les règles.</p>
      <div><button class="btn" data-action="rappel">Le remettre en ${Math.min(RAPPEL_PLACE, liste.length + 1)}<sup>e</sup> position</button>
      <button class="btn ghost" data-action="pas-rappel">Non merci</button></div></div>`;
  }

  html += `<section class="bloc"><div class="bloc-tete"><h1>Prochains jeux</h1>
    <div class="boutons">
      <button class="btn" data-action="planifier" ${besoinJoueur()}>+ Ajouter un jeu</button>
      <button class="btn ghost" data-action="serie" ${besoinJoueur()}>Ajouter plusieurs</button>
      ${liste.length ? `<button class="btn ghost" data-action="tout-effacer" ${besoinJoueur()}>Tout effacer</button>` : ""}
    </div></div>`;
  if (!liste.length) {
    html += `<p class="vide-txt">Rien de prévu pour l'instant. Ajoute une idée ci-dessous ou un jeu depuis la ludothèque.</p>`;
  } else {
    liste.forEach((s, i) => {
      const g = parId[s.jeu];
      if (!g) return;
      html += `<div class="soiree${i === 0 ? " premier" : ""}">
        <div class="rang" ${i === 0 ? `title="Prochain jeu"` : ""}><b>${i + 1}</b></div>
        <a href="#/jeu/${g.id}" class="soiree-jeu">${vignette(g)}<span><b>${esc(g.nom)}</b>
          <small>${esc(joueursTxt(g))} · ${esc(dureeTxt(g))}${s.extensions?.length ? ` · ${esc(avecExt(s))}` : ""}${s.note ? ` · ${esc(s.note)}` : ""}</small>
          ${s.date ? `<small class="quand">📅 ${esc(fmtDate(s.date))}</small>` : ""}</span></a>
        <div class="soiree-act">
          <button class="btn petit ghost" data-action="monter" data-id="${s.id}" ${i === 0 ? "disabled" : besoinJoueur()} aria-label="Monter">↑</button>
          <button class="btn petit ghost" data-action="descendre" data-id="${s.id}" ${i === liste.length - 1 ? "disabled" : besoinJoueur()} aria-label="Descendre">↓</button>
          <button class="btn petit" data-action="jouee" data-id="${s.id}" ${besoinJoueur()}>Jouée ✓</button>
          <button class="btn petit ghost" data-action="changer" data-id="${s.id}" ${besoinJoueur()} title="Remplacer par une autre idée" aria-label="Changer de jeu">↻</button>
          <button class="btn petit ghost" data-action="modifier" data-id="${s.id}" ${besoinJoueur()} aria-label="Modifier">✎</button>
          <button class="btn petit ghost" data-action="supprimer" data-id="${s.id}" ${besoinJoueur()} aria-label="Supprimer">✕</button>
        </div></div>`;
    });
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
      <button class="btn petit" data-action="ajouter" data-jeu="${g.id}" ${besoinJoueur()}>+ Ajouter</button>
    </div>`;
  }
  html += `</div></section>`;

  const prets = Object.entries(st.prets).filter(([id]) => parId[id]);
  if (prets.length) {
    html += `<section class="bloc"><h2>Jeux prêtés (${prets.length})</h2><ul class="histo">`;
    for (const [id, p] of prets) {
      html += `<li><a href="#/jeu/${id}">${esc(parId[id].nom)}</a> → ${esc(p.prenom)} ${esc(p.nom)}${p.tel ? ` · ${telLien(p.tel)}` : ""}
        <small>depuis le ${esc(fmtDate(p.depuis, { day: "numeric", month: "short", year: "numeric" }))}</small></li>`;
    }
    html += `</ul></section>`;
  }

  const histo = st.soirees.filter(s => s.statut === "jouee").sort((a, b) => b.date.localeCompare(a.date));
  if (histo.length) {
    html += `<section class="bloc"><details><summary><h2>Soirées passées (${histo.length})</h2></summary><ul class="histo">`;
    for (const s of histo) {
      const g = parId[s.jeu];
      if (g) html += `<li><span>${esc(fmtDate(s.date, { day: "numeric", month: "short", year: "numeric" }))}</span> <a href="#/jeu/${g.id}">${esc(g.nom)}</a> <small>${esc(avecExt(s))}${s.note ? ` ${esc(s.note)}` : ""}</small></li>`;
    }
    html += `</ul></details></section>`;
  }
  vue.innerHTML = html;
}

/* ---------- vue : ludothèque ---------- */
// Aucun avis donné (ni envie, ni plaisir, ni « à découvrir ») : par moi si je suis identifié, sinon par l'un de nous.
const sansAvis = (g, p) => { const a = st.avis[g.id]?.[p] || {}; return !a.envie && !a.rejouer && !a.decouvrir; };
const aNoter = g => st.joueur ? sansAvis(g, st.joueur) : PERS.some(p => sansAvis(g, p));

const FILTRES = {
  anoter: ["À noter", aNoter],
  prete: ["Prêtés", g => !!st.prets[g.id]],
  decouvrir: ["À découvrir", g => aDecouvrir(g)],
  deux: ["Bien à 2", g => ideal(g).deux],
  plus: ["Mieux à 3+", g => ideal(g).plus],
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
    vue.innerHTML = `<section class="bloc">
      <div class="outils">
        <input type="search" id="q" placeholder="Rechercher un jeu, une mécanique…" value="${esc(ui.q)}" autocomplete="off">
        <select id="tri" aria-label="Trier par">${Object.entries(TRIS).map(([k, [l]]) => `<option value="${k}" ${k === ui.tri ? "selected" : ""}>Tri : ${l}</option>`).join("")}</select>
      </div>
      <div class="genres" role="group" aria-label="Catégorie">${["", ...GENRES].map(x =>
        `<button class="genre${x === ui.genre ? " on" : ""}" data-genre="${esc(x)}">${esc(x || "Tous")}</button>`).join("")}</div>
      <div class="chips">${Object.entries(FILTRES).map(([k, [l]]) => `<button class="chip${ui.filtres.has(k) ? " on" : ""}" data-filtre="${k}">${l}${k === "anoter" ? ` <span class="nb" id="nbANoter"></span>` : ""}</button>`).join("")}</div>
      <p class="compte" id="compte"></p>
      <div class="grille" id="grille"></div></section>`;
  }
  const q = norm(ui.q);
  const liste = jeux.filter(g =>
    (!q || norm([g.nom, g.nomOriginal, g.resume, ...g.genres, ...g.categories, ...g.mecaniques, ...g.extensions.map(x => x.nom)].join(" ")).includes(q)) &&
    (!ui.genre || g.genres.includes(ui.genre)) &&
    [...ui.filtres].every(f => FILTRES[f][1](g))
  ).sort(TRIS[ui.tri][1]);

  $("#nbANoter").textContent = jeux.filter(aNoter).length;
  $("[data-filtre=anoter]").title = st.joueur
    ? `Jeux que ${JOUEURS[st.joueur].nom} n'a pas encore notés ni mis « à découvrir »`
    : "Jeux que l'un de vous n'a pas encore notés ni mis « à découvrir »";
  $("#compte").textContent = `${liste.length} jeu${liste.length > 1 ? "x" : ""}`;
  $("#grille").innerHTML = liste.map(g => `
    <a class="carte" href="#/jeu/${g.id}">
      <div class="carte-img">${g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy">` : `<span class="vide">🎲</span>`}
        <div class="carte-badges">${badges(g)}</div></div>
      <div class="carte-txt">
        <h3>${esc(g.nom)}</h3>
        <p class="meta">${esc(joueursTxt(g))} · ${esc(dureeTxt(g))}${niveau(g.difficulte) ? " · " + niveau(g.difficulte) : ""}</p>
        <div class="carte-badges-txt">${badges(g)}</div>
        <p class="resume">${esc(g.resume)}</p>
        <div class="envies">${PERS.map(p => `<span title="Envie de ${JOUEURS[p].nom}">${JOUEURS[p].nom[0]} ${pastilles(avis(g, p).envie)}</span>`).join("")}</div>
      </div></a>`).join("") || `<p class="vide-txt">Aucun jeu ne correspond.</p>`;
}

/* ---------- vue : fiche jeu ---------- */
function blocPret(g) {
  let corps;
  const p = st.prets[g.id];
  if (!store.modeLocal && !st.joueur) {
    corps = `<p class="aide">Connecte-toi pour voir et noter les prêts.</p>`;
  } else if (p) {
    corps = `<div class="pret"><p>Prêté à <b>${esc(p.prenom)} ${esc(p.nom)}</b>${p.tel ? ` · ${telLien(p.tel)}` : ""}
      <small>depuis le ${esc(fmtDate(p.depuis, { day: "numeric", month: "long", year: "numeric" }))}</small></p>
      <button class="btn petit" data-action="rendu" data-jeu="${g.id}" ${besoinJoueur()}>Rendu ✓</button></div>`;
  } else {
    corps = `<form class="form-pret" data-jeu="${g.id}">
      <input name="prenom" placeholder="Prénom" required autocomplete="off">
      <input name="nom" placeholder="Nom" autocomplete="off">
      <input name="tel" type="tel" placeholder="Téléphone" autocomplete="off">
      <button class="btn petit" ${besoinJoueur()}>Prêter</button></form>`;
  }
  return `<section class="bloc"><h2>Prêt</h2>${corps}</section>`;
}

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
          <div><dt>Joueurs</dt><dd>${esc(joueursTxt(g))}</dd></div>
          <div><dt>Durée</dt><dd>${esc(dureeTxt(g))}</dd></div>
          ${g.age ? `<div><dt>Âge</dt><dd>${g.age}+</dd></div>` : ""}
          ${g.difficulte ? `<div><dt>Difficulté</dt><dd>${niveau(g.difficulte)} <small>(${String(g.difficulte).replace(".", ",")}/5)</small></dd></div>` : ""}
          ${g.noteBgg ? `<div><dt>Note BGG</dt><dd>${String(g.noteBgg).replace(".", ",")}/10</dd></div>` : ""}
          ${g.annee ? `<div><dt>Année</dt><dd>${g.annee}</dd></div>` : ""}
        </dl>
        <div class="genres-fiche">${g.genres.map(x => `<a class="badge genre" href="#/jeux" data-genre="${esc(x)}">${esc(x)}</a>`).join("")}</div>
        <div class="fiche-act">
          <button class="btn" data-action="planifier" data-jeu="${g.id}" ${besoinJoueur()}>📅 Planifier</button>
          ${badges(g)}
        </div>
      </div>
    </header>

    <section class="bloc">
      <h2>Nos avis</h2>
      ${st.joueur ? "" : `<p class="aide">Identifie-toi en haut à droite pour noter.</p>`}
      <div class="ideal"><span>À combien ?</span>
        ${[["deux", "Bien à 2"], ["plus", "Mieux à 3+"]].map(([v, l]) =>
          `<button class="chip${ideal(g)[v] ? " on" : ""}" data-action="ideal" data-jeu="${g.id}" data-v="${v}" aria-pressed="${ideal(g)[v]}" ${besoinJoueur()}>${ideal(g)[v] ? "✓ " : ""}${l}</button>`).join("")}
        ${idealChoisi(g) ? "" : `<small>avis BGG${g.aDeux === "meilleur" ? " : excellent à 2" : ""}</small>`}</div>
      <table class="avis">
        <thead><tr><th></th>${PERS.map(p => `<th class="${p === st.joueur ? "moi-col" : ""}">${JOUEURS[p].nom}</th>`).join("")}</tr></thead>
        <tbody>
          ${ligne("Envie d'y jouer bientôt", "envie")}
          ${ligne("Plaisir à y rejouer", "rejouer")}
          <tr><th>À découvrir <small>(pas encore joué)</small></th>${PERS.map(p => {
            const v = avis(g, p).decouvrir;
            return `<td>${p === st.joueur
              ? `<button class="toggle${v ? " on" : ""}" data-action="decouvrir" data-jeu="${g.id}" aria-pressed="${v}">${v ? "Oui" : "Non"}</button>`
              : `<span class="etat">${v ? "Oui" : "Non"}</span>`}</td>`;
          }).join("")}</tr>
        </tbody>
      </table>
    </section>

    ${blocPret(g)}

    <section class="bloc">
      <h2>Le jeu</h2>
      ${lie ? `<p class="aide">Se joue avec <a href="#/jeu/${lie.id}">${esc(lie.nom)}</a>.</p>` : ""}
      <div class="texte">${(g.description || "Description à venir.").split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join("")}</div>
      ${g.categories.length || g.mecaniques.length ? `<h3>Style</h3><div class="tags">
        ${g.categories.map(c => `<span class="tag">${esc(c)}</span>`).join("")}
        ${g.mecaniques.map(m => `<span class="tag meca">${esc(m)}</span>`).join("")}</div>` : ""}
      ${g.auteurs.length ? `<p class="credits">Auteurs : ${esc(g.auteurs.join(", "))}${g.editeurs.length ? ` · Éditeurs : ${esc(g.editeurs.join(", "))}` : ""}</p>` : ""}
    </section>

    ${g.extensions.length ? `<section class="bloc"><h2>Extensions (${g.extensions.length})</h2><ul class="extensions">
      ${g.extensions.map(x => `<li>${x.vignette ? `<img src="${esc(x.vignette)}" alt="" loading="lazy">` : ""}<div><b>${esc(x.nom)}</b><p>${esc(x.resume)}</p></div>
        <button class="btn petit ghost" data-action="planifier" data-jeu="${g.id}" data-ext="${esc(x.nom)}" ${besoinJoueur()}>Planifier avec</button></li>`).join("")}
    </ul></section>` : ""}

    <section class="bloc"><h2>Règles</h2>
      ${g.regles.length ? `<ul class="regles">${g.regles.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">📄 ${esc(r.titre)}</a> <small>${esc(r.source)}</small></li>`).join("")}</ul>`
        : `<p class="aide">Pas encore de PDF des règles en français.</p>`}
      ${g.bgg ? `<p><a href="https://boardgamegeek.com/boardgame/${g.bgg}" target="_blank" rel="noopener">Voir la fiche sur BoardGameGeek ↗</a></p>` : ""}
    </section>

    <section class="bloc"><h2>Historique</h2>
      ${histo.length ? `<ul class="histo">${histo.map(s => `<li><span>${esc(fmtDate(s.date, { day: "numeric", month: "short", year: "numeric" }))}</span> Soirée jouée <small>${esc(avecExt(s))}${s.note ? ` ${esc(s.note)}` : ""}</small></li>`).join("")}</ul>`
        : `<p class="aide">Aucune soirée jouée pour l'instant.</p>`}
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
// Cases à cocher des extensions du jeu choisi dans le dialogue.
function rendreExtDialogue(g, coches = []) {
  const p = g && st.prets[g.id];
  $("#dlgInfo").textContent = p ? `⚠ Ce jeu est actuellement prêté à ${p.prenom} ${p.nom}.` : "";
  const box = $("#dlgExt");
  box.hidden = !g?.extensions.length;
  $("div", box).innerHTML = (g?.extensions || []).map(x =>
    `<label class="case"><input type="checkbox" value="${esc(x.nom)}" ${coches.includes(x.nom) ? "checked" : ""}> ${esc(x.nom)}</label>`).join("");
}
const jeuSaisi = () => jeux.find(x => norm(x.nom) === norm(form.jeu.value.trim()));
form.jeu.addEventListener("input", () => rendreExtDialogue(jeuSaisi()));

function ouvrirDialogue({ jeu, soiree, ext } = {}) {
  form.reset();
  $("#dlgErreur").textContent = "";
  $("#dlgTitre").textContent = soiree ? "Modifier" : "Ajouter un prochain jeu";
  form.dataset.id = soiree?.id || "";
  form.date.value = soiree?.date || "";
  form.jeu.value = parId[soiree?.jeu || jeu]?.nom || "";
  form.note.value = soiree?.note || "";
  rendreExtDialogue(parId[soiree?.jeu || jeu], soiree?.extensions || (ext ? [ext] : []));
  dlg.showModal();
  if (!form.jeu.value) form.jeu.focus();
}
$("#dlgAnnuler").onclick = () => dlg.close();
form.addEventListener("submit", async e => {
  e.preventDefault();
  const g = jeuSaisi();
  if (!g) { $("#dlgErreur").textContent = "Choisis un jeu de la liste."; return; }
  const extensions = [...form.querySelectorAll("#dlgExt input:checked")].map(c => c.value);
  const data = { date: form.date.value || null, jeu: g.id, extensions, note: form.note.value.trim() };
  try {
    if (form.dataset.id) await store.majSoiree(form.dataset.id, data);
    else await store.ajouterSoiree({ ...data, ordre: ordrePour() });
    dlg.close();
  } catch (err) {
    $("#dlgErreur").textContent = "Enregistrement impossible : " + err.message;
  }
});

/* ---------- actions ---------- */
async function marquerJouee(id) {
  const s = st.soirees.find(x => x.id === id);
  const g = parId[s.jeu];
  const premiere = aDecouvrir(g);
  const date = s.date && s.date <= auj() ? s.date : auj();
  await store.majSoiree(id, { statut: "jouee", decouverte: premiere, date });
  for (const p of PERS) if (avis(g, p).decouvrir) await store.majAvis(g.id, p, { decouvrir: false });
  if (premiere) ui.proposition = { jeu: g.id };
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
  const genre = e.target.closest("[data-genre]");
  if (genre) {   // depuis une fiche, le lien mène ensuite à #/jeux
    ui.genre = genre.dataset.genre;
    if ($("#grille")) {
      document.querySelectorAll(".genres [data-genre]").forEach(b => b.classList.toggle("on", b.dataset.genre === ui.genre));
      vueJeux();
    }
    return;
  }
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
    if (action === "planifier") ouvrirDialogue({ jeu, ext: el.dataset.ext });
    else if (action === "ajouter") await store.ajouterSoiree({ jeu, ordre: ordrePour() });
    else if (action === "monter" || action === "descendre") {
      const l = prevues(), i = l.findIndex(s => s.id === id), j = action === "monter" ? i - 1 : i + 1;
      // On renumérote toute la liste pour que l'échange reste net même avec d'anciens ordres égaux.
      [l[i], l[j]] = [l[j], l[i]];
      for (const [k, s] of l.entries()) if (ordre(s) !== k + 1) await store.majSoiree(s.id, { ordre: k + 1 });
    }
    else if (action === "serie") ouvrirSerie();
    else if (action === "tout-effacer") {
      const liste = prevues();
      if (confirm(`Vider la liste des ${liste.length} prochains jeux ? Les parties déjà jouées sont gardées.`))
        for (const s of liste) await store.supprimerSoiree(s.id);
    }
    else if (action === "changer") {
      const autre = suggestions(1)[0];
      if (autre) await store.majSoiree(id, { jeu: autre.g.id, extensions: [], note: "" });
    }
    else if (action === "rendu") await store.rendu(jeu);
    else if (action === "ideal") {
      const actuel = ideal(parId[jeu]);
      await store.majIdeal(jeu, { ...actuel, [el.dataset.v]: !actuel[el.dataset.v] });
    }
    else if (action === "modifier") ouvrirDialogue({ soiree: st.soirees.find(s => s.id === id) });
    else if (action === "supprimer") await store.supprimerSoiree(id);
    else if (action === "jouee") await marquerJouee(id);
    else if (action === "rappel") {
      const { jeu: j } = ui.proposition;
      ui.proposition = null;
      await store.ajouterSoiree({ jeu: j, ordre: ordrePour(RAPPEL_PLACE - 1), note: "pour s'en souvenir" });
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

document.addEventListener("submit", async e => {
  const f = e.target.closest(".form-pret");
  if (!f) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  await store.preter(f.dataset.jeu, { prenom: d.prenom.trim(), nom: d.nom.trim(), tel: d.tel.trim(), depuis: auj() });
});

/* ---------- dialogue : plusieurs soirées ---------- */
const dlgSerie = $("#dlgSerie"), formSerie = $("#formSerie");
function ouvrirSerie() {
  $("#serieErreur").textContent = "";
  dlgSerie.showModal();
}
$("#serieAnnuler").onclick = () => dlgSerie.close();
formSerie.addEventListener("submit", async e => {
  e.preventDefault();
  try {
    let o = ordrePour();
    for (const { g } of suggestions(Number(formSerie.nombre.value))) await store.ajouterSoiree({ jeu: g.id, ordre: o++ });
    dlgSerie.close();
  } catch (err) {
    $("#serieErreur").textContent = "Enregistrement impossible : " + err.message;
  }
});

document.addEventListener("input", e => {
  if (e.target.id === "q") { ui.q = e.target.value; vueJeux(); }
});
document.addEventListener("change", e => {
  if (e.target.id === "tri") { ui.tri = e.target.value; vueJeux(); }
});
window.addEventListener("hashchange", rendre);

/* ---------- démarrage ---------- */
jeux = await fetch("data/games.json?v=4").then(r => r.json());
parId = Object.fromEntries(jeux.map(g => [g.id, g]));
$("#listeJeux").innerHTML = jeux.map(g => `<option value="${esc(g.nom)}">`).join("");
store.ecouter(s => { st = s; rendre(); });
store.demarrer().catch(err => {
  console.error(err);
  $("#bandeau").hidden = false;
  $("#bandeau").textContent = "Connexion à la base impossible : " + err.message;
});
