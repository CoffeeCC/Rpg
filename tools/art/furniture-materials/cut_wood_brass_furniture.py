"""
Cut painted albedo for pile_tray, lantern_cradle and brass_strap from the two
existing seamless source materials (console_timber.png / console_brass.png),
following the same recipe as the console deck (ART_QC_FURNITURE_2026-07-26.md,
ENGINE_PLAN.md §23):

  1. Load the CURRENTLY SHIPPED PNG at web/public/art/materials/board/<name>.png.
  2. Take its alpha channel verbatim -- this is the silhouette and must not move.
  3. Tile the seamless 1024x1024 source material (wrap-indexed, so it works for
     any crop offset and any target size up to and beyond 1024px) to cover the
     target's exact pixel dimensions, at a distinct offset per output so the
     wood/brass pieces are not all identical crops of the same source region.
  4. Recombine: new RGB from the tiled source, alpha from the original file.
  5. Verify the alpha channel is byte-identical to the original before saving
     anything, and report tonal range (2nd-98th percentile luminance, restricted
     to opaque pixels) before/after plus mean RGB, mirroring the QC doc's table.

Nothing here touches normal/material maps or any other shape. Sources are never
regenerated -- console_timber.png / console_brass.png / console_body*.png are
read-only inputs.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
BOARD = ROOT.parent.parent.parent / "web" / "public" / "art" / "materials" / "board"

TIMBER = ROOT / "console_timber.png"
BRASS_MAT = ROOT / "console_brass.png"

# (target file, source material, crop offset (x, y) into the 1024x1024 source)
JOBS = [
    ("pile_tray.png", TIMBER, (0, 0)),
    ("pile_tray_brass.png", BRASS_MAT, (0, 0)),
    ("lantern_cradle.png", TIMBER, (350, 120)),
    ("lantern_cradle_brass.png", BRASS_MAT, (350, 120)),
    ("brass_strap.png", BRASS_MAT, (650, 500)),
]


def srgb_luminance(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def tiled_crop(source: np.ndarray, width: int, height: int, offset: tuple[int, int]) -> np.ndarray:
    """Wrap-tile `source` (H0,W0,3) to an output of (height, width, 3) starting at offset."""
    h0, w0 = source.shape[:2]
    ox, oy = offset
    ys = (np.arange(height) + oy) % h0
    xs = (np.arange(width) + ox) % w0
    return source[np.ix_(ys, xs)]


def metrics(rgb: np.ndarray, alpha: np.ndarray) -> dict:
    opaque = alpha > 0
    if not np.any(opaque):
        return {"mean_rgb": [0.0, 0.0, 0.0], "tonal_range_pct": 0.0}
    lum = srgb_luminance(rgb)[opaque]
    p2, p98 = np.percentile(lum, [2, 98])
    mean_rgb = rgb[opaque].mean(axis=0)
    return {
        "mean_rgb": [round(float(x), 1) for x in mean_rgb],
        "tonal_range_pct": round(float((p98 - p2) / 255.0 * 100.0), 2),
    }


def main() -> None:
    results = []
    for name, source_path, offset in JOBS:
        target_path = BOARD / name
        orig = Image.open(target_path).convert("RGBA")
        orig_arr = np.array(orig)
        orig_rgb = orig_arr[..., :3].astype(np.float64)
        orig_alpha = orig_arr[..., 3]

        before = metrics(orig_rgb, orig_alpha)

        src_img = Image.open(source_path).convert("RGB")
        src_arr = np.array(src_img).astype(np.uint8)

        h, w = orig_arr.shape[0], orig_arr.shape[1]
        new_rgb = tiled_crop(src_arr, w, h, offset)

        # Recombine: new albedo, ORIGINAL alpha, unchanged.
        out_arr = np.zeros((h, w, 4), dtype=np.uint8)
        out_arr[..., :3] = new_rgb
        out_arr[..., 3] = orig_alpha

        # Hard verification: alpha must be byte-identical to what shipped.
        assert np.array_equal(out_arr[..., 3], orig_alpha), f"alpha mismatch for {name}"

        after = metrics(out_arr[..., :3].astype(np.float64), out_arr[..., 3])

        out_path = ROOT / name
        Image.fromarray(out_arr, mode="RGBA").save(out_path, format="PNG", optimize=True)

        results.append(
            {
                "file": name,
                "size": [w, h],
                "source": source_path.name,
                "offset": list(offset),
                "alpha_identical_to_shipped": True,
                "before": before,
                "after": after,
            }
        )
        print(f"{name}: size={w}x{h} source={source_path.name} offset={offset}")
        print(f"  before: {before}")
        print(f"  after:  {after}")
        print(f"  alpha byte-identical to shipped: True")

    (ROOT / "_cut_report.json").write_text(json.dumps(results, indent=2))
    print("\nWrote _cut_report.json")


if __name__ == "__main__":
    main()
