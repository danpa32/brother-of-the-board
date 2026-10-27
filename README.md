# Brother of the board

Nos jeux de société, nos envies de jeu (Daniel & Mathieu) et le planning des prochaines soirées.
Site statique publié sur GitHub Pages ; notes et planning partagés via Firebase (Firestore).

## Mettre en route Firebase (une seule fois)

1. Sur <https://console.firebase.google.com>, **Ajouter un projet** (Google Analytics : inutile).
2. **Build → Firestore Database → Créer une base de données**, emplacement `europe-west6` (Zurich), mode production.
3. **Build → Authentication → Commencer → Google** : activer.
   Dans **Paramètres → Domaines autorisés**, ajouter `danpa32.github.io`.
4. **Paramètres du projet → Vos applications → Web (`</>`)** : enregistrer une appli, copier
   `apiKey`, `authDomain`, `projectId`, `appId` dans `js/config.js` (ces valeurs ne sont pas secrètes).
5. **Firestore → Règles** : coller `firestore.rules`, remplacer `ADRESSE_DANIEL` et `ADRESSE_MATHIEU`
   par nos deux adresses Google **dans la console seulement**, puis **Publier**.
6. Sur le site, chacun se connecte avec Google et clique une fois sur « Je suis Daniel / Mathieu ».

Nos adresses n'apparaissent nulle part dans ce repo. Sans connexion avec l'un de nos deux comptes,
le site montre seulement la liste des jeux : ni notes, ni planning, ni prêts, et aucune modification possible.
Tant que `apiKey` est vide, le site tourne en « mode local » (données dans le navigateur seulement).

## Données des jeux

`data/games.json` est généré ; ne pas l'éditer à la main.

```bash
python3 tools/fetch_bgg.py tools/bgstats-export.json   # infos BGG (anglais) -> tools/bgg-raw.json
python3 tools/group_games.py                           # extensions rattachées au jeu de base -> tools/entries.json
python3 tools/build_data.py                            # assemble le tout en français -> data/games.json
```

- `tools/fr/*.json` : résumés, descriptions et liens vers les règles en français.
- `tools/vocab_fr.json` : traduction des catégories et mécaniques BGG.
- `tools/achats.json` : jeux achetés après l'export BG Stats (`bggId`, `nom`, `parent` pour une extension).
  Un jeu absent de BGG prend `"bggId": null` ; ses joueurs, durée et âge vont alors dans `infos` de son lot `tools/fr`.
- `tools/proprietaires.json` : à qui appartient chaque jeu ou extension (`["daniel"]`, `["mathieu"]` ou les deux).
- Après une mise à jour, augmenter le `?v=` dans `index.html` et `js/app.js` pour que les téléphones rechargent.

## Tester en local

```bash
python3 -m http.server 8000   # puis http://localhost:8000
```
