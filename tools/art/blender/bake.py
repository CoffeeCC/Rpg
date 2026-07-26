# =========================================================================
# BLENDER BAKE — the board's furniture, rendered rather than painted.
#
# Run headless:
#     blender --background --python tools/art/blender/bake.py -- --out web/art-staging/materials/board
#
# WHY THIS EXISTS, when the rest of the art pipeline is Grok plus derivation:
#
# `docs/ENGINE_PLAN.md` §7 and §15 split the art by what each source is
# actually good at. Grok paints living, characterful things — 92 monsters,
# where the painterly style IS the value. It is bad at exactly what board
# FURNITURE needs: twenty objects that must look like one craftsman made them,
# with clean bevels and correct geometric correspondence. Diffusion drifts.
#
# The furniture is a slab, a cube, a cylinder and a chamfer. For that, 3D is
# the EASY path, not the ambitious one, and it buys three things derivation
# cannot:
#
#   REAL NORMALS   baked from actual geometry, not inferred from luminance.
#                  A bevel is a sharp geometric feature and luminance->Sobel
#                  handles it poorly — see ENGINE_PLAN §9.1.
#   REAL AO        from actual occlusion, so corners darken because they ARE
#                  corners.
#   CONSISTENCY    one material, one rig, twenty objects that unmistakably
#                  belong together. This is the thing diffusion cannot give.
#
# And flat albedo is free here: you simply do not put a light in the scene.
# The de-shading fight that dominates the Grok brief does not exist.
#
# WHAT IT PRODUCES, and why renders rather than texture bakes:
#
# The engine draws QUADS (`lantern/scene/sprite.ts`), so what it wants is a
# sprite with a matching normal and AO — not a UV-unwrapped material. So each
# object is RENDERED orthographically through the game's own camera angle, and
# three passes come out pixel-aligned by construction:
#
#     <name>.png            albedo, flat, transparent background
#     <name>_normal.png     tangent-ish normal, remapped to 0..1
#     <name>_ao.png         ambient occlusion
#
# Pixel-aligned by construction is the whole point. §7 rejected asking a
# diffusion model for a companion map because the channels would not register;
# here they cannot fail to, because they are the same render.
# =========================================================================

import argparse
import math
import os
import sys

import bpy  # type: ignore  # provided by Blender's bundled interpreter

# The camera angle the game actually uses. Keep in sync with
# `web/src/lantern/scene/camera.ts` DEFAULT_TILT (55 degrees from straight
# down). A sprite baked at one angle and drawn at another has its shading
# lit from the wrong place, and it is the kind of wrong that looks like a
# lighting bug rather than an art bug.
DEFAULT_TILT_DEG = 55.0

# Render at 4x the on-screen size and let the engine mip it down. Cheap
# insurance: re-rendering because a sprite is soft at a high zoom costs more
# than the disk.
SUPERSAMPLE = 4


def clear_scene():
    """Blender starts with a cube, a camera and a light. Remove all of it."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)


def use_nodes(mat):
    """
    Enable the node tree, without tripping the 5.2 deprecation warning.

    `Material.use_nodes` is slated for removal in Blender 6.0, where node
    trees are always present. Setting it only when it exists AND is false
    keeps this working on both sides of that change instead of warning on
    every material today and breaking outright later.
    """
    if getattr(mat, "use_nodes", True) is False:
        mat.use_nodes = True
    if mat.node_tree is None:  # pragma: no cover - 6.0 path
        mat.use_nodes = True
    return mat.node_tree


def flat_material(name, rgb):
    """
    An EMISSION shader, not a diffuse one.

    This is what makes the albedo pass flat. An emission shader outputs its
    colour regardless of lighting, so the render is the surface colour and
    nothing else — no key light, no falloff, no baked shadow. Exactly what
    ENGINE_PLAN §7 asks the Grok briefs for and cannot reliably get.
    """
    mat = bpy.data.materials.new(name)
    nt = use_nodes(mat)
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*rgb, 1.0)
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def ao_material(name, distance=0.35, samples=16):
    """
    Ambient occlusion, rendered as emission so it comes out as a plain image.

    Using the AO shader node rather than a render pass on purpose: the pass
    differs between EEVEE and Cycles and across Blender versions, while this
    node behaves the same everywhere and takes a distance that can be tuned
    per object. `distance` is in Blender units and should be a fraction of the
    object's size — too large and every surface reads as occluded.
    """
    mat = bpy.data.materials.new(name)
    nt = use_nodes(mat)
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = samples
    ao.inputs["Distance"].default_value = distance
    nt.links.new(ao.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def normal_material(name, space="WORLD"):
    """
    Surface normal as colour, remapped from [-1,1] to [0,1].

    THE SPACE IS NOT A DETAIL, and getting it wrong produces a normal map
    that looks plausible and lights wrongly. The first version baked
    everything in CAMERA space and every map came out green-dominant, because
    a plinth seen at 55 degrees has its top face pointing mostly "up the
    screen" rather than at the viewer.

    What the engine expects depends on how the sprite is DRAWN, because
    `lighting.ts` re-orients the sampled normal per sprite kind:

      LYING decal (plinth, rim, board surface) — the shader uses the sampled
        normal as-is against board space, so +Z means "up out of the board".
        Bake WORLD space. A flat top face becomes (128,128,255).

      UPRIGHT billboard (a figure) — the shader maps the sampled +Z to
        "toward the camera", so bake CAMERA space, where a face pointed at
        the viewer becomes (128,128,255).

    `vector_type = NORMAL` rather than VECTOR, because a normal transforms by
    the inverse transpose. With uniform scale the two agree; with the
    non-uniform scaling these shapes use, VECTOR skews the result.
    """
    mat = bpy.data.materials.new(name)
    nt = use_nodes(mat)
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    xform = nt.nodes.new("ShaderNodeVectorTransform")
    xform.vector_type = "NORMAL"
    xform.convert_from = "WORLD"
    xform.convert_to = space
    mul = nt.nodes.new("ShaderNodeVectorMath")
    mul.operation = "MULTIPLY_ADD"
    mul.inputs[1].default_value = (0.5, 0.5, 0.5)
    mul.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs["Normal"], xform.inputs["Vector"])
    nt.links.new(xform.outputs["Vector"], mul.inputs[0])
    nt.links.new(mul.outputs["Vector"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def setup_camera(size, tilt_deg=DEFAULT_TILT_DEG):
    """
    Orthographic, at the game's tilt, looking at the origin.

    Orthographic and not perspective for the same reason `camera.ts` is: the
    engine's projection has no vanishing point, so a sprite baked under
    perspective would disagree with the grid it sits on — its verticals would
    converge while the board's do not.
    """
    cam_data = bpy.data.cameras.new("bake_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = size
    cam = bpy.data.objects.new("bake_cam", cam_data)
    bpy.context.collection.objects.link(cam)

    tilt = math.radians(tilt_deg)
    dist = size * 4
    # Straight down is -Z. Tilt rotates toward -Y so the camera looks down and
    # forward, matching a player leaning over the near edge of the table.
    cam.location = (0.0, -dist * math.sin(tilt), dist * math.cos(tilt))
    cam.rotation_euler = (tilt, 0.0, 0.0)
    bpy.context.scene.camera = cam
    return cam


def set_pass_encoding(is_colour):
    """
    sRGB for colour, RAW for data. This is not cosmetic.

    Blender's "Standard" view transform still applies the sRGB encode on the
    way out. For albedo that is correct — the engine uploads it as
    SRGB8_ALPHA8 and the hardware decodes it back to linear. For a NORMAL or
    an AO map it is a corruption: those channels are numbers, not colours.

    Measured: with Standard on every pass, all three normal maps came out with
    a red mean of 185. sRGB-encoding 0.5 gives 0.7258, which is 185/255 —
    exactly. So a normal of x=0 was being stored as x=+0.45, and every surface
    would have lit as though tilted to the right.

    The tell was that 185 appeared identically on three unrelated shapes. A
    real geometric bias would differ between a cylinder and a slab.
    """
    vs = bpy.context.scene.view_settings
    vs.view_transform = "Standard" if is_colour else "Raw"
    vs.look = "None"


def setup_render(px):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.render.resolution_x = px
    scene.render.resolution_y = px
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    # Per-pass; see `set_pass_encoding`. Colour is encoded, data is not.
    scene.view_settings.look = "None"


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def assign(objs, mat):
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)


def bake_object(name, build, out_dir, size, px, ao_distance=0.35, colour=(0.55, 0.42, 0.28), space="WORLD"):
    """
    Build one object and render its three passes.

    `build` is a callable returning the list of mesh objects. Geometry is
    rebuilt per object rather than reused so a failed bake cannot contaminate
    the next one — these runs are unattended.
    """
    clear_scene()
    objs = build()
    setup_camera(size)
    setup_render(px)

    os.makedirs(out_dir, exist_ok=True)
    for suffix, is_colour, mat in (
        ("", True, flat_material(f"{name}_albedo", colour)),
        ("_normal", False, normal_material(f"{name}_normal", space)),
        ("_ao", False, ao_material(f"{name}_ao", distance=ao_distance)),
    ):
        assign(objs, mat)
        set_pass_encoding(is_colour)
        render_to(os.path.join(out_dir, f"{name}{suffix}.png"))
    print(f"[bake] {name}: 3 passes -> {out_dir}")


# -------------------------------------------------------------------------
# The furniture
# -------------------------------------------------------------------------


def bevelled(obj, width, segments=3):
    """A chamfer is what separates a rendered box from a made object."""
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return obj


def build_plinth():
    """
    The base a piece stands in. §15: one moulded base, every piece.

    A shallow cylinder with a chamfered top edge and a slot across it — the
    slot is what says "a figure slides in here" rather than "this is a coin",
    and it is the single detail that makes the base read as part of a game
    rather than as a disc.
    """
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=0.12, vertices=48, location=(0, 0, 0.06))
    base = bpy.context.object
    bevelled(base, 0.02)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.13))
    slot = bpy.context.object
    slot.scale = (0.62, 0.035, 0.06)
    boolean = base.modifiers.new(name="Slot", type="BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.object = slot
    slot.hide_render = True
    return [base]


def build_wall_block():
    """A wall as a piece (§12.1): a cube with a chamfer, sitting on the board."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.45))
    block = bpy.context.object
    block.scale = (0.5, 0.5, 0.45)
    bpy.ops.object.transform_apply(scale=True)
    bevelled(block, 0.035)
    return [block]


def build_board_rim():
    """
    A corner of the board's edge: the slab, its bevel, and the inset lip the
    play surface sits in. §13 made this visible every frame.
    """
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -0.1))
    slab = bpy.context.object
    slab.scale = (2.0, 2.0, 0.1)
    bpy.ops.object.transform_apply(scale=True)
    bevelled(slab, 0.03)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, -0.06))
    inset = bpy.context.object
    inset.scale = (1.78, 1.78, 0.1)
    cut = slab.modifiers.new(name="Inset", type="BOOLEAN")
    cut.operation = "DIFFERENCE"
    cut.object = inset
    inset.hide_render = True
    return [slab]


# name -> (builder, ortho size, AO distance, flat colour, normal space)
#
# Everything here is a LYING decal, so everything bakes in world space. A
# billboard piece would use "CAMERA"; there are none yet, because figures come
# from Grok plus the EDT relief (ENGINE_PLAN §15) rather than from Blender.
SHAPES = {
    "plinth": (build_plinth, 1.2, 0.18, (0.42, 0.34, 0.30), "WORLD"),
    "wall_block": (build_wall_block, 1.6, 0.30, (0.50, 0.47, 0.46), "WORLD"),
    "board_rim": (build_board_rim, 4.6, 0.40, (0.36, 0.24, 0.14), "WORLD"),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(description="Bake board furniture to albedo/normal/AO sprites.")
    ap.add_argument("--out", default="web/art-staging/materials/board")
    ap.add_argument("--px", type=int, default=256, help="on-screen size; the render is this x SUPERSAMPLE")
    ap.add_argument("--only", default=None, help="bake a single shape by name")
    args = ap.parse_args(argv)

    # ABSOLUTE, always. Blender resolves a bare relative render path against
    # the DRIVE ROOT rather than the working directory — the first run of this
    # script wrote a perfectly good plinth to C:\webrt-staging\ and reported
    # success, which is the worst kind of wrong.
    out_dir = os.path.abspath(args.out)
    args.out = out_dir

    names = [args.only] if args.only else list(SHAPES)
    for name in names:
        if name not in SHAPES:
            raise SystemExit(f"unknown shape {name!r}; have {', '.join(SHAPES)}")
        build, size, ao_dist, colour, space = SHAPES[name]
        bake_object(name, build, args.out, size, args.px * SUPERSAMPLE, ao_dist, colour, space)


if __name__ == "__main__":
    main()
