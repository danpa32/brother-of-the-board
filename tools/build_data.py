"""Assemble data/games.json (en français) pour le site.

Sources : tools/bgg-raw.json (BGG), tools/entries.json (regroupements),
tools/fr/*.json (traductions et règles), tools/vocab_fr.json.
Usage : python3 tools/build_data.py
"""
import glob, json

raw = json.load(open("tools/bgg-raw.json"))
entries = json.load(open("tools/entries.json"))
vocab = json.load(open("tools/vocab_fr.json"))
fr = {}
for path in sorted(glob.glob("tools/fr/*.json")):
    fr.update(json.load(open(path)))


def game_id(key):
    e = raw[key]
    return str(e["bggId"]) if e["bggId"] else e["name"].lower().replace(" ", "-")


def translate(names, table, limit=None):
    out = []
    for n in names:
        t = table.get(n, n)
        if t and t not in out:
            out.append(t)
    return out[:limit] if limit else out


def best_at_two(polls):
    """'meilleur' / 'recommande' / None selon le vote BGG pour 2 joueurs."""
    if not polls:
        return None
    for label, key in (("meilleur", "best"), ("recommande", "recommended")):
        if any(r["min"] <= 2 <= r["max"] for r in polls.get(key) or []):
            return label
    return None


games = []
for key, ent in entries.items():
    e, t = raw[key], fr.get(key, {})
    info = t.get("infos", {})
    games.append({
        "id": game_id(key),
        "nom": t.get("nomFr") or e["name"],
        "nomOriginal": e.get("bggName") or e["name"],
        "annee": e.get("year") or None,
        "image": e.get("image"),
        "vignette": e.get("thumb"),
        "joueurs": {"min": e.get("minPlayers") or info.get("minPlayers"),
                    "max": e.get("maxPlayers") or info.get("maxPlayers")},
        "aDeux": best_at_two(e.get("polls")),
        "duree": {"min": e.get("minTime") or info.get("minTime"),
                  "max": e.get("maxTime") or info.get("maxTime")},
        "age": e.get("minAge") or info.get("minAge"),
        "difficulte": round(e["weight"], 1) if e.get("weight") else None,
        "noteBgg": round(e["rating"], 1) if e.get("rating") else None,
        "categories": translate(e.get("categories") or info.get("categories", []), vocab["categories"]),
        "mecaniques": translate(e.get("mechanics", []), vocab["mechanics"], 8),
        "auteurs": e.get("designers", []),
        "editeurs": e.get("publishers", [])[:3],
        "resume": t.get("resume", ""),
        "description": t.get("description", ""),
        "extensions": [{
            "nom": (t.get("expansions", {}).get(x, {}).get("nomFr")) or raw[x]["name"],
            "resume": t.get("expansions", {}).get(x, {}).get("resume", ""),
            "vignette": raw[x].get("thumb"),
            "bgg": raw[x]["bggId"] or None,
        } for x in ent["expansions"]],
        "regles": t.get("regles", []),
        "bgg": e["bggId"] or None,
        "lie": game_id(ent["relatedTo"]) if ent["relatedTo"] else None,
        "parties": ent["plays"],
        "derniereFois": ent["lastPlayed"] or None,
    })

games.sort(key=lambda g: g["nom"].lower().lstrip("[").replace("é", "e"))
json.dump(games, open("data/games.json", "w"), ensure_ascii=False, separators=(",", ":"))
missing = [g["nom"] for g in games if not g["description"]]
print(f"{len(games)} jeux écrits dans data/games.json ; sans description FR : {len(missing)}")
