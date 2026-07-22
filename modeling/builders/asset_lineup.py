# Diagnostic scene: every furniture candidate in a row on a plain floor so a
# single fast render shows what each asset actually looks like. Order (left to
# right) is the ASSETS list below.
import bpy
import math
import os

SELF_WORLD = True
SUN_ENERGY = 4.0

ASSETS = [
    "modern_arm_chair_01", "mid_century_lounge_chair", "modern_coffee_table_01",
    "Ottoman_01", "modern_wooden_cabinet",
]
GAP = 2.6
TOP_VIEW = bool(os.environ.get("LINEUP_TOP"))  # overhead pass for orientation
AROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     "assets", "polyhaven", "models")


def append_asset(name, at, rot_z=0.0):
    path = None
    for base, _dirs, files in os.walk(os.path.join(AROOT, name)):
        for f in files:
            if f.endswith(".blend"):
                path = os.path.join(base, f)
    root = bpy.data.objects.new(name + "_root", None)
    bpy.context.collection.objects.link(root)
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = list(src.objects)
    for ob in dst.objects:
        if ob is None:
            continue
        bpy.context.collection.objects.link(ob)
        if ob.parent is None:
            ob.parent = root
    root.location = at
    root.rotation_euler = (0, 0, rot_z)
    return root


def build():
    m = bpy.data.materials.new("Floor")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.52, 0.48, 1)
    bpy.ops.mesh.primitive_plane_add(size=80, location=(len(ASSETS) * GAP / 2, 0, 0))
    bpy.context.active_object.data.materials.append(m)

    for i, name in enumerate(ASSETS):
        append_asset(name, at=(i * GAP, 0, 0))

    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.75, 0.8, 0.9, 1)
    bg.inputs["Strength"].default_value = 1.0

    cx = (len(ASSETS) - 1) * GAP / 2
    cam = bpy.data.objects.new("InteriorCam", None)
    cam.location = (cx, -0.01, 16.0) if TOP_VIEW else (cx, -13.5, 4.2)
    bpy.context.collection.objects.link(cam)
    tgt = bpy.data.objects.new("InteriorTarget", None)
    tgt.location = (cx, 0, 0.5) if not TOP_VIEW else (cx, 0, 0)
    bpy.context.collection.objects.link(tgt)
