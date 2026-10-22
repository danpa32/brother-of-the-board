"""Récupère les infos BGG des jeux possédés dans l'export BG Stats.

Usage : python3 tools/fetch_bgg.py tools/bgstats-export.json
Écrit tools/bgg-raw.json (données brutes, en anglais).
"""
import json, sys, time, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (brother-of-the-board)"}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

export = json.load(open(sys.argv[1]))
owned = [g for g in export["games"]
         if any(c.get("statusOwned") for c in g.get("copies") or [])]

out = {}
for g in owned:
    bid = g.get("bggId") or 0
    entry = {"bgstatsId": g["id"], "name": g["name"], "bggId": bid,
             "isExpansion": bool(g.get("isExpansion")) and not g.get("isBaseGame")}
    if bid:
        base = f"objectid={bid}&objecttype=thing"
        item = get(f"https://api.geekdo.com/api/geekitems?{base}&nosession=1")["item"]
        dyn = get(f"https://api.geekdo.com/api/dynamicinfo?{base}")["item"]
        links = item["links"]
        names = lambda k: [x["name"] for x in links.get(k) or []]
        ids = lambda k: [int(x["objectid"]) for x in links.get(k) or []]
        entry.update({
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
            "image": item.get("imageurl") or g.get("urlImage"),
            "thumb": g.get("urlThumb"),
            "rating": float(dyn["stats"].get("average") or 0),
            "weight": float(dyn["stats"].get("avgweight") or 0),
            "polls": dyn.get("polls", {}).get("userplayers"),
            "languageDependence": dyn.get("polls", {}).get("languagedependence"),
        })
        time.sleep(0.5)
    out[str(g["id"])] = entry
    print(f"{len(out):3}/{len(owned)} {g['name']}", file=sys.stderr)

json.dump(out, open("tools/bgg-raw.json", "w"), ensure_ascii=False, indent=1)
