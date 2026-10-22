# Brother of the board

Nos jeux de société, nos envies de jeu (Daniel & Mathieu) et le planning des prochaines soirées.
Site statique publié sur GitHub Pages ; notes et planning partagés via Firebase (Firestore).

## Mettre en route Firebase (une seule fois)

1. Sur <https://console.firebase.google.com>, **Ajouter un projet** (Google Analytics : inutile).
2. **Build → Firestore Database → Créer une base de données**, emplacement `europe-west6` (Zurich), mode production.
3. **Build → Authentication → Commencer → Google** : activer.
   Dans **Paramètres → Domaines autorisés**, ajouter `danpa32.github.io`.
4. **Paramètres du projet → Vos applications → Web (`</>`)** : enregistrer une appli, copier
   `apiKey`, `authDomain`, `projectId`, `appId` dans `js/config.js`.
5. Dans `js/config.js`, mettre l'adresse Gmail de Daniel et de Mathieu.
6. **Firestore → Règles** : coller `firestore.rules` en remplaçant les deux adresses, puis **Publier**.

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
- Après une mise à jour, augmenter le `?v=` dans `index.html` et `js/app.js` pour que les téléphones rechargent.

## Tester en local

```bash
python3 -m http.server 8000   # puis http://localhost:8000
```
