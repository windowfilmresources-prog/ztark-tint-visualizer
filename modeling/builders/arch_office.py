"""ARCHVIZ LIVING ROOM — photoreal still-render scene.

Room shell built procedurally (walls / wood floor / full-width glass slider),
dressed entirely with PolyHaven CC0 assets (furniture appended from .blend,
scanned PBR textures, HDRI daylight). Rendered by render_stills.py.

Contracts:
  * tintable panes: meshes named Glass_*  (material "Building_Glass")
  * empties InteriorCam / InteriorTarget for the interior camera
  * SELF_WORLD = True — this builder owns the world (HDRI); render_stills
    only adds/scales the sun.
"""
import bpy
import glob
import math
import os

SELF_WORLD = True
SUN_ENERGY = 7.0

A = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "assets", "polyhaven")

# room bounds (m): X across, Y depth (glass wall at -Y), Z up
X0, X1 = -6.0, 6.0
Y0, Y1 = -2.9, 2.9
H = 3.4


# ---------------------------------------------------------------- helpers

def box(name, x0, x1, y0, y1, z0, z1, mat=None):
    bpy.ops.mesh.primitive_cube_add(
        size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    bpy.ops.object.transform_apply(scale=True)
    if mat:
        ob.data.materials.append(mat)
    return ob


def plane(name, x0, x1, y0, y1, z, mat=None):
    bpy.ops.mesh.primitive_plane_add(
        size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, z))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (abs(x1 - x0), abs(y1 - y0), 1)
    bpy.ops.object.transform_apply(scale=True)
    if mat:
        ob.data.materials.append(mat)
    return ob


def tex_path(asset, kind):
    hits = glob.glob(os.path.join(A, "textures", asset, f"{asset}_{kind}_*"))
    return hits[0] if hits else None


def pbr(name, asset, scale=1.0, rough=None, bump=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])

    def img(kind, cs=None):
        p = tex_path(asset, kind)
        if not p:
            return None
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(p, check_existing=True)
        if cs:
            node.image.colorspace_settings.name = cs
        nt.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    d = img("Diffuse")
    if d:
        bc = nt.nodes.new("ShaderNodeBrightContrast")
        bc.inputs["Bright"].default_value = 0.0
        nt.links.new(d.outputs["Color"], bc.inputs["Color"])
        nt.links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])
        m["_bright_node"] = 0  # marker; adjusted below via node name
        bc.name = "AlbedoLift"
    r = img("Rough", "Non-Color")
    if r:
        nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    elif rough is not None:
        bsdf.inputs["Roughness"].default_value = rough
    n = img("nor_gl", "Non-Color")
    if n:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = bump
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def uv_box(ob, scale=1.0):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=scale, correct_aspect=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def append_asset(asset, at=(0, 0, 0), rot_z=0.0, scale=1.0):
    """Append every object from a PolyHaven .blend, grouped under an empty."""
    path = os.path.join(A, "models", asset, f"{asset}.blend")
    if not os.path.exists(path):
        print("missing asset:", asset)
        return None
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = list(src.objects)
    root = bpy.data.objects.new(f"{asset}_root", None)
    bpy.context.collection.objects.link(root)
    for ob in dst.objects:
        if ob is None:
            continue
        bpy.context.collection.objects.link(ob)
        if ob.parent is None:
            ob.parent = root
    root.location = at
    root.rotation_euler = (0, 0, rot_z)
    root.scale = (scale, scale, scale)
    return root


# ---------------------------------------------------------------- build

def build():
    # polished concrete: uniform gray with soft noise mottling in color and
    # roughness — no tile texture reads more "commercial lobby" than pavers
    m_floor = bpy.data.materials.new("FloorConcrete")
    m_floor.use_nodes = True
    _nt = m_floor.node_tree
    _pbn = _nt.nodes["Principled BSDF"]
    _pbn.inputs["Base Color"].default_value = (0.30, 0.30, 0.295, 1)
    _noise = _nt.nodes.new("ShaderNodeTexNoise")
    _noise.inputs["Scale"].default_value = 1.6
    _noise.inputs["Detail"].default_value = 6.0
    _ramp = _nt.nodes.new("ShaderNodeMapRange")
    _ramp.inputs["From Min"].default_value = 0.35
    _ramp.inputs["From Max"].default_value = 0.65
    _ramp.inputs["To Min"].default_value = 0.22
    _ramp.inputs["To Max"].default_value = 0.45
    _nt.links.new(_noise.outputs["Fac"], _ramp.inputs["Value"])
    _nt.links.new(_ramp.outputs["Result"], _pbn.inputs["Roughness"])
    m_wall = pbr("WallPlaster", "plastered_wall_04", scale=1.2, bump=0.25)
    m_wall.node_tree.nodes["AlbedoLift"].inputs["Bright"].default_value = 0.22
    m_rug = pbr("RugFabric", "fabric_pattern_07", scale=2.2, bump=0.8)
    m_pavers = pbr("Pavers", "concrete_pavers", scale=0.9, bump=0.6)

    m_frame = bpy.data.materials.new("FrameAlu")
    m_frame.use_nodes = True
    fb = m_frame.node_tree.nodes["Principled BSDF"]
    fb.inputs["Base Color"].default_value = (0.045, 0.048, 0.05, 1)
    fb.inputs["Metallic"].default_value = 0.85
    fb.inputs["Roughness"].default_value = 0.35

    m_glass = bpy.data.materials.new("Building_Glass")
    m_glass.use_nodes = True
    gb = m_glass.node_tree.nodes["Principled BSDF"]
    gb.inputs["Base Color"].default_value = (1, 1, 1, 1)
    gb.inputs["Roughness"].default_value = 0.0
    for key in ("Transmission Weight", "Transmission"):
        if key in gb.inputs:
            gb.inputs[key].default_value = 1.0
            break
    if "IOR" in gb.inputs:
        gb.inputs["IOR"].default_value = 1.45

    m_white = bpy.data.materials.new("TrimWhite")
    m_white.use_nodes = True
    m_white.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.82, 0.815, 0.80, 1)
    m_white.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6

    m_linen = bpy.data.materials.new("CurtainLinen")
    m_linen.use_nodes = True
    lb = m_linen.node_tree.nodes["Principled BSDF"]
    lb.inputs["Base Color"].default_value = (0.72, 0.68, 0.61, 1)
    lb.inputs["Roughness"].default_value = 0.9

    # shell
    fl = plane("Floor", X0, X1, Y0, Y1, 0.0, m_floor)
    uv_box(fl, 1.0)
    # real roof: white ceiling below, slab body, and an eave overhanging the
    # glass so the building reads as a building (also throws a nice shadow
    # band into the room's top edge)
    box("RoofSlab", X0 - 0.35, X1 + 0.35, Y0 - 0.65, Y1 + 0.35, H, H + 0.28, m_white)
    m_fascia = bpy.data.materials.new("RoofFascia")
    m_fascia.use_nodes = True
    m_fascia.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.07, 0.072, 0.075, 1)
    m_fascia.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.5
    box("Roof_FasciaF", X0 - 0.35, X1 + 0.35, Y0 - 0.65, Y0 - 0.57, H - 0.02, H + 0.28, m_fascia)
    for nm, x0b, x1b, y0b, y1b in (
        ("Wall_E", X1, X1 + 0.15, Y0 - 0.15, Y1 + 0.15),
        ("Wall_W", X0 - 0.15, X0, Y0 - 0.15, Y1 + 0.15),
        ("Wall_N", X0, X1, Y1, Y1 + 0.15),
    ):
        w = box(nm, x0b, x1b, y0b, y1b, 0, H, m_wall)
        uv_box(w, 1.0)
    box("Base_E", X1 - 0.02, X1, Y0, Y1, 0, 0.09, m_white)
    box("Base_W", X0, X0 + 0.02, Y0, Y1, 0, 0.09, m_white)
    box("Base_N", X0, X1, Y1 - 0.02, Y1, 0, 0.09, m_white)

    # glass slider wall at -Y: 4 panes, slim aluminium frames
    yF = Y0
    box("Slider_Head", X0, X1, yF - 0.07, yF + 0.07, H - 0.12, H, m_frame)
    box("Slider_Sill", X0, X1, yF - 0.07, yF + 0.07, 0, 0.05, m_frame)
    span = (X1 - X0)
    n_panes = 6
    pw = span / n_panes
    for i in range(n_panes + 1):
        x = X0 + i * pw
        box(f"Slider_Mull{i}", x - 0.025, x + 0.025, yF - 0.05, yF + 0.05,
            0.05, H - 0.12, m_frame)
    for i in range(n_panes):
        x = X0 + i * pw
        g = box(f"Glass_{i}", x + 0.03, x + pw - 0.03, yF - 0.006, yF + 0.006,
                0.05, H - 0.12, m_glass)


    # ---------------- furniture (PolyHaven, CC0) ----------------
    # conversation group centered on the view: sofa faces the glass, two
    # armchairs angled in from the sides, round table in the middle
    # procedural modern sofa — boxy modular form, the style PolyHaven lacks
    m_boucle = bpy.data.materials.new("SofaBoucle")
    m_boucle.use_nodes = True
    _sb = m_boucle.node_tree.nodes["Principled BSDF"]
    _sb.inputs["Base Color"].default_value = (0.36, 0.33, 0.28, 1)  # warm greige (linear)
    _sb.inputs["Roughness"].default_value = 0.95
    for _k in ("Specular IOR Level", "Specular"):
        if _k in _sb.inputs:
            _sb.inputs[_k].default_value = 0.05
            break
    m_plinth = bpy.data.materials.new("SofaPlinth")
    m_plinth.use_nodes = True
    m_plinth.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.045, 0.04, 0.035, 1)

    def soft_box(name, cx, cy, w, d, z0, h, mat, bevel=0.05, rz=0.0):
        bpy.ops.mesh.primitive_cube_add(location=(cx, cy, z0 + h / 2))
        ob = bpy.context.active_object
        ob.name = name
        ob.scale = (w / 2, d / 2, h / 2)
        ob.rotation_euler = (0, 0, rz)
        bpy.ops.object.transform_apply(scale=True)
        bv = ob.modifiers.new("bv", "BEVEL")
        bv.width = bevel
        bv.segments = 4
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=0.9)
        except Exception:
            bpy.ops.object.shade_smooth()
        ob.data.materials.append(mat)
        return ob

    # ---------------- lounge cluster (west half): L-sofa facing the view
    _sx, _sy = -3.0, 1.4
    soft_box("SofaPlinth", _sx, _sy, 3.0, 0.98, 0.0, 0.13, m_plinth, bevel=0.015)
    soft_box("SofaSeat1", _sx - 0.72, _sy - 0.03, 1.4, 0.9, 0.13, 0.24, m_boucle, bevel=0.06)
    soft_box("SofaSeat2", _sx + 0.72, _sy - 0.03, 1.4, 0.9, 0.13, 0.24, m_boucle, bevel=0.06)
    soft_box("SofaBack1", _sx - 0.72, _sy + 0.33, 1.4, 0.3, 0.34, 0.5, m_boucle, bevel=0.07)
    soft_box("SofaBack2", _sx + 0.72, _sy + 0.33, 1.4, 0.3, 0.34, 0.5, m_boucle, bevel=0.07)
    soft_box("SofaArmR", _sx + 1.56, _sy + 0.02, 0.16, 0.94, 0.13, 0.44, m_boucle, bevel=0.05)
    # L-return along the west wall, facing east into the room
    soft_box("SofaRetPlinth", -4.85, 0.15, 0.98, 2.4, 0.0, 0.13, m_plinth, bevel=0.015, rz=0.0)
    soft_box("SofaRetSeat", -4.82, 0.15, 0.9, 2.3, 0.13, 0.24, m_boucle, bevel=0.06)
    soft_box("SofaRetBack", -5.18, 0.15, 0.3, 2.3, 0.34, 0.5, m_boucle, bevel=0.07)
    soft_box("SofaCornerSeat", -4.78, 1.42, 0.9, 0.9, 0.13, 0.24, m_boucle, bevel=0.06)
    soft_box("SofaCornerBack", -5.05, 1.62, 0.42, 0.42, 0.34, 0.5, m_boucle, bevel=0.07, rz=0.78)
    m_throw = bpy.data.materials.new("ThrowRust")
    m_throw.use_nodes = True
    m_throw.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.30, 0.11, 0.05, 1)
    m_throw.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    soft_box("Throw1", _sx - 0.9, _sy + 0.22, 0.42, 0.16, 0.37, 0.4, m_throw, bevel=0.07, rz=0.18)
    soft_box("Throw2", -5.1, -0.5, 0.16, 0.42, 0.37, 0.4, m_boucle, bevel=0.07, rz=-0.1)

    append_asset("modern_coffee_table_01", at=(-3.0, -0.35, 0))
    append_asset("ceramic_vase_03", at=(-2.85, -0.4, 0.39), scale=0.7)  # table top 0.390
    # lounge chair closes the group from the glass side, facing the sofa
    # (asset default-faces -Y; rot = 180 - target bearing)
    append_asset("mid_century_lounge_chair", at=(-1.45, -1.05, 0), rot_z=math.radians(-148))
    # rug anchors the lounge
    rug_l = box("RugLounge", -5.3, -1.0, -1.7, 2.3, 0.0, 0.012, m_rug)
    uv_box(rug_l, 2.5)

    # ---------------- reception (east half): counter facing into the room
    m_cfront = bpy.data.materials.new("CounterFront")
    m_cfront.use_nodes = True
    m_cfront.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.055, 0.055, 0.058, 1)
    m_cfront.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.55
    m_ctop = bpy.data.materials.new("CounterTop")
    m_ctop.use_nodes = True
    m_ctop.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.62, 0.60, 0.57, 1)
    m_ctop.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.25
    soft_box("CounterFront", 3.9, 0.3, 2.6, 0.14, 0.0, 1.02, m_cfront, bevel=0.012, rz=math.radians(90))
    soft_box("CounterTop", 4.0, 0.3, 2.8, 0.72, 1.02, 0.06, m_ctop, bevel=0.01, rz=math.radians(90))
    append_asset("brass_vase_03", at=(3.95, 1.25, 1.08))
    append_asset("potted_plant_04", at=(3.97, -0.65, 1.08), rot_z=1.4, scale=0.85)

    # reception backdrop: dark feature panel on the north wall, cabinet + art
    m_feat = bpy.data.materials.new("FeaturePanel")
    m_feat.use_nodes = True
    m_feat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.045, 0.035, 0.028, 1)
    m_feat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.45
    box("FeatureWall", X1 - 0.05, X1, -1.15, 1.75, 0.0, 2.7, m_feat)
    _cab = append_asset("modern_wooden_cabinet", at=(2.9, 2.6, 0))  # default faces -Y = into the room
    for _ch in list(_cab.children):
        if _ch.location.length > 1.2:  # spare door parked off-origin
            bpy.data.objects.remove(_ch, do_unlink=True)
    append_asset("hanging_picture_frame_01", at=(X1 - 0.08, 0.3, 1.95), rot_z=math.radians(-90), scale=1.9)

    # pendants over lounge table and counter (mesh authored above its origin)
    append_asset("modern_ceiling_lamp_01", at=(-3.0, -0.3, H - 1.17))
    append_asset("modern_ceiling_lamp_01", at=(2.75, 0.3, H - 1.17))
    # interior fill scaled to the bigger volume; dims with the film
    _fd = bpy.data.lights.new("FillArea", type="AREA")
    _fd.energy = 95
    _fd.size = 4.6
    _fd.color = (1.0, 0.95, 0.9)
    _fo = bpy.data.objects.new("FillArea", _fd)
    _fo.location = (-0.6, 0.9, H - 0.06)
    bpy.context.collection.objects.link(_fo)

    # ---------------- outside: high-rise city ----------------
    # The room is a ~20th-floor suite: street canyon 80m below, rows of
    # procedural towers with window-grid facades. Far rows get lighter,
    # bluer materials — painter's atmospheric haze without volumetrics.
    import random as _random
    _crng = _random.Random(77)
    GROUND = -80.0

    def _facade(name, frame_col, glass_col, haze=0.0):
        # window grid via modulo masks: ~2m bays, 3m floors — dark glass
        # cells in concrete frames; haze lifts distant rows toward sky
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        coord = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])

        def stripe(axis_out, period, frac_window):
            # Blender MODULO truncates: negative coords give negative
            # remainders and the window test always fails — shift positive
            off = nt.nodes.new("ShaderNodeMath")
            off.operation = "ADD"
            off.inputs[1].default_value = 1000.0
            nt.links.new(axis_out, off.inputs[0])
            mod = nt.nodes.new("ShaderNodeMath")
            mod.operation = "MODULO"
            mod.inputs[1].default_value = period
            nt.links.new(off.outputs["Value"], mod.inputs[0])
            gt = nt.nodes.new("ShaderNodeMath")
            gt.operation = "GREATER_THAN"
            gt.inputs[1].default_value = period * (1 - frac_window)
            nt.links.new(mod.outputs["Value"], gt.inputs[0])
            return gt

        # stripe on (x+y): varies on every vertical face of an axis-aligned
        # box (the constant axis only shifts phase) — max(gx,gy) degenerated
        # on side faces whenever the constant axis landed in a window zone
        gadd = nt.nodes.new("ShaderNodeMath")
        gadd.operation = "ADD"
        nt.links.new(sep.outputs["X"], gadd.inputs[0])
        nt.links.new(sep.outputs["Y"], gadd.inputs[1])
        gxy = stripe(gadd.outputs["Value"], 2.0, 0.78)
        gz = stripe(sep.outputs["Z"], 3.0, 0.72)
        win = nt.nodes.new("ShaderNodeMath")
        win.operation = "MULTIPLY"
        nt.links.new(gxy.outputs["Value"], win.inputs[0])
        nt.links.new(gz.outputs["Value"], win.inputs[1])

        mixc = nt.nodes.new("ShaderNodeMixRGB")
        mixc.inputs["Color1"].default_value = frame_col
        mixc.inputs["Color2"].default_value = glass_col
        nt.links.new(win.outputs["Value"], mixc.inputs["Fac"])
        if haze > 0:
            hz = nt.nodes.new("ShaderNodeMixRGB")
            hz.inputs["Fac"].default_value = haze
            hz.inputs["Color2"].default_value = (0.34, 0.42, 0.55, 1)
            nt.links.new(mixc.outputs["Color"], hz.inputs["Color1"])
            nt.links.new(hz.outputs["Color"], bsdf.inputs["Base Color"])
        else:
            nt.links.new(mixc.outputs["Color"], bsdf.inputs["Base Color"])
        mixr = nt.nodes.new("ShaderNodeMixRGB")
        mixr.inputs["Color1"].default_value = (0.7, 0.7, 0.7, 1)
        mixr.inputs["Color2"].default_value = (0.3, 0.3, 0.3, 1)
        nt.links.new(win.outputs["Value"], mixr.inputs["Fac"])
        nt.links.new(mixr.outputs["Color"], bsdf.inputs["Roughness"])
        return m

    m_fac_a = _facade("FacadeConcrete", (0.24, 0.23, 0.21, 1), (0.030, 0.045, 0.065, 1))
    m_fac_b = _facade("FacadeBlue", (0.09, 0.095, 0.10, 1), (0.045, 0.075, 0.11, 1))
    m_fac_mid = _facade("FacadeMid", (0.26, 0.27, 0.29, 1), (0.06, 0.09, 0.13, 1), haze=0.18)
    m_fac_far = _facade("FacadeFar", (0.26, 0.29, 0.34, 1), (0.10, 0.14, 0.20, 1), haze=0.4)

    m_asphalt = bpy.data.materials.new("Asphalt")
    m_asphalt.use_nodes = True
    m_asphalt.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.035, 0.035, 0.037, 1)
    m_asphalt.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    m_walk = bpy.data.materials.new("Sidewalk")
    m_walk.use_nodes = True
    m_walk.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.22, 0.215, 0.20, 1)
    m_lane = bpy.data.materials.new("LanePaint")
    m_lane.use_nodes = True
    m_lane.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.53, 0.42, 1)

    # street canyon directly below the glass
    plane("Street", -160, 160, -42, -12, GROUND, m_asphalt)
    plane("WalkNear", -160, 160, -12, -4, GROUND + 0.12, m_walk)
    plane("WalkFar", -160, 160, -50, -42, GROUND + 0.12, m_walk)
    for _lx in range(-30, 31, 4):  # dashed centre line
        box(f"Lane{_lx}", _lx * 4 - 1.1, _lx * 4 + 1.1, -27.6, -26.9,
            GROUND + 0.13, GROUND + 0.14, m_lane)

    m_roof = bpy.data.materials.new("RoofDeck")
    m_roof.use_nodes = True
    m_roof.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.045, 0.046, 0.05, 1)
    m_roof.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.85

    def _tower(i, x, y, w, d, top, mat):
        b = box(f"Tower{i}", x - w / 2, x + w / 2, y - d / 2, y + d / 2,
                GROUND, top, mat)
        uv_box(b, 1.0)
        # roofs are viewed from above (our suite is up high) — a blank bright
        # roof reads as a white box, so cap with a dark deck + parapet + a
        # small mechanical unit
        box(f"Roof{i}", x - w / 2, x + w / 2, y - d / 2, y + d / 2,
            top, top + 0.15, m_roof)
        pr = 0.35
        box(f"Parapet{i}N", x - w/2, x + w/2, y + d/2 - 0.25, y + d/2, top, top + 0.7, m_roof)
        box(f"Parapet{i}S", x - w/2, x + w/2, y - d/2, y - d/2 + 0.25, top, top + 0.7, m_roof)
        box(f"Parapet{i}E", x + w/2 - 0.25, x + w/2, y - d/2, y + d/2, top, top + 0.7, m_roof)
        box(f"Parapet{i}W", x - w/2, x - w/2 + 0.25, y - d/2, y + d/2, top, top + 0.7, m_roof)
        _mw, _md = w * 0.32, d * 0.32
        box(f"Mech{i}", x - _mw/2 + w*0.12, x + _mw/2 + w*0.12,
            y - _md/2, y + _md/2, top + 0.15, top + 1.4, m_roof)
        return b

    # our own building's lower floors: a facade slab dropping to the street
    _tower("Self", 0, Y0 - 6.0, X1 * 2 + 24, 12.0, -0.35, m_fac_a)

    # front row across the street — centre towers stay below the sun path
    _ti = 0
    for _x in (-52, -30, -12, 6, 24, 44, 64):
        _w = _crng.uniform(12, 18)
        _d = _crng.uniform(12, 16)
        _top = _crng.uniform(-32, 6) if -52 <= _x <= 30 else _crng.uniform(-18, 16)
        _tower(_ti, _x, -76 - _crng.uniform(0, 10), _w, _d, _top,
               m_fac_a if _ti % 2 else m_fac_b)
        _ti += 1
    _tower("HeroA", 34, -92, 15, 15, 32, m_fac_b)
    _tower("HeroB", 70, -84, 18, 16, 20, m_fac_a)
    # mid row
    for _x in range(-100, 101, 24):
        _tower(_ti, _x + _crng.uniform(-5, 5), -95 - _crng.uniform(0, 18),
               _crng.uniform(14, 22), _crng.uniform(14, 20),
               _crng.uniform(-20, 42), m_fac_mid)
        _ti += 1
    # far skyline
    for _x in range(-160, 161, 28):
        _tower(_ti, _x + _crng.uniform(-8, 8), -165 - _crng.uniform(0, 30),
               _crng.uniform(18, 30), _crng.uniform(18, 26),
               _crng.uniform(-5, 46), m_fac_far)
        _ti += 1

    # ---------------- world: HDRI daylight ----------------
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    hdr = glob.glob(os.path.join(A, "hdri", "*.hdr"))
    if hdr:
        env.image = bpy.data.images.load(hdr[0], check_existing=True)
    mapping = nt.nodes.new("ShaderNodeMapping")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping.inputs["Rotation"].default_value = (0, 0, math.radians(145))
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.name = "Background"
    bg.inputs["Strength"].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # ---------------- camera anchors ----------------
    cam = bpy.data.objects.new("InteriorCam", None)
    cam.location = (-5.05, 2.45, 1.62)
    bpy.context.collection.objects.link(cam)
    tgt = bpy.data.objects.new("InteriorTarget", None)
    tgt.location = (2.0, -3.2, 0.5)
    bpy.context.collection.objects.link(tgt)
