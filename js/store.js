// Données partagées : avis (notes par jeu et par joueur) et soirées planifiées.
// Deux implémentations avec la même interface : Firebase (partagé) ou local (navigateur).
import { FIREBASE } from "./config.js?v=3";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

export const modeLocal = !FIREBASE.apiKey;

const etat = { avis: {}, soirees: [], prets: {}, joueur: null, pret: false };
let ecouteur = () => {};
const notifier = () => ecouteur({ ...etat });

export function ecouter(fn) { ecouteur = fn; notifier(); }

/* ---------- mode local ---------- */
const CLE = "botb-local-v1";

function lireLocal() {
  try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; }
}
function ecrireLocal() {
  try {
    localStorage.setItem(CLE, JSON.stringify({ avis: etat.avis, soirees: etat.soirees, prets: etat.prets, joueur: etat.joueur }));
  } catch { /* stockage indisponible : on garde en mémoire */ }
}

/* ---------- mode Firebase ---------- */
let fb = null;   // { db, auth, fs, au }

async function demarrerFirebase() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  const app = initializeApp(FIREBASE);
  fb = { db: fs.getFirestore(app), auth: au.getAuth(app), fs, au };

  // Toutes les données (avis, soirées, prêts) ne sont lisibles qu'une fois connecté avec
  // l'un de nos deux comptes ; un visiteur ne voit que la liste des jeux.
  let arrets = [];
  const ecouterTout = () => {
    arrets = [
      fs.onSnapshot(fs.collection(fb.db, "avis"), snap => {
        etat.avis = {};
        snap.forEach(d => { etat.avis[d.id] = d.data(); });
        notifier();
      }, err => console.error("avis", err)),
      fs.onSnapshot(fs.collection(fb.db, "soirees"), snap => {
        etat.soirees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        notifier();
      }, err => console.error("soirees", err)),
      fs.onSnapshot(fs.collection(fb.db, "prets"), snap => {
        etat.prets = {};
        snap.forEach(d => { etat.prets[d.id] = d.data(); });
        notifier();
      }, err => console.error("prets", err)),
    ];
  };

  au.onAuthStateChanged(fb.auth, async user => {
    arrets.forEach(f => f()); arrets = [];
    Object.assign(etat, { avis: {}, soirees: [], prets: {}, joueur: null, choixRequis: false, refuse: false });
    if (user) {
      // membres/{uid} dit qui est qui ; la lecture échoue si le compte n'est pas autorisé.
      try {
        const m = await fs.getDoc(fs.doc(fb.db, "membres", user.uid));
        if (m.exists()) { etat.joueur = m.data().joueur; ecouterTout(); }
        else etat.choixRequis = true;
      } catch {
        etat.refuse = true;
      }
    }
    etat.pret = true;
    notifier();
  });
}

export async function demarrer() {
  if (modeLocal) {
    const l = lireLocal();
    Object.assign(etat, { avis: l.avis || {}, soirees: l.soirees || [], prets: l.prets || {}, joueur: l.joueur || null, pret: true });
    notifier();
  } else {
    await demarrerFirebase();
  }
}

/* ---------- identité ---------- */
export async function connexion(joueur) {
  if (modeLocal) { etat.joueur = joueur; ecrireLocal(); notifier(); return; }
  await fb.au.signInWithPopup(fb.auth, new fb.au.GoogleAuthProvider());
}

// Première connexion d'un compte autorisé : il dit une fois pour toutes qui il est.
export async function choisirJoueur(joueur) {
  await fb.fs.setDoc(fb.fs.doc(fb.db, "membres", fb.auth.currentUser.uid), { joueur });
  etat.joueur = joueur; etat.choixRequis = false;
  // Recharger l'état complet via l'écouteur de connexion.
  location.reload();
}
export async function deconnexion() {
  if (modeLocal) { etat.joueur = null; ecrireLocal(); notifier(); return; }
  await fb.au.signOut(fb.auth);
}

/* ---------- écritures ---------- */
// patch = { envie?, rejouer?, decouvrir? } pour un joueur
export async function majAvis(jeu, joueur, patch) {
  const actuel = etat.avis[jeu]?.[joueur] || {};
  const nouveau = { ...actuel, ...patch };
  if (modeLocal) {
    etat.avis[jeu] = { ...etat.avis[jeu], [joueur]: nouveau };
    ecrireLocal(); notifier(); return;
  }
  await fb.fs.setDoc(fb.fs.doc(fb.db, "avis", jeu), { [joueur]: nouveau }, { merge: true });
}

export async function ajouterSoiree(s) {
  const soiree = { statut: "prevue", note: "", date: null, extensions: [], ...s, creePar: etat.joueur };
  if (modeLocal) {
    etat.soirees.push({ id: crypto.randomUUID(), ...soiree });
    ecrireLocal(); notifier(); return;
  }
  await fb.fs.addDoc(fb.fs.collection(fb.db, "soirees"), soiree);
}

export async function majSoiree(id, patch) {
  if (modeLocal) {
    etat.soirees = etat.soirees.map(s => s.id === id ? { ...s, ...patch } : s);
    ecrireLocal(); notifier(); return;
  }
  await fb.fs.updateDoc(fb.fs.doc(fb.db, "soirees", id), patch);
}

// pret = { prenom, nom, tel, depuis } ; un seul prêt en cours par jeu.
export async function preter(jeu, pret) {
  const p = { ...pret, par: etat.joueur };
  if (modeLocal) { etat.prets[jeu] = p; ecrireLocal(); notifier(); return; }
  await fb.fs.setDoc(fb.fs.doc(fb.db, "prets", jeu), p);
}

export async function rendu(jeu) {
  if (modeLocal) { delete etat.prets[jeu]; ecrireLocal(); notifier(); return; }
  await fb.fs.deleteDoc(fb.fs.doc(fb.db, "prets", jeu));
}

export async function supprimerSoiree(id) {
  if (modeLocal) {
    etat.soirees = etat.soirees.filter(s => s.id !== id);
    ecrireLocal(); notifier(); return;
  }
  await fb.fs.deleteDoc(fb.fs.doc(fb.db, "soirees", id));
}
