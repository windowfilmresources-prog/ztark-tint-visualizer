#!/usr/bin/env python3
"""Pull a CC0 asset set from PolyHaven for the archviz room.

Models arrive as .blend + their relative texture includes (so wm.append keeps
working texture paths); material sets as individual maps; HDRI as .hdr.
Everything lands under modeling/assets/polyhaven/.
"""
import json
import os
import sys
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "polyhaven")

MODELS = [
    "sofa_02", "ArmChair_01", "CoffeeTable_01", "side_table_01",
    "potted_plant_01", "potted_plant_04", "modern_ceiling_lamp_01",
    "decorative_book_set_01", "ceramic_vase_03", "fancy_picture_frame_01",
    "drawer_cabinet", "jacaranda_tree", "planter_box_01", "dining_chair_02",
    "dining_table", "brass_vase_03",
]
TEXTURES = [
    "wood_floor_deck", "plastered_wall_04", "fabric_pattern_07",
    "carpet_01", "concrete_pavers", "brown_mud_leaves_01",
]
HDRI = "qwantani_puresky"
RES = "2k"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ztark-archviz-fetch"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def save(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    data = get(url)
    with open(path, "wb") as f:
        f.write(data)
    return True


def files_json(asset):
    return json.loads(get(f"https://api.polyhaven.com/files/{asset}"))


def fetch_model(asset):
    fj = files_json(asset)
    blend = fj.get("blend", {}).get(RES, {}).get("blend")
    if not blend:
        res2 = sorted(fj.get("blend", {}).keys())
        if not res2:
            print(f"  !! no blend for {asset}")
            return
        blend = fj["blend"][res2[0]]["blend"]
    base = os.path.join(ROOT, "models", asset)
    n = save(blend["url"], os.path.join(base, f"{asset}.blend"))
    for rel, meta in (blend.get("include") or {}).items():
        save(meta["url"], os.path.join(base, rel))
    print(f"  model {asset}: {'fetched' if n else 'cached'} "
          f"(+{len(blend.get('include') or {})} textures)")


def fetch_texture(asset):
    fj = files_json(asset)
    base = os.path.join(ROOT, "textures", asset)
    got = 0
    for kind in ("Diffuse", "nor_gl", "Rough", "AO", "Displacement", "arm"):
        entry = fj.get(kind, {}).get(RES, {})
        for fmt in ("jpg", "png", "exr"):
            if fmt in entry:
                got += 1 if save(entry[fmt]["url"],
                                 os.path.join(base, f"{asset}_{kind}_{RES}.{fmt}")) else 0
                break
    print(f"  texture {asset}: {got} new maps")


def fetch_hdri(asset):
    fj = files_json(asset)
    entry = fj["hdri"].get("4k", fj["hdri"][sorted(fj["hdri"].keys())[0]])["hdr"]
    save(entry["url"], os.path.join(ROOT, "hdri", f"{asset}_4k.hdr"))
    print(f"  hdri {asset}: ok")


def main():
    print("models:")
    for m in MODELS:
        try:
            fetch_model(m)
        except Exception as e:
            print(f"  !! {m}: {e}")
    print("textures:")
    for t in TEXTURES:
        try:
            fetch_texture(t)
        except Exception as e:
            print(f"  !! {t}: {e}")
    print("hdri:")
    try:
        fetch_hdri(HDRI)
    except Exception as e:
        print(f"  !! {HDRI}: {e}")
    total = 0
    for dirpath, _, files in os.walk(ROOT):
        total += sum(os.path.getsize(os.path.join(dirpath, f)) for f in files)
    print(f"total asset size: {total / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
