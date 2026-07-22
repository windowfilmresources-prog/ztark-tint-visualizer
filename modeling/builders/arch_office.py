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

    # ---------------- outside: patio, planters, trees, pool ----------------
    pat = plane("Patio", X0 - 2, X1 + 2, Y0 - 2.1, Y0, -0.02, m_pavers)
    uv_box(pat, 1.0)
    # cedar planters on the patio, kept clear of the drape lines
    append_asset("planter_box_01", at=(-2.1, Y0 - 1.25, 0), rot_z=0.04)
    append_asset("planter_box_01", at=(2.3, Y0 - 1.1, 0), rot_z=-0.06)
    m_lawn = pbr("YardLawn", "grass_medium_01", scale=9.0, bump=0.6)
    # saturate the ground read; the hair grass on top carries the realism
    _sat = m_lawn.node_tree.nodes.new("ShaderNodeHueSaturation")
    _sat.inputs["Saturation"].default_value = 1.5
    _al = m_lawn.node_tree.nodes["AlbedoLift"]
    _pb = m_lawn.node_tree.nodes["Principled BSDF"]
    m_lawn.node_tree.links.new(_al.outputs["Color"], _sat.inputs["Color"])
    m_lawn.node_tree.links.new(_sat.outputs["Color"], _pb.inputs["Base Color"])
    m_lawn.node_tree.nodes["AlbedoLift"].inputs["Bright"].default_value = 0.07
    _lb = m_lawn.node_tree.nodes["Principled BSDF"]
    for _k in ("Specular IOR Level", "Specular"):
        if _k in _lb.inputs:
            _lb.inputs[_k].default_value = 0.04   # grass has no glancing sheen
            break
    for _l in list(_lb.inputs["Roughness"].links):
        m_lawn.node_tree.links.remove(_l)
    _lb.inputs["Roughness"].default_value = 1.0
    ground = plane("Yard", X0 - 20, X1 + 20, Y0 - 30, Y0 - 2.1, -0.03, m_lawn)
    uv_box(ground, 1.0)
    # real 3D lawn: hair-particle grass on the visible band (offline render
    # can afford it — this is what sells "lawn" in archviz)
    m_blade = bpy.data.materials.new("LawnBlades")
    m_blade.use_nodes = True
    bb = m_blade.node_tree.nodes["Principled BSDF"]
    bb.inputs["Base Color"].default_value = (0.11, 0.28, 0.045, 1)
    bb.inputs["Roughness"].default_value = 0.7
    near = plane("YardNear", X0 - 12, X1 + 12, Y0 - 13.5, Y0 - 2.1, -0.028, m_lawn)
    uv_box(near, 1.0)
    near.data.materials.append(m_blade)
    psm = near.modifiers.new("grass", 'PARTICLE_SYSTEM')
    pset = near.particle_systems[0].settings
    pset.type = 'HAIR'
    pset.count = 14000
    pset.hair_length = 0.11
    pset.length_random = 0.55
    pset.child_type = 'INTERPOLATED'
    pset.rendered_child_count = 8
    pset.child_length = 0.85
    pset.root_radius = 0.018
    pset.material = 2
    pset.use_hair_bspline = True
    import os as _os
    if _os.environ.get("ZT_FAST"):
        # layout-iteration mode: lawn detail is irrelevant, cut the hair cost
        pset.count = 3500
        pset.rendered_child_count = 2
    _FAST = bool(__import__("os").environ.get("ZT_FAST"))  # layout-draft mode
    # jacarandas are placed below via linked instances — full copies OOM'd
    m_hedge = pbr("BackHedge", "grass_medium_01", scale=2.2, bump=0.9)
    _hb = m_hedge.node_tree.nodes["Principled BSDF"]
    for _k in ("Specular IOR Level", "Specular"):
        if _k in _hb.inputs:
            _hb.inputs[_k].default_value = 0.04
            break
    hbb = box("Hedge_Back", X0 - 16, X1 + 16, Y0 - 16.6, Y0 - 15.8, -0.03, 1.6, m_hedge)
    uv_box(hbb, 1.0)
    # pool: coping + water
    m_cope = bpy.data.materials.new("PoolCoping")
    m_cope.use_nodes = True
    m_cope.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.52, 0.47, 1)
    m_water = bpy.data.materials.new("PoolWater")
    m_water.use_nodes = True
    wb = m_water.node_tree.nodes["Principled BSDF"]
    wb.inputs["Base Color"].default_value = (0.18, 0.55, 0.6, 1)
    wb.inputs["Roughness"].default_value = 0.03
    # (pool omitted from this camera — clean lawn composition)

    # ---------------- environment fill: hills + treeline ----------------
    import random as _rnd
    _erng = _rnd.Random(42)
    # extend the flat lawn further back so the treeline stands on grass
    # (the near yard plane already covers to Y0-30)
    # rolling hills backdrop: displaced grid rising behind the treeline
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=72, y_subdivisions=72, size=1)
    hills = bpy.context.active_object
    hills.name = "Hills"
    hills.scale = (340, 200, 1)
    hills.location = (0, Y0 - 130, -1.2)
    bpy.ops.object.transform_apply(scale=True)
    htex = bpy.data.textures.get("HillNoise")
    if htex is None:
        htex = bpy.data.textures.new("HillNoise", type='CLOUDS')
        htex.noise_scale = 55.0
    hmod = hills.modifiers.new('hdisp', 'DISPLACE')
    hmod.texture = htex
    hmod.strength = 22.0
    hmod.mid_level = 0.42
    bpy.ops.object.select_all(action='DESELECT')
    hills.select_set(True)
    bpy.context.view_layer.objects.active = hills
    bpy.ops.object.modifier_apply(modifier=hmod.name)
    bpy.ops.object.shade_smooth()
    m_hills = pbr("HillGrass", "grass_medium_01", scale=30.0, bump=0.3)
    _hlb = m_hills.node_tree.nodes["Principled BSDF"]
    for _k in ("Specular IOR Level", "Specular"):
        if _k in _hlb.inputs:
            _hlb.inputs[_k].default_value = 0.04
            break
    for _l in list(_hlb.inputs["Roughness"].links):
        m_hills.node_tree.links.remove(_l)
    _hlb.inputs["Roughness"].default_value = 1.0
    _hsat = m_hills.node_tree.nodes.new("ShaderNodeHueSaturation")
    _hsat.inputs["Saturation"].default_value = 1.35
    _hal = m_hills.node_tree.nodes["AlbedoLift"]
    m_hills.node_tree.links.new(_hal.outputs["Color"], _hsat.inputs["Color"])
    m_hills.node_tree.links.new(_hsat.outputs["Color"], _hlb.inputs["Base Color"])
    hills.data.materials.append(m_hills)
    uv_box(hills, 1.0)

    # treeline: each species appended ONCE, then linked duplicates (shared
    # mesh data) — full copies of tree meshes blew GPU memory
    _proto = {}
    if not _FAST:
        for _sp in ("island_tree_02", "tree_small_02", "jacaranda_tree"):
            _proto[_sp] = append_asset(_sp, at=(0, Y0 - 60, -50))  # parked off-view

    def _tree_instance(_sp, _at, _rz, _sc):
        if _FAST:
            return
        _root = _proto[_sp]
        _nr = bpy.data.objects.new(_root.name + "_i", None)
        bpy.context.collection.objects.link(_nr)
        for _ch in _root.children:
            _c = _ch.copy()                  # linked duplicate: shares mesh
            bpy.context.collection.objects.link(_c)
            _c.parent = _nr
        _nr.location = _at
        _nr.rotation_euler = (0, 0, _rz)
        _nr.scale = (_sc, _sc, _sc)

    _species = ["island_tree_02", "tree_small_02"]
    for _ti in range(9):
        _sp = _species[_ti % len(_species)]
        _tx = _erng.uniform(X0 - 18, X1 + 18)
        _ty = Y0 - _erng.uniform(17.5, 26.0)
        _tsc = _erng.uniform(0.8, 1.4)
        _tree_instance(_sp, (_tx, _ty, -0.05), _erng.uniform(0, 6.28), _tsc)
    _tree_instance("tree_small_02", (-14.0, Y0 - 14.0, -0.03), 1.2, 0.9)
    _tree_instance("island_tree_02", (16.0, Y0 - 17.0, -0.03), 3.6, 0.8)
    # hero jacarandas framing the view, clear of the sun corridor
    _tree_instance("jacaranda_tree", (-16.5, Y0 - 10.0, 0), 0.0, 1.0)
    _tree_instance("jacaranda_tree", (14.5, Y0 - 12.5, 0), 2.1, 0.85)
    _tree_instance("jacaranda_tree", (19.0, Y0 - 22.0, 0), 4.0, 1.1)

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
    tgt.location = (2.2, -3.1, 1.0)
    bpy.context.collection.objects.link(tgt)
