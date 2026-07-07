"""Render a downloaded glTF/GLB candidate model in the standard judging studio.

Usage:
  Blender --background --python modeling/render_candidate.py -- \
      --model /path/to/model.glb --out /path/to/outdir

Outputs side.png / front34.png / rear34.png sized+centered like the harness,
plus a stats line (mesh count, tri count, materials, glass-ish mesh names).
"""
import bpy
import math
import os
import sys

from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"model": None, "out": "modeling/out/candidate"}
    i = 0
    while i < len(argv):
        if argv[i] == "--model":
            out["model"] = argv[i + 1]; i += 2
        elif argv[i] == "--out":
            out["out"] = argv[i + 1]; i += 2
        else:
            i += 1
    return out


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def studio():
    world = bpy.data.worlds["World"] if bpy.data.worlds else bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.92, 0.93, 0.95, 1.0)
    bg.inputs[1].default_value = 0.55
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "Studio_Floor"
    fm = bpy.data.materials.new("Studio_FloorMat")
    fm.use_nodes = True
    fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.94, 0.945, 0.95, 1)
    fm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    floor.data.materials.append(fm)
    for name, energy, size, loc, rot in (
        ("Studio_Key", 2600, 7, (3.5, -4.5, 6.0), (38, 0, 30)),
        ("Studio_Fill", 1100, 9, (-5.0, 4.0, 4.5), (48, 0, -125)),
    ):
        light = bpy.data.lights.new(name, type="AREA")
        light.energy = energy
        light.size = size
        lo = bpy.data.objects.new(name, light)
        lo.location = loc
        lo.rotation_euler = tuple(math.radians(a) for a in rot)
        bpy.context.collection.objects.link(lo)


def import_model(path):
    before = set(bpy.context.scene.objects)
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    else:
        raise RuntimeError("unsupported: " + ext)
    return [o for o in bpy.context.scene.objects if o not in before]


def normalize(objects):
    meshes = [o for o in objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("no meshes imported")
    mins = Vector((1e9,) * 3)
    maxs = Vector((-1e9,) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mins = Vector(map(min, mins, w))
            maxs = Vector(map(max, maxs, w))
    size = maxs - mins
    length = max(size.x, size.y)
    scale = 4.7 / max(length, 1e-6)
    root = bpy.data.objects.new("CandidateRoot", None)
    bpy.context.collection.objects.link(root)
    for o in objects:
        if o.parent is None:
            o.parent = root
    root.scale = (scale,) * 3
    center = (mins + maxs) / 2
    root.location = (-center.x * scale, -center.y * scale, -mins.z * scale)
    # cars are usually modeled length-along-X already; if Y is longer, rotate
    if size.y > size.x:
        root.rotation_euler = (0, 0, math.radians(90))
    return meshes


def stats(meshes):
    tris = sum(len(o.data.loop_triangles) or len(o.data.polygons) for o in meshes)
    mats = {m.material.name for o in meshes for m in o.material_slots if m.material}
    glassish = [o.name for o in meshes if any(k in (o.name + " " + " ".join(
        s.material.name for s in o.material_slots if s.material)).lower()
        for k in ("glass", "window", "windshield", "wind"))]
    print(f"CANDIDATE_STATS meshes={len(meshes)} tris≈{tris} materials={len(mats)}")
    print("CANDIDATE_GLASS", glassish[:12])
    print("CANDIDATE_MATS", sorted(mats)[:24])


def render(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "EEVEE"):
        try:
            scene.render.engine = engine
            break
        except Exception:
            continue
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 562
    cam = bpy.data.cameras.new("Studio_Cam")
    cam.lens = 55
    co = bpy.data.objects.new("Studio_Cam", cam)
    bpy.context.collection.objects.link(co)
    scene.camera = co
    for name, pos in {"side": (0.2, -8.6, 1.1), "front34": (5.6, -5.4, 1.9), "rear34": (-5.3, -5.3, 2.0)}.items():
        co.location = pos
        d = Vector((0, 0, 0.62)) - Vector(pos)
        co.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, name + ".png")
        bpy.ops.render.render(write_still=True)


args = parse_args()
clear_scene()
studio()
objs = import_model(args["model"])
meshes = normalize(objs)
for o in meshes:
    o.data.calc_loop_triangles()
stats(meshes)
render(args["out"])
print("CANDIDATE DONE:", args["out"])
