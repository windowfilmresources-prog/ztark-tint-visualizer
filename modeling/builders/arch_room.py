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
SUN_ENERGY = 4.2

A = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "assets", "polyhaven")

# room bounds (m): X across, Y depth (glass wall at -Y), Z up
X0, X1 = -4.2, 4.2
Y0, Y1 = -2.9, 2.9
H = 3.0


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
    m_floor = pbr("FloorWood", "wood_floor_deck", scale=2.3, bump=0.4)
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
    ce = plane("Ceiling", X0, X1, Y0, Y1, H, m_white)
    ce.rotation_euler = (math.pi, 0, 0)
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
    n_panes = 4
    pw = span / n_panes
    for i in range(n_panes + 1):
        x = X0 + i * pw
        box(f"Slider_Mull{i}", x - 0.025, x + 0.025, yF - 0.05, yF + 0.05,
            0.05, H - 0.12, m_frame)
    for i in range(n_panes):
        x = X0 + i * pw
        g = box(f"Glass_{i}", x + 0.03, x + pw - 0.03, yF - 0.006, yF + 0.006,
                0.05, H - 0.12, m_glass)

    # curtains flanking the glass, gentle sine folds
    for side, cx in (("L", X0 + 0.55), ("R", X1 - 0.55)):
        bpy.ops.mesh.primitive_plane_add(size=1)
        cu = bpy.context.active_object
        cu.name = f"Curtain_{side}"
        cu.scale = (1.0, 2.75, 1)
        bpy.ops.object.transform_apply(scale=True)
        cu.rotation_euler = (math.pi / 2, 0, 0)
        cu.location = (cx, yF + 0.16, H / 2 - 0.03)
        bpy.ops.object.transform_apply(rotation=True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.subdivide(number_cuts=40)
        bpy.ops.object.mode_set(mode="OBJECT")
        me = cu.data
        for v in me.vertices:
            v.co.y += 0.05 * math.sin(v.co.x * 24.0)
        sol = cu.modifiers.new("sol", "SOLIDIFY")
        sol.thickness = 0.008
        cu.data.materials.append(m_linen)

    # rug under the seating group
    rug = box("Rug", -2.5, 0.9, -1.5, 1.4, 0.0, 0.012, m_rug)
    uv_box(rug, 2.5)

    # ---------------- furniture (PolyHaven, CC0) ----------------
    append_asset("sofa_03", at=(-1.0, 1.15, 0), rot_z=math.pi)       # back to room, faces glass
    append_asset("ArmChair_01", at=(1.35, -0.1, 0), rot_z=math.radians(-125))
    append_asset("coffee_table_round_01", at=(-0.85, -0.45, 0))
    append_asset("ceramic_vase_03", at=(-0.55, -0.5, 0.5), scale=0.7)
    append_asset("side_table_01", at=(-2.75, 0.4, 0), rot_z=0.3)
    append_asset("brass_vase_03", at=(-2.75, 0.4, 0.52))
    append_asset("potted_plant_01", at=(3.5, -2.0, 0), rot_z=0.7)
    append_asset("modern_ceiling_lamp_01", at=(-0.9, -0.3, H))
    append_asset("dining_table", at=(-3.1, 1.9, 0), rot_z=math.pi / 2, scale=0.95)
    append_asset("dining_chair_02", at=(-2.45, 1.55, 0), rot_z=math.radians(160))
    append_asset("dining_chair_02", at=(-2.5, 2.35, 0), rot_z=math.radians(20))

    # ---------------- outside: patio, planters, trees, pool ----------------
    pat = plane("Patio", X0 - 2, X1 + 2, Y0 - 2.1, Y0, -0.02, m_pavers)
    uv_box(pat, 1.0)
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
    pset.count = 22000
    pset.hair_length = 0.11
    pset.length_random = 0.55
    pset.child_type = 'INTERPOLATED'
    pset.rendered_child_count = 14
    pset.child_length = 0.85
    pset.root_radius = 0.018
    pset.material = 2
    pset.use_hair_bspline = True
    append_asset("planter_box_01", at=(-3.4, Y0 - 1.0, 0))
    append_asset("planter_box_01", at=(2.2, Y0 - 1.0, 0), rot_z=0.03)
    append_asset("jacaranda_tree", at=(-5.5, Y0 - 7.5, 0), scale=1.0)
    append_asset("jacaranda_tree", at=(5.0, Y0 - 10.0, 0), rot_z=2.1, scale=0.85)
    append_asset("jacaranda_tree", at=(-0.5, Y0 - 14.0, 0), rot_z=4.0, scale=1.1)
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
    cam.location = (3.45, 2.35, 1.5)
    bpy.context.collection.objects.link(cam)
    tgt = bpy.data.objects.new("InteriorTarget", None)
    tgt.location = (-1.9, -4.3, 0.82)
    bpy.context.collection.objects.link(tgt)
