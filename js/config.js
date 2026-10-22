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
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
};

/* ========================================= */
