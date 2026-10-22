"""Regroupe les jeux possédés : une fiche par jeu, extensions rattachées.

Écrit tools/entries.json, utilisé ensuite par build_data.py.
"""
import json
from collections import Counter

raw = json.load(open("tools/bgg-raw.json"))
export = json.load(open("tools/bgstats-export.json"))
DANIEL, MATHIEU = 4, 1   # ids des joueurs dans BG Stats (Mathieu = propriétaire du compte BG Stats)

by_name = {e["name"]: k for k, e in raw.items()}
by_bgg = {e["bggId"]: k for k, e in raw.items() if e["bggId"]}

# Extensions qui forment presque un jeu à part : gardées comme fiche séparée,
# avec un lien vers le jeu de base.
STANDALONE = {"Les Ruines Perdues de Narak: La Mission Disparue", "Dice Throne Adventures"}
# Rattachements que BGG ne donne pas directement.
MANUAL_PARENT = {
    "Wanted! A Fistful of Cards": "Wanted! Dead or Alive",
    "Wanted! Dodge City": "Wanted! Dead or Alive",
    "Wanted! High Noon": "Wanted! Dead or Alive",
    "Munchkin Christmas Lite": "Munchkin",
    "Dixit 3: Journey": "Dixit",
    "Dixit: Quest": "Dixit",
}
# Les boîtes Dice Throne sont toutes des héros pour le même jeu.
DICE_THRONE_BOXES = [n for n in by_name if n.startswith("Dice Throne:")]

def parent_of(e):
    if e["name"] in STANDALONE:
        return None
    if e["name"] in MANUAL_PARENT:
        return by_name[MANUAL_PARENT[e["name"]]]
    if e["name"] in DICE_THRONE_BOXES:
        return by_name["Dice Throne"]
    if not e["isExpansion"]:
        return None
    owned_parents = [by_bgg[b] for b in e.get("expands", []) if b in by_bgg]
    return owned_parents[0] if owned_parents else None

plays = Counter()
last = {}
for p in export["plays"]:
    who = {s["playerRefId"] for s in p["playerScores"]}
    for pid in (DANIEL, MATHIEU):
        if pid in who:
            plays[(p["gameRefId"], pid)] += 1
            last[p["gameRefId"]] = max(last.get(p["gameRefId"], ""), p["playDate"][:10])

entries = {}
for k, e in raw.items():
    if parent_of(e) is None:
        entries[k] = {"key": k, "expansions": [], "relatedTo": None}
for k, e in raw.items():
    p = parent_of(e)
    if p is not None:
        entries[p]["expansions"].append(k)
for name in STANDALONE:
    k = by_name[name]
    entries[k]["relatedTo"] = by_name["Dice Throne" if "Dice" in name else "Les Ruines Perdues de Narak"]

for k, ent in entries.items():
    members = [k] + ent["expansions"]
    ent["plays"] = {
        "daniel": sum(plays[(int(m), DANIEL)] for m in members),
        "mathieu": sum(plays[(int(m), MATHIEU)] for m in members),
    }
    ent["lastPlayed"] = max((last.get(int(m), "") for m in members), default="")

json.dump(entries, open("tools/entries.json", "w"), ensure_ascii=False, indent=1)
for k, ent in sorted(entries.items(), key=lambda x: raw[x[0]]["name"].lower()):
    exp = f"  (+{len(ent['expansions'])} ext.)" if ent["expansions"] else ""
    print(raw[k]["name"] + exp)
print(len(entries), "fiches")
