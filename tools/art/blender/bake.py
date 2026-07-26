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
# 7. THERE IS NO SUCH THING AS AN INVISIBLE OCCLUDER. The tempting trick for a
#    wall-mounted fitting is to park an unrendered wall behind it purely so the
#    AO pass has something to darken against — `build_face` already does the
#    same thing with a floor slab, and a bracket wants a wall the way a face
#    wants a floor. It does not work. Cycles traces the AO node's rays with the
#    ray type of the path that reached the shading point, so on a surface the
#    camera can see directly they ARE camera rays, and `visible_camera = False`
#    takes the occluder out of them too.
#
#    Measured: plan view of a box floating over a floor slab, AO over the box.
#
#        no floor at all                     mean 254.8   min 250
#        floor, visible                      mean 228.9   min 131
#        floor, visible_camera = False       mean 254.8   min 250   <- identical
#
#    So occlusion comes from geometry that is either IN the picture and belongs
#    there — which is why `sconce_bracket` carries its own backplate instead of
#    borrowing a wall — or parked OUTSIDE the frame, which is what `build_face`
#    can do and an upright fitting cannot, because a wall behind a bracket is
#    squarely in shot.
#
# 8. `lipped()` DIES IN PROPORTION TO HOW MANY CUTS SHARE THE FACE, and it dies
#    quietly. Gotcha 6 says a bevel after a boolean loses the SILHOUETTE's
#    chamfer; this is the other half, found on the console. The lip that is
#    supposed to chamfer the cut edges themselves gets clamped away too, and
#    the more booleans slice one face the less of it is left:
#
#      shape           booleans on the face   peak |dev| in the normal map
#      button_recess           1              104   <- the lip is fine
#      button_plate            4                5   <- the border is gone
#      tray                    6                1   <- EVERY feature is gone
#
#    The tray's whole normal map came back flat: maxDev 1 out of 128 across the
#    entire texture, while its AO showed the pocket, the routed border and the
#    thumb notch perfectly. Exactly gotcha 6's failure mode, one level down.
#
#    THE MEAN-BASED CHECKS CANNOT SEE THIS. A symmetric feature averages to
#    127.5 whether it is present or absent, so `sheet.mjs` reported the tray as
#    a clean, perfectly neutral shape. What catches it is counting pixels that
#    deviate from flat rather than averaging them, and then scanning a line
#    across where a feature is supposed to be.
#
#    THE FIX IS TO CUT THE CHAMFER RATHER THAN TO BEVEL IT. A modifier can be
#    clamped; geometry cannot. `route_ring` therefore cuts a 45-degree V, and a
#    pocket gets its mouth chamfer from a V-ring centred on the pocket's own
#    perimeter. Bevelling the CUTTER instead does not work and is worth saying
#    out loud: a pocket cutter has to stand proud of the surface so the cut
#    goes through it, so the cutter's own chamfered top edge ends up in the air
#    above the part, nowhere near the mouth it was meant to soften.
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
import mathutils  # type: ignore  # ditto

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
# §19 asks for the console to be "the same brass and timber" as the board, so
# brass is a palette entry rather than a per-shape colour: it is the material of
# every plate and bezel on the console AND of a sconce's cup, which is what ties
# the two families together.
BRASS = (0.52, 0.39, 0.16)
# Burnt fuel — a brazier's coal bed, a torch's pitched head. Dark enough that
# the engine's emissive flame reads as the light source and this reads as the
# thing it is burning.
CHARCOAL = (0.09, 0.075, 0.07)


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
#   BILLBOARD `lighting.ts` builds the quad's frame explicitly, and it is the
#             only one of the three that is not a swizzle:
#
#                 worldN = vec3(N.x,0,0) + vec3(0,-c,s)*N.y
#                                        + vec3(0, s,c)*N.z     [board space]
#
#             so the three texture axes are, in WORLD space after the y flip,
#             (1,0,0), (0,cos,sin) and (0,-sin,cos) — camera right, camera up,
#             and the direction from the surface toward the viewer.
#
#             THIS IS *NOT* BLENDER'S CAMERA SPACE, and the earlier note in
#             this file claiming it was is now known to be wrong, because the
#             first billboard shape in the project measured it:
#
#               Vector Transform WORLD->CAMERA, card baked face-on
#                   B mean 9.1 / 9.7 / 2.8 / 3.1  on four unrelated shapes
#
#             B near ZERO on a card the camera is looking straight at means the
#             transform reported every normal as pointing AWAY — Cycles' camera
#             space runs +Z into the screen, the opposite of the convention
#             `lighting.ts` uses. The tell is the same one gotcha 2 turns on:
#             the SAME wrong number on four shapes that share no geometry.
#
#             It is not merely a sign flip to patch, either. The Y axis has its
#             own convention in that space and there is no way to check it from
#             inside Blender. So `billboard_basis()` states all three axes as
#             world vectors taken from the shader, and the stock Vector
#             Transform node is not used at all. Slower to write, impossible to
#             be wrong about quietly.
NORMAL_SWIZZLE = {
    VIEW_LYING: (("X", 1.0), ("Y", -1.0), ("Z", 1.0)),
    VIEW_UPRIGHT: (("X", 1.0), ("Z", 1.0), ("Y", -1.0)),
}


def billboard_basis(tilt_deg=DEFAULT_TILT_DEG):
    """
    (R, G, B) axes for a billboard's normal map, as WORLD vectors.

    Transcribed from `lighting.ts`'s `vUpright > 1.5` branch and then flipped
    from board space to world (board y = world -Y), which is the only step here
    that is this file's own rather than the shader's.

    Note what G means for a billboard: CAMERA UP, so a facet tipping toward the
    TOP of the image reads above 128. That is the same sense as a vertical face
    and the OPPOSITE of a lying decal, where G is board +y and therefore points
    down the image. Not a contradiction — `lighting.ts` re-swizzles per quad
    type — but it is why these three cases cannot share one rule.
    """
    t = math.radians(tilt_deg)
    return ((1.0, 0.0, 0.0),
            (0.0, math.cos(t), math.sin(t)),
            (0.0, -math.sin(t), math.cos(t)))


def relief_normal(nt, relief, space=None):
    """
    Surface texture too fine to be geometry, as a genuinely perturbed normal.

    THIS IS NOT A SHORTCUT, it is the only available construction, and the file
    already contains the proof. A linen tooth at 2.6px pitch cut as V-grooves
    would be four hundred Booleans sharing one face; gotcha 8's table says what
    that produces at SIX — an AO pass full of detail over a normal map that is
    flat everywhere. So the tooth goes in the shader, and every feature big
    enough to survive stays as geometry.

    A Bump node perturbs the TRUE geometric normal by the gradient of a height
    field, which is the reason it is the right node rather than an analytic
    normal: `card_stock` has chamfers, drafted sockets and V-cut mouths whose
    normals must be preserved and merely roughened. Replace the normal instead
    of perturbing it and every one of those goes flat.

    THE HEIGHT FIELD IS A SUM OF TRIANGLE WAVES, because a triangle wave IS a
    V-groove: constant slope, one flank up and one flank down. It is the same
    profile `vee()` cuts, at a scale where cutting is not possible.

    COORDINATES COME FROM ONE OBJECT, NOT FROM EACH. `ShaderNodeTexCoord.object`
    pins every part of a shape to a single space, so a bead built at the card's
    corner and a slab built at its centre share one phase. Leave it unset and
    each object's grating restarts at its own origin — and the phase seams land
    exactly on the gilt, which is where they are most visible.
    """
    coord = nt.nodes.new("ShaderNodeTexCoord")
    if space is not None:
        coord.object = space

    def radius():
        """Distance from the shape's own origin, in the card's plane."""
        flat = nt.nodes.new("ShaderNodeVectorMath")
        flat.operation = "MULTIPLY"
        flat.inputs[1].default_value = (1.0, 1.0, 0.0)
        nt.links.new(coord.outputs["Object"], flat.inputs[0])
        ln = nt.nodes.new("ShaderNodeVectorMath")
        ln.operation = "LENGTH"
        nt.links.new(flat.outputs["Vector"], ln.inputs[0])
        return ln.outputs["Value"]

    total = None
    for direction, pitch, amp, gate in relief:
        if direction is None:  # radial: concentric rings
            u = radius()
        elif direction == "theta":  # angular: spokes
            sep = nt.nodes.new("ShaderNodeSeparateXYZ")
            nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
            at = nt.nodes.new("ShaderNodeMath")
            at.operation = "ARCTAN2"
            nt.links.new(sep.outputs["Y"], at.inputs[0])
            nt.links.new(sep.outputs["X"], at.inputs[1])
            u = at.outputs["Value"]
        else:  # straight grooves cut across `direction`
            dot = nt.nodes.new("ShaderNodeVectorMath")
            dot.operation = "DOT_PRODUCT"
            dot.inputs[1].default_value = direction
            nt.links.new(coord.outputs["Object"], dot.inputs[0])
            u = dot.outputs["Value"]
        # PINGPONG is the triangle wave: it ramps 0..1..0 with period twice its
        # scale, so a scale of pitch/2 gives a groove every `pitch`.
        div = nt.nodes.new("ShaderNodeMath")
        div.operation = "DIVIDE"
        div.inputs[1].default_value = pitch / 2.0
        nt.links.new(u, div.inputs[0])
        pp = nt.nodes.new("ShaderNodeMath")
        pp.operation = "PINGPONG"
        pp.inputs[1].default_value = 1.0
        nt.links.new(div.outputs["Value"], pp.inputs[0])
        # Centred on zero, so summing two sets does not lift the surface.
        sc = nt.nodes.new("ShaderNodeMath")
        sc.operation = "MULTIPLY_ADD"
        sc.inputs[1].default_value = amp
        sc.inputs[2].default_value = -0.5 * amp
        nt.links.new(pp.outputs["Value"], sc.inputs[0])
        term = sc.outputs["Value"]
        if gate is not None:
            # SMOOTHSTEP, not a hard cut. A step in amplitude is a step in the
            # normal, and the eye finds a discontinuous ring far faster than it
            # finds the aliasing the gate was there to remove.
            ramp = nt.nodes.new("ShaderNodeMapRange")
            ramp.interpolation_type = "SMOOTHSTEP"
            ramp.inputs["From Min"].default_value = gate[0]
            ramp.inputs["From Max"].default_value = gate[1]
            nt.links.new(radius(), ramp.inputs["Value"])
            gated = nt.nodes.new("ShaderNodeMath")
            gated.operation = "MULTIPLY"
            nt.links.new(term, gated.inputs[0])
            nt.links.new(ramp.outputs["Result"], gated.inputs[1])
            term = gated.outputs["Value"]
        if total is None:
            total = term
        else:
            add = nt.nodes.new("ShaderNodeMath")
            add.operation = "ADD"
            nt.links.new(total, add.inputs[0])
            nt.links.new(term, add.inputs[1])
            total = add.outputs["Value"]

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.0
    # The height is already in Blender units, so Distance is a pass-through. Set
    # it to anything else and the flank angle stops being the one FOIL_SLOPE
    # says it is, which is the number the pitch test was run against.
    bump.inputs["Distance"].default_value = 1.0
    nt.links.new(total, bump.inputs["Height"])
    return bump.outputs["Normal"]


def normal_material(name, view, relief=None, space=None):
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
    # A relief spec replaces the raw geometric normal with a bumped one. It is
    # still a real world-space normal, so everything downstream is unchanged.
    source = relief_normal(nt, relief, space) if relief else geo.outputs["Normal"]

    mul = nt.nodes.new("ShaderNodeVectorMath")
    mul.operation = "MULTIPLY_ADD"
    mul.inputs[1].default_value = (0.5, 0.5, 0.5)
    mul.inputs[2].default_value = (0.5, 0.5, 0.5)

    if view == VIEW_BILLBOARD:
        # Three dot products against `billboard_basis()`, not a Vector
        # Transform. See the NORMAL_SWIZZLE note: Cycles' camera space runs +Z
        # into the screen, so the stock node returned B = 9 where a card facing
        # the camera has to read 255. Dotting the world normal against axes
        # transcribed from the shader has no convention to get wrong, and it
        # sidesteps gotcha 4's inverse-transpose problem too, because the
        # Geometry node's Normal is already correct under any object scale.
        com = nt.nodes.new("ShaderNodeCombineXYZ")
        for channel, axis in zip("XYZ", billboard_basis()):
            dot = nt.nodes.new("ShaderNodeVectorMath")
            dot.operation = "DOT_PRODUCT"
            dot.inputs[1].default_value = axis
            nt.links.new(source, dot.inputs[0])
            nt.links.new(dot.outputs["Value"], com.inputs[channel])
        nt.links.new(com.outputs["Vector"], mul.inputs[0])
    else:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        com = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(source, sep.inputs["Vector"])
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
    # `mask` says the albedo pass is DATA, not colour — `card_foil`'s only
    # content is where the foil is. sRGB leaves white and black alone and lifts
    # every ANTIALIASED EDGE texel from 128 to 188, which on a mask made of thin
    # gilt lines fattens every line by half a pixel. Gotcha 2, pointed the other
    # way round.
    set_pass_encoding(not spec.get("mask", False))
    render_to(os.path.join(out_dir, f"{name}.png"), PASS_SAMPLES["albedo"])

    assign(objs, normal_material(f"{name}_normal", view, relief=spec.get("bump"),
                                 space=objs[0] if objs else None))
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


def cylinder(radius, depth, loc, verts=64, rot=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, vertices=verts, location=loc, rotation=rot
    )
    return bpy.context.object


def frustum(bottom, top, depth, loc, verts=64, rot=(0.0, 0.0, 0.0)):
    """
    A round cone section — the bowl of a brazier, the cup of a sconce.

    The same argument as `build_trap_hole`'s shaft, applied to a container
    rather than a hole: a straight-walled cup is exactly edge-on in a plan view
    and comes out as a rim around nothing. A cup that OPENS UPWARD shows the
    inside of its far wall, which is what makes it read as something you could
    drop a flame into.
    """
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts, radius1=bottom, radius2=top, depth=depth, location=loc, rotation=rot
    )
    return bpy.context.object


def ring(major, minor, loc, rot=(0.0, 0.0, 0.0), major_segments=64, minor_segments=16):
    """
    Round bar bent into a circle: a cup's rim, a torch collar, a brazier's tie.

    SMOOTH-SHADED, unlike everything else here, and that is not an
    inconsistency. The rest of the family is flat stock whose facets ARE the
    chamfers; a torus has no sharp edge anywhere, so flat shading would put
    16 invented creases into a normal map on a part 0.02 tiles thick — the
    exact "plausible and lights wrongly" failure the header keeps warning
    about, at a scale small enough to skim past.
    """
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    bpy.ops.object.shade_smooth()
    return obj


def aim(p0, p1):
    """
    Centre, length and euler for a part running from `p0` to `p1`.

    Hand-computing the rotation for every strut is how a bracket ends up with
    an arm that misses its own cup by a hundredth of a tile — and the error is
    invisible in the albedo and obvious in the AO. `to_track_quat` derives it
    from the two endpoints, so moving a cup moves the arm that holds it.

    THE UP AXIS IS CHOSEN, NOT FIXED. `to_track_quat("Z", "Y")` is degenerate
    when the run is along Y, and almost every part on a wall bracket runs
    straight out of the wall along -Y. Degenerate does not raise; it returns an
    arbitrary roll, so a strut with a rectangular section comes out rotated
    about its own axis by whatever the maths happened to produce — a 0.048 x
    0.026 strap silently baked 0.026 x 0.048. Picking whichever of X and Y the
    run is LEAST aligned with makes the roll deterministic.
    """
    a = mathutils.Vector(p0)
    b = mathutils.Vector(p1)
    d = b - a
    mid = (a + b) / 2.0
    n = d.normalized()
    up = "X" if abs(n.x) < abs(n.y) else "Y"
    e = d.to_track_quat("Z", up).to_euler()
    return (mid.x, mid.y, mid.z), d.length, (e.x, e.y, e.z)


def lerp(p0, p1, t):
    return tuple(a + (b - a) * t for a, b in zip(p0, p1))


def strut(p0, p1, sx, sy=None):
    """Square-section bar from p0 to p1. Local Z is the run, so `sx`/`sy` are its section."""
    mid, length, rot = aim(p0, p1)
    return box(sx, sx if sy is None else sy, length, mid, rot)


def rod(p0, p1, radius, verts=32):
    """Round-section bar from p0 to p1 — a torch shaft, a candle stem."""
    mid, length, rot = aim(p0, p1)
    return cylinder(radius, length, mid, verts=verts, rot=rot)


def vee(target, length, width, centre, run="x", name="Vee"):
    """
    ONE straight V-groove, cut rather than bevelled. The primitive gotcha 8 is
    about: a modifier can be clamped away, a hole in the mesh cannot.

    The cutter is a square section rotated 45 degrees about its own run, so the
    diamond always lies in the plane PERPENDICULAR to `run` and the groove
    comes out `width` wide at the surface and `width / 2` deep. Which surface
    it cuts is decided by where `centre` sits, not by an argument — put it on
    the top face and the groove goes down, put it on a front face and the
    groove goes in.
    """
    s = width / math.sqrt(2.0)
    q = math.radians(45.0)
    if run == "x":
        cutter = box(length, s, s, centre, (q, 0.0, 0.0))
    elif run == "y":
        cutter = box(s, length, s, centre, (0.0, q, 0.0))
    else:
        cutter = box(s, s, length, centre, (0.0, 0.0, q))
    return cut(target, cutter, name)


def grain(target, offsets, run, length, level, name="Grain"):
    """
    Parallel V-grooves all running ONE WAY — what makes a flat albedo read as
    timber instead of as painted board.

    Paul asked for "nice wood", and wood in this pipeline cannot be a colour:
    the albedo is deliberately flat and Grok paints the surface later, so the
    only channel that can carry "this is a plank" is the NORMAL, and the only
    thing that distinguishes a plank from a slab there is that its detail is
    ANISOTROPIC. Grooves along one axis put variation in one channel and leave
    the other flat, which is measurable — see the grain check in the notes.

    `offsets` is an explicit table of (position across the run, groove width),
    not a random scatter, for `build_wall_top`'s reason: identical spacing
    reads as machining and true randomness cannot be reviewed or reproduced.
    Varying the widths is what stops it looking like a comb.
    """
    for i, (off, w) in enumerate(offsets):
        centre = (off, 0.0, level) if run == "y" else (0.0, off, level)
        vee(target, length, w, centre, run=run, name=f"{name}{i}")
    return target


# Six grooves, no two the same width, none evenly spaced. Positions are ACROSS
# the run, so on a rail running along board y these are x offsets.
OAK_GRAIN = (
    (-0.168, 0.011), (-0.104, 0.008), (-0.041, 0.013),
    (0.028, 0.009), (0.096, 0.012), (0.158, 0.008),
)


def route_ring(target, rw, rd, gw, centre, plane="xy", name="Ring"):
    """
    A routed groove running round a rectangle, cut as a V. See gotcha 8.

    Four strips that STOP at the corners, unlike `build_frame`'s bead. The bead
    is four strips that run right past each other and out to the slab edge,
    which on a frame reads as a mitred border and is what that shape wants. On
    a button plate the same construction reads as a hash with eight stubs
    running to the edge. So these are cut to length: each strip is the ring's
    own side plus one groove width, which closes the corners exactly.

    A V, NOT A RECTANGULAR SLOT, and that is the part worth reading. A slot's
    walls are VERTICAL, and a vertical wall in a plan view is exactly edge-on —
    zero pixels — so a slotted groove exists in the normal map only through
    whatever chamfer `lipped()` manages to survive putting on its mouth, which
    once several cuts share a face is nothing at all. A 45-degree V has two
    sloped walls by construction, involves no modifier, and therefore cannot be
    clamped away.

    The cutter is a square section rotated 45 degrees about its own run, so the
    groove comes out `gw` wide at the surface and `gw / 2` deep. `rw` x `rd` is
    the groove's CENTRELINE rectangle; `centre` sits ON the surface being cut.
    """
    cx, cy, cz = centre
    s = gw / math.sqrt(2.0)
    q = math.radians(45.0)
    sides = (
        (True, 0.0, rd / 2.0),
        (True, 0.0, -rd / 2.0),
        (False, rw / 2.0, 0.0),
        (False, -rw / 2.0, 0.0),
    )
    for i, (across, u, v) in enumerate(sides):
        if plane == "xy":  # a groove in a face the camera looks DOWN at
            cutter = (
                box(rw + gw, s, s, (cx + u, cy + v, cz), (q, 0.0, 0.0))
                if across
                else box(s, rd + gw, s, (cx + u, cy + v, cz), (0.0, q, 0.0))
            )
        else:  # "xz" — a groove in a face that looks back at the player
            cutter = (
                box(rw + gw, s, s, (cx + u, cy, cz + v), (q, 0.0, 0.0))
                if across
                else box(s, s, rd + gw, (cx + u, cy, cz + v), (0.0, 0.0, q))
            )
        cut(target, cutter, f"{name}{i}")
    return target


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


# -------------------------------------------------------------------------
# WHAT THE FLAME IS MOUNTED IN (§18.1)
# -------------------------------------------------------------------------
#
# §18.1, after looking at a real frame: *"Sconce flames float. They are drawn
# as bare flames hovering in a row above the wall tops, with no bracket, no
# cup, no wall plate. They read as disconnected candles rather than as lights
# MOUNTED on something."*
#
# The flame stays procedural — it flickers, it is a light, `scene/emitters.ts`
# owns it. What was missing is the fitting, and a fitting is hard-surface,
# machine-made and identical on every wall in the dungeon, which is §7's case
# for Blender stated exactly.
#
# THE ANCHOR IS THE CONTRACT. A bracket is useless to the engine unless it
# knows where the flame goes, and "somewhere near the top" is how you get a
# flame growing out of an arm. Every wall fitting here puts its MOUTH — the cup
# rim, the top of the torch shaft — at exactly 0.90 of the frame height above
# the frame's base, so:
#
#     flameBase = bracketQuadBottom + 0.90 * bracketQuadHeight
#
# and the remaining 0.10 is the headroom that keeps the rim's own chamfer and
# its antialiasing inside the texture.
#
# These are UPRIGHT shapes: they are drawn on a vertical face, so they bake in
# ELEVATION and swizzle through `NORMAL_SWIZZLE[VIEW_UPRIGHT]`. Getting that
# wrong on a fitting is the worst case for it — a bracket is nothing but
# angled facets catching a light that is right next to it.
#
# AND ELEVATION MEANS HOW FAR A FITTING STANDS OFF THE WALL IS INVISIBLE. The
# camera looks straight at the face, so an arm reaching toward the viewer is
# foreshortened to nothing and a shaft leaning out reads as vertical. This was
# worth finding by looking: the first version of both brackets was designed
# around depth — a load-bearing arm plus a brace making a visible triangle, a
# torch leaning away from the stone it would scorch — and NONE of that survives
# into the texture. What survives is the arm's end-on section, which reads as a
# rib down the plate, and the AO contact it casts.
#
# So a fitting is distinguished by SILHOUETTE and MATERIAL, never by standoff:
# a flaring brass cup against two iron collars and a burnt shaft. Depth is
# still worth modelling — it is what the AO darkens against — but it must not
# be what tells two fittings apart.
#
# The wall behind them is NOT modelled, and gotcha 7 is why: an occluder the
# camera cannot see does not occlude the AO node either, and a wall the camera
# CAN see fills the frame. So the backplate does that job. It has to be there
# anyway — a plate bolted flat to the stone is the single detail that says
# "fixed to the wall" rather than "floating in front of it".

MOUTH = 0.90


def build_sconce_bracket(h=0.40, chamfer=0.007):
    """
    An iron wall bracket with a brass cup — the standard sconce fitting.

    THE CUP IS WHAT DOES THE WORK. In elevation the arm and the brace are both
    pointing at the camera and collapse into a single rib down the middle of
    the plate, so what the player actually sees is: a bolted plate, a rib, and
    a cup that FLARES. The flare is the whole silhouette — a straight tube
    would read as a pipe stub — and it is why the cup is a frustum rather than
    a cylinder.

    The two struts are still modelled, and still earn their place, but in the
    AO rather than in the outline: they are what darkens the plate beneath the
    cup, which is the shading that says the cup is held off the wall rather
    than printed on it.

    Brass cup on an iron bracket, one shape, two materials — the same trick
    `build_trap_tile` uses for its iron lid in a stone floor, and the reason
    the cup is the part your eye lands on.
    """
    mouth = h * MOUTH
    plate_w, plate_t = 0.16, 0.032
    out = -0.125  # how far the cup stands off the wall

    plate = box(plate_w, plate_t, 0.26, (0.0, -plate_t / 2.0, 0.15))
    bevelled(plate, chamfer)

    arm = strut((0.0, -plate_t, 0.245), (0.0, out, 0.290), 0.036)
    brace = strut((0.0, -plate_t, 0.075), (0.0, out * 0.94, 0.248), 0.024)
    bevelled(arm, chamfer * 0.8)
    bevelled(brace, chamfer * 0.8)

    stem = cylinder(0.020, 0.055, (0.0, out, 0.268), verts=32)
    cup = frustum(0.042, 0.070, 0.075, (0.0, out, mouth - 0.0375), verts=48)
    bevelled(cup, chamfer * 0.8)
    rim = ring(0.070, 0.009, (0.0, out, mouth - 0.007))
    for obj in (stem, cup, rim):
        obj["albedo"] = BRASS

    objs = [plate, arm, brace, stem, cup, rim]
    # Four bolts through the plate. Their axis runs along Y — a rivet baked as
    # a Z-axis cylinder on an UPRIGHT part is a disc seen edge-on, which is a
    # line, which is nothing.
    for sx in (-1, 1):
        for z in (0.235, 0.062):
            bolt = cylinder(0.013, 0.012, (sx * 0.046, -plate_t - 0.004, z),
                            verts=16, rot=(math.radians(90.0), 0.0, 0.0))
            bevelled(bolt, 0.004)
            objs.append(bolt)
    return objs


def build_torch_bracket(h=0.50, chamfer=0.008):
    """
    The heavy variant: two collars holding a torch shaft that leans out.

    A RING rather than a cup, because a torch is a stick and a stick is held
    round its middle. Two of them, spaced apart, because one ring is a hinge —
    a shaft through a single collar has nothing setting its angle and reads as
    resting there by luck.

    WHAT SEPARATES IT FROM `sconce_bracket` AT A GLANCE is the silhouette and
    the materials, not the pose: two hard iron rings and a pale wooden shaft
    ending in a black burnt head, against a smooth brass flare. The shaft does
    lean out and up, which is right — it keeps the flame off the stone — but
    the lean is along the view axis and the texture cannot show it, so it is
    not doing any of the telling-apart. See the section note above.

    The burnt head is not decoration either: without it the shaft stops at a
    flat disc and reads as a cut dowel rather than as something that has been
    lit.
    """
    top = h * MOUTH
    plate_w, plate_t = 0.19, 0.038
    foot = (0.0, -0.078, 0.055)
    head = (0.0, -0.185, top)

    plate = box(plate_w, plate_t, 0.30, (0.0, -plate_t / 2.0, 0.175))
    bevelled(plate, chamfer)

    shaft = rod(foot, lerp(foot, head, 0.90), 0.027)
    shaft["albedo"] = WOOD_FRAME
    # The pitched head, fatter and burnt. It is what the flame sits on, and
    # without it the shaft ends in a flat disc that reads as a cut dowel.
    burnt = rod(lerp(foot, head, 0.84), head, 0.040)
    burnt["albedo"] = CHARCOAL

    objs = [plate, shaft, burnt]
    # The two collars, each at the point on the shaft it actually grips, and
    # each turned to the shaft's own axis — `aim` derives both from the same
    # two endpoints, so a change to the lean cannot leave a collar behind.
    for t, major, minor, strap_z, strap_w in ((0.62, 0.046, 0.014, 0.288, 0.048),
                                              (0.12, 0.038, 0.012, 0.088, 0.048)):
        at = lerp(foot, head, t)
        _, _, rot = aim(foot, head)
        objs.append(ring(major, minor, at, rot=rot, major_segments=48))
        strap = strut((0.0, -plate_t, strap_z), (at[0], at[1] + 0.012, at[2]), strap_w, 0.026)
        bevelled(strap, chamfer * 0.7)
        objs.append(strap)

    for sx in (-1, 1):
        for z in (0.272, 0.072):
            bolt = cylinder(0.014, 0.013, (sx * 0.056, -plate_t - 0.004, z),
                            verts=16, rot=(math.radians(90.0), 0.0, 0.0))
            bevelled(bolt, 0.004)
            objs.append(bolt)
    return objs


def build_wall_plate(w=0.28, h=0.34, t=0.042, chamfer=0.012):
    """
    A backplate on its own, for when a fitting needs to look BOLTED rather than
    merely adjacent.

    Both brackets carry their own plate, so this is not a dependency — it is
    the heavier option, drawn behind a bracket where the wall wants a bigger
    statement, and usable under anything else that has to appear fixed to
    stone. A routed border and four corner bolts, nothing else: whatever sits
    in front of it is the thing being looked at.

    The plate is centred at `h / 2 + 0.03`, so a frame of `h + 0.06` puts equal
    headroom above and below it and the shape reads as centred in its quad.
    """
    cz = h / 2.0 + 0.03
    plate = box(w, t, h, (0.0, -t / 2.0, cz))
    bevelled(plate, chamfer)
    # Inset 0.075, not the 0.05 that looks right on paper: the bolts sit
    # BETWEEN the groove and the edge, and at 0.05 the groove's outer wall and
    # the bolt heads want the same 0.007 of plate. Two features overlapping by
    # a hair does not read as tight tolerance, it reads as a mistake.
    route_ring(plate, w - 0.15, h - 0.15, 0.020, (0.0, -t, cz), plane="xz")
    lipped(plate, 0.006)

    objs = [plate]
    for sx in (-1, 1):
        for sz in (-1, 1):
            bolt = cylinder(0.015, 0.014, (sx * (w / 2.0 - 0.032), -t - 0.005, cz + sz * (h / 2.0 - 0.036)),
                            verts=16, rot=(math.radians(90.0), 0.0, 0.0))
            bevelled(bolt, 0.004)
            objs.append(bolt)
    return objs


def build_brazier(bowl=0.32, feet=0.44, chamfer=0.010):
    """
    A standing floor bowl on four legs — a fire for the middle of a room rather
    than for a wall.

    LYING, like a plinth, and for the same reason: it is a thing standing on
    the board, so `buildVertexData` squashes it by cos(tilt) at draw time and
    the bake must not do it again (gotcha 3). What the plan view shows is the
    rim, the inside of the far wall, the coal bed and four feet radiating out.

    FOUR LEGS AT THE CARDINALS, and the tripod a real brazier would have is
    wrong here for two separate reasons. A three-legged bounding box is not
    symmetric, so the shape would sit off-centre in a quad the engine centres
    on a tile. And legs must splay PAST the rim to exist at all in a plan view
    — anything inside `bowl` is hidden under the bowl it holds up.

    The mouth is at z = 0.42 at this scale, i.e. `0.447 * spriteWidth` above
    the floor: that is where a flame billboard's base belongs.
    """
    objs = []
    for i in range(4):
        a = math.radians(90.0 * i)
        c, s = math.cos(a), math.sin(a)
        leg = strut((feet * c, feet * s, 0.0), (0.17 * c, 0.17 * s, 0.245), 0.055, 0.045)
        bevelled(leg, chamfer)
        pad = box(0.085, 0.085, 0.036, (feet * c, feet * s, 0.018))
        bevelled(pad, chamfer * 0.8)
        objs += [leg, pad]

    # The tie ring, at the radius where it actually meets the legs. Under the
    # bowl it would be invisible; outside the feet it would be a hoop floating
    # in space. It is the detail that says the legs are one frame rather than
    # four sticks.
    tie_r = 0.36
    objs.append(ring(tie_r, 0.014, (0.0, 0.0, 0.245 * (feet - tie_r) / (feet - 0.17))))

    body = frustum(0.20, bowl, 0.20, (0.0, 0.0, 0.32))
    bevelled(body, chamfer)
    cut(body, frustum(0.155, bowl - 0.035, 0.24, (0.0, 0.0, 0.36)), "Hollow")
    lipped(body, chamfer * 0.5)
    objs.append(body)
    objs.append(ring(bowl - 0.018, 0.016, (0.0, 0.0, 0.42)))

    coals = frustum(0.152, 0.105, 0.05, (0.0, 0.0, 0.262), verts=32)
    coals["albedo"] = CHARCOAL
    bevelled(coals, chamfer * 0.5)
    objs.append(coals)
    return objs


# -------------------------------------------------------------------------
# THE PLAYER CONSOLE (§19)
# -------------------------------------------------------------------------
#
# §19 settled where the UI lives: not on the board, which pans and zooms, but
# on the TABLE, as a fixed console at the near edge facing the player. And it
# settled the split that keeps it affordable, which is §1.2's line:
#
#     THE GPU DRAWS EVERY SURFACE. THE DOM DRAWS TEXT AND HIT TARGETS.
#
# So NOTHING HERE HAS A GLYPH ON IT, and that is a constraint rather than an
# omission. Bake a label into a plate and you have baked in a language, a
# breakpoint, a font size and a screen reader that cannot read it. Every plate
# below therefore has a deliberately EMPTY, FLAT centre — the routed border
# stops well short of it — and a transparent DOM element sits on top carrying
# the text, the click handler, the ARIA role and `data-nav-item`.
#
# COMPONENTS, NOT A MONOLITH, so a console can be assembled at any width. The
# body tiles along a run the way `board_rim` does; the plates and their sockets
# are dropped onto it wherever the layout wants them.
#
# THE PLATE AND ITS SOCKET SHARE A FRAME, which is the one thing here that will
# save somebody an afternoon. A plate baked at its own extent and a socket
# baked at its own extent have to be aligned by arithmetic at draw time, and
# any disagreement shows as a plate sitting crooked in its hole. Instead both
# are baked into the SAME frame — plate footprint plus `BUTTON_SURROUND` on
# every side — so the engine draws the two quads at the identical rect and they
# cannot drift. The margin the silhouette needs comes free with it.

BUTTON_SURROUND = 0.10
# (width, depth) of the plate itself, in tiles. The frame is this plus surround.
BTN_SMALL = (0.34, 0.34)
BTN = (0.86, 0.34)
BTN_WIDE = (1.50, 0.34)
# A socket is cut 0.055 deep for a plate 0.045 thick, so a pressed button has
# 0.010 of travel to sink into and still clears the floor of its own hole.
PLATE_T = 0.045
SOCKET_DEPTH = 0.055


def socket(size):
    """The shared frame for a plate and the recess it drops into."""
    return (size[0] + 2.0 * BUTTON_SURROUND, size[1] + 2.0 * BUTTON_SURROUND)


def build_console_body(run=6.0, deep=1.30, thick=0.16, chamfer=0.022):
    """
    The slab everything is mounted on: timber deck, brass lip at the near edge.

    IT RUNS PAST THE FRAME SIDEWAYS and carries no feature on the left or right
    edge, which is `build_face`'s `joint = 0` case — the console is one
    continuous surface however wide it is assembled, so a chamfer on the frame
    edge would be a seam every four tiles down a deck that is supposed to be
    unbroken.

    The BRASS RAIL IS AT THE BOTTOM OF THE IMAGE. Board +y is world -Y and
    points at the player (see the axes note), and a plan camera puts world +Y
    at the top — so the near edge, the one the player's hands reach, renders at
    the bottom. Getting this backwards puts the finger rail against the board.
    """
    deck = box(run, deep, thick, (0.0, 0.0, -thick / 2.0))
    bevelled(deck, chamfer)
    # Two inlay lines running the length. They cross the frame edge on purpose:
    # they are part of what tiles, so each texture carries a section of one
    # continuous groove.
    for y in (-0.44, -0.50):
        cut(deck, box(run + 0.4, 0.030, 0.024, (0.0, y, -0.002)), f"Inlay{y}")
    lipped(deck, 0.010)

    front = box(run, 0.09, 0.05, (0.0, -deep / 2.0 + 0.065, 0.025))
    back = box(run, 0.06, 0.03, (0.0, deep / 2.0 - 0.050, 0.015))
    for rail, ch in ((front, 0.012), (back, 0.008)):
        rail["albedo"] = BRASS
        bevelled(rail, ch)
    return [deck, front, back]


def build_button_plate(size, ring_groove=True, chamfer=0.014):
    """
    A brass plate a DOM label sits on. THE CENTRE IS EMPTY AND STAYS EMPTY.

    The routed border stops 0.041 from the edge and the bolts sit outside it,
    which leaves a flat rectangle of `w - 0.15` by `d - 0.15` in the middle
    with nothing on it at all. That rectangle is the whole product: it is where
    the text goes, and anything baked into it would be text the DOM cannot
    change, translate, resize or read aloud.

    The square variant drops the border and takes four corner bolts instead —
    at that size the groove and the bolts want the same 0.02 of plate, and a
    bolt clipping a groove is the sort of detail that looks like a mistake
    because it is one.
    """
    w, d = size
    plate = box(w, d, PLATE_T, (0.0, 0.0, PLATE_T / 2.0))
    bevelled(plate, chamfer)
    if ring_groove:
        # Inset further on the LONG axis than the short one, because that is
        # the end the bolts are at. A uniform 0.05 border leaves the groove's
        # outer wall and the bolt heads fighting over the same 0.004 of brass,
        # and there is no bolt radius that fits between them.
        route_ring(plate, w - 0.15, d - 0.10, 0.018, (0.0, 0.0, PLATE_T))
    lipped(plate, 0.006)

    objs = [plate]
    corners = ((-1, -1), (-1, 1), (1, -1), (1, 1)) if not ring_groove else ((-1, 0), (1, 0))
    for sx, sy in corners:
        bolt = cylinder(0.013, 0.014, (sx * (w / 2.0 - 0.030), sy * (d / 2.0 - 0.045), PLATE_T + 0.002),
                        verts=16)
        bevelled(bolt, 0.004)
        objs.append(bolt)
    return objs


def build_button_recess(size, chamfer=0.020):
    """
    The routed socket a plate drops into, cut into a patch of console deck.

    THE DECK OVERRUNS THE FRAME AND CARRIES NO EDGE FEATURE, so this sprite has
    no silhouette of its own — exactly `build_trap_tile`'s floor. It is drawn
    on top of `console_body`, in the same timber, and the only thing visible is
    the hole. Put a chamfer on the frame edge instead and every button on the
    console acquires a rectangular outline nobody asked for.
    """
    w, d = size
    fw, fd = socket(size)
    deck = box(fw + 0.30, fd + 0.30, 0.16, (0.0, 0.0, -0.08))
    bevelled(deck, chamfer)
    cut(deck, box(w + 0.044, d + 0.044, 0.20, (0.0, 0.0, 0.10 - SOCKET_DEPTH)), "Socket")
    # The mouth chamfer is cut, not bevelled. `lipped()` alone does hold up here
    # — one boolean, measured at 104/128 — but it holds up by luck of the cut
    # count, and the next person to add a feature to this socket would lose it
    # silently. Same construction as the tray, for the same reason.
    route_ring(deck, w + 0.044, d + 0.044, 0.026, (0.0, 0.0, 0.0), name="Mouth")
    lipped(deck, 0.012)
    return [deck]


def build_tray(pocket=(1.66, 0.76), frame=(1.86, 0.96), depth=0.075, chamfer=0.020):
    """
    A shallow routed recess for cards or tokens, with a finger scallop.

    The scallop is the detail that makes it a TRAY rather than a hole: a real
    card well has a thumb notch bitten out of its near wall, because otherwise
    you cannot get the bottom card out. It is cut with a vertical cylinder that
    stops at the pocket floor — run it through the deck instead and the sprite
    gets a transparent bite taken out of the console.

    Near wall means the BOTTOM of the image, same as the console's brass rail.
    """
    pw, pd = pocket
    deck = box(frame[0] + 0.40, frame[1] + 0.40, 0.16, (0.0, 0.0, -0.08))
    bevelled(deck, chamfer)
    cut(deck, box(pw, pd, 0.24, (0.0, 0.0, 0.12 - depth)), "Pocket")
    # The pocket's MOUTH CHAMFER, cut as geometry rather than left to
    # `lipped()`. This shape carries six booleans and the lip does not survive
    # them — gotcha 8. A V-ring centred exactly on the pocket's perimeter has
    # its inner half already carved away, so what is left is a 45-degree
    # chamfer running round the mouth, which is what a router leaves anyway.
    route_ring(deck, pw, pd, 0.030, (0.0, 0.0, 0.0), name="Mouth")
    # The thumb notch, DRAFTED rather than straight-walled, for `build_trap_hole`'s
    # reason: a vertical wall is edge-on in a plan view and contributes nothing.
    # Radius 0.077 at the surface, not the 0.17 a thumb suggests — a scallop
    # wider than the lip it is cut into reaches past the FRAME, and then it is
    # not a notch in a near wall, it is a channel running off the texture.
    cut(deck, frustum(0.055, 0.115, depth + 0.13, (0.0, -pd / 2.0, (0.13 - depth) / 2.0), verts=48),
        "Scallop")
    # Centreline midway between the pocket and the frame edge. On the frame
    # edge itself — which is what `frame` reads like — half the groove would be
    # outside the texture.
    route_ring(deck, frame[0] - 0.10, frame[1] - 0.10, 0.022, (0.0, 0.0, 0.0))
    lipped(deck, 0.012)
    return [deck]


def build_bezel(outer=(1.30, 0.60), opening=(1.02, 0.32), thick=0.05, chamfer=0.016):
    """
    A brass frame round a panel or a readout. The middle is TRANSPARENT.

    THE OPENING IS EXACTLY 3/4 OF THE FRAME WIDTH AND 1/2 OF ITS HEIGHT, and
    that is the point of choosing these numbers rather than pretty ones: the
    thing being framed is the bezel's own quad scaled by (0.75, 0.50) about the
    same centre. No offset table, no measuring a PNG.
    """
    body = box(outer[0], outer[1], thick, (0.0, 0.0, thick / 2.0))
    bevelled(body, chamfer)
    cut(body, box(opening[0], opening[1], thick * 4.0, (0.0, 0.0, thick / 2.0)), "Opening")
    lipped(body, 0.010)

    objs = [body]
    for sx in (-1, 1):
        for sy in (-1, 1):
            bolt = cylinder(0.017, 0.014, (sx * (outer[0] / 2.0 - 0.048), sy * (outer[1] / 2.0 - 0.048),
                                           thick + 0.002), verts=16)
            bevelled(bolt, 0.005)
            objs.append(bolt)
    return objs


# -------------------------------------------------------------------------
# THE PLAYER BOARD (§19.1)
# -------------------------------------------------------------------------
#
# Paul, having watched a lit fight: *"I would really like the (Player board im
# going to call) to be modeled with some nice wood and brass accents. A
# Dedicated place for the Vigor Candles Player and Enemy Portraits, The Discard
# Pile, The Exhaust pile... Something for the End Turn lantern to fit in to,
# and the Combat/Chronicle Log. It should all feel like a physical part of the
# game being played. not just a menu. then i think the Vigor candles wont look
# so weird. Like the candles should sit in sockets made for them."*
#
# §19.1 reads the last sentences as a DIAGNOSIS rather than a decoration
# request, and it is right. `9f3cfa0` moved the vigor candles onto the board's
# left frame band and they still looked wrong, because a candle resting on a
# bare strip of timber is a candle somebody left there. A socket is what makes
# an object belong — the same argument §15 makes for a piece and its plinth.
# So every item here is a FITTING, not a position.
#
# WOOD CANNOT BE A COLOUR HERE. The albedo is flat by construction and Grok
# paints the surface later, so the only channel that can say "plank" is the
# normal, and the only thing that says it there is that the detail runs ONE
# WAY. That is what `grain()` is for, and it is checkable: grooves along y put
# their variation in R and leave G alone.
#
# SEPARATE PARTS, SEPARATE TEXTURES, AND THAT IS NOW A REQUIREMENT rather than
# a preference. §19.1 defers wear but says to model for it: wax pooling in and
# around the candle sockets, brass polished where a thumb rests, a card-shaped
# scuff in the discard tray, scorch around the exhaust. Wear lands where a
# thing has been USED, so it has to be authored per fitting; merged into one
# shell for the whole board it could not be re-textured independently, and the
# wax pass would become a single enormous atlas nobody wants to paint.
#
# The concrete consequence today is in `build_candle_socket`: the drip pan is a
# real dished BASIN with a raised rim, not a flat seat, so there is somewhere
# for the wax to go when that pass happens.
#
# The candle numbers are `battleScene.ts`'s, not invented: CANDLE_WIDTH = 0.2,
# and the rail stands at CANDLE_FRAME_X = -ARENA_BORDER / 2 on a frame band 1.2
# tiles wide, with candles spread along ~4.3 tiles of board Y.


def build_candle_socket(pan=0.235, bore=0.10, chamfer=0.008):
    """
    A brass cup with a drip pan and a collar, sized so a 0.2-tile candle drops
    in. THE PRIORITY PART — §19.1's whole diagnosis rests on it.

    THE PAN IS A BASIN, NOT A DISC, and that is the §19.1 wear note made
    concrete: the top is dished between the collar and a raised outer rim, so
    when the wax pass lands there is a place for wax to pool instead of a flat
    surface it would have to be painted onto. It costs one boolean now.

    It also happens to be what makes the socket READ. A flat pan seen from
    above is a brass disc; a dished one shows the far inside of its own wall,
    which is the same argument `build_trap_hole` makes about a shaft that has
    to narrow to be visible at all. Every wall here is therefore drafted rather
    than vertical — the bore included, which tapers 0.100 to 0.109 over its
    depth.

    Baked LYING (gotcha 3): it stands on the board like a plinth and the engine
    squashes it by cos(tilt) at draw time.
    """
    body = cylinder(pan, 0.044, (0.0, 0.0, 0.022))
    bevelled(body, chamfer)
    # The basin. Steep enough that the pan's top opening is 0.206 while the
    # floor is 0.150 — most of the visible annulus is sloped wall, which is the
    # part a light can catch.
    cut(body, frustum(0.150, 0.230, 0.040, (0.0, 0.0, 0.036)), "Basin")
    lipped(body, chamfer * 0.5)

    collar = frustum(0.148, 0.138, 0.098, (0.0, 0.0, 0.065))
    bevelled(collar, chamfer)
    cut(collar, frustum(bore, bore + 0.020, 0.14, (0.0, 0.0, 0.120)), "Bore")
    lipped(collar, chamfer * 0.5)

    bead = ring(0.132, 0.012, (0.0, 0.0, 0.111))
    # Spent wax and soot in the bottom of the bore. With a candle in the socket
    # it is hidden; with the socket empty it is what stops the bore reading as
    # a bright brass dimple.
    spent = cylinder(0.096, 0.012, (0.0, 0.0, 0.056), verts=32)
    spent["albedo"] = CHARCOAL
    return [body, collar, bead, spent]


def build_candle_rail(width=0.52, run=2.6, thick=0.09, chamfer=0.016):
    """
    The timber rail the sockets are set into, tiling along BOARD Y.

    THE RUN AXIS IS Y AND THAT IS NOT ARBITRARY. The rail stands on the left
    frame band at `CANDLE_FRAME_X` with the candles spread along board y, so
    the strip repeats vertically in the image. Baking it running along X and
    asking the engine to turn it would TRANSPOSE the normal map — R and G swap
    meaning — which is the "plausible and lights wrongly" failure this file
    keeps paying for. Bake the orientation of use.

    So the y edges carry no feature at all and the geometry overruns them:
    `build_face`'s `joint = 0` case, because a rail is one continuous length of
    timber however many candles share it. The x edges ARE real edges and their
    chamfers sit inside the frame.

    The sockets are NOT cut into this. They are their own sprite dropped at
    each candle position, because the positions are computed from the vigor
    count at runtime and a rail with holes pre-cut at fixed intervals could
    only ever match one of them.
    """
    plank = box(width, run, thick, (0.0, 0.0, thick / 2.0))
    bevelled(plank, chamfer)
    grain(plank, OAK_GRAIN, "y", run * 1.2, thick)

    objs = [plank]
    for sx in (-1, 1):
        edge = box(0.06, run, 0.022, (sx * (width / 2.0 - 0.03), 0.0, thick + 0.011))
        edge["albedo"] = BRASS
        bevelled(edge, 0.006)
        objs.append(edge)
    return objs


def build_portrait_bezel(frame_w, chamfer=0.014):
    """
    A brass surround for a painted face. ROUND, and the bore is exactly TWO
    THIRDS of the frame width in both sizes.

    That ratio is the deliverable as much as the geometry is: the art the
    engine puts behind this is the bezel's own quad scaled by 2/3 about the
    same centre, at either size, with no table to look up. Same trick as
    `build_bezel`'s 3/4 by 1/2, and the reason both sizes use one number is
    that a hero frame and an enemy frame that disagreed would need two.

    The opening is COUNTERSUNK — the cutter is wider at the top — so the inner
    edge presents a sloped face to the light rather than a vertical wall that
    is edge-on from above and therefore invisible.

    EVERY DIMENSION IS A FRACTION OF `frame_w`, which is what actually makes
    the two sizes one design rather than two. The first version mixed fractions
    with absolute offsets, and the consequence was not cosmetic: the bead and
    the bosses collided at one size and cleared at the other, so "move the
    bosses out a little" fixed the hero frame and broke the enemy one.
    """
    f = frame_w
    outer, bore, t = f * 0.94, f * (2.0 / 3.0), f * 0.052
    chamfer = f * 0.015
    body = cylinder(outer / 2.0, t, (0.0, 0.0, t / 2.0))
    bevelled(body, chamfer)
    # THE CUTTER HAS TO SPAN THE WHOLE BODY, and the first version did not — it
    # started at the body's mid-height, left a floor, and baked a solid brass
    # disc that would have hidden the face it exists to frame. It rendered
    # perfectly and the normal map even showed a convincing ring.
    #
    # What caught it was COVER: 69% of the frame, which is the area of the full
    # disc, where an annulus with a 2/3 bore is 34%. Worth remembering that the
    # cheapest check for "is there a hole" is how much of the frame is opaque.
    #
    # Spanning -0.05..0.10 with the taper set so the radius is exactly bore/2
    # at the BOTTOM face and bore/2 + 0.03 at the top: the limiting aperture
    # seen from above is therefore exactly `bore`, and the flare above it is
    # the countersink.
    cut(body, frustum(bore / 2.0 - f * 0.03, bore / 2.0 + f * 0.06, t * 3.0, (0.0, 0.0, t / 2.0)),
        "Bore")
    # A concentric cove bead, cut with a torus rather than stepped with a
    # second cylinder. It is what turns a flat washer into a moulding, and
    # cutting it means it survives whatever else lands on this face — the same
    # argument as the V-grooves, with a round bit instead of a chamfer bit.
    cut(body, ring(bore / 2.0 + f * 0.030, f * 0.014, (0.0, 0.0, t)), "Bead")
    lipped(body, f * 0.008)

    objs = [body]
    # Four bosses on the cardinals. They give the ring an orientation, which a
    # plain annulus does not have — and a frame with no top reads as a washer.
    for i in range(4):
        a = math.radians(90.0 * i)
        r = f * 0.420
        boss = cylinder(f * 0.030, t * 0.36, (r * math.cos(a), r * math.sin(a), t + t * 0.14),
                        verts=20)
        bevelled(boss, f * 0.005)
        objs.append(boss)
    return objs


def build_lantern_cradle(base=0.42, chamfer=0.016):
    """
    A housing the End Turn lantern sits down into.

    THE HARD PART IS THAT IT HAS TO WORK UNLIT. A cradle read only by the glow
    of the thing in it is a cradle that disappears the moment the lantern is
    dark, and the End Turn control is dark for most of a turn. So the form is
    carried by geometry that does not depend on the lantern at all: a timber
    base, a brass collar ring round the well, and two upright posts that break
    the silhouette whether or not anything is sitting between them.

    THE EARS ARE THE IDENTITY, and the first version got this wrong in a way
    only looking caught. It had two small round posts flanking a shallow dish,
    and in plan that reads as a dish with two nubs — a saucer, not a housing.
    Two things fixed it, both about the plan view specifically:

      THE SILHOUETTE MUST NOT BE A CIRCLE. Brass ears now run PAST the base
      disc, so the outline itself says "something clamps in here" before any
      shading is applied. A round object among round objects has no identity.

      THE WELL HAD TO GET DEEPER. At 0.06 into a 0.29 radius the AO fell off
      so gently it read as a DOME rather than a hole — convex and concave look
      the same when the gradient is soft enough. At 0.09 it has the hard dark
      ring `candle_socket` gets, which is what actually says "down into".

    Making the posts taller would have done nothing: this is a lying decal, so
    height is the one dimension the texture cannot show.
    """
    body = cylinder(base, 0.12, (0.0, 0.0, 0.06))
    bevelled(body, chamfer)
    cut(body, frustum(0.25, 0.33, 0.16, (0.0, 0.0, 0.11)), "Well")
    lipped(body, 0.008)

    collar = ring(0.295, 0.018, (0.0, 0.0, 0.118))
    collar["albedo"] = BRASS
    objs = [body, collar]
    for sx in (-1, 1):
        ear = box(0.15, 0.22, 0.045, (sx * 0.40, 0.0, 0.100))
        ear["albedo"] = BRASS
        bevelled(ear, 0.010)
        bolt = cylinder(0.032, 0.020, (sx * 0.40, 0.0, 0.128), verts=20)
        bolt["albedo"] = BRASS
        bevelled(bolt, 0.005)
        objs += [ear, bolt]
    return objs


def build_log_well(w=2.40, d=1.30, well=(2.00, 1.05), depth=0.055, chamfer=0.022):
    """
    The recessed panel the Chronicle text sits in. §1.2 keeps the TEXT in the
    DOM, so this is the well and never a texture with words in it.

    THE INTERIOR IS EMPTY AND STAYS EMPTY — the same rule as `build_button_plate`,
    and here it is load-bearing rather than tidy: the well is 2.00 x 1.05, which
    is exactly 0.80 by 0.75 of the frame, so the DOM box that carries the log is
    the panel's own rect scaled by those two numbers. Anything modelled inside
    it would end up behind running text.

    The grain runs the LONG way, as a board that size would be cut, and it is
    on the surround only.
    """
    body = box(w, d, 0.10, (0.0, 0.0, -0.05))
    bevelled(body, chamfer)
    cut(body, box(well[0], well[1], 0.14, (0.0, 0.0, 0.07 - depth)), "Well")
    route_ring(body, well[0], well[1], 0.032, (0.0, 0.0, 0.0), name="Mouth")
    grain(body, ((-0.62, 0.010), (0.58, 0.012), (1.02, 0.009)), "x", w * 1.2, 0.0)
    lipped(body, 0.010)

    objs = [body]
    header = box(w, 0.07, 0.020, (0.0, d / 2.0 - 0.055, 0.010))
    header["albedo"] = BRASS
    bevelled(header, 0.006)
    objs.append(header)
    for sx in (-1, 1):
        for sy in (-1, 1):
            bolt = cylinder(0.026, 0.016, (sx * (w / 2.0 - 0.055), sy * (d / 2.0 - 0.048), 0.008),
                            verts=16)
            bolt["albedo"] = BRASS
            bevelled(bolt, 0.005)
            objs.append(bolt)
    return objs


# The discard tray and the exhaust share a FOOTPRINT so they read as a pair,
# and share nothing else so they read as opposites. §19.1: exhaust "must read
# as somewhere cards do NOT return from... Distinguished by SILHOUETTE, not by
# a label."
CARD_SLOT = (0.64, 0.90)
PILE_BODY = (0.86, 1.12)


def build_pile_tray(chamfer=0.018):
    """
    The discard pile: a shallow timber tray with a card-shaped recess.

    Card-shaped literally — 0.64 by 0.90 is a 0.71 aspect, which is a playing
    card. A square recess would read as a coaster.

    The recess has a FLOOR. That is the entire difference from `exhaust_grate`,
    and it is deliberately the kind of difference you can see in a silhouette
    at a glance: cards you can get back sit on something.
    """
    body = box(PILE_BODY[0], PILE_BODY[1], 0.09, (0.0, 0.0, -0.045))
    bevelled(body, chamfer)
    cut(body, box(CARD_SLOT[0], CARD_SLOT[1], 0.12, (0.0, 0.0, 0.06 - 0.05)), "Slot")
    route_ring(body, CARD_SLOT[0], CARD_SLOT[1], 0.028, (0.0, 0.0, 0.0), name="Mouth")
    grain(body, ((-0.37, 0.009), (0.36, 0.011)), "y", PILE_BODY[1] * 1.2, 0.0)
    lipped(body, 0.009)

    objs = [body]
    for sx in (-1, 1):
        for sy in (-1, 1):
            bolt = cylinder(0.024, 0.014, (sx * 0.385, sy * 0.505, 0.007), verts=16)
            bolt["albedo"] = BRASS
            bevelled(bolt, 0.004)
            objs.append(bolt)
    return objs


def build_exhaust_grate(bars=3, chamfer=0.018):
    """
    Exhausted cards: the same footprint as the discard tray, and the opposite
    object.

    IT GOES ALL THE WAY THROUGH. The middle of this texture is transparent, so
    what shows is whatever is under the console — the same device
    `build_trap_hole` uses, and for the same reason: a painted black hole is a
    lid, an actual hole is a hole. That alone separates it from `pile_tray` in
    silhouette, before the bars.

    Then blackened iron bars across it, and a scorched sleeve lining the mouth.
    Cards do not come back from behind bars, and the soot says the exhaust is
    where things are burnt rather than merely stored.
    """
    w, d = PILE_BODY
    sw, sd = CARD_SLOT
    body = box(w, d, 0.09, (0.0, 0.0, -0.045))
    bevelled(body, chamfer)
    cut(body, box(sw, sd, 0.30, (0.0, 0.0, 0.0)), "Through")
    route_ring(body, sw, sd, 0.028, (0.0, 0.0, 0.0), name="Mouth")
    grain(body, ((-0.37, 0.009), (0.36, 0.011)), "y", d * 1.2, 0.0)
    lipped(body, 0.009)
    objs = [body]

    # The scorched sleeve: four thin uprights lining the opening, dropped below
    # the surface so they read as the inside of the slot rather than as a frame
    # drawn on top of it.
    for sx, sy, bw, bd in ((0, 1, sw, 0.022), (0, -1, sw, 0.022),
                           (1, 0, 0.022, sd), (-1, 0, 0.022, sd)):
        sleeve = box(bw, bd, 0.05, (sx * (sw / 2.0 - 0.011), sy * (sd / 2.0 - 0.011), -0.021))
        sleeve["albedo"] = CHARCOAL
        objs.append(sleeve)

    for i in range(bars):
        t = (i + 0.5) / bars - 0.5
        bar = box(sw + 0.04, 0.045, 0.032, (0.0, t * sd, -0.012))
        bar["albedo"] = CHARCOAL
        bevelled(bar, 0.007)
        objs.append(bar)
    return objs


def build_brass_strap(length=0.86, wide=0.20, chamfer=0.010):
    """
    A brass band across a timber seam, with a bolt at each end.

    RUNS ALONG X, and a strap for a seam running the other way is a second
    table row rather than the same texture turned. Flipping or transposing a
    sprite flips the sign of a normal channel with it, and nothing in the image
    looks wrong when that happens — the lighting simply comes from the wrong
    side. `build_board_corner` carries the same warning for the same reason.
    """
    band = box(length, wide, 0.030, (0.0, 0.0, 0.015))
    bevelled(band, chamfer)
    # Two beads along the length. They stop a strap reading as a strip of tape,
    # and they are cut as V so they survive whatever else lands on this face.
    for off in (-0.055, 0.055):
        vee(band, length * 1.2, 0.020, (0.0, off, 0.030), run="x", name=f"Bead{off}")
    objs = [band]
    for sx in (-1, 1):
        bolt = cylinder(0.028, 0.018, (sx * (length / 2.0 - 0.06), 0.0, 0.036), verts=20)
        bevelled(bolt, 0.005)
        objs.append(bolt)
    return objs


def build_board_corner(size=0.56, arm=0.17, sx=-1, sy=1, chamfer=0.014):
    """
    An L-shaped brass cap over a corner of the board.

    `sx`/`sy` pick WHICH corner, and the other three are one table row each —
    NOT a UV flip of this one. Mirroring a sprite negates the x component of
    every normal it carries, so a flipped corner cap lights from the wrong side
    while looking perfectly correct in a still. Baking four is cheap; debugging
    that is not.

    Defaults to `sx = -1, sy = +1`: world -X and +Y, which a plan render puts
    at the TOP-LEFT of the image and the board's FAR-LEFT corner.
    """
    plate = box(size, size, 0.045, (0.0, 0.0, 0.0225))
    bevelled(plate, chamfer)
    # Remove the inner quadrant, leaving two arms of width `arm`.
    keep = size / 2.0 - arm
    cut(plate, box(size, size, 0.12, (-sx * (size / 2.0 - keep), -sy * (size / 2.0 - keep), 0.0225)),
        "Inner")
    lipped(plate, 0.010)

    objs = [plate]
    # A bolt in the corner itself and one at each arm end, which is where a cap
    # would actually be fixed.
    for bx, by in ((sx * 0.20, sy * 0.20), (sx * 0.20, -sy * 0.19), (-sx * 0.19, sy * 0.20)):
        bolt = cylinder(0.030, 0.018, (bx, by, 0.052), verts=20)
        bevelled(bolt, 0.005)
        objs.append(bolt)
    return objs


# =========================================================================
# THE PHYSICAL CARD (§15's argument, applied to the thing in your hand)
# =========================================================================
#
# Paul: *"can we model the Actual Cards to they can bounce light?"*, then
# *"Physical card, Physical Borders, Needs to have some shiny aspects like the
# borders and the backs"*, then *"would it be possible to add Real holographic
# artwork"*, then *"maybe even just on specific parts of the art so excentuate
# them"*.
#
# FOUR PARTS, NOT ONE, AND THE RENDERER FORCES IT rather than taste choosing
# it. `Material.roughness` is per-MATERIAL, not per-pixel, so a single quad
# carrying matte stock AND a gilt border can only ever be one or the other.
# §19.1 already pays that price to make the console's brass catch the light; a
# card pays it twice, because it also needs a foil channel that is neither.
#
#     card_stock    the matte board: chamfered edge, linen tooth, a sunken art
#                   window, a debossed name panel and rules field, and a socket
#                   for the cost medallion. High roughness.
#     card_border   the gilt: frame moulding, corner braces, window bezel,
#                   panel beads, the cost medallion itself. Low roughness.
#     card_back     what a deck and a discard pile show for the whole game, so
#                   it earns real detail. Low roughness.
#     card_foil     the holographic layer, which is TWO channels in one bake —
#                   see below; it is the part with an argument in it.
#
# ALL FOUR SHARE ONE FRAME, which is `socket()`'s trick for the console's
# button plates promoted to a rule. The engine draws four quads at one rect, so
# they cannot drift apart, and moving a panel moves it in every layer at once.
#
# THE DIMENSIONS ARE MEASURED, NOT INVENTED, which is the whole reason the
# constants below are written as `U(33)` instead of as `0.25`. `battle.css`
# sizes a hand card at five breakpoints — 84x118, 132x185, 156x218, 164x230,
# 172x241 — and `backdrops.tsx CardBack` states the ratio outright:
# `height = round(width * 1.4)`. So the card is 1.0 x 1.4, the reference width
# is the 132 that two of those five breakpoints use, and every panel position
# here is that breakpoint's CSS box divided by 132. Invent the layout instead
# and the baked window does not sit where the DOM art sits.
#
# NO MARGIN, unlike a plinth. The table's rule is that free-standing shapes take
# MARGIN so Cycles' filter has somewhere to put the antialiased silhouette; a
# card is the other case. Its silhouette IS the frame — the straight edges
# coincide with it exactly and the rounded corners are interior — so a margin
# would only mean the engine has to draw the quad 4% larger than the card.
#
# BILLBOARD, and gotcha 3 is why that matters. A card faces the camera, so the
# render IS the camera's view of it: the geometry is built flat in XY where the
# panel arithmetic is legible, and `face_camera()` then stands the whole scene
# up into the plane the game's own tilt looks straight at. Bake it LYING
# instead and `buildVertexData` squashes by cos(tilt) a texture that was
# already squashed by cos(tilt) — and the green channel comes to mean the
# opposite of what `lighting.ts` reads out of it.
#
# -------------------------------------------------------------------------
# FOIL IS A RARITY SIGNAL, SO THERE IS A MASK PER TIER
# -------------------------------------------------------------------------
#
# Paul, on seeing the first version, which had one universal mask:
# *"that card agent isnt doing EVERY card in holographic shiny foil is it? we
# need to distinguish between rarer cards and common cards using that
# technique"*.
#
# He is right and the one-mask version was wrong on its own terms. A deck where
# everything shines says nothing; the shine only means anything against a
# baseline that does not have it. So a COMMON CARD GETS NO FOIL AT ALL — not a
# little, none — and the ladder climbs from there:
#
#     starter    nothing. The most ordinary card in the game.
#     common     nothing. This is the baseline the rest are read against.
#     uncommon   the cost medallion and the rarity pip. The smallest accent
#                that exists: two objects, both under 24px, so it registers
#                when the lantern sweeps past and not before.
#     rare       the border frame along its full run, plus the above.
#     star       the frame, the title panel and the corner flourishes.
#
# TWO THINGS ARE FOILED AT NO TIER, and they are omissions on purpose:
#
#   the art window bezel — because the per-card art foil composites INSIDE that
#     window, and a permanently foiled ring one pixel outside it would be a
#     second, brighter shine competing with the one that is supposed to be
#     drawing the eye to the creature.
#   the rules panel bead — a card's biggest block of DOM text sits in it.
#
# THE SHAPE NAMES ARE THE ENGINE'S RARITY STRINGS, so a renderer can look up
# `card_foil_${card.rarity}` with no mapping table and no branch — which is also
# why `starter` and `common` are emitted as all-black masks rather than as
# missing files. A missing file is a special case somebody has to remember.
#
# ONE EXCEPTION, FLAGGED RATHER THAN QUIETLY RESOLVED: `types.ts` says
# `CardRarity = 'starter' | 'common' | 'uncommon' | 'rare'`. There is no 'star'.
# `card_foil_star` is baked because the tier was asked for by name and the
# geometry costs nothing, but nothing can select it until that union gains a
# member. It is a mask waiting for a rarity, not a rarity waiting for a mask.
#
# -------------------------------------------------------------------------
# THE FOIL IS A MASK AND A GRATING, AND THEY ARE DIFFERENT KINDS OF THING
# -------------------------------------------------------------------------
#
# Real holo is view-angle-dependent iridescence: the hue sweeps as the card or
# the light moves. That is shader work. What a bake can hand a shader is the
# two things it multiplies, and each `card_foil_*` carries one in each pass.
#
#   THE MASK is the ALBEDO pass — white where the card is foil, black where it
#   is plain stock. It is DATA, so it renders under the Raw view transform like
#   the normal and the AO, which is gotcha 2 pointed the other way. sRGB does
#   not change pure white or pure black; it changes every ANTIALIASED EDGE
#   TEXEL, lifting a half-covered one from 128 to 188. On a mask made almost
#   entirely of thin gilt lines that is not a rounding error — it fattens every
#   line in the mask by roughly half a pixel. Hence `spec["mask"]`.
#
#   THE MASK IS FURNITURE ONLY, and the art window's interior is deliberately
#   BLACK. Which part of a particular creature is foiled is a per-card decision
#   that has to register with that painting pixel for pixel, so it is derived in
#   `tools/art/pipeline.mjs`, where the paintings actually are. Anything baked
#   into that rectangle here would be a second, fixed mask fighting the real
#   one — and it would win, because it is on top.
#
#   THE GRATING is the NORMAL pass, and it runs across the WHOLE face rather
#   than only under the mask — on EVERY tier, common and starter included. The
#   groove pattern is a property of the card STOCK, not of the foil, so it costs
#   nothing beside a black mask and it means a card promoted to a foil tier
#   already has the grooves that break the holo into bands.
#
#   The five normal passes are therefore the SAME IMAGE, and it was worth
#   checking rather than asserting — the first draft of this comment claimed
#   byte-identical and the hashes disagreed. Measured against `common`:
#
#       starter    max 0    mean 0.0000
#       uncommon   max 1    mean 0.0001
#       rare       max 7    mean 0.0013
#       star       max 7    mean 0.0015
#
#   Identical everywhere except a handful of texels on the outlines of the mask
#   pieces themselves, where the 0.0004 z offset lets the pixel filter resolve
#   either surface and Cycles' jitter sequence differs because the scene has a
#   different number of objects in it. Immaterial, but "byte-identical" would
#   have been a claim this file could not have backed up.
#
# WHY THE MASK CARRIES NO RELIEF AT ALL. Every piece of `card_foil` is a FLAT
# POLYGON — not a thin slab, not a bevelled one. A slab would put its own walls
# and chamfers into the normal pass, and that pass has exactly one job here: be
# a clean, uninterrupted grating. Give the mask geometry a bevel and the normal
# comes back carrying a faint ghost of the frame, which the shader reads as
# diffraction that changes direction at the edge of the gilt.
#
# THE PITCH IS THE ONE NUMBER THAT HAD TO BE MEASURED. A grating is what makes
# holo break into moving BANDS instead of glowing as one flat sheet, and the
# band spacing IS the groove pitch. Two failure modes bracket it, and the
# bracket was rendered rather than reasoned about:
#
#     node tools/art/blender/cards.mjs --pitch web/art-staging/materials/pitch
#
# bakes the foil at each candidate, box-filters it to a 132px-wide card, and
# reports how much of the grating's amplitude survived the trip:
#
#     pitch   rms 731px   rms 132px   kept   what it looks like
#     1.5 px    21.96        9.51      43%   gone. Well under Nyquist.
#     2.0 px    22.70       14.19      63%   the bands come out HORIZONTAL —
#                                            a beat against the pixel grid,
#                                            not the 21-degree grating at all
#     3.0 px    23.41       18.38      78%   right direction, faint beat left
#     4.0 px    23.77       20.17      85%   <- FOIL_PITCH_PX
#     6.0 px    24.11       21.82      90%   countable lines: corduroy
#     8.0 px    24.28       22.60      93%   stripes
#
# 4px is the finest pitch whose bands still run the way the grooves do. That is
# the criterion, and it is not the same as "keeps the most amplitude" — 8px
# keeps more and is plainly wrong. The two numbers bound the answer and the eye
# picks inside them; the visual is `_pitch.png`, written by the same command.
#
# What this argues against is the obvious instinct, which is to go as fine as a
# real hologram. A real grating is ~1000 lines/mm — four orders of magnitude
# below one screen pixel. Bake that and every texel gets an independent hue,
# which is not iridescence, it is noise; and because the shader sweeps it as the
# card moves, it is noise that CRAWLS.
#
# 4px is also therefore a FLOOR FOR THE WHOLE PROJECT, not a fact about foil.
# Nothing baked here can be finer than that and survive being drawn at the size
# it is drawn at, which is why `LINEN_PITCH` had to be moved UP to sit above it.
#
# The grooves run at 21 degrees off the card's horizontal, deliberately not at
# 0, 45 or 90: an axis-aligned grating beats against the pixel grid and a
# 45-degree one beats against its diagonal.

# --- measured off battle.css and backdrops.tsx ---------------------------
# `.hand-fan .playing-card` is 132x185 at two of its five breakpoints; that is
# the reference. Everything below is a CSS pixel at that size.
CARD_REF_PX = 132.0
CARD_W = 1.0
CARD_H = 1.4  # backdrops.tsx CardBack: height = round(width * 1.4)


def U(px):
    """A CSS pixel at the reference card width, in board units."""
    return px / CARD_REF_PX


CARD_H_PX = CARD_H * CARD_REF_PX  # 184.8; the CSS says 185, which is 1.4015
CARD_BOX = (0.0, 0.0, CARD_REF_PX, CARD_H_PX)

# `.playing-card { border-radius: 8px }`.
CARD_R_PX = 8.0
# The gilt band. `.playing-card`'s CSS border is 3px, which is what a DOM
# element can afford; a moulding needs two beads and the channel between them,
# and at 132px wide three features do not fit into three pixels.
FRAME_PX = 7.0

# The panels, as CSS boxes (left, top, width, height) at the 132px reference:
#   .card-name       margin 8px 14px 0 30px, +3px card border, +2px pad, +1px
#   .card-art-window margin 6px 14px 0, height 43% of the 179px content box
#   .card-type-line  margin 6px 14px 0
#   .card-text-plate margin 6px 14px 8px, flex:1
NAME_BOX = (33.0, 11.0, 82.0, 19.4)
ART_BOX = (17.0, 36.4, 98.0, 77.0)
TYPE_BOX = (17.0, 119.4, 98.0, 14.6)
RULES_BOX = (17.0, 140.0, 98.0, 34.0)
# `.card-cost` sits at (4, 4) so the gem overlaps the card's own border. A
# medallion needs board underneath it to be set INTO, so it comes in one pixel:
# at (5, 5) the socket's nearest corner is 3.8px from the card's edge, which is
# a web of stock rather than a breach of the silhouette.
COST_BOX = (5.0, 5.0, 22.0, 24.0)
# Corner braces, as the top-left pair; the other three corners are mirrors.
BRACE_BARS = ((1.25, 1.25, 20.0, 4.5), (1.25, 1.25, 4.5, 20.0))
# THE RARITY PIP, and its position is the only free choice on the whole card —
# so it was made by elimination rather than by taste. It has to be gilt (it is a
# foil target), it has to read at 132px, and it cannot sit under DOM text. That
# rules out the type line and the rules field outright. What is left is the strip
# between the name plate's right edge at x=115 and the frame's inner edge at
# x=125: exactly ten pixels, which is why the pip is ten pixels. A diamond, not
# another rounded rectangle, because at this size the SILHOUETTE is all the
# information there is and every other object on the card is a rounded rect.
RARITY_PIP_BOX = (115.0, 12.0, 10.0, 10.0)

# Depths. A card is 0.3mm of board, and modelling that literally would give the
# chamfer a quarter of a pixel to live in. The thickness is therefore
# exaggerated, which costs nothing: a billboard is seen face-on, so its
# thickness is invisible except through the chamfer it carries.
CARD_T = U(4.0)
CARD_CHAMFER = U(1.6)
ART_DEPTH = U(1.6)
ART_MOUTH = U(3.0)  # `.card-art-window { border: 3px groove }`, as a real V
PANEL_DEPTH = U(1.0)
PANEL_MOUTH = U(2.0)
COST_DEPTH_PX = 1.4
GILT_T = U(1.8)  # how proud the gilt stands off the board
GILT_CHAMFER = U(0.7)

# `.playing-card`'s own gradient top stop, #191720, and `--gold` #c9a227 from
# index.css — sRGB converted to linear, because `flat_material` emits linear and
# the albedo pass re-encodes on the way out.
CARD_STOCK = (0.0097, 0.0086, 0.0145)
CARD_INK = (0.030, 0.024, 0.055)  # the back's field: ink, not the front's board
GILT = (0.584, 0.361, 0.020)

# --- the two surface textures, as normal-map relief ----------------------
# Neither can be geometry. A linen tooth at 2.6px pitch cut as V-grooves is four
# hundred Booleans on one face, and gotcha 8's table says exactly what that
# produces: an AO pass full of detail and a normal map that is flat everywhere.
#
# `slope` is the tangent of the flank angle, which is what actually decides how
# far the normal tips. The amplitude follows from it and the pitch, because a
# triangle wave of period p and peak-to-peak height a has |dh/du| = 2a/p — so
# the shape below is stated in the units it is judged in.
FOIL_PITCH_PX = 4.0
FOIL_PITCH = U(FOIL_PITCH_PX)
FOIL_SLOPE = 0.213  # tan(12 degrees)
FOIL_ANGLE_DEG = 21.0
# Linen finish is a woven emboss, so it is a CROSS hatch — the exact opposite of
# `grain()`, on purpose. Grain says "plank" precisely by running one way; board
# says "board" by running both.
#
# COARSER THAN THE FOIL, and the first version had it the other way round at
# 2.6px. The brief for the foil is that its grating be the finest relief in the
# project, and 4px is the measured floor for ANY relief at true size — so a
# 2.6px linen was not "finer detail", it was the same aliasing the pitch sweep
# rejected, on a channel nobody was going to check. 4.4px keeps the foil the
# finest thing on the card by a margin that is real rather than nominal.
LINEN_PITCH = U(4.4)
LINEN_SLOPE = 0.06  # tan(3.4 degrees) — a tooth, not a corrugation
# The back's engine-turning: concentric rings crossed by spokes, which is what a
# rose engine actually cuts.
#
# AN ANGULAR WAVE HAS NO SINGLE PITCH, which is the trap in it. Its spacing is
# an ARC, so it is 2*pi*r/spokes and it shrinks to nothing at the centre: at 56
# spokes everything inside r = 36px was below the 4px floor, and the middle
# third of the back came back as a disc of noise that a moving light would make
# crawl. 32 spokes puts the floor at r = 20px, and `build_card_back`'s boss is
# sized to cover exactly that — the geometry hides the only part that cannot be
# sampled. The two numbers are therefore a pair; change one and check the other.
GUILLOCHE_PITCH = U(4.6)
GUILLOCHE_SLOPE = 0.16
GUILLOCHE_SPOKES = 32
GUILLOCHE_FLOOR_PX = GUILLOCHE_SPOKES * 4.0 / (2.0 * math.pi)  # 20.4


def wave(direction, pitch, slope, gate=None):
    """
    One set of parallel V-grooves as a relief spec.

    `direction` is the axis the grooves are cut ACROSS, so the grooves run
    perpendicular to it. `None` means radial and `"theta"` means angular; those
    two together are what makes a guilloche a guilloche rather than a bullseye.

    `gate` is (inner, outer) radii, and it exists for one reason: AN ANGULAR
    WAVE HAS NO SINGLE PITCH. Its spacing is an arc — 2*pi*r/spokes — so however
    well it is sampled at the rim it is below Nyquist near the centre, always,
    at every spoke count. Hiding that under a raised boss was tried and does not
    work: the boss's own chamfer is a pixel wide at true size, so it reads as
    nothing and the vortex shows straight through it. Fading the term out below
    a radius removes it instead of covering it, and what is left inside is the
    radial wave, whose pitch is the same everywhere by construction.
    """
    return (direction, pitch, slope * pitch / 2.0, gate)


LINEN = (wave((1.0, 0.0, 0.0), LINEN_PITCH, LINEN_SLOPE),
         wave((0.0, 1.0, 0.0), LINEN_PITCH, LINEN_SLOPE))
FOIL_GRATING = (wave((math.cos(math.radians(FOIL_ANGLE_DEG)),
                      math.sin(math.radians(FOIL_ANGLE_DEG)), 0.0),
                     FOIL_PITCH, FOIL_SLOPE),)
GUILLOCHE = (
    wave(None, GUILLOCHE_PITCH, GUILLOCHE_SLOPE),
    # A THIRD of the radial slope, not half again as much. The first version had
    # the spokes dominant and the back came out a hypnotic sunburst rather than
    # an engine-turned panel: on a real rose engine the rosette MODULATES the
    # rings, it does not replace them. Gated off inside the radius where its arc
    # spacing falls under the 4px floor, and faded in over the next half again
    # so the boundary is not itself a visible ring.
    wave("theta", 2.0 * math.pi / GUILLOCHE_SPOKES, GUILLOCHE_SLOPE * 0.34,
         gate=(U(GUILLOCHE_FLOOR_PX), U(GUILLOCHE_FLOOR_PX * 1.6))),
)


# -------------------------------------------------------------------------
# Outlines. A card is rounded rectangles all the way down, and none of them can
# be a bevelled cube.
# -------------------------------------------------------------------------


def rounded_rect(w, h, r, segments=6, centre=(0.0, 0.0)):
    """
    Counter-clockwise outline of a rounded rectangle in the XY plane.

    NOT a bevelled box, and the difference is not cosmetic. An 8px radius on a
    card 4px thick has the Bevel modifier's clamp eat it against the thickness,
    and what comes out is a rounded EDGE rather than a rounded CORNER. Building
    the outline makes the corner exact and leaves the modifier the one job it is
    good at, which is the chamfer.

    The arc CENTRES sit at (+-(w/2 - r), +-(h/2 - r)), which is what makes an
    inset copy line up point-for-point with this one: shrink w, h and r by the
    same amount and every arc centre stays where it was. That is why `poly_band`
    can bridge two outlines without matching anything up by hand.
    """
    cx, cy = centre
    r = max(1e-5, min(r, w / 2.0, h / 2.0))
    ax, ay = w / 2.0 - r, h / 2.0 - r
    pts = []
    for kx, ky, a0 in ((1, -1, -90.0), (1, 1, 0.0), (-1, 1, 90.0), (-1, -1, 180.0)):
        ccx, ccy = cx + kx * ax, cy + ky * ay
        for s in range(segments + 1):
            a = math.radians(a0 + 90.0 * s / segments)
            pts.append((ccx + r * math.cos(a), ccy + r * math.sin(a)))
    # DEDUPLICATE, and this is not defensive tidying — it is a real bug with a
    # measurement attached. When `r` reaches half the width the shape is a
    # CIRCLE, the straight runs vanish, and consecutive arcs then share their
    # endpoints exactly: one duplicate vertex at each of 0, 90, 180 and 270
    # degrees, and therefore a ZERO-LENGTH EDGE there. Bevel's clamp limits a
    # chamfer by its neighbours (gotcha 6's mechanism), and a neighbour of
    # length zero clamps it to zero — so the card back's boss came out with its
    # chamfer collapsed at exactly the four cardinal points and intact between
    # them. Measured on the boss's top edge, peak |dev| in the normal map:
    #
    #     at the apex (the duplicate)         43   <- probe landed here
    #     five pixels round the arc          100
    #
    # A defect that hides at three points out of four and shows at the fourth is
    # precisely the "looks detailed, lights wrongly" failure this file keeps
    # paying for. Culling by distance rather than by case also covers the
    # stadium shapes, where only two of the four collapse.
    out = []
    for p in pts:
        if not out or math.dist(p, out[-1]) > r * 1e-6:
            out.append(p)
    if len(out) > 1 and math.dist(out[0], out[-1]) <= r * 1e-6:
        out.pop()
    return out


def css_centre(css_box):
    """(left, top, w, h) in reference CSS pixels -> the card-local XY centre."""
    left, top, w, h = css_box
    return (U(left + w / 2.0) - CARD_W / 2.0, CARD_H / 2.0 - U(top + h / 2.0))


def css_rect(css_box, r=3.0, inset=0.0, segments=6):
    """A CSS box as a rounded outline, shrunk by `inset` CSS pixels all round."""
    left, top, w, h = css_box
    return rounded_rect(U(w - 2.0 * inset), U(h - 2.0 * inset), U(r - inset),
                        segments, css_centre(css_box))


def css_poly(pts_px):
    """
    An explicit CSS-space polygon -> card-local XY. Y IS DOWN IN CSS and up in
    Blender, which is the same flip `css_centre` performs and the same one the
    board's axes note makes for board y. Get it wrong and the cost medallion is
    mirrored top to bottom — and a keystone upside down still looks like a
    keystone, which is what makes it worth stating.
    """
    return [(U(x) - CARD_W / 2.0, CARD_H / 2.0 - U(y)) for x, y in pts_px]


def mirror_box(css_box, flip_x, flip_y):
    """A CSS box reflected into another quadrant of the card."""
    left, top, w, h = css_box
    if flip_x:
        left = CARD_REF_PX - left - w
    if flip_y:
        top = CARD_H_PX - top - h
    return (left, top, w, h)


def brace_boxes():
    """The eight bars of the four corner braces. Two bars, never an L-shaped
    n-gon: a concave face is the one case `recalc_face_normals` can get wrong,
    and a brace with an inverted normal reads as a hole in the gilt."""
    return [mirror_box(bar, fx, fy)
            for fx in (False, True) for fy in (False, True) for bar in BRACE_BARS]


def shield(css_box, inset=0.0):
    """
    `.card-cost`'s outline: `clip-path: polygon(0 0, 100% 0, 100% 62%, 50% 100%,
    0 62%)`. A keystone, taken from the CSS rather than drawn to taste, so the
    baked medallion and the DOM badge are the same object.

    `inset` shrinks it about the box centre, in CSS pixels. Exact for the four
    axis-aligned edges and approximate for the two raking ones, which at this
    size is an error of a hundredth of a pixel — and it is what lets the socket
    be the medallion plus a clearance instead of a second hand-drawn outline.
    """
    return _unit_poly(css_box, ((0.0, 0.0), (1.0, 0.0), (1.0, 0.62), (0.5, 1.0), (0.0, 0.62)),
                      inset)


def diamond(css_box, inset=0.0):
    """The rarity pip. See RARITY_PIP_BOX for why it is not a rounded rect."""
    return _unit_poly(css_box, ((0.5, 0.0), (1.0, 0.5), (0.5, 1.0), (0.0, 0.5)), inset)


def _unit_poly(css_box, unit, inset):
    """A polygon given in 0..1 box coordinates, placed and shrunk about the box
    centre. Shared so the medallion and the pip cannot drift apart in how they
    handle `inset` — the socket for each is the outline plus a clearance."""
    left, top, w, h = css_box
    cx, cy = left + w / 2.0, top + h / 2.0
    fx, fy = (w - 2.0 * inset) / w, (h - 2.0 * inset) / h
    return css_poly([(cx + (left + u * w - cx) * fx, cy + (top + v * h - cy) * fy)
                     for u, v in unit])


def _mesh_from(name, verts, faces, recalc=True):
    """
    Build a mesh vertex by vertex, because a card's outlines are not primitives.

    `recalc` IS OFF FOR OPEN GEOMETRY and that is not a detail.
    `recalc_face_normals` orients faces outward from a closed volume; handed a
    single flat polygon there is no outward, so it picks one — and a mask piece
    that picks -Z renders its BACK face at the camera, which Cycles then flips
    against the ray. The mask's normal pass would come back with the grating
    inverted inside the gilt and upright everywhere else. The open shapes here
    are wound counter-clockwise by construction, so they need no help.
    """
    import bmesh  # type: ignore  # Blender's bundled bmesh

    bm = bmesh.new()
    bv = [bm.verts.new(v) for v in verts]
    for f in faces:
        try:
            bm.faces.new([bv[i] for i in f])
        except ValueError:
            pass  # a duplicate face, which a degenerate outline can produce
    bm.faces.ensure_lookup_table()
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def poly_prism(profile, depth, z0, name="prism", top_profile=None):
    """
    A closed outline extruded along Z. `top_profile` makes it DRAFTED, which is
    `build_trap_hole`'s argument applied to a cutter: a vertical wall is exactly
    edge-on to a face-on camera and contributes zero pixels, so a pocket cut
    with a straight-sided cutter exists in the AO pass and nowhere else.
    """
    n = len(profile)
    top = top_profile if top_profile is not None else profile
    verts = [(x, y, z0) for x, y in profile] + [(x, y, z0 + depth) for x, y in top]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return _mesh_from(name, verts, faces)


def poly_band(outer, inner, depth, z0, name="band"):
    """
    A closed band — the frame moulding, a window bezel, a panel bead.

    BUILT, NOT BOOLEANED OUT OF A PLATE, and that is gotcha 6 taken seriously
    rather than worked around. A ring cut from a slab is a Boolean, and a
    Boolean's leftover slivers clamp away the chamfer of every edge sharing that
    face — including edges nowhere near the cut. A ring that was never anything
    else has clean topology, so `bevelled()` on it does exactly what it says and
    the moulding gets a real bead on both of its edges.
    """
    n = len(outer)
    verts = ([(x, y, z0) for x, y in outer] + [(x, y, z0 + depth) for x, y in outer]
             + [(x, y, z0) for x, y in inner] + [(x, y, z0 + depth) for x, y in inner])
    ob, ot, ib, it = 0, n, 2 * n, 3 * n
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((ob + i, ob + j, ot + j, ot + i))
        faces.append((ib + j, ib + i, it + i, it + j))
        faces.append((ot + i, ot + j, it + j, it + i))
        faces.append((ob + j, ob + i, ib + i, ib + j))
    return _mesh_from(name, verts, faces)


def poly_face(profile, z, name="face"):
    """
    A single flat polygon — the mask's unit of construction, and nothing else's.

    ZERO RELIEF IS THE POINT. `card_foil` renders a mask in its albedo and a
    grating in its normal, and the grating has to be uninterrupted; a mask piece
    with any thickness at all puts its own walls into the normal pass, and the
    shader reads those as diffraction that changes direction at the gilt.
    """
    return _mesh_from(name, [(x, y, z) for x, y in profile],
                      [tuple(range(len(profile)))], recalc=False)


def poly_band_face(outer, inner, z, name="band_face"):
    """A flat annulus. `poly_face` for the pieces of the mask that are rings."""
    n = len(outer)
    verts = [(x, y, z) for x, y in outer] + [(x, y, z) for x, y in inner]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return _mesh_from(name, verts, faces, recalc=False)


def face_camera(objs):
    """
    Stand the whole scene up into the plane the game's camera looks straight at.

    A card BILLBOARDS, so gotcha 3's third case applies: the render IS the
    camera's own view of it. The panels are laid out flat in XY, where the CSS
    arithmetic is legible and every helper above already works, and this rotates
    the result into the tilt plane afterwards.

    EVERY MESH IN THE SCENE, not just the ones the builder returned. A Boolean
    transforms its cutter by `target.matrix_world.inverted() @
    cutter.matrix_world`, so the two have to move together — rotate only the
    visible parts and every pocket is cut at 55 degrees through the card, which
    the AO pass would render beautifully.

    AND `matrix_world` IS STALE UNTIL THE VIEW LAYER IS UPDATED, which cost a
    bake. Setting `obj.rotation_euler` marks an object dirty; it does not
    recompute the matrix, and Blender only does that on the next depsgraph
    evaluation — which in a headless script is whenever it feels like it.
    Reading the matrix first therefore returns the IDENTITY, and `rot @ identity`
    quietly throws the rotation away. The symptom was four lugs meant to sit at
    45, 135, 225 and 315 degrees all stacked on top of each other at 0, which
    renders as ONE lug and looks like a builder that only ran once.
    """
    bpy.context.view_layer.update()
    rot = mathutils.Matrix.Rotation(math.radians(DEFAULT_TILT_DEG), 4, "X")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.matrix_world = rot @ obj.matrix_world
    return objs


# -------------------------------------------------------------------------
# The four parts
# -------------------------------------------------------------------------


def build_card_stock():
    """
    The board itself: matte, chamfered, carrying everything the gilt sits in.

    THE ORDER IS THE ONE GOTCHA 6 SPELLS OUT, and this shape is the worst case
    the file has seen for it — eleven Booleans share the front face, where four
    was enough to delete `build_button_plate`'s border and six to flatten
    `build_tray` entirely. So:

      1. `bevelled()` on the clean rounded slab. The perimeter chamfer is the
         card's most visible feature and it survives only if it is applied
         before anything at all is cut.
      2. the pockets, as Booleans.
      3. every mouth chamfer CUT AS GEOMETRY — `route_ring` for the rectangles,
         a drafted cutter for the keystone. A modifier can be clamped away; a
         45-degree V cut into the mesh cannot.

    There is no `lipped()` call anywhere below, and that is a decision rather
    than an omission: gotcha 8's table says that at this Boolean count it would
    contribute nothing while looking like it contributed something.

    THE PANEL INTERIORS ARE EMPTY AND STAY EMPTY — `build_button_plate`'s rule.
    The name, the type line, the rules text and the art are DOM or painted art;
    anything baked inside those rectangles is content the app cannot change,
    translate, resize or read aloud.
    """
    slab = poly_prism(rounded_rect(CARD_W, CARD_H, U(CARD_R_PX), segments=8),
                      CARD_T, -CARD_T / 2.0, name="card_stock")
    bevelled(slab, CARD_CHAMFER)
    top = CARD_T / 2.0

    def pocket(css_box, depth, mouth, label):
        _, _, w, h = css_box
        cx, cy = css_centre(css_box)
        cut(slab, box(U(w), U(h), 0.4, (cx, cy, top - depth + 0.2)), f"{label}Pocket")
        # Centred exactly on the pocket's perimeter, so its inner half is
        # already carved away and what is left is a 45-degree chamfer running
        # round the mouth — which is what a router leaves anyway. `build_tray`.
        route_ring(slab, U(w), U(h), mouth, (cx, cy, top), name=f"{label}Mouth")

    pocket(ART_BOX, ART_DEPTH, ART_MOUTH, "Art")
    pocket(NAME_BOX, PANEL_DEPTH, PANEL_MOUTH, "Name")
    pocket(RULES_BOX, PANEL_DEPTH, PANEL_MOUTH, "Rules")

    # The cost socket. DRAFTED rather than V-ringed, because `route_ring` only
    # knows how to run round a rectangle and this is a keystone. The cutter is
    # the medallion's outline plus a clearance at the bottom and the same
    # outline one depth larger at the top, so the wall it leaves is a 45-degree
    # chamfer by construction — `build_candle_socket`'s bore, at card scale.
    clear_px, over_px = 0.6, 1.0
    cut(slab,
        poly_prism(shield(COST_BOX, inset=-clear_px), U(COST_DEPTH_PX + over_px),
                   top - U(COST_DEPTH_PX), name="cost_cutter",
                   top_profile=shield(COST_BOX, inset=-(clear_px + COST_DEPTH_PX + over_px))),
        "CostSocket")
    return face_camera([slab])


def build_card_border():
    """
    The gilt: everything on a card that is meant to catch a moving light.

    ITS OWN TEXTURE, which is the hard constraint rather than a preference —
    `Material.roughness` is per material, so gilt and board cannot share a quad.
    §19.1 makes the same argument for the console's brass; this is that argument
    at card scale, where the two materials interleave far more finely.

    NOT ONE BOOLEAN IN THE WHOLE SHAPE. Every piece is a band or a prism that
    was built as that shape, so every `bevelled()` here survives intact. Gotcha
    6 and gotcha 8 are both about chamfers dying after a cut; the way to win
    that fight is to not have the cut.

    THE FRAME IS A MOULDING, NOT A LINE — two beads with a sunken channel
    between them. That is also the only way this shape gets any AO at all:
    gotcha 7 says there is no such thing as an invisible occluder, so a bead
    cannot borrow contact darkening from the board it will be drawn on top of,
    because that board is a different texture and simply is not here. It has to
    occlude itself, and a channel between two beads is what does that.
    """
    objs = []
    for i, (a, b) in enumerate(((0.0, 2.5), (4.5, FRAME_PX))):
        bead = poly_band(css_rect(CARD_BOX, r=CARD_R_PX, inset=a, segments=8),
                         css_rect(CARD_BOX, r=CARD_R_PX, inset=b, segments=8),
                         GILT_T, CARD_T / 2.0, name=f"frame_bead{i}")
        bevelled(bead, GILT_CHAMFER)
        objs.append(bead)
    channel = poly_band(css_rect(CARD_BOX, r=CARD_R_PX, inset=2.5, segments=8),
                        css_rect(CARD_BOX, r=CARD_R_PX, inset=4.5, segments=8),
                        GILT_T * 0.4, CARD_T / 2.0, name="frame_channel")
    bevelled(channel, GILT_CHAMFER * 0.5)
    objs.append(channel)

    for i, bar in enumerate(brace_boxes()):
        brace = poly_prism(css_rect(bar, r=1.4, segments=3), GILT_T * 1.35, CARD_T / 2.0,
                           name=f"brace{i}")
        bevelled(brace, GILT_CHAMFER)
        objs.append(brace)

    # The window bezel. `.card-art-window`'s CSS border is `3px groove`, i.e.
    # inset; as a physical part it is RAISED, because a gilt bezel sitting below
    # the board cannot catch a light the board is shading it from.
    bezel = poly_band(css_rect(ART_BOX, r=3.0, inset=-3.0), css_rect(ART_BOX, r=3.0),
                      GILT_T, CARD_T / 2.0 - ART_DEPTH * 0.15, name="art_bezel")
    bevelled(bezel, GILT_CHAMFER)
    objs.append(bezel)

    # Panel beads. Thin, and HOLLOW: `.card-name`, `.card-type-line` and
    # `.card-text-plate` all carry DOM text, so the bead runs round the field
    # and nothing at all crosses it.
    for css_box, name in ((NAME_BOX, "name_bead"), (TYPE_BOX, "type_bead"),
                          (RULES_BOX, "rules_bead")):
        bead = poly_band(css_rect(css_box, r=3.0, inset=-1.6), css_rect(css_box, r=3.0),
                         GILT_T * 0.8, CARD_T / 2.0 - PANEL_DEPTH * 0.2, name=name)
        bevelled(bead, GILT_CHAMFER * 0.7)
        objs.append(bead)

    # The cost medallion, seated in `build_card_stock`'s socket. Plate and
    # socket from one outline and one clearance, which is `build_button_plate`
    # and `build_button_recess` again: change COST_BOX and both move together.
    #
    # It stands PROUDER THAN THE CORNER BRACE it overlaps, which is the whole
    # reason the height is stated as a multiple of GILT_T rather than as a
    # number. A medallion pinned over the corner of a frame is a real object; a
    # medallion with a brace poking through it is a modelling error.
    coin = poly_prism(shield(COST_BOX), U(COST_DEPTH_PX) + GILT_T * 2.2,
                      CARD_T / 2.0 - U(COST_DEPTH_PX), name="cost_medallion")
    bevelled(coin, GILT_CHAMFER)
    objs.append(coin)
    rim = poly_band(shield(COST_BOX, inset=2.2), shield(COST_BOX, inset=4.0),
                    GILT_T * 0.7, CARD_T / 2.0 + GILT_T * 2.2, name="cost_rim")
    bevelled(rim, GILT_CHAMFER * 0.6)
    objs.append(rim)

    # The rarity pip. It exists because foil is a rarity signal (see the header)
    # and `uncommon` needs something to foil that is not the frame — a tier whose
    # only mark was the cost medallion would be indistinguishable from a common
    # card whose cost happened to catch the light.
    pip = poly_prism(diamond(RARITY_PIP_BOX), GILT_T * 1.5, CARD_T / 2.0, name="rarity_pip")
    bevelled(pip, GILT_CHAMFER)
    objs.append(pip)
    return face_camera(objs)


def build_card_back():
    """
    What a deck and a discard pile show for the entire game, which is the whole
    argument for detailing it: the FACE of a card is on screen while it is in
    your hand, and the back is on screen always.

    Shiny in one piece, unlike the front. A card back has no matte region to
    keep separate, so the per-material roughness constraint costs it nothing and
    it can be a single part with a gilt albedo on the raised pieces.

    THE ENGINE-TURNING IS RELIEF, NOT GEOMETRY. A guilloche is concentric rings
    crossed by spokes; cut as V-grooves that is several hundred Booleans on one
    face, and gotcha 8 says the result is a convincing AO pass over a flat
    normal map. It goes in the normal shader instead — see GUILLOCHE — and what
    stays as geometry is only what has to OCCLUDE: the border moulding, the
    medallion ring, and the boss at the centre.
    """
    slab = poly_prism(rounded_rect(CARD_W, CARD_H, U(CARD_R_PX), segments=8),
                      CARD_T, -CARD_T / 2.0, name="card_back")
    bevelled(slab, CARD_CHAMFER)
    objs = [slab]
    top = CARD_T / 2.0
    gilt = []

    for i, (a, b) in enumerate(((1.5, 4.0), (6.0, 8.0))):
        bead = poly_band(css_rect(CARD_BOX, r=CARD_R_PX, inset=a, segments=8),
                         css_rect(CARD_BOX, r=CARD_R_PX, inset=b, segments=8),
                         GILT_T, top, name=f"back_bead{i}")
        bevelled(bead, GILT_CHAMFER)
        gilt.append(bead)

    # The centre: a boss and a ring rather than a picture. The back has to read
    # at 132px across, and at that size a motif with interior detail turns to
    # noise while a strong concentric silhouette still reads as a device.
    #
    # THE BOSS IS SIZED BY THE GUILLOCHE, NOT BY TASTE. An angular wave's
    # spacing is an arc, so it collapses toward the centre; `GUILLOCHE_FLOOR_PX`
    # is the radius inside which 32 spokes fall below the 4px floor, and the
    # boss covers it. That is why this number is computed rather than typed: at
    # 56 spokes the floor was r = 36px and the middle third of the back was a
    # disc of aliased noise that a moving light would set crawling.
    boss_px = 2.0 * GUILLOCHE_FLOOR_PX  # 40.8 across
    ring_in, ring_out = boss_px + 12.0, boss_px + 22.0
    ring_band = poly_band(rounded_rect(U(ring_out), U(ring_out), U(ring_out / 2.0), segments=12),
                          rounded_rect(U(ring_in), U(ring_in), U(ring_in / 2.0), segments=12),
                          GILT_T * 1.4, top, name="back_ring")
    # CHAMFERS TWICE THE FRONT'S, because these have to compete with a guilloche
    # rather than with a flat field. A 0.7px chamfer is what the gilt on the
    # FACE wants — nothing else there is finer than a pixel. Here the same
    # chamfer sat under a rosette and simply was not found: the centre read as
    # aliased noise straight through a boss that was supposed to be covering it.
    bevelled(ring_band, GILT_CHAMFER * 2.0)
    gilt.append(ring_band)
    boss = poly_prism(rounded_rect(U(boss_px), U(boss_px), U(boss_px / 2.0), segments=12),
                      GILT_T * 2.2, top, name="back_boss")
    bevelled(boss, GILT_CHAMFER * 2.6)
    gilt.append(boss)
    # Four lugs bridging the ring outward, which is what stops the centre
    # reading as a button. Built along +X at the radius and then TURNED, not
    # placed at the angle and then turned again — that doubles the angle, and
    # four spokes at 90, 270, 450 and 630 degrees is two spokes.
    for i in range(4):
        a = math.radians(45.0 + 90.0 * i)
        lug = poly_prism(rounded_rect(U(18.0), U(4.5), U(2.2), segments=3,
                                      centre=(U(ring_out / 2.0), 0.0)),
                         GILT_T, top, name=f"back_lug{i}")
        lug.rotation_euler = (0.0, 0.0, a)
        bevelled(lug, GILT_CHAMFER * 0.8)
        gilt.append(lug)

    for obj in gilt:
        obj["albedo"] = GILT
    return face_camera(objs + gilt)


# Which gilt each rarity foils. CUMULATIVE ON PURPOSE — a ladder whose rungs do
# not contain each other is not a ladder, it is four unrelated treatments, and
# a player cannot read "more" off it at a glance.
#
# `bezel` and `rules` appear in no tier. See the header: the art window's bezel
# is left plain so it does not compete with the per-card art foil that lands
# inside it, and the rules bead surrounds the card's largest block of DOM text.
FOIL_TIERS = {
    "starter": (),
    "common": (),
    "uncommon": ("cost", "pip"),
    "rare": ("frame", "cost", "pip"),
    "star": ("frame", "braces", "name", "cost", "pip"),
}


def build_card_foil(tier):
    """
    THE HOLOGRAPHIC LAYER for one rarity, which is two different things sharing
    one bake.

    ALBEDO IS THE MASK: white where this rarity's card is foil, black where it
    is plain stock, and the shader keys the entire effect off it. FLAT POLYGONS
    ONLY — see `poly_face`. Nothing here has thickness, a bevel, or an AO story.

    NORMAL IS THE GRATING, and it covers the WHOLE card on EVERY tier —
    including the two whose mask is entirely black. The grooves belong to the
    card STOCK rather than to the foil, so they cost nothing next to a black
    mask, and a card promoted to a foil tier already has them.

    THE ART WINDOW IS BLACK AT EVERY TIER. Which part of a given creature is
    foiled has to line up with that creature's painting pixel for pixel, so it
    is derived per painting in `tools/art/pipeline.mjs`. A fixed mask baked into
    that rectangle would not merely be useless — it would fight the real one and
    win, because it is on top.

    EVERY WHITE PIECE IS THE FOOTPRINT OF A PIECE OF `build_card_border`, from
    the same constants and the same helper calls, so a mask cannot drift out of
    register with the thing it is masking. There is no second table of outlines.
    """
    parts = FOIL_TIERS[tier]
    plate = poly_face(rounded_rect(CARD_W, CARD_H, U(CARD_R_PX), segments=8), 0.0,
                      name="foil_plate")
    plate["albedo"] = (0.0, 0.0, 0.0)
    objs = [plate]
    z = 0.0004  # far enough to win the depth test, near enough to stay coplanar

    def white(obj):
        obj["albedo"] = (1.0, 1.0, 1.0)
        objs.append(obj)
        return obj

    if "frame" in parts:
        white(poly_band_face(css_rect(CARD_BOX, r=CARD_R_PX, segments=8),
                             css_rect(CARD_BOX, r=CARD_R_PX, inset=FRAME_PX, segments=8),
                             z, name="foil_frame"))
    if "braces" in parts:
        for i, bar in enumerate(brace_boxes()):
            white(poly_face(css_rect(bar, r=1.4, segments=3), z, name=f"foil_brace{i}"))
    if "name" in parts:
        white(poly_band_face(css_rect(NAME_BOX, r=3.0, inset=-1.6), css_rect(NAME_BOX, r=3.0),
                             z, name="foil_name"))
    if "cost" in parts:
        white(poly_face(shield(COST_BOX), z, name="foil_cost"))
    if "pip" in parts:
        white(poly_face(diamond(RARITY_PIP_BOX), z, name="foil_pip"))
    return face_camera(objs)


def shape(build, width, height, view=VIEW_LYING, ao=0.30, colour=STONE, centre=None, **extra):
    """
    One row of the table below. Everything a bake needs and nothing else.

    `**extra` carries the two flags only the card shapes set so far — `bump`
    (surface texture too fine to be geometry) and `mask` (the albedo pass is
    data, so it renders Raw). They are kwargs rather than positional defaults
    because twenty-nine shapes do not have them and should not have to say so.
    """
    spec = {
        "build": build,
        "width": width,
        "height": height,
        "view": view,
        "ao": ao,
        "colour": colour,
        "centre": centre,
    }
    spec.update(extra)
    return spec


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

    # --- what the flame is mounted in (§18.1) ----------------------------
    # FREE-STANDING, so they carry MARGIN: the engine sizes a fitting by its
    # own quad rather than by the tile. The mouth of each wall fitting is at
    # 0.90 of the frame height — see `MOUTH`.
    "sconce_bracket": shape(
        build_sconce_bracket, width=0.18, height=0.40, view=VIEW_UPRIGHT, ao=0.09, colour=IRON,
    ),
    "torch_bracket": shape(
        build_torch_bracket, width=0.22, height=0.50, view=VIEW_UPRIGHT, ao=0.11, colour=IRON,
    ),
    "wall_plate": shape(
        build_wall_plate, width=0.32, height=0.40, view=VIEW_UPRIGHT, ao=0.08, colour=IRON,
    ),
    # LYING, not upright: a brazier stands ON the board like a plinth, and the
    # engine squashes it. Baking it in elevation would be gotcha 3 again.
    "brazier": shape(build_brazier, width=0.94, height=0.94, ao=0.22, colour=IRON),

    # --- the player console (§19) ----------------------------------------
    # The body tiles along a run: exact width, no margin, geometry overscanning
    # sideways. Everything else is dropped onto it.
    "console_body": shape(
        build_console_body, width=4.0, height=1.36, ao=0.20, colour=WOOD_FRAME,
    ),
    # Plate and socket SHARE A FRAME so the engine can draw both quads at one
    # rect. Change `BUTTON_SURROUND` or a size and both move together.
    "button_plate_small": shape(
        lambda: build_button_plate(BTN_SMALL, ring_groove=False),
        width=socket(BTN_SMALL)[0], height=socket(BTN_SMALL)[1], ao=0.10, colour=BRASS,
    ),
    "button_recess_small": shape(
        lambda: build_button_recess(BTN_SMALL),
        width=socket(BTN_SMALL)[0], height=socket(BTN_SMALL)[1], ao=0.10, colour=WOOD_FRAME,
    ),
    "button_plate": shape(
        lambda: build_button_plate(BTN),
        width=socket(BTN)[0], height=socket(BTN)[1], ao=0.10, colour=BRASS,
    ),
    "button_recess": shape(
        lambda: build_button_recess(BTN),
        width=socket(BTN)[0], height=socket(BTN)[1], ao=0.10, colour=WOOD_FRAME,
    ),
    "button_plate_wide": shape(
        lambda: build_button_plate(BTN_WIDE),
        width=socket(BTN_WIDE)[0], height=socket(BTN_WIDE)[1], ao=0.10, colour=BRASS,
    ),
    "button_recess_wide": shape(
        lambda: build_button_recess(BTN_WIDE),
        width=socket(BTN_WIDE)[0], height=socket(BTN_WIDE)[1], ao=0.10, colour=WOOD_FRAME,
    ),
    "tray": shape(build_tray, width=1.86, height=0.96, ao=0.16, colour=WOOD_FRAME),
    "bezel": shape(build_bezel, width=1.36, height=0.64, ao=0.10, colour=BRASS),

    # --- the player board's fittings (§19.1) ------------------------------
    # Every one of these is its own texture on purpose: §19.1 defers wear but
    # requires it be authorable per fitting later — wax in the sockets, scuff
    # in the discard tray, scorch at the exhaust — which a merged shell could
    # not carry.
    #
    # The socket is the priority: §19.1's diagnosis is that the candles look
    # wrong because nothing holds them. FREE-STANDING, so it takes MARGIN.
    "candle_socket": shape(build_candle_socket, width=0.50, height=0.50, ao=0.11, colour=BRASS),
    # The rail TILES ALONG ITS HEIGHT — board y — so the height is exact and the
    # width carries the margin. See the builder for why it is not baked
    # running along x and turned.
    "candle_rail_strip": shape(
        build_candle_rail, width=0.56, height=2.0, ao=0.14, colour=WOOD_FRAME,
    ),

    # Bore is 2/3 of the frame in both sizes, so the art behind either is the
    # bezel's own quad scaled by 2/3.
    "portrait_bezel": shape(
        lambda: build_portrait_bezel(0.96), width=0.96, height=0.96, ao=0.14, colour=BRASS,
    ),
    "portrait_bezel_small": shape(
        lambda: build_portrait_bezel(0.66), width=0.66, height=0.66, ao=0.10, colour=BRASS,
    ),

    # Wider than tall: the brass ears run past the base disc on the x axis,
    # which is the whole point of them.
    "lantern_cradle": shape(build_lantern_cradle, width=1.00, height=0.90, ao=0.16, colour=WOOD_FRAME),
    "log_well": shape(build_log_well, width=2.50, height=1.40, ao=0.18, colour=WOOD_FRAME),

    # Same footprint, opposite objects — one has a floor, one goes through.
    "pile_tray": shape(build_pile_tray, width=0.96, height=1.22, ao=0.13, colour=WOOD_FRAME),
    "exhaust_grate": shape(build_exhaust_grate, width=0.96, height=1.22, ao=0.13, colour=WOOD_FRAME),

    # --- the physical card (see THE PHYSICAL CARD, above) -----------------
    # Four layers at ONE frame, so the engine draws four quads at one rect and
    # they cannot drift. No margin: a card's silhouette IS its frame.
    #
    # BILLBOARD, all four. A card turns to face the camera, so the render is the
    # camera's view of it — gotcha 3's third case, and the first shapes in this
    # file to use it. `face_camera()` in each builder is what makes it true.
    #
    # The AO distances are an order of magnitude below the rest of the table
    # because the relief is: a card's deepest feature is 1.6px of art window,
    # where a wall block's is most of a tile. Leave AO at 0.30 here and every
    # surface reads as occluded by every other one.
    "card_stock": shape(
        build_card_stock, width=CARD_W, height=CARD_H, view=VIEW_BILLBOARD,
        ao=0.05, colour=CARD_STOCK, bump=LINEN,
    ),
    "card_border": shape(
        build_card_border, width=CARD_W, height=CARD_H, view=VIEW_BILLBOARD,
        ao=0.04, colour=GILT,
    ),
    "card_back": shape(
        build_card_back, width=CARD_W, height=CARD_H, view=VIEW_BILLBOARD,
        ao=0.05, colour=CARD_INK, bump=GUILLOCHE,
    ),
    # ONE MASK PER RARITY, named after the engine's own `CardRarity` strings so
    # the lookup is `card_foil_${card.rarity}` with no mapping table. `starter`
    # and `common` are emitted as ALL-BLACK masks rather than omitted, because a
    # missing file is a special case somebody has to remember; a black mask is
    # the same code path returning nothing.
    #
    # Albedo is data (`mask=True`); the normal is the grating and is identical
    # across all five by construction; the AO is a flat plate and unused.
    **{
        f"card_foil_{tier}": shape(
            (lambda t: lambda: build_card_foil(t))(tier),
            width=CARD_W, height=CARD_H, view=VIEW_BILLBOARD,
            ao=0.02, colour=(0.0, 0.0, 0.0), bump=FOIL_GRATING, mask=True,
        )
        for tier in FOIL_TIERS
    },

    "brass_strap": shape(build_brass_strap, width=0.90, height=0.26, ao=0.08, colour=BRASS),
    # The far-left corner. The other three are a row each — never a UV flip.
    "board_corner_brass": shape(build_board_corner, width=0.60, height=0.60, ao=0.12, colour=BRASS),
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
