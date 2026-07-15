"""Proof renders for the office diorama.

Imports the exported GLB (so this doubles as a round-trip check that the
InteriorCam / InteriorTarget empties and Glass_ meshes survive export), then:
  (a) exterior isometric: azimuth 45deg, elevation ~30deg, ORTHOGRAPHIC
  (b) interior: perspective 55deg FOV from InteriorCam toward InteriorTarget
  (c) entry perspective (art-direction extra)
Glass gets a render-only alpha-blend tweak so transparency reads in EEVEE.
"""
import bpy
import math
import os
import sys

from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.join(OUT, "car.glb")

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB)

scene = bpy.context.scene

# ---- round-trip verification -------------------------------------------
names = [o.name for o in scene.objects]
glass = [n for n in names if n.startswith("Glass_")]
empt = [o.name for o in scene.objects if o.type == 'EMPTY']
bad = [n for n in names if not n.startswith("Glass_")
       and ("glass" in n.lower() or "window" in n.lower())]
badm = [m.name for m in bpy.data.materials
        if m.name != "Building_Glass"
        and ("glass" in m.name.lower() or "window" in m.name.lower())]
print("CHECK glass meshes:", len(glass))
print("CHECK empties:", empt)
print("CHECK bad names:", bad, badm)
print("CHECK materials:", sorted({m.name.split('.')[0] for m in bpy.data.materials}))

# ---- engine -------------------------------------------------------------
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try:
        scene.render.engine = eng
        break
    except Exception:
        continue
print("ENGINE:", scene.render.engine)
try:
    scene.eevee.use_raytracing = True
except Exception:
    pass

# ---- render-only glass tweak (alpha blend reads reliably in EEVEE) ------
for m in bpy.data.materials:
    if m.name.startswith("Building_Glass"):
        b = m.node_tree.nodes.get("Principled BSDF")
        if b:
            for k in ("Transmission Weight", "Transmission"):
                if k in b.inputs:
                    b.inputs[k].default_value = 0.0
            b.inputs["Base Color"].default_value = (0.55, 0.70, 0.76, 1.0)
            b.inputs["Alpha"].default_value = 0.18
            b.inputs["Roughness"].default_value = 0.05
        m.blend_method = 'BLEND'
        if hasattr(m, "show_transparent_back"):
            m.show_transparent_back = False
for o in scene.objects:
    if o.name.startswith("Glass_"):
        o.visible_shadow = False

# truer colors for proofing (viewer does its own tone mapping)
try:
    scene.view_settings.view_transform = 'Standard'
except Exception:
    pass

# punch up pendant emission for the proofs only
em = bpy.data.materials.get("Pendant_Emit")
if em:
    b = em.node_tree.nodes.get("Principled BSDF")
    if b and "Emission Strength" in b.inputs:
        b.inputs["Emission Strength"].default_value = 6.0

# ---- world + sun ---------------------------------------------------------
world = bpy.data.worlds[0] if bpy.data.worlds else bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.80, 0.85, 0.92, 1.0)
bg.inputs[1].default_value = 0.55

sun = bpy.data.lights.new("Sun", type='SUN')
sun.energy = 3.6
sun.angle = math.radians(4)
so = bpy.data.objects.new("Sun", sun)
so.rotation_euler = (math.radians(48), 0, math.radians(135))  # from +X+Y
bpy.context.collection.objects.link(so)

fill = bpy.data.lights.new("Fill", type='SUN')
fill.energy = 0.9
fill.angle = math.radians(30)
fo = bpy.data.objects.new("Fill", fill)
fo.rotation_euler = (math.radians(60), 0, math.radians(-60))
bpy.context.collection.objects.link(fo)

# ---- bbox ---------------------------------------------------------------
mins = Vector((1e9,) * 3)
maxs = Vector((-1e9,) * 3)
for o in scene.objects:
    if o.type != 'MESH':
        continue
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mins = Vector(map(min, mins, w))
        maxs = Vector(map(max, maxs, w))
ctr = (mins + maxs) / 2
print("BBOX", tuple(round(v, 2) for v in mins), tuple(round(v, 2) for v in maxs))

cam = bpy.data.cameras.new("Cam")
co = bpy.data.objects.new("Cam", cam)
bpy.context.collection.objects.link(co)
scene.camera = co


def aim(pos, tgt):
    co.location = pos
    d = Vector(tgt) - Vector(pos)
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def shot(name, rx, ry):
    scene.render.resolution_x = rx
    scene.render.resolution_y = ry
    scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("SHOT", name)


# (a) exterior isometric, orthographic, azimuth 45 elev 30
cam.type = 'ORTHO'
az, el, dist = math.radians(45), math.radians(30), 80.0
off = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el),
              math.sin(el))) * dist
aim(ctr + off, ctr)
# fit ortho scale: project bbox corners onto camera right/up
inv = co.matrix_world.inverted() if False else None
q = (Vector(ctr) - (ctr + off)).to_track_quat('-Z', 'Y')
right = q @ Vector((1, 0, 0))
up = q @ Vector((0, 1, 0))
ext_r = ext_u = 0.0
for cx in (mins.x, maxs.x):
    for cy in (mins.y, maxs.y):
        for cz in (mins.z, maxs.z):
            v = Vector((cx, cy, cz)) - ctr
            ext_r = max(ext_r, abs(v.dot(right)))
            ext_u = max(ext_u, abs(v.dot(up)))
aspect = 1200.0 / 900.0
cam.ortho_scale = max(ext_r * 2, ext_u * 2 * aspect) * 1.08
print("ORTHO SCALE", round(cam.ortho_scale, 2))
shot("proof_exterior_iso", 1200, 900)

# (b) interior from the InteriorCam empty toward InteriorTarget
bg.inputs[0].default_value = (0.55, 0.70, 0.90, 1.0)   # bluer sky out the pane
bg.inputs[1].default_value = 0.9
icam = scene.objects.get("InteriorCam")
itgt = scene.objects.get("InteriorTarget")
assert icam is not None and itgt is not None, "interior empties missing!"
cam.type = 'PERSP'
cam.angle = math.radians(55)
ic = icam.matrix_world.translation
aim(ic, itgt.matrix_world.translation)
cam.clip_start = 0.05
# soft interior fill so the room reads against the bright exterior
ia = bpy.data.lights.new("IntFill", type='AREA')
ia.energy = 320
ia.size = 5.0
io = bpy.data.objects.new("IntFill", ia)
io.location = (ic.x, ic.y - 2.0, ic.z + 1.5)
io.rotation_euler = (math.radians(15), 0, 0)
bpy.context.collection.objects.link(io)
shot("proof_interior", 1100, 780)
io.hide_render = True

# (c) entry perspective, eye level from the front yard
cam.angle = math.radians(50)
aim((4.5, 12.0, 2.0), (-2.0, 2.0, 4.5))
shot("proof_entry", 1100, 780)

print("PROOF DONE")
