#!/usr/bin/env python3
"""Sync the app's venue directory from the website's bahnen.json.

Single source of truth is PLONKY_WEBSITE/bahnen.json (used by plonky.ch).
This pulls a SLIM copy — only the fields the app's Anlagen-Auswahl needs —
into 01_APP/venues.json, which Flask serves at /venues.json.

Run after the website list changes:
    python3 tools/sync_venues.py
"""
import json
import os

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.normpath(os.path.join(APP_DIR, "..", "PLONKY_WEBSITE", "bahnen.json"))
OUT = os.path.join(APP_DIR, "venues.json")


def main():
    with open(SRC, encoding="utf-8") as f:
        bahnen = json.load(f)

    venues = []
    for b in bahnen:
        slug = (b.get("slug") or "").strip()
        name = (b.get("name") or "").strip()
        canton = (b.get("canton") or "").strip().upper()
        if not (slug and name and canton):
            continue  # a venue without these can't live in the picker
        city = (b.get("city") or b.get("region") or "").strip()
        # region = Quartier/Gegend (z. B. "Waldau" für Minigolf Bern). Nur wenn es echte
        # Zusatz-Info ist (≠ Ort) — damit man die Anlage auch nach dem Quartiernamen findet.
        region = (b.get("region") or "").strip()
        if region.lower() == city.lower():
            region = ""
        entry = {
            "slug": slug,
            "name": name,
            "canton": canton,
            "city": city,
            # holes may be missing on the website — keep null, the app defaults to 18
            "holes": b.get("holes") if isinstance(b.get("holes"), int) else None,
        }
        if region:
            entry["region"] = region
        venues.append(entry)

    # tidy order: by canton, then by name — the frontend groups/sorts anyway
    venues.sort(key=lambda v: (v["canton"], v["name"].lower()))

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(venues, f, ensure_ascii=False, indent=0, separators=(",", ":"))
        f.write("\n")

    with_holes = sum(1 for v in venues if v["holes"])
    cantons = sorted({v["canton"] for v in venues})
    print(f"✓ {len(venues)} Anlagen → {os.path.relpath(OUT, APP_DIR)}")
    print(f"  {with_holes} mit Bahnenzahl · {len(venues) - with_holes} ohne (Standard 18)")
    print(f"  {len(cantons)} Kantone: {', '.join(cantons)}")


if __name__ == "__main__":
    main()
