/* ============ À PERSONNALISER ============ */

// Les deux joueurs. `email` = adresse du compte Google utilisé pour se connecter
// (doit aussi figurer dans firestore.rules).
export const JOUEURS = {
  daniel:  { nom: "Daniel",  email: "" },
  mathieu: { nom: "Mathieu", email: "" },
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
