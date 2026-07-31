"""Procedural seamless console brass albedo — smooth continuous metal first."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SIZE = 1024
OUT = Path(__file__).resolve().parent / "console_brass.png"
RNG = np.random.default_rng(20260726)

# Target centre colour (sRGB)
BASE = np.array([191.0, 168.0, 111.0], dtype=np.float64)
# Gentle tarnish film hues (still warm metal, not dirt)
TARNISH_A = np.array([150.0, 130.0, 82.0], dtype=np.float64)   # darker gold
TARNISH_B = np.array([140.0, 124.0, 76.0], dtype=np.float64)   # warm olive-brown
BURNISH = np.array([212.0, 190.0, 130.0], dtype=np.float64)    # brighter burnished brass
LUM_FLOOR = 92.0  # sRGB luminance floor — nothing near-black / dirt


def wrap_gaussian(arr: np.ndarray, sigma: float | tuple[float, ...]) -> np.ndarray:
    """Gaussian blur with wrap (seamless both axes)."""
    if isinstance(sigma, (int, float)) and sigma <= 0:
        return arr
    return ndimage.gaussian_filter(arr, sigma=sigma, mode="wrap")


def fbm(shape: tuple[int, int], octaves: int, base_scale: float, seed: int) -> np.ndarray:
    """Seamless multi-octave value noise via FFT-filtered white noise."""
    h, w = shape
    out = np.zeros((h, w), dtype=np.float64)
    amp = 1.0
    total_amp = 0.0
    scale = base_scale
    for o in range(octaves):
        rng = np.random.default_rng(seed + o * 9973)
        white = rng.standard_normal((h, w))
        # Low-pass via Gaussian in spatial domain (wrap) approximates band-limited noise
        # sigma related to feature size: larger sigma = larger features
        sigma = max(0.4, scale)
        band = wrap_gaussian(white, sigma)
        # High-pass relative to next octave for more interesting structure
        band = band - wrap_gaussian(band, sigma * 2.2)
        band = (band - band.mean()) / (band.std() + 1e-8)
        out += amp * band
        total_amp += amp
        amp *= 0.52
        scale *= 0.5
    out /= total_amp
    out = (out - out.mean()) / (out.std() + 1e-8)
    return out


def soft_blobs(shape: tuple[int, int], n: int, sigma: float, seed: int) -> np.ndarray:
    """Sparse soft positive blobs, seamless."""
    h, w = shape
    rng = np.random.default_rng(seed)
    field = np.zeros((h, w), dtype=np.float64)
    ys = rng.integers(0, h, size=n)
    xs = rng.integers(0, w, size=n)
    strengths = rng.uniform(0.55, 1.0, size=n)
    for y, x, s in zip(ys, xs, strengths):
        field[y, x] += s
    field = wrap_gaussian(field, sigma)
    field = field / (field.max() + 1e-8)
    return field


def fine_tarnish_mask(shape: tuple[int, int], seed: int) -> np.ndarray:
    """
    Sparse 2–6 px tarnish flecks / thin film mottling.
    Continuous metal stays dominant (~70%+ clean). NO large blotches.
    """
    # Only fine scales — deliberately avoid large-structure FBM
    n1 = fbm(shape, octaves=3, base_scale=1.6, seed=seed)
    n2 = fbm(shape, octaves=2, base_scale=2.8, seed=seed + 11)
    raw = 0.7 * n1 + 0.3 * n2
    # Sparse: only top ~22% carries film, falloff keeps most near zero
    thr = np.quantile(raw, 0.78)
    m = np.clip((raw - thr) / (raw.max() - thr + 1e-8), 0.0, 1.0)
    # ~2–5 px soft flecks
    m = wrap_gaussian(m, 0.85)
    m = np.clip(m * 1.55, 0.0, 1.0)
    m = m ** 1.25
    return m


def horizontal_scratches(shape: tuple[int, int], seed: int) -> np.ndarray:
    """
    Long fine horizontal hand-polish micro-scratches.
    Returns a signed field: negative = groove darkening, small positive = ridge lift.
    Features are 1–2 px tall, long in X, very low amplitude.
    """
    h, w = shape
    rng = np.random.default_rng(seed)
    field = np.zeros((h, w), dtype=np.float64)

    # Dense very fine hairlines across the whole surface
    n_lines = 720
    for _ in range(n_lines):
        y0 = int(rng.integers(0, h))
        amp = float(rng.uniform(0.0, 1.0))
        phase = float(rng.uniform(0, 2 * math.pi))
        freq = float(rng.uniform(0.003, 0.016))
        strength = float(rng.uniform(0.35, 1.2))
        length = int(rng.integers(w // 2, w + 1))
        x0 = int(rng.integers(0, w))
        gap_noise = rng.random(length)
        for i in range(length):
            x = (x0 + i) % w
            y = int(round(y0 + amp * math.sin(phase + i * freq))) % h
            if gap_noise[i] < 0.10:
                continue
            field[y, x] -= strength
            if rng.random() < 0.40:
                field[(y - 1) % h, x] += strength * 0.22
                field[(y + 1) % h, x] += strength * 0.14

    # Slightly longer tool marks (still 1–2 px tall)
    for _ in range(90):
        y0 = int(rng.integers(0, h))
        strength = float(rng.uniform(0.9, 1.8))
        length = int(rng.integers(int(w * 0.6), w + 1))
        x0 = int(rng.integers(0, w))
        drift = float(rng.uniform(-0.35, 0.35))
        for i in range(length):
            x = (x0 + i) % w
            y = int(round(y0 + drift * i / max(length, 1))) % h
            field[y, x] -= strength

    # Soften just enough that scratches read as metal, not hard 1px alias
    field = wrap_gaussian(field, 0.50)
    field = (field - field.mean()) / (field.std() + 1e-8)
    return field


def alloy_micrograin(shape: tuple[int, int], seed: int) -> np.ndarray:
    """Very fine continuous alloy grain — subtle, not grit."""
    g = fbm(shape, octaves=5, base_scale=0.85, seed=seed)
    g = wrap_gaussian(g, 0.45)
    g = (g - g.mean()) / (g.std() + 1e-8)
    return g


def srgb_luminance(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def enforce_lum_floor(rgb: np.ndarray, floor: float = LUM_FLOOR) -> np.ndarray:
    """Hard floor: nothing below `floor` luminance. Iterative warm lift."""
    out = rgb.copy()
    for _ in range(4):
        lum = srgb_luminance(out)
        need = floor - lum
        mask = need > 0.05
        if not np.any(mask):
            break
        out[mask, 0] += need[mask] * 1.08
        out[mask, 1] += need[mask] * 0.96
        out[mask, 2] += need[mask] * 0.72
    # Final absolute safety clamp on luminance via scale-up
    lum = srgb_luminance(out)
    scale = np.ones_like(lum)
    bad = lum < floor
    scale[bad] = floor / np.maximum(lum[bad], 1e-3)
    out = out * scale[..., None]
    return out


def main() -> None:
    shape = (SIZE, SIZE)

    # --- Continuous metal base ---
    grain = alloy_micrograin(shape, seed=101)
    # Broad soft tone variation (alloy inhomogeneity / soft burnish prep) — very low amp
    broad = fbm(shape, octaves=3, base_scale=28.0, seed=202)
    broad = wrap_gaussian(broad, 18.0)
    broad = (broad - broad.mean()) / (broad.std() + 1e-8)

    # Horizontal polish scratches
    scratches = horizontal_scratches(shape, seed=303)

    # Soft burnished palm/thumb patches — brighter, low contrast, blended
    burnish_mask = soft_blobs(shape, n=9, sigma=85.0, seed=404)
    burnish_mask = wrap_gaussian(burnish_mask, 38.0)
    burnish_mask = burnish_mask / (burnish_mask.max() + 1e-8)
    # Soft edges dissolve into metal — no hard spots
    burnish_mask = np.clip(burnish_mask * 1.15, 0.0, 1.0) ** 0.75

    # Fine translucent tarnish film (sparse)
    tarnish = fine_tarnish_mask(shape, seed=505)
    # Second layer of even finer flecks, rarer
    fleck = fbm(shape, octaves=3, base_scale=1.4, seed=606)
    fleck_m = np.clip((fleck - np.quantile(fleck, 0.93)) / 0.5, 0.0, 1.0)
    fleck_m = wrap_gaussian(fleck_m, 0.7) ** 1.2

    # Compose multipliers / additives in linear-ish float RGB
    rgb = np.zeros((SIZE, SIZE, 3), dtype=np.float64)
    rgb[...] = BASE

    # Micrograin: continuous alloy crystal — visible but not grit
    rgb += grain[..., None] * np.array([16.0, 14.0, 10.5])

    # Broad soft metal tone drift — KEEP LOW so no large dark islands
    rgb += broad[..., None] * np.array([10.0, 8.5, 6.0])

    # Horizontal brush-band variation (anisotropic metal polish, mid frequency)
    # Creates soft striations that read as brushed brass without grit
    brush = fbm(shape, octaves=3, base_scale=3.5, seed=909)
    # Stretch horizontally: blur more in X than Y via successive 1D-ish wrap blurs
    brush = wrap_gaussian(brush, (0.6, 8.0))  # (y, x) sigma — long horizontal
    brush = (brush - brush.mean()) / (brush.std() + 1e-8)
    rgb += brush[..., None] * np.array([20.0, 17.0, 12.5])

    # Scratches: groove darkens (geometry), ridge slightly brightens
    groove = np.clip(-scratches, 0.0, None)
    ridge = np.clip(scratches, 0.0, None)
    groove = groove ** 0.72
    rgb -= groove[..., None] * np.array([44.0, 37.0, 28.0])
    rgb += ridge[..., None] * np.array([17.0, 15.0, 11.0])

    # Burnish: soft palm-scale brighter patches, low-contrast blend
    b = burnish_mask[..., None]
    rgb = rgb * (1.0 - b * 0.68) + BURNISH * (b * 0.68)
    rgb += burnish_mask[..., None] * np.array([9.0, 7.5, 5.0])

    # Tarnish film: translucent, FINE only, warm olive-brown / darker gold
    t_alpha = np.clip(tarnish * 0.55 + fleck_m * 0.22, 0.0, 0.60)
    mix = (fbm(shape, octaves=2, base_scale=3.5, seed=707) + 1.5) / 3.0
    mix = np.clip(mix, 0.0, 1.0)
    tarnish_col = TARNISH_A * (1.0 - mix[..., None]) + TARNISH_B * mix[..., None]
    ta = t_alpha[..., None]
    rgb = rgb * (1.0 - ta * 0.88) + tarnish_col * (ta * 0.88)

    # Extremely rare verdigris fleck (essentially none — a few dozen pixels max)
    vg = fbm(shape, octaves=2, base_scale=1.0, seed=808)
    vg_m = (vg > np.quantile(vg, 0.9995)).astype(np.float64)
    vg_m = wrap_gaussian(vg_m, 0.5)
    # soft mute teal-green on top of metal, tiny
    rgb = rgb * (1.0 - vg_m[..., None] * 0.25) + np.array([110.0, 130.0, 95.0]) * (
        vg_m[..., None] * 0.25
    )

    # No global gradient / vignette — already avoided by wrap noise
    # Soft overall re-centre mean toward BASE so it stays warm-bright
    mean = rgb.mean(axis=(0, 1))
    rgb += BASE - mean

    # Soft-cap extreme highlights (no specular hotspots under flat ambient)
    lum = srgb_luminance(rgb)
    hi = 228.0
    over = lum > hi
    if np.any(over):
        # Compress only the excess luminance, keep hue
        factor = np.ones_like(lum)
        factor[over] = hi / lum[over]
        # Gentle: don't fully crush, leave a little headroom
        factor = 0.55 + 0.45 * factor
        rgb = rgb * factor[..., None]

    # Clamp and enforce luminance floor
    rgb = np.clip(rgb, 0.0, 255.0)
    rgb = enforce_lum_floor(rgb, LUM_FLOOR)
    rgb = np.clip(rgb, 0.0, 255.0)

    # Gentle re-centre if floor lift drifted mean too much
    mean = rgb.mean(axis=(0, 1))
    rgb += (BASE - mean) * 0.40
    rgb = np.clip(rgb, 0.0, 255.0)
    rgb = enforce_lum_floor(rgb, LUM_FLOOR)
    rgb = np.clip(rgb, 0.0, 255.0)

    # Final soft highlight compress + hard floor (order matters)
    lum = srgb_luminance(rgb)
    hi = 222.0
    over = lum > hi
    if np.any(over):
        t = np.clip((lum - hi) / (lum.max() - hi + 1e-8), 0.0, 1.0)
        # ease excess toward hi without hard clip
        new_lum = hi + (lum - hi) * (1.0 - 0.75 * t)
        scale = np.ones_like(lum)
        scale[over] = new_lum[over] / np.maximum(lum[over], 1e-3)
        rgb = rgb * scale[..., None]
    rgb = np.clip(rgb, 0.0, 255.0)
    rgb = enforce_lum_floor(rgb, 90.0)
    rgb = np.clip(rgb, 0.0, 255.0)

    # Metrics
    lum = srgb_luminance(rgb)
    p2, p98 = np.percentile(lum, [2, 98])
    tonal = (p98 - p2) / 255.0 * 100.0
    q = [
        lum[: SIZE // 2, : SIZE // 2].mean(),
        lum[: SIZE // 2, SIZE // 2 :].mean(),
        lum[SIZE // 2 :, : SIZE // 2].mean(),
        lum[SIZE // 2 :, SIZE // 2 :].mean(),
    ]
    q_spread = (max(q) - min(q)) / 255.0 * 100.0
    below = (lum < LUM_FLOOR).mean() * 100.0
    cleanish = (t_alpha[..., 0] < 0.12).mean() * 100.0

    print(f"mean RGB: {rgb.mean(axis=(0,1)).round(1)}")
    print(f"lum p2={p2:.1f} p50={np.median(lum):.1f} p98={p98:.1f}")
    print(f"tonal range: {tonal:.1f}%  (target 45-65)")
    print(f"quadrant means: {[round(x,1) for x in q]}  spread={q_spread:.2f}%")
    print(f"pct below L={LUM_FLOOR}: {below:.3f}%")
    print(f"pct mostly-clean metal (tarnish alpha <0.12): {cleanish:.1f}%")
    print(f"min lum: {lum.min():.1f}  max lum: {lum.max():.1f}")

    img = Image.fromarray(rgb.astype(np.uint8), mode="RGB")
    img.save(OUT, format="PNG", optimize=True)
    print(f"wrote {OUT}")
    print(f"size={img.size} mode={img.mode}")


if __name__ == "__main__":
    main()
