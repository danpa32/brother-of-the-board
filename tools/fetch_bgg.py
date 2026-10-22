"""Récupère les infos BGG des jeux possédés : ceux de l'export BG Stats
plus ceux listés dans tools/achats.json (achetés après l'export).

Usage : python3 tools/fetch_bgg.py tools/bgstats-export.json [--tout]
Écrit tools/bgg-raw.json (données brutes, en anglais). Sans --tout, seuls
les jeux absents de bgg-raw.json sont téléchargés.
"""
import json, os, sys, time, urllib.error, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (brother-of-the-board)"}
RAW = "tools/bgg-raw.json"

def get(url, essais=5):
    req = urllib.request.Request(url, headers=UA)
    for i in range(essais):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == essais - 1:
                raise
            time.sleep(15 * (i + 1))   # BGG limite le débit : on patiente

def bgg_info(bid, image=None, thumb=None):
    base = f"objectid={bid}&objecttype=thing"
    item = get(f"https://api.geekdo.com/api/geekitems?{base}&nosession=1")["item"]
    dyn = get(f"https://api.geekdo.com/api/dynamicinfo?{base}")["item"]
    links = item["links"]
    names = lambda k: [x["name"] for x in links.get(k) or []]
    ids = lambda k: [int(x["objectid"]) for x in links.get(k) or []]
    time.sleep(1.5)
    return {
        "bggName": item["name"],
        "year": int(item["yearpublished"] or 0),
        "minPlayers": int(item["minplayers"] or 0),
        "maxPlayers": int(item["maxplayers"] or 0),
        "minTime": int(item["minplaytime"] or 0),
        "maxTime": int(item["maxplaytime"] or 0),
        "minAge": int(item["minage"] or 0),
        "shortDescription": item.get("short_description") or "",
        "description": item.get("description") or "",
        "categories": names("boardgamecategory"),
        "mechanics": names("boardgamemechanic"),
        "designers": names("boardgamedesigner"),
        "publishers": names("boardgamepublisher")[:5],
        "expands": ids("expandsboardgame"),
        "isExpansionBgg": item.get("subtype") == "boardgameexpansion",
        "image": item.get("imageurl") or image,
        "thumb": thumb or (item.get("images") or {}).get("thumb"),
        "rating": float(dyn["stats"].get("average") or 0),
        "weight": float(dyn["stats"].get("avgweight") or 0),
        "polls": dyn.get("polls", {}).get("userplayers"),
        "languageDependence": dyn.get("polls", {}).get("languagedependence"),
    }

export = json.load(open(sys.argv[1]))
achats = json.load(open("tools/achats.json"))
tout = "--tout" in sys.argv
out = {} if tout or not os.path.exists(RAW) else json.load(open(RAW))

# Jeux à avoir : possédés dans l'export, ou rachetés depuis (achats.json).
achat_ids = {a["bggId"] for a in achats}
voulus = {}
for g in export["games"]:
    owned = any(c.get("statusOwned") for c in g.get("copies") or [])
    if owned or (g.get("bggId") and g["bggId"] in achat_ids):
        voulus[str(g["id"])] = {"bgstatsId": g["id"], "name": g["name"], "bggId": g.get("bggId") or 0,
                                "isExpansion": bool(g.get("isExpansion")) and not g.get("isBaseGame"),
                                "_img": (g.get("urlImage"), g.get("urlThumb"))}
dans_export = {v["bggId"] for v in voulus.values()}
for a in achats:
    if a["bggId"] not in dans_export:
        voulus[f"bgg-{a['bggId']}"] = {"bgstatsId": None, "name": a["nom"], "bggId": a["bggId"],
                                       "isExpansion": bool(a.get("parent")), "_img": (None, None)}

for i, (k, v) in enumerate(voulus.items(), 1):
    img = v.pop("_img")
    if k in out:
        continue
    if v["bggId"]:
        v.update(bgg_info(v["bggId"], *img))
    out[k] = v
    print(f"{i:3}/{len(voulus)} {v['name']}", file=sys.stderr)

json.dump(out, open(RAW, "w"), ensure_ascii=False, indent=1)
