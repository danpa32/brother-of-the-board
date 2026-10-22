/* ============ À PERSONNALISER ============ */

// Les deux joueurs. Aucune adresse e-mail ici : les comptes autorisés sont listés
// uniquement dans les règles Firestore, collées dans la console Firebase.
export const JOUEURS = {
  daniel:  { nom: "Daniel" },
  mathieu: { nom: "Mathieu" },
};

// Configuration Firebase (console Firebase → Paramètres du projet → Vos applications → Web).
// Tant que `apiKey` est vide, le site fonctionne en « mode local » :
// les notes et le planning restent dans ce navigateur uniquement.
export const FIREBASE = {
  apiKey: "AIzaSyDbvfNk72h68CjnBJqF7en5Bf9vm2I2hGM",
  authDomain: "brother-of-the-board.firebaseapp.com",
  projectId: "brother-of-the-board",
  appId: "1:52316646174:web:ec6b8f2de5352e9b8df70f",
};

/* ========================================= */
