// Données partagées : avis (notes par jeu et par joueur) et soirées planifiées.
// Deux implémentations avec la même interface : Firebase (partagé) ou local (navigateur).
import { JOUEURS, FIREBASE } from "./config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

export const modeLocal = !FIREBASE.apiKey;

const etat = { avis: {}, soirees: [], joueur: null, pret: false };
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
    localStorage.setItem(CLE, JSON.stringify({ avis: etat.avis, soirees: etat.soirees, joueur: etat.joueur }));
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

  fs.onSnapshot(fs.collection(fb.db, "avis"), snap => {
    etat.avis = {};
    snap.forEach(d => { etat.avis[d.id] = d.data(); });
    etat.pret = true; notifier();
  }, err => console.error("avis", err));

  fs.onSnapshot(fs.collection(fb.db, "soirees"), snap => {
    etat.soirees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    notifier();
  }, err => console.error("soirees", err));

  au.onAuthStateChanged(fb.auth, user => {
    const email = user?.email?.toLowerCase();
    etat.joueur = Object.keys(JOUEURS).find(k => JOUEURS[k].email.toLowerCase() === email) || null;
    etat.emailInconnu = user && !etat.joueur ? user.email : null;
    notifier();
  });
}

export async function demarrer() {
  if (modeLocal) {
    const l = lireLocal();
    Object.assign(etat, { avis: l.avis || {}, soirees: l.soirees || [], joueur: l.joueur || null, pret: true });
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
  const soiree = { statut: "prevue", note: "", ...s, creePar: etat.joueur };
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

export async function supprimerSoiree(id) {
  if (modeLocal) {
    etat.soirees = etat.soirees.filter(s => s.id !== id);
    ecrireLocal(); notifier(); return;
  }
  await fb.fs.deleteDoc(fb.fs.doc(fb.db, "soirees", id));
}
