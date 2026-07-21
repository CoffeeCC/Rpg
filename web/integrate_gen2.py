# -*- coding: utf-8 -*-
"""Integrate Grok run-2: new monsters, card faces, unique gear -> art dirs + manifests."""
import os, re, json
from PIL import Image

WEB = os.path.dirname(os.path.abspath(__file__))
STAGE = os.path.join(WEB, 'gen2-staging')
ART = os.path.join(WEB, 'public', 'art')
LO, HI = 14, 52

def transparent(src, dst, maxpx=None):
    im = Image.open(src).convert('RGB')
    if maxpx and max(im.size) > maxpx:
        im.thumbnail((maxpx, maxpx))
    w, h = im.size; px = im.load()
    out = Image.new('RGBA', (w, h)); op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]; lum = max(r, g, b)
            a = 0 if lum <= LO else 255 if lum >= HI else int(round((lum - LO) / (HI - LO) * 255))
            op[x, y] = (r, g, b, a)
    out.save(dst, optimize=True)

# 1. monsters -> transparent PNG (full res)
for f in os.listdir(os.path.join(STAGE, 'monsters')):
    if f.endswith('.jpg'):
        transparent(os.path.join(STAGE, 'monsters', f), os.path.join(ART, 'monsters', f[:-4] + '.png'))
print('monsters converted')

# 2. uniques -> transparent PNG (256, like gear icons)
os.makedirs(os.path.join(ART, 'uniques'), exist_ok=True)
for f in os.listdir(os.path.join(STAGE, 'uniques')):
    if f.endswith('.jpg'):
        transparent(os.path.join(STAGE, 'uniques', f), os.path.join(ART, 'uniques', f[:-4] + '.png'), 256)
print('uniques converted')

# 3. cards -> jpg copy
import shutil
for f in os.listdir(os.path.join(STAGE, 'cards')):
    if f.endswith('.jpg'):
        shutil.copy2(os.path.join(STAGE, 'cards', f), os.path.join(ART, 'cards', f))
print('cards copied')

# --- regenerate paintedCharacters.ts (monsters+heroes png, npcs jpg) ---
def manifest_block(sub, ext, var):
    files = sorted(f[:-4] for f in os.listdir(os.path.join(ART, sub)) if f.endswith(ext))
    lines = ["  %s: '/art/%s/%s%s'," % (f, sub, f, ext) for f in files]
    lines = [l.replace("'/art", "'art") for l in lines]  # relative (base-aware)
    return "export const %s: Record<string, string> = {\n%s\n};\n" % (var, "\n".join(lines))
pc = "// AUTO-CURATED: Grok-painted character art (transparent PNG). Missing ids fall back to SVG.\n\n"
pc += manifest_block('monsters', '.png', 'PAINTED_MONSTERS') + "\n"
pc += manifest_block('heroes', '.png', 'PAINTED_HEROES') + "\n"
pc += manifest_block('npcs', '.jpg', 'PAINTED_NPCS')
open(os.path.join(WEB, 'src', 'art', 'paintedCharacters.ts'), 'w', encoding='utf8').write(pc)

# --- regenerate cardArt.ts (species -> monster png unless dedicated face; all faces) ---
s = open(os.path.join(WEB, 'src', 'engine', 'data', 'cards.ts'), encoding='utf8').read()
i = s.index('export const SPECIES_CARDS'); j = s.index('};', i)
entries = re.findall(r"(\w+): \[([^\]]*)\]", s[i:j])
monster_png = set(f[:-4] for f in os.listdir(os.path.join(ART, 'monsters')) if f.endswith('.png'))
card_faces = set(f[:-4] for f in os.listdir(os.path.join(ART, 'cards')) if f.endswith('.jpg'))
lines = set()
for species, cards in entries:
    if species not in monster_png:
        continue
    for cid in re.findall(r"'([a-zA-Z0-9_]+)'", cards):
        if cid not in card_faces:
            lines.add("  %s: 'art/monsters/%s.png'," % (cid, species))
for cid in sorted(card_faces):
    lines.add("  %s: 'art/cards/%s.jpg'," % (cid, cid))
ca = "// AUTO-GENERATED: card face art. Species cards borrow their monster's painting;\n"
ca += "// dedicated card faces win. \nexport const CARD_ART: Record<string, string> = {\n" + "\n".join(sorted(lines)) + "\n};\n"
open(os.path.join(WEB, 'src', 'art', 'cardArt.ts'), 'w', encoding='utf8').write(ca)

# --- UNIQUE_ART into gearArt.ts ---
uniq = {f[:-4]: 'art/uniques/%s.png' % f[:-4] for f in os.listdir(os.path.join(ART, 'uniques')) if f.endswith('.png')}
ga = open(os.path.join(WEB, 'src', 'art', 'gearArt.ts'), encoding='utf8').read()
ga = re.sub(r"export const UNIQUE_ART: Record<string, string> = \{[^}]*\};",
            "export const UNIQUE_ART: Record<string, string> = " + json.dumps(uniq, indent=1) + ";", ga)
open(os.path.join(WEB, 'src', 'art', 'gearArt.ts'), 'w', encoding='utf8').write(ga)
print('manifests regenerated: %d monsters, %d card faces, %d uniques' % (len(monster_png), len(card_faces), len(uniq)))
