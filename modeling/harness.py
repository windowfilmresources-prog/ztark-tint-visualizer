"""Headless Blender harness for the tint-visualizer car models.

Usage:
  Blender --background --python modeling/harness.py -- \
      --builder modeling/builders/<name>.py --out modeling/out/<name> [--no-glb]

The builder file must define build() and create its objects in the current scene.
NAMING CONTRACT (the web viewer keys off these):
  Mesh names:  Windshield, WindowFrontL, WindowFrontR, WindowRearL, WindowRearR,
               RearWindow  (glass zones) — everything else is body/trim/wheels/interior.
  Materials:   use harness.mats()["paint" | "trim" | "glass" | "chrome" | "tire" |
               "rim" | "interior" | "light_head" | "light_tail"] or make your own;
               the paintable body material MUST be named "Body_Paint".
Car axes: +X = nose, +Y = up (Blender +Z is up internally; the harness rotates the
export so the web viewer sees Y-up — build with +Z up, +X nose, Y width).
Scale: meters. Target ~4.6-4.8 long, wheels r ≈ 0.34-0.37.

Outputs: side.png / front34.png / rear34.png / top.png renders + car.glb
"""
import bpy
import importlib.util
import math
import os
import sys

from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"builder": None, "out": "modeling/out/untitled", "glb": True, "blend": False}
    i = 0
    while i < len(argv):
        if argv[i] == "--builder":
            out["builder"] = argv[i + 1]; i += 2
        elif argv[i] == "--out":
            out["out"] = argv[i + 1]; i += 2
        elif argv[i] == "--no-glb":
            out["glb"] = False; i += 1
        elif argv[i] == "--blend":
            out["blend"] = True; i += 1
        else:
            i += 1
    return out


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


_MATS = {}

def _principled(name, color, metallic=0.0, roughness=0.5, transmission=0.0, emission=None, emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    for key in ("Transmission Weight", "Transmission"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = transmission
            break
    if emission is not None:
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (*emission, 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return m


def mats():
    """Shared material set (created once)."""
    if _MATS:
        return _MATS
    _MATS.update({
        "paint": _principled("Body_Paint", (0.45, 0.46, 0.48), metallic=0.15, roughness=0.38),
        "trim": _principled("Trim", (0.015, 0.017, 0.02), metallic=0.3, roughness=0.55),
        "glass": _principled("Glass", (1, 1, 1), metallic=0.0, roughness=0.06, transmission=1.0),
        "chrome": _principled("Chrome", (0.85, 0.87, 0.9), metallic=1.0, roughness=0.15),
        "tire": _principled("Tire", (0.02, 0.02, 0.022), roughness=0.9),
        "rim": _principled("Rim", (0.75, 0.77, 0.8), metallic=0.9, roughness=0.28),
        "interior": _principled("Interior", (0.05, 0.052, 0.055), roughness=0.85),
        "light_head": _principled("Headlight", (0.9, 0.95, 1.0), roughness=0.15, emission=(0.8, 0.9, 1.0), emission_strength=2.0),
        "light_tail": _principled("Taillight", (0.6, 0.02, 0.03), roughness=0.2, emission=(1.0, 0.05, 0.05), emission_strength=3.0),
    })
    return _MATS


def studio():
    world = bpy.data.worlds["World"] if bpy.data.worlds else bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.92, 0.93, 0.95, 1.0)
    bg.inputs[1].default_value = 0.55

    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "Studio_Floor"
    floor.data.materials.append(_principled("Studio_FloorMat", (0.94, 0.945, 0.95), roughness=0.9))

    key = bpy.data.lights.new("Studio_Key", type="AREA")
    key.energy = 2600
    key.size = 7
    ko = bpy.data.objects.new("Studio_Key", key)
    ko.location = (3.5, -4.5, 6.0)
    ko.rotation_euler = (math.radians(38), 0, math.radians(30))
    bpy.context.collection.objects.link(ko)

    fill = bpy.data.lights.new("Studio_Fill", type="AREA")
    fill.energy = 1100
    fill.size = 9
    fo = bpy.data.objects.new("Studio_Fill", fill)
    fo.location = (-5.0, 4.0, 4.5)
    fo.rotation_euler = (math.radians(48), 0, math.radians(-125))
    bpy.context.collection.objects.link(fo)


def add_camera():
    cam = bpy.data.cameras.new("Studio_Cam")
    cam.lens = 55
    co = bpy.data.objects.new("Studio_Cam", cam)
    bpy.context.collection.objects.link(co)
    bpy.context.scene.camera = co
    return co


def aim(cam_obj, pos, target=(0, 0, 0.62)):
    cam_obj.location = pos
    direction = Vector(target) - Vector(pos)
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_shots(out_dir, cam_scale=1.0):
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
    cam = add_camera()
    shots = {
        "side": (0.2, -8.6, 1.1),
        "front34": (5.6, -5.4, 1.9),
        "rear34": (-5.3, -5.3, 2.0),
        "top": (0.2, -7.2, 5.2),
    }
    s = cam_scale
    for name, pos in shots.items():
        aim(cam, (pos[0] * s, pos[1] * s, pos[2] if name == "side" else pos[2] * s))
        scene.render.filepath = os.path.join(out_dir, name + ".png")
        bpy.ops.render.render(write_still=True)


def export_glb(path):
    for o in bpy.context.scene.objects:
        o.select_set(not o.name.startswith("Studio_"))
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_apply=True)


def main():
    args = parse_args()
    clear_scene()
    studio()

    spec = importlib.util.spec_from_file_location("builder", args["builder"])
    builder = importlib.util.module_from_spec(spec)
    sys.modules["builder"] = builder
    # builders import the harness for mats(); expose self
    sys.modules["harness"] = sys.modules[__name__]
    spec.loader.exec_module(builder)
    builder.build()

    render_shots(args["out"], cam_scale=getattr(builder, "CAM_SCALE", 1.0))
    if args["glb"]:
        export_glb(os.path.join(args["out"], "car.glb"))
    if args["blend"]:
        bpy.ops.wm.save_as_mainfile(
            filepath=os.path.abspath(os.path.join(args["out"], "car.blend")))
    print("HARNESS DONE:", args["out"])


main()
