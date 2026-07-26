# =========================================================================
# BLENDER BAKE — the board's furniture, rendered rather than painted.
#
# Run headless:
#     npm run art:board                       # every shape, 256px long axis
#     blender --background --python tools/art/blender/bake.py -- --px 96 --only plinth
#
# On Windows the installer does not put Blender on PATH, so `npm run art:board`
# will not find it. The literal invocation:
#
#     & "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" `
#         --background --python tools\art\blender\bake.py -- --px 96
#
# THEN LOOK AT THE RESULT. `npm run art:sheet` builds a labelled contact sheet
# of every bake and prints the numbers that catch the bugs listed below.
# Rendering without an error is not the same as rendering the right thing —
# four of the six gotchas here produced a perfectly clean run.
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
# object is RENDERED orthographically and three passes come out pixel-aligned
# by construction:
#
#     <name>.png            albedo, flat, transparent background
#     <name>_normal.png     board-space normal, remapped to 0..1
#     <name>_ao.png         ambient occlusion
#
# Pixel-aligned by construction is the whole point. §7 rejected asking a
# diffusion model for a companion map because the channels would not register;
# here they cannot fail to, because they are the same render.
#
# =========================================================================
# SIX THINGS THAT HAVE ALREADY GONE WRONG. Read before editing.
# =========================================================================
#
# 1. OUTPUT PATHS MUST BE ABSOLUTE. Blender resolves a bare relative render
#    path against the DRIVE ROOT, not the working directory. The first run of
#    this script wrote a perfectly good plinth to `C:\webrt-staging\` and
#    reported success, which is the worst kind of wrong. `main()` absolutises.
#
# 2. COLOUR ENCODING IS PER PASS. Blender's "Standard" view transform applies
#    the sRGB encode on the way out. Correct for albedo; a CORRUPTION for
#    normal and AO, which are numbers rather than colours. Measured: with
#    Standard on every pass, all three normal maps had a red mean of exactly
#    185 — and sRGB(0.5) = 0.7258 = 185/255, exactly. The tell was that 185
#    appeared identically on three unrelated shapes; a real geometric bias
#    would differ between a cylinder and a slab. `set_pass_encoding()`.
#
# 3. THE VIEW IS NOT THE GAME'S CAMERA ANGLE — for anything but a billboard.
#    This one shipped wrong and cost a re-bake of every shape.
#
#    `buildVertexData` (sprite.ts) already applies the projection: a LYING
#    quad is squashed by cos(tilt) and a STANDING quad by sin(tilt), at draw
#    time. So a sprite baked through a 55-degree camera gets foreshortened
#    TWICE — a plinth authored as an ellipse of aspect cos(55°)=0.57 draws as
#    an ellipse of 0.33. The engine's own procedural plinth
#    (`piece.ts baseDiscPixels`) is a full CIRCLE, which is the ground truth
#    for what these textures replace.
#
#      lying decal  -> PLAN view, camera straight down. The engine squashes.
#      vertical face-> ELEVATION view, camera level. The engine squashes.
#      billboard    -> the game's tilt, because a billboard quad turns to face
#                      the camera and its texture IS the camera's view of it.
#
# 4. THE NORMAL IS BOARD SPACE WITH Y POINTING DOWN THE IMAGE, and neither
#    Blender's world space nor its camera space is that. Deriving it from the
#    shader rather than guessing (see `normal_material`) is the only way this
#    is checkable. Two independent statements pin it down:
#      - `passes/lighting.ts`: lying quads use `worldN = N` and vertical faces
#        use `worldN = vec3(N.x, N.z, N.y)`.
#      - `piece.ts baseDiscNormalPixels`: *"texture +v (DOWN the image) is
#        board +y, toward the camera"*.
#    In Blender we place board +y along world -Y (the camera side), so a
#    plan-view render already has board +y at the BOTTOM of the image — but
#    the G channel then needs its sign flipped, which is exactly the class of
#    bug that "looks plausible and lights wrongly".
#    `vector_type = "NORMAL"`, never VECTOR: a normal transforms by the
#    inverse transpose, and these shapes carry non-uniform scale.
#
# 5. THE DENOISER IS OFF, DELIBERATELY. Cycles enables OIDN by default. On a
#    normal map it is a blur applied to data, and on AO it hides exactly the
#    contact darkening the pass exists to capture. Noise is dealt with by
#    sample count, per pass — see `PASS_SAMPLES`.
#
# 6. A BEVEL AFTER A BOOLEAN LOSES THE WHOLE SILHOUETTE'S CHAMFER, silently.
#    The obvious stack — cut the slot, then chamfer everything so the cut gets
#    a lip too — is wrong. Bevel's `use_clamp_overlap` limits an edge's width
#    by its neighbours, and a Boolean leaves short slivers all over the face
#    it cut; the clamp then propagates across the shared face and flattens
#    edges NOWHERE NEAR THE CUT.
#
#    Measured on a wall block, mean G over the top 8 rows of the normal map,
#    where 128 is flat and a chamfer tipping away reads low:
#
#        no cuts, bevel                       58    <- the chamfer we want
#        cut 3 chips, then bevel             129    <- gone. Not weaker: gone.
#        cut ONE groove nowhere near the
#          edge, then bevel                  126    <- still gone
#        bevel, then cut, then a narrow lip   74    <- correct
#
#    The reason it went unnoticed for a whole bake is that the AO pass still
#    showed the cuts perfectly, so the shape looked detailed — it just lit
#    like a sticker, because every edge normal was flat.
#
#    So the order is `bevelled()` on the clean primitive, then `cut()`, then
#    `lipped()` for the cut edges. Turning the clamp off instead also works
#    and is worse: it lets a groove narrower than twice the bevel width
#    chamfer itself into a V.
#
# =========================================================================
# THE BOARD'S AXES, IN BLENDER
# =========================================================================
#
#     board +x  =  world +X      (across, u increases)
#     board +y  =  world -Y      (toward the near edge of the table, i.e.
#                                 toward the viewer; v increases)
#     board +z  =  world +Z      (up out of the board)
#     one tile  =  1.0 blender unit
#
# The y flip is what makes a plan-view render come out the right way up: the
# camera sits above looking down with its own up along world +Y, so world +Y
# lands at the TOP of the image, and board y is smallest at the top — which
# is what `buildVertexData` assumes when it puts v0 at the far edge.
# =========================================================================

import argparse
import math
import os
import sys

import bpy  # type: ignore  # provided by Blender's bundled interpreter

# The camera angle the game actually uses. Keep in sync with
# `web/src/lantern/scene/camera.ts` DEFAULT_TILT (55 degrees from straight
# down). Used by BILLBOARD shapes only — see gotcha 3.
DEFAULT_TILT_DEG = 55.0

# Render at 4x the on-screen size and let the engine mip it down. Cheap
# insurance: re-rendering because a sprite is soft at a high zoom costs more
# than the disk.
SUPERSAMPLE = 4

# How much empty space around a FREE-STANDING shape (a plinth, which the
# engine sizes by its own diameter). Shapes that have to register with the
# tile grid or tile along a run use no margin at all — their frame is exactly
# the geometry the engine will stretch it over.
MARGIN = 1.04

# How the sprite is drawn, which decides the camera AND the normal basis.
VIEW_LYING = "lying"  # a decal on the board: plinth, wall top, frame, trap
VIEW_UPRIGHT = "upright"  # a vertical face: ledge, rim, wall front, riser
VIEW_BILLBOARD = "billboard"  # a figure that turns to face the camera

# Samples per pass. Albedo and normal are analytic — the only thing samples
# buy is edge anti-aliasing. AO is the one that actually integrates.
PASS_SAMPLES = {"albedo": 16, "normal": 16, "ao": 96}

# The shared palette. One family, five materials — this is the "one craftsman"
# constraint expressed as a table rather than as a hope.
WOOD_FRAME = (0.36, 0.24, 0.14)
STONE = (0.50, 0.47, 0.46)
STONE_COOL = (0.44, 0.44, 0.47)
PEWTER = (0.42, 0.34, 0.30)
IRON = (0.24, 0.23, 0.24)


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


# Texture channel <- (world axis, sign). Derived from the shader, not guessed;
# the derivation is worth keeping because it is checkable and because getting
# it wrong is invisible until a light moves.
#
# Board space is (x, y, z) = (world X, -world Y, world Z) — see the axes note
# in the header. `lighting.ts` then says, for each kind of quad, what the
# texture's tangent frame means in board space:
#
#   LYING     worldN = vec3(N.x, N.y, N.z)      so N = boardN
#             -> texture RGB = (wX, -wY, wZ)
#             Check: a flat top face has world normal +Z -> (128,128,255). And
#             the near lip of a plinth rim tips toward the viewer (world -Y),
#             giving G > 128 at the BOTTOM of the image, which is what
#             `baseDiscNormalPixels` documents.
#
#   UPRIGHT   worldN = vec3(N.x, N.z, N.y)      so N = (bX, bZ, bY)
#             -> texture RGB = (wX, wZ, -wY)
#             Check: a face looking at the near edge has world normal -Y ->
#             (128,128,255), the flat normal. Correct: for a wall's front face
#             "out of the texture" IS "toward the player".
#
#   BILLBOARD the shader's basis is (1,0,0), (0,-cos,sin), (0,sin,cos) in
#             BOARD space, which — after the y flip — is exactly Blender's
#             camera basis at the same tilt. So camera space, unswizzled, is
#             already right. That agreement is not luck; it is the same tilt
#             written twice, and it is the reason the billboard path can use
#             the stock Vector Transform node.
NORMAL_SWIZZLE = {
    VIEW_LYING: (("X", 1.0), ("Y", -1.0), ("Z", 1.0)),
    VIEW_UPRIGHT: (("X", 1.0), ("Z", 1.0), ("Y", -1.0)),
}


def normal_material(name, view):
    """
    Surface normal as colour, in the space the engine's shader will read it.

    THE SPACE IS NOT A DETAIL, and getting it wrong produces a normal map that
    looks plausible and lights wrongly. The first version baked everything in
    CAMERA space and every map came out green-dominant, because a plinth seen
    at 55 degrees has its top face pointing mostly "up the screen" rather than
    at the viewer. The second version baked WORLD space, which fixes the
    green-dominance but leaves the G channel inverted for every lying decal
    (see NORMAL_SWIZZLE) — the failure mode there is that a rim catches the
    light on the side away from the lantern, and nothing about the image looks
    wrong until it moves.
    """
    mat = bpy.data.materials.new(name)
    nt = use_nodes(mat)
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")

    mul = nt.nodes.new("ShaderNodeVectorMath")
    mul.operation = "MULTIPLY_ADD"
    mul.inputs[1].default_value = (0.5, 0.5, 0.5)
    mul.inputs[2].default_value = (0.5, 0.5, 0.5)

    if view == VIEW_BILLBOARD:
        xform = nt.nodes.new("ShaderNodeVectorTransform")
        # NORMAL, not VECTOR: a normal transforms by the inverse transpose,
        # and with the non-uniform scaling these shapes use the two disagree.
        xform.vector_type = "NORMAL"
        xform.convert_from = "WORLD"
        xform.convert_to = "CAMERA"
        nt.links.new(geo.outputs["Normal"], xform.inputs["Vector"])
        nt.links.new(xform.outputs["Vector"], mul.inputs[0])
    else:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        com = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
        for channel, (axis, sign) in zip("XYZ", NORMAL_SWIZZLE[view]):
            src = sep.outputs[axis]
            if sign < 0:
                neg = nt.nodes.new("ShaderNodeMath")
                neg.operation = "MULTIPLY"
                neg.inputs[1].default_value = -1.0
                nt.links.new(src, neg.inputs[0])
                src = neg.outputs[0]
            nt.links.new(src, com.inputs[channel])
        nt.links.new(com.outputs["Vector"], mul.inputs[0])

    nt.links.new(mul.outputs["Vector"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def setup_camera(width, height, view, centre):
    """
    Orthographic, framing exactly `width` x `height` board units at `centre`.

    Orthographic and not perspective for the same reason `camera.ts` is: the
    engine's projection has no vanishing point, so a sprite baked under
    perspective would disagree with the grid it sits on — its verticals would
    converge while the board's do not.

    `sensor_fit = HORIZONTAL` so `ortho_scale` always means the WIDTH of the
    frame whatever the aspect is; the resolution carries the aspect instead.
    Without it a wide-and-short shape (a board rim is 4 tiles by 0.34) has its
    ortho scale silently reinterpreted against the long axis.
    """
    cam_data = bpy.data.cameras.new("bake_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = width
    cam_data.sensor_fit = "HORIZONTAL"
    cx, cy, cz = centre
    dist = max(width, height) * 4.0 + 4.0
    cam_data.clip_start = 0.01
    cam_data.clip_end = dist * 4.0
    cam = bpy.data.objects.new("bake_cam", cam_data)
    bpy.context.collection.objects.link(cam)

    if view == VIEW_LYING:
        # PLAN. Straight down. Image up is world +Y, which is board y minimum
        # — the far edge — and that is where v0 belongs.
        cam.location = (cx, cy, cz + dist)
        cam.rotation_euler = (0.0, 0.0, 0.0)
    elif view == VIEW_UPRIGHT:
        # ELEVATION. Level, looking along world +Y, i.e. from the player's
        # side of the table at the face that looks back at them. Image up is
        # world +Z, so v0 is the top of the face — which is where the standing
        # quad's zTop is.
        cam.location = (cx, cy - dist, cz)
        cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    else:
        # The game's own tilt. Only a billboard wants this; see gotcha 3.
        tilt = math.radians(DEFAULT_TILT_DEG)
        cam.location = (cx, cy - dist * math.sin(tilt), cz + dist * math.cos(tilt))
        cam.rotation_euler = (tilt, 0.0, 0.0)
    bpy.context.scene.camera = cam
    return cam


def set_pass_encoding(is_colour):
    """
    sRGB for colour, RAW for data. This is not cosmetic — see gotcha 2.
    """
    vs = bpy.context.scene.view_settings
    vs.view_transform = "Standard" if is_colour else "Raw"
    vs.look = "None"


def setup_render(res_x, res_y):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    # Gotcha 5. A denoiser on a data pass is a blur applied to numbers.
    scene.cycles.use_denoising = False
    # Per-pass; see `set_pass_encoding`. Colour is encoded, data is not.
    scene.view_settings.look = "None"


def render_to(path, samples):
    bpy.context.scene.cycles.samples = samples
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def assign(objs, mat):
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)


def assign_albedo(objs, name, colour):
    """
    One flat colour per object, so a shape can be made of two materials.

    A trapdoor is an iron plate in a stone floor and it has to read as two
    things; a builder says so by setting `obj["albedo"]`. Everything else
    inherits the shape's colour, which keeps the family one family.
    """
    cache = {}
    for obj in objs:
        rgb = tuple(obj.get("albedo", colour))
        mat = cache.get(rgb)
        if mat is None:
            mat = flat_material(f"{name}_albedo_{len(cache)}", rgb)
            cache[rgb] = mat
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def bake_object(name, spec, out_dir, px):
    """
    Build one shape and render its three passes.

    Geometry is rebuilt per shape rather than reused so a failed bake cannot
    contaminate the next one — these runs are unattended.
    """
    clear_scene()
    objs = spec["build"]()

    width, height, view = spec["width"], spec["height"], spec["view"]
    centre = spec.get("centre")
    if centre is None:
        # A vertical face stands ON the board, so its frame runs 0..height.
        centre = (0.0, 0.0, height / 2.0 if view == VIEW_UPRIGHT else 0.0)
    setup_camera(width, height, view, centre)

    # `px` sizes the LONG axis; the short one follows the shape's aspect, so a
    # 4 x 0.34 rim does not get baked into a square texture that is 92% empty.
    long_px = px * SUPERSAMPLE
    if width >= height:
        res_x, res_y = long_px, max(1, round(long_px * height / width))
    else:
        res_x, res_y = max(1, round(long_px * width / height)), long_px
    setup_render(res_x, res_y)

    os.makedirs(out_dir, exist_ok=True)
    colour = spec["colour"]

    assign_albedo(objs, name, colour)
    set_pass_encoding(True)
    render_to(os.path.join(out_dir, f"{name}.png"), PASS_SAMPLES["albedo"])

    assign(objs, normal_material(f"{name}_normal", view))
    set_pass_encoding(False)
    render_to(os.path.join(out_dir, f"{name}_normal.png"), PASS_SAMPLES["normal"])

    assign(objs, ao_material(f"{name}_ao", distance=spec["ao"]))
    set_pass_encoding(False)
    render_to(os.path.join(out_dir, f"{name}_ao.png"), PASS_SAMPLES["ao"])

    print(f"[bake] {name}: {res_x}x{res_y}, {view}, 3 passes -> {out_dir}")


# -------------------------------------------------------------------------
# Geometry helpers
# -------------------------------------------------------------------------


def bevelled(obj, width, segments=3, name="Bevel"):
    """
    The family chamfer — what separates a rendered box from a made object.

    CALL THIS ON CLEAN GEOMETRY, BEFORE ANY CUT. See gotcha 6: a Bevel
    modifier that comes after a Boolean has its width clamped away to nothing
    by the short edges the Boolean leaves behind, and it takes the whole
    silhouette's chamfer with it — including edges nowhere near the cut.
    """
    mod = obj.modifiers.new(name=name, type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return obj


def lipped(obj, width=0.014, segments=2):
    """
    A small second chamfer for the edges a Boolean left. Call AFTER the cuts.

    Narrow on purpose. It is what stops a slot or a groove reading as a hole
    punched in a sheet, and it has to fit inside features that are a few
    hundredths of a tile wide — a groove chamfered by half its own width from
    both sides is a V, not a groove.
    """
    return bevelled(obj, width, segments=segments, name="Lip")


def box(sx, sy, sz, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)):
    """
    A box of the given FULL dimensions, centred on `loc`, in radians.

    THE ROTATION IS NOT DECORATION when the box is a cutter. A chip knocked
    out with an axis-aligned box is INVISIBLE in a plan-view normal map: every
    face it leaves behind is either horizontal (indistinguishable from the top
    it was cut into) or vertical (exactly edge-on, zero pixels). The damage
    shows up in AO and nowhere else, so the stone lights as though it were
    undamaged. Tilting the cutter is what gives the chip a sloped face for the
    lantern to catch.
    """
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return obj


def cylinder(radius, depth, loc, verts=64):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=verts, location=loc)
    return bpy.context.object


def square_frustum(top, bottom, depth, loc):
    """
    A square hole's cutter: wider at the top than the bottom.

    A 4-vertex cone puts its vertices on the axes, so it is a diamond; the
    45-degree spin is what makes it an axis-aligned square, and then the
    "radius" is the half-diagonal rather than the half-side.
    """
    bpy.ops.mesh.primitive_cone_add(
        vertices=4,
        radius1=bottom / math.sqrt(2.0),
        radius2=top / math.sqrt(2.0),
        depth=depth,
        location=loc,
        rotation=(0.0, 0.0, math.radians(45.0)),
    )
    return bpy.context.object


def cut(target, cutter, name="Cut"):
    """
    Boolean difference. ORDER MATTERS: `bevelled` first, then this, then
    `lipped`. Gotcha 6.
    """
    mod = target.modifiers.new(name=name, type="BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    # Hidden from the render AND from the AO node's rays, which is the part
    # that matters: a visible cutter would occlude the shape it carved.
    cutter.hide_render = True
    return target


# -------------------------------------------------------------------------
# The furniture
# -------------------------------------------------------------------------


def build_plinth(radius=0.45, depth=0.12, slot=0.035, step=0.0, chamfer=0.02):
    """
    The base a piece stands in. §15: one moulded base, every piece.

    A shallow cylinder with a chamfered top edge and a slot across it — the
    slot is what says "a figure slides in here" rather than "this is a coin",
    and it is the single detail that makes the base read as part of a game
    rather than as a disc.

    `step` makes the rim two-tier instead of one. That is the variation that
    keeps a boss's base from reading as the standard base photographed closer:
    a scaled copy has the same silhouette, a stepped one does not.
    """
    lower = depth if step <= 0.0 else depth * 0.55
    base = cylinder(radius, lower, (0.0, 0.0, lower / 2.0))
    objs = [base]
    top = base
    if step > 0.0:
        upper = depth - lower
        top = cylinder(radius - step, upper, (0.0, 0.0, lower + upper / 2.0))
        objs.append(top)
    for obj in objs:
        bevelled(obj, chamfer)
    if slot > 0.0:
        cut(top, box(radius * 1.5, slot, depth * 0.55, (0.0, 0.0, depth)), "Slot")
        lipped(top, chamfer * 0.4)
    return objs


def build_wall_top(height=0.7, chamfer=0.035, worn=False):
    """
    The TOP FACE of a wall block, which is what `wallBlockSprites` draws as a
    lying quad at `z = height` (§12.1: a wall is a piece at a different size).

    Framed at exactly one tile with no margin, because it has to register with
    the grid: a block's footprint is the tile, and a 4% margin here would show
    as a 4% gap along every wall run.

    The whole block is modelled rather than just its lid, so the AO node sees
    the drop and darkens the chamfer against it.
    """
    block = box(1.0, 1.0, height, (0.0, 0.0, height / 2.0))
    bevelled(block, chamfer)
    if worn:
        # Knocked corners, at four sizes and four attitudes. Identical damage
        # on every stone is worse than no damage — it reads as a texture
        # rather than as wear. Every cutter is tilted in all three axes, which
        # is the whole trick; see `box`.
        for x, y, size, rot in (
            (0.50, 0.40, 0.20, (0.42, 0.22, 0.62)),
            (-0.46, -0.50, 0.14, (-0.30, 0.38, 1.15)),
            (0.10, -0.50, 0.11, (0.34, -0.20, 0.35)),
            (-0.50, 0.24, 0.09, (0.20, 0.30, 0.80)),
        ):
            cut(block, box(size, size, size * 1.6, (x, y, height), rot=rot), f"Chip{size}")
        # A scratch, cut with a blade tilted off vertical so it has one lit
        # wall and one shaded one. An upright slot has neither. The tilt also
        # sets its WIDTH on screen — a cutter this thin leaning over shows
        # more of its floor than of its walls, so 0.22 rad is about the limit
        # before a scratch becomes a trench.
        cut(block, box(0.60, 0.045, 0.08, (0.05, 0.16, height + 0.028), rot=(0.22, 0.0, 0.28)), "Crack")
        lipped(block, chamfer * 0.4)
    return [block]


def build_face(height=0.7, chamfer=0.035, courses=(), joint=0.0, overscan=2.2, depth=0.5, chipped=False):
    """
    A vertical face at a height discontinuity — §16's `ledgeFace`, which is
    the board's rim, a wall's front, a stair riser and the drop at the edge of
    a §14 layer, all as one piece of geometry.

    THE GEOMETRY RUNS PAST THE FRAME SIDEWAYS, and `joint` is the choice that
    makes. A face is drawn as a RUN sharing one texture, so whatever sits at
    the left and right of the frame repeats every tile:

      joint = 0   a cliff, a ledge, the board's own rim. One continuous
                  surface, so the frame edge must show nothing at all — a
                  chamfer there would be a seam every tile in a face that is
                  supposed to be unbroken.
      joint > 0   a WALL, which is a run of separate blocks (§12.1) and ought
                  to show it. A groove of this width is cut ON the frame edge,
                  so each texture carries half of it and two neighbours make
                  one joint. This is what stops a wall run reading as a
                  ribbon.

    A floor slab is placed in FRONT of the face, below the frame, purely so
    the AO pass has something to darken against. That contact darkening at the
    base is most of what makes a face read as standing on the board rather
    than as floating in it.
    """
    body = box(1.0 * overscan, depth, height, (0.0, depth / 2.0, height / 2.0))
    bevelled(body, chamfer)
    for i, at in enumerate(courses):
        # A course line: the joint between the capstone and the riser below
        # it. Cut into the face plane at y = 0.
        cut(body, box(overscan * 1.4, 0.05, 0.045, (0.0, 0.0, height * at)), f"Course{i}")
    if joint > 0.0:
        for i in range(int(overscan) + 1):
            # Every whole tile across the overscan, not just the two on the
            # frame edge — otherwise the AO pass sees an occluder on one side
            # of the groove and open air on the other, and the two halves of
            # the joint come out different shades.
            cut(body, box(joint, 0.06, height * 2.0, (0.5 + i, 0.0, height / 2.0)), f"JointR{i}")
            cut(body, box(joint, 0.06, height * 2.0, (-0.5 - i, 0.0, height / 2.0)), f"JointL{i}")
    if chipped:
        # Damage lives on EDGES. Chips scattered across the middle of a face
        # read as confetti stuck to it — stone breaks where it is already
        # exposed, so these sit on the top edge, the base and the joints.
        for x, at, size, rot in (
            (0.30, 1.0, 0.11, (0.35, 0.30, 0.50)),
            (-0.24, 1.0, 0.075, (-0.28, 0.44, 1.20)),
            (0.50, 0.58, 0.09, (0.40, -0.25, 0.30)),
            (-0.12, 0.0, 0.09, (0.22, 0.36, 0.90)),
        ):
            # `size` across, but only half that deep INTO the stone. A cutter
            # as deep as it is wide takes a bite; the face wants a graze, and
            # the difference is whether the chip reads as damage or as a hole.
            cut(body, box(size, size, size, (x, 0.0, height * at), rot=rot), f"Chip{x}")
    lipped(body, chamfer * 0.4)

    floor = box(overscan * 1.4, 1.4, 0.3, (0.0, -0.7, -0.15))
    return [body, floor]


def build_frame(play=4.0, border=1.1, thickness=0.34, chamfer=0.03, rebate=0.05, bead=0.10):
    """
    The board's frame: a slab, an outer chamfer, a routed bead running all the
    way round, and the rebate the play surface sits down inside.

    ONE PIECE OF GEOMETRY, THREE TEXTURES. `board_frame`, `frame_corner`,
    `frame_edge_h` and `frame_edge_v` are the same object rendered through
    different camera WINDOWS, which is why the corner's mitre matches the
    edge's profile exactly — they are the same routed groove, photographed
    twice. Building the corner as its own object is where the "four unrelated
    strips" look comes from, and no amount of care with numbers fixes it.

    Why a corner and edges at all, when §16 chose one quad for the frame: one
    quad works because it gets every edge at once, but it STRETCHES. A square
    texture over a 24 x 16 slab makes the top chamfer 1.5x the width of the
    side one. Corner-plus-edge is the version that survives a board whose
    aspect is not 1:1.
    """
    outer = play + border * 2.0
    slab = box(outer, outer, thickness, (0.0, 0.0, -thickness / 2.0))
    bevelled(slab, chamfer)

    # The rebate: everything above -rebate inside the play area is removed, so
    # the tile grid sits down in a tray rather than on top of a table mat.
    cut(slab, box(play, play, 2.0, (0.0, 0.0, -rebate + 1.0)), "Rebate")

    # The bead: four crossing strips, which is a rectangular ring, which
    # mitres at the corners for free. A ring built as four separate grooves
    # meeting at 45 degrees is the same shape and four more chances to be
    # half a millimetre out.
    line = play / 2.0 + border * 0.5
    depth = 0.05
    for i, (sx, sy, x, y) in enumerate(
        (
            (outer + 0.4, bead, 0.0, line),
            (outer + 0.4, bead, 0.0, -line),
            (bead, outer + 0.4, line, 0.0),
            (bead, outer + 0.4, -line, 0.0),
        )
    ):
        cut(slab, box(sx, sy, depth, (x, y, 0.02 - depth / 2.0)), f"Bead{i}")

    lipped(slab, chamfer * 0.45)
    return [slab]


# The frame is baked at these numbers, and the windows below are expressed
# against them. Keeping them here rather than inline means moving the bead
# moves it in the corner and both edges at once.
FRAME_PLAY = 4.0
FRAME_BORDER = 1.1
FRAME_OUTER = FRAME_PLAY + FRAME_BORDER * 2.0
# The window reaches `FRAME_BORDER` for the frame itself plus a little of the
# play area, so the rebate lip is inside the texture rather than on its edge.
FRAME_WINDOW = FRAME_BORDER + 0.4


def build_trap_tile(plate=0.84, gap=0.035, drop=0.014, chamfer=0.018):
    """
    A trap tile, shut. §14.2 has pieces falling through these.

    An iron plate dropped into a stone floor: the gap around it is the whole
    tell, because a plate flush with the floor is a floor. Framed at exactly
    one tile — it has to sit on the grid.

    The floor runs past the frame so the tile has no silhouette of its own.
    """
    floor = box(1.7, 1.7, 0.4, (0.0, 0.0, -0.2))
    cut(floor, box(plate + gap * 2.0, plate + gap * 2.0, 0.16, (0.0, 0.0, 0.02)), "Recess")
    lipped(floor, chamfer)

    lid = box(plate, plate, 0.048, (0.0, 0.0, -drop - 0.024))
    lid["albedo"] = IRON
    bevelled(lid, chamfer)
    objs = [floor, lid]

    # Rivets. Small, four of them, and the reason the plate reads as iron
    # rather than as a darker paving slab.
    r = plate / 2.0 - 0.09
    for sx in (-1, 1):
        for sy in (-1, 1):
            rivet = cylinder(0.028, 0.022, (sx * r, sy * r, -drop - 0.004), verts=16)
            rivet["albedo"] = IRON
            bevelled(rivet, 0.008)
            objs.append(rivet)
    return objs


def build_trap_hole(mouth=0.86, throat=0.58, depth=0.55, chamfer=0.02):
    """
    The same trap, open. The middle of the texture is TRANSPARENT on purpose:
    §14.1 says the layer below stays present and unlit, so a hole must let the
    renderer show what is down there rather than paint a lid of darkness.

    The shaft NARROWS going down, which is the only reason it reads as a hole
    from directly above. A straight shaft is exactly edge-on in a plan view —
    zero pixels of wall — and the tile comes out as a rim around nothing.
    """
    floor = box(1.7, 1.7, depth, (0.0, 0.0, -depth / 2.0))
    cut(floor, square_frustum(mouth, throat, depth * 2.0, (0.0, 0.0, -depth * 0.5)), "Shaft")
    lipped(floor, chamfer)
    return [floor]


def shape(build, width, height, view=VIEW_LYING, ao=0.30, colour=STONE, centre=None):
    """One row of the table below. Everything a bake needs and nothing else."""
    return {
        "build": build,
        "width": width,
        "height": height,
        "view": view,
        "ao": ao,
        "colour": colour,
        "centre": centre,
    }


# -------------------------------------------------------------------------
# THE TABLE. A re-bake is one command; a tweak is one number.
# -------------------------------------------------------------------------
#
# `width` and `height` are the board units the texture covers. Two rules
# decide them, and they are not interchangeable:
#
#   REGISTERED shapes — anything that must line up with the tile grid or tile
#     along a run (wall tops, faces, traps) — get their EXACT extent, no
#     margin. A margin here shows up as a gap or a doubled seam.
#   FREE-STANDING shapes — a plinth, which the engine sizes by its own
#     diameter — get MARGIN, so Cycles' filter has somewhere to put the
#     anti-aliased silhouette instead of clipping it at the frame.
SHAPES = {
    # --- pieces stand in these (§15) -------------------------------------
    # Three sizes and three rim treatments: rank and file, hero, boss. The
    # sizes alone would read as one base at three zooms.
    "plinth_small": shape(
        lambda: build_plinth(radius=0.34, depth=0.10, slot=0.028, chamfer=0.018),
        width=0.68 * MARGIN, height=0.68 * MARGIN, ao=0.14, colour=PEWTER,
    ),
    "plinth": shape(
        lambda: build_plinth(radius=0.45, depth=0.12, slot=0.035, chamfer=0.02),
        width=0.90 * MARGIN, height=0.90 * MARGIN, ao=0.18, colour=PEWTER,
    ),
    "plinth_large": shape(
        lambda: build_plinth(radius=0.62, depth=0.16, slot=0.05, step=0.075, chamfer=0.024),
        width=1.24 * MARGIN, height=1.24 * MARGIN, ao=0.22, colour=PEWTER,
    ),

    # --- walls are blocks (§12.1) ----------------------------------------
    # The top face is a lying quad on the tile; the front face is a ledge.
    "wall_top": shape(
        lambda: build_wall_top(height=0.7), width=1.0, height=1.0, ao=0.30, colour=STONE,
    ),
    "wall_top_worn": shape(
        lambda: build_wall_top(height=0.7, worn=True), width=1.0, height=1.0, ao=0.30, colour=STONE,
    ),
    "wall_face": shape(
        lambda: build_face(height=0.7, courses=(0.62,), joint=0.05),
        width=1.0, height=0.7, view=VIEW_UPRIGHT, ao=0.26, colour=STONE,
    ),
    "wall_face_tall": shape(
        lambda: build_face(height=1.05, courses=(0.42, 0.76), joint=0.05),
        width=1.0, height=1.05, view=VIEW_UPRIGHT, ao=0.26, colour=STONE,
    ),
    "wall_face_chipped": shape(
        lambda: build_face(height=0.7, courses=(0.62,), joint=0.05, chipped=True),
        width=1.0, height=0.7, view=VIEW_UPRIGHT, ao=0.26, colour=STONE,
    ),

    # --- the vertical faces the map is made of (§14) ---------------------
    # `ledge_face` is the general one: a full-tile drop between layers.
    # `stair_riser` is the shallow one a climbable tile shows.
    # `board_rim` is the slab's own edge — four tiles wide because
    # `boardSlabSprites` repeats its UV every four.
    "ledge_face": shape(
        lambda: build_face(height=1.0, chamfer=0.045, courses=(0.72, 0.34)),
        width=1.0, height=1.0, view=VIEW_UPRIGHT, ao=0.34, colour=STONE_COOL,
    ),
    "stair_riser": shape(
        lambda: build_face(height=0.34, chamfer=0.03, courses=()),
        width=1.0, height=0.34, view=VIEW_UPRIGHT, ao=0.16, colour=STONE_COOL,
    ),
    "board_rim": shape(
        lambda: build_face(height=0.34, chamfer=0.035, courses=(0.55,), overscan=6.0, depth=0.8),
        width=4.0, height=0.34, view=VIEW_UPRIGHT, ao=0.20, colour=WOOD_FRAME,
    ),

    # --- the board's outline (§13) ---------------------------------------
    # One frame, four windows. See `build_frame` for why the corner is a crop
    # of the whole thing rather than its own object.
    "board_frame": shape(
        build_frame, width=FRAME_OUTER * MARGIN, height=FRAME_OUTER * MARGIN, ao=0.30, colour=WOOD_FRAME,
    ),
    "frame_corner": shape(
        build_frame, width=FRAME_WINDOW, height=FRAME_WINDOW, ao=0.30, colour=WOOD_FRAME,
        centre=(-FRAME_OUTER / 2.0 + FRAME_WINDOW / 2.0, FRAME_OUTER / 2.0 - FRAME_WINDOW / 2.0, 0.0),
    ),
    "frame_edge_h": shape(
        build_frame, width=1.0, height=FRAME_WINDOW, ao=0.30, colour=WOOD_FRAME,
        centre=(0.0, FRAME_OUTER / 2.0 - FRAME_WINDOW / 2.0, 0.0),
    ),
    "frame_edge_v": shape(
        build_frame, width=FRAME_WINDOW, height=1.0, ao=0.30, colour=WOOD_FRAME,
        centre=(-FRAME_OUTER / 2.0 + FRAME_WINDOW / 2.0, 0.0, 0.0),
    ),

    # --- what a piece falls through (§14.2) ------------------------------
    "trap_tile": shape(build_trap_tile, width=1.0, height=1.0, ao=0.22, colour=STONE),
    "trap_hole": shape(build_trap_hole, width=1.0, height=1.0, ao=0.45, colour=STONE),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(description="Bake board furniture to albedo/normal/AO sprites.")
    ap.add_argument("--out", default="web/art-staging/materials/board")
    ap.add_argument("--px", type=int, default=256, help="long axis on screen; the render is this x SUPERSAMPLE")
    ap.add_argument("--only", default=None, help="bake a subset, comma separated")
    args = ap.parse_args(argv)

    # ABSOLUTE, always. Gotcha 1 in the header: Blender resolves a bare
    # relative render path against the DRIVE ROOT rather than the working
    # directory, and reports success either way.
    out_dir = os.path.abspath(args.out)

    names = [n.strip() for n in args.only.split(",")] if args.only else list(SHAPES)
    for name in names:
        if name not in SHAPES:
            raise SystemExit(f"unknown shape {name!r}; have {', '.join(SHAPES)}")
        bake_object(name, SHAPES[name], out_dir, args.px)
    print(f"[bake] {len(names)} shapes done")


if __name__ == "__main__":
    main()
