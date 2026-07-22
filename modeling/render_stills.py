"""Cycles still-render pipeline for the building visualizer.

Renders each scene/view in two lighting states plus a glass mask; the web app
blends the pair per film shade (light is additive, so lerping renders is a
physically sound relight) and uses the mask for view-through tinting.

  bright  - full sun + sky
  filmed  - sun/sky cut to FILM_FLOOR (strong film on every pane)
  mask    - white where tintable glass is visible (object index pass)

Usage:
  blender --background --python modeling/render_stills.py -- \
      --builder modeling/builders/house_iso.py --out web/assets/stills/house \
      [--view interior|exterior|both] [--samples N] [--probe]
"""
import bpy
import importlib.util
import math
import os
import sys

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(flag, default=None):
    if flag in ARGS:
        i = ARGS.index(flag)
        if i + 1 < len(ARGS) and not ARGS[i + 1].startswith("--"):
            return ARGS[i + 1]
        return True
    return default


BUILDER = arg("--builder")
OUT = arg("--out", "modeling/out/stills")
VIEW = arg("--view", "both")
SAMPLES = int(arg("--samples", "192"))
PROBE = bool(arg("--probe", False))
if bool(arg("--fast", False)):
    SAMPLES = min(SAMPLES, 24)
BRIGHT_ONLY = bool(arg("--bright-only", False))  # fast light-iteration probes
FAST = bool(arg("--fast", False))  # layout-draft mode: tiny frame, few samples
if FAST:
    os.environ["ZT_FAST"] = "1"   # builders lighten heavy detail (hair grass)
FILM_FLOOR = 0.14          # light fraction in the "filmed" state
RES = (640, 400) if FAST else (960, 600) if PROBE else (1680, 1050)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                  bpy.data.cameras, bpy.data.textures):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def load_builder(path):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(path))))
    spec = importlib.util.spec_from_file_location("builder", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["builder"] = mod
    spec.loader.exec_module(mod)
    mod.build()
    return mod


def setup_world_and_sun():
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sun_elevation = math.radians(38)
    sky.sun_rotation = math.radians(215)
    sky.sun_intensity = 0.55
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.55
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    sun = bpy.data.lights.new("Sun", type="SUN")
    sun.energy = 3.4
    sun.angle = math.radians(1.2)     # soft-ish shadow edges
    sun.color = (1.0, 0.96, 0.90)
    so = bpy.data.objects.new("Sun", sun)
    so.rotation_euler = (math.radians(52), 0, math.radians(35))
    bpy.context.collection.objects.link(so)
    return world, sun


def scale_light(world, sun, f):
    base = globals().get("_SUN_BASE", 3.4)
    sun.energy = base * f
    bg = world.node_tree.nodes.get("Background")
    if bg:
        base_bg = globals().setdefault("_BG_BASE", bg.inputs["Strength"].default_value)
        bg.inputs["Strength"].default_value = base_bg * (0.3 + 0.7 * f)


def mark_glass_index():
    n = 0
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        mats = [m.name if m else "" for m in ob.data.materials]
        if ob.name.startswith("Glass") or any("Building_Glass" in m for m in mats):
            ob.pass_index = 7
            n += 1
    return n


def add_cameras():
    cams = {}
    # exterior: gentle 3/4 aerial, nicer than the ortho iso for a beauty still
    cam = bpy.data.cameras.new("ExtCam")
    cam.lens = 42
    co = bpy.data.objects.new("ExtCam", cam)
    co.location = (16.5, -20.0, 13.5)
    co.rotation_euler = (math.radians(60), 0, math.radians(39))
    bpy.context.collection.objects.link(co)
    cams["exterior"] = co
    # interior: reuse the builder's anchor empties
    a = bpy.data.objects.get("InteriorCam")
    t = bpy.data.objects.get("InteriorTarget")
    if a and t:
        cam2 = bpy.data.cameras.new("IntCam")
        cam2.lens = 18
        ci = bpy.data.objects.new("IntCam", cam2)
        ci.location = a.location
        d = (t.location - a.location)
        ci.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(ci)
        cams["interior"] = ci
    return cams


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    clear_scene()
    builder = load_builder(BUILDER)
    if getattr(builder, "SELF_WORLD", False):
        # builder owns the world (HDRI); we only add the controllable sun
        world = bpy.context.scene.world
        sun = bpy.data.lights.new("Sun", type="SUN")
        sun.energy = getattr(builder, "SUN_ENERGY", 3.4)
        sun.angle = math.radians(1.1)
        sun.color = (1.0, 0.95, 0.88)
        so = bpy.data.objects.new("Sun", sun)
        so.rotation_euler = (math.radians(62), 0, math.radians(352))
        bpy.context.collection.objects.link(so)
        globals()["_SUN_BASE"] = sun.energy
    else:
        world, sun = setup_world_and_sun()
        globals()["_SUN_BASE"] = 3.4
    n_glass = mark_glass_index()
    print("glass objects tagged:", n_glass)
    cams = add_cameras()

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.texture_limit_render = "1024" if PROBE else "2048"  # VRAM guard
    try:
        sc.cycles.device = "GPU"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
    except Exception as e:
        print("GPU setup failed, CPU fallback:", e)
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 92
    sc.view_settings.view_transform = "Filmic"
    sc.view_settings.look = "Medium High Contrast"
    sc.view_settings.exposure = 0.55   # interiors under a real roof need the lift

    os.makedirs(OUT, exist_ok=True)
    views = ["interior", "exterior"] if VIEW == "both" else [VIEW]
    for view in views:
        if view not in cams:
            print("no camera for", view)
            continue
        sc.camera = cams[view]
        scale_light(world, sun, 1.0)
        render(os.path.join(OUT, f"{view}_bright.jpg"))
        if BRIGHT_ONLY:
            continue
        scale_light(world, sun, FILM_FLOOR)
        render(os.path.join(OUT, f"{view}_filmed.jpg"))
        scale_light(world, sun, 1.0)
        # glass mask: object-index emission via compositor-free trick — render
        # with an override emission on pass_index==7 is complex; instead use
        # Workbench-style flat pass: temporarily swap glass to emissive white,
        # everything else black
        override_mask_and_render(os.path.join(OUT, f"{view}_mask.png"))
    print("STILLS DONE:", OUT)


def override_mask_and_render(path):
    sc = bpy.context.scene
    black = bpy.data.materials.new("MaskBlack")
    black.use_nodes = True
    bt = black.node_tree
    bt.nodes.clear()
    e = bt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (0, 0, 0, 1)
    o = bt.nodes.new("ShaderNodeOutputMaterial")
    bt.links.new(e.outputs["Emission"], o.inputs["Surface"])
    white = bpy.data.materials.new("MaskWhite")
    white.use_nodes = True
    wt = white.node_tree
    wt.nodes.clear()
    e2 = wt.nodes.new("ShaderNodeEmission")
    e2.inputs["Color"].default_value = (1, 1, 1, 1)
    e2.inputs["Strength"].default_value = 1.0
    o2 = wt.nodes.new("ShaderNodeOutputMaterial")
    wt.links.new(e2.outputs["Emission"], o2.inputs["Surface"])

    saved = {}
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        saved[ob.name] = [m for m in ob.data.materials]
        target = white if ob.pass_index == 7 else black
        for i in range(len(ob.data.materials)):
            ob.data.materials[i] = target
        if not ob.data.materials:
            ob.data.materials.append(target)

    old = (sc.cycles.samples, sc.render.image_settings.file_format,
           sc.view_settings.view_transform)
    sc.cycles.samples = 16
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Raw"
    world_bg = bpy.context.scene.world.node_tree.nodes["Background"]
    old_strength = world_bg.inputs["Strength"].default_value
    world_bg.inputs["Strength"].default_value = 0.0
    render(path)
    world_bg.inputs["Strength"].default_value = old_strength
    sc.cycles.samples, sc.render.image_settings.file_format = old[0], old[1]
    sc.view_settings.view_transform = old[2]
    for name, mats in saved.items():
        ob = bpy.data.objects.get(name)
        if not ob:
            continue
        for i, m in enumerate(mats):
            ob.data.materials[i] = m


main()
