"""Proof renders for the house diorama GLB.

  (a) exterior isometric — azimuth 45, elevation ~30, ORTHOGRAPHIC
  (b) interior — perspective 55 deg FOV from the InteriorCam empty
      aimed at the InteriorTarget empty (looking out through the sliders)
  (c) bonus left iso for art-direction judging

Renders FROM THE EXPORTED GLB (validates the artifact, incl. empties).
Glass gets a render-only alpha so transparency is judgeable in EEVEE.
"""
import bpy
import math
import os
import sys
from mathutils import Vector

GLB = "/Users/ebonyjohnson/ztark-tint-visualizer/modeling/out/house_iso/car.glb"
OUT = "/Users/ebonyjohnson/ztark-tint-visualizer/modeling/out/house_iso/proofs"

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if argv:
    GLB = argv[0]
if len(argv) > 1:
    OUT = argv[1]
os.makedirs(OUT, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=GLB)

scene = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try:
        scene.render.engine = eng
        break
    except Exception:
        continue
print("ENGINE:", scene.render.engine)

# ---- verify contract objects survived the GLB round-trip
names = {o.name for o in scene.objects}
glass_meshes = [o for o in scene.objects
                if o.type == 'MESH' and o.name.startswith("Glass_")]
print("GLASS MESHES:", len(glass_meshes))
print("HAS InteriorCam:", "InteriorCam" in names,
      " HAS InteriorTarget:", "InteriorTarget" in names)
bad = [o.name for o in scene.objects
       if ("glass" in o.name.lower() or "window" in o.name.lower())
       and not o.name.startswith("Glass_")]
print("BAD NAMES:", bad)

# ---- render-only glass alpha so we can see through panes in EEVEE
for mat in bpy.data.materials:
    if "Building_Glass" in mat.name and mat.use_nodes:
        b = mat.node_tree.nodes.get("Principled BSDF")
        if b:
            b.inputs["Alpha"].default_value = 0.18
            for k in ("Transmission Weight", "Transmission"):
                if k in b.inputs:
                    b.inputs[k].default_value = 0.0
                    break
        for attr, val in (("blend_method", 'BLEND'),
                          ("surface_render_method", 'BLENDED')):
            try:
                setattr(mat, attr, val)
            except Exception:
                pass
        try:
            mat.show_transparent_back = False
        except Exception:
            pass

# ---- lighting
world = bpy.data.worlds[0] if bpy.data.worlds else bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.72, 0.80, 0.92, 1.0)
bg.inputs[1].default_value = 0.6

try:
    scene.view_settings.view_transform = 'Standard'
except Exception:
    pass
scene.view_settings.exposure = 0.0

sun = bpy.data.lights.new("Sun", type='SUN')
sun.energy = 5.0
sun.angle = math.radians(4)
so = bpy.data.objects.new("Sun", sun)
so.rotation_euler = (math.radians(45), 0, math.radians(45))
bpy.context.collection.objects.link(so)

fill = bpy.data.lights.new("FillArea", type='AREA')
fill.energy = 900
fill.size = 14
fo = bpy.data.objects.new("FillArea", fill)
fo.location = (-9, -9, 12)
fo.rotation_euler = (math.radians(35), 0, math.radians(-45))
bpy.context.collection.objects.link(fo)

# proof-only interior bounce light (living room)
ia = bpy.data.lights.new("IntArea", type='AREA')
ia.energy = 120
ia.size = 4.5
io_ = bpy.data.objects.new("IntArea", ia)
io_.location = (-4.0, 3.5, 3.1)
bpy.context.collection.objects.link(io_)
ia2 = bpy.data.lights.new("IntArea2", type='AREA')
ia2.energy = 60
ia2.size = 3.0
io2 = bpy.data.objects.new("IntArea2", ia2)
io2.location = (4.0, 0.5, 2.5)
bpy.context.collection.objects.link(io2)

try:
    scene.eevee.use_gtao = True
except Exception:
    pass

# ---- scene bbox (meshes only)
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
print("BBOX min", tuple(round(v, 2) for v in mins),
      "max", tuple(round(v, 2) for v in maxs))

cam = bpy.data.cameras.new("ProofCam")
co = bpy.data.objects.new("ProofCam", cam)
bpy.context.collection.objects.link(co)
scene.camera = co


def aim(pos, target):
    co.location = Vector(pos)
    d = Vector(target) - Vector(pos)
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def fit_ortho(margin=1.06):
    """Set ortho_scale so the whole mesh bbox fits the view."""
    inv = co.matrix_world.inverted()
    xs, ys = [], []
    for corner in ((mins.x, mins.y, mins.z), (maxs.x, mins.y, mins.z),
                   (mins.x, maxs.y, mins.z), (mins.x, mins.y, maxs.z),
                   (maxs.x, maxs.y, mins.z), (maxs.x, mins.y, maxs.z),
                   (mins.x, maxs.y, maxs.z), (maxs.x, maxs.y, maxs.z)):
        p = inv @ Vector(corner)
        xs.append(p.x)
        ys.append(p.y)
    w = 2 * max(abs(min(xs)), abs(max(xs)))
    h = 2 * max(abs(min(ys)), abs(max(ys)))
    aspect = scene.render.resolution_x / scene.render.resolution_y
    cam.ortho_scale = max(w, h * aspect) * margin


def shot(path):
    scene.render.filepath = os.path.join(OUT, path)
    bpy.ops.render.render(write_still=True)
    print("WROTE", path)


# (a) exterior isometric, azimuth 45, elevation 30, orthographic
scene.render.resolution_x = 1500
scene.render.resolution_y = 1060
cam.type = 'ORTHO'
cam.clip_end = 500
el, az, d = math.radians(30), math.radians(45), 70.0
offs = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el),
               math.sin(el))) * d
aim(ctr + offs, ctr)
fit_ortho()
shot("exterior_iso.png")

# (c) left iso for judging
offs2 = Vector((-math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el),
                math.sin(el))) * d
aim(ctr + offs2, ctr)
fit_ortho()
shot("exterior_iso_left.png")

# (b) interior from the InteriorCam empty toward InteriorTarget
icam = bpy.data.objects.get("InteriorCam")
itgt = bpy.data.objects.get("InteriorTarget")
if icam and itgt:
    scene.render.resolution_x = 1240
    scene.render.resolution_y = 930
    cam.type = 'PERSP'
    cam.sensor_fit = 'AUTO'
    cam.angle = math.radians(55)
    cam.clip_start = 0.05
    aim(icam.matrix_world.translation, itgt.matrix_world.translation)
    shot("interior.png")
else:
    print("ERROR: interior anchors missing from GLB")
