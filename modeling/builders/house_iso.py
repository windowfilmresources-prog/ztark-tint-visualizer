"""ARCHVIZ DIORAMA — modern flat-roof residence for the tint visualizer.

Two offset volumes on a rounded-rect concrete plinth:
  A) 2-story white-plaster volume 9 x 8 m — ground floor is a full-height
     4-pane glass slider wall, upper floor a 3-pane horizontal band.
  B) 1-story wood-slat wing 7 x 6 m pulled 2 m proud — big corner glass
     (3 front panes + 2 side panes, slim corner post).
Furnished interiors (living room + kitchen island + stairs hint), lawn,
rounded pool with deck strip, hedges, stylized trees.

HARD CONTRACTS honored here:
  * every tintable pane = its own mesh named Glass_* sharing ONE material
    named exactly "Building_Glass" (transmission 1, rough .05, IOR 1.45)
  * empties "InteriorCam" (in living room) and "InteriorTarget" (outside)
  * origin centered, plinth bottom at Z=0, Blender +Z up, meters
"""
import bpy
import bmesh
import math
import random
from mathutils import Vector

Z0 = 0.35          # plinth top
CAM_SCALE = 3.1    # harness quick-look framing for an ~21 m diorama


# ---------------------------------------------------------------- materials

def _principled(name, color, metallic=0.0, roughness=0.5, transmission=0.0,
                ior=None, emission=None, emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    for key in ("Transmission Weight", "Transmission"):
        if key in b.inputs:
            b.inputs[key].default_value = transmission
            break
    if ior is not None and "IOR" in b.inputs:
        b.inputs["IOR"].default_value = ior
    if emission is not None:
        for key in ("Emission Color", "Emission"):
            if key in b.inputs:
                b.inputs[key].default_value = (*emission, 1.0)
                break
        if "Emission Strength" in b.inputs:
            b.inputs["Emission Strength"].default_value = emission_strength
    return m


_M = {}

def mats():
    if _M:
        return _M
    _M.update({
        "plaster":  _principled("White_Plaster", (0.90, 0.90, 0.88), roughness=0.8),
        "concrete": _principled("Warm_Concrete", (0.80, 0.78, 0.74), roughness=0.85),
        "oak":      _principled("Warm_Oak", (0.62, 0.45, 0.28), roughness=0.6),
        "frame":    _principled("Dark_Frame", (0.13, 0.14, 0.15), metallic=0.3, roughness=0.5),
        "glass":    _principled("Building_Glass", (1.0, 1.0, 1.0), roughness=0.05,
                                transmission=1.0, ior=1.45),
        "foliage":  _principled("Foliage", (0.075, 0.16, 0.045), roughness=0.8),
        "foliage2": _principled("Foliage_Deep", (0.048, 0.105, 0.028), roughness=0.85),
        "lawn":     _principled("Lawn", (0.14, 0.23, 0.06), roughness=0.9),
        "grass_a":  _principled("Grass_Blade_A", (0.16, 0.27, 0.07), roughness=0.85),
        "grass_b":  _principled("Grass_Blade_B", (0.19, 0.25, 0.05), roughness=0.85),
        "trunk":    _principled("Trunk", (0.19, 0.12, 0.06), roughness=0.85),
        "water":    _principled("Pool_Water", (0.30, 0.55, 0.68), roughness=0.08),
        "fabric":   _principled("Sofa_Fabric", (0.58, 0.55, 0.50), roughness=0.9),
        "fabric2":  _principled("Cushion_Fabric", (0.70, 0.66, 0.58), roughness=0.9),
        "rug":      _principled("Rug", (0.78, 0.73, 0.64), roughness=0.95),
        "lamp":     _principled("Lamp_Shade", (1.0, 0.88, 0.66), roughness=0.4,
                                emission=(1.0, 0.80, 0.52), emission_strength=2.0),
    })
    return _M


# ---------------------------------------------------------------- helpers

def _finish(ob, mat, bevel=0.0, smooth=False):
    if bevel > 0:
        mod = ob.modifiers.new('bv', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.data.materials.append(mat)
    if smooth:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            bpy.ops.object.shade_smooth()
    return ob


def B(name, x0, x1, y0, y1, za, zb, mat, bevel=0.0, smooth=False, abs_z=False,
      rot=None):
    """Axis-aligned box from absolute bounds; z measured from plinth top."""
    zoff = 0.0 if abs_z else Z0
    loc = ((x0 + x1) / 2, (y0 + y1) / 2, zoff + (za + zb) / 2)
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (abs(x1 - x0), abs(y1 - y0), abs(zb - za))
    if rot is not None:
        ob.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    return _finish(ob, mat, bevel, smooth)


def C(name, x, y, za, zb, r, mat, verts=24, smooth=True, rtop=None):
    zoff = Z0
    if rtop is None:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=verts, radius=r, depth=zb - za,
            location=(x, y, zoff + (za + zb) / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(
            vertices=verts, radius1=r, radius2=rtop, depth=zb - za,
            location=(x, y, zoff + (za + zb) / 2))
    ob = bpy.context.active_object
    ob.name = name
    return _finish(ob, mat, 0.0, smooth)


def rounded_slab(name, cx, cy, sx, sy, z_bottom, h, r, mat, seg=7, abs_z=True):
    """Rounded-rectangle slab (plinth, pool coping)."""
    zoff = 0.0 if abs_z else Z0
    hx, hy = sx / 2 - r, sy / 2 - r
    corners = [(hx, hy, 0.0), (-hx, hy, 90.0), (-hx, -hy, 180.0), (hx, -hy, 270.0)]
    pts = []
    for ox, oy, a0 in corners:
        for i in range(seg + 1):
            a = math.radians(a0 + 90.0 * i / seg)
            pts.append((cx + ox + r * math.cos(a), cy + oy + r * math.sin(a)))
    bm = bmesh.new()
    verts = [bm.verts.new((p[0], p[1], zoff + z_bottom)) for p in pts]
    face = bm.faces.new(verts)
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [v for v in res['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, 0, h))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def glazed_run(prefix, face, pos, u0, u1, za, zb, n_panes, m,
               depth=0.14, member=0.07, mullion=0.06, sill=0.06):
    """Glass wall run: dark frame + n thin Glass_* panes.

    face='Y' -> wall runs along X, normal +-Y, pos = Y center of frame.
    face='X' -> wall runs along Y, normal +-X, pos = X center of frame.
    """
    d0, d1 = pos - depth / 2, pos + depth / 2
    gd0, gd1 = pos - 0.01, pos + 0.01
    fr = mats()["frame"]

    def fbox(name, a0, a1, zlo, zhi):
        if face == 'Y':
            B(name, a0, a1, d0, d1, zlo, zhi, fr)
        else:
            B(name, d0, d1, a0, a1, zlo, zhi, fr)

    # sill / head / jambs
    fbox(prefix + "_Sill", u0, u1, za, za + sill)
    fbox(prefix + "_Head", u0, u1, zb - member, zb)
    fbox(prefix + "_JambA", u0, u0 + member, za + sill, zb - member)
    fbox(prefix + "_JambB", u1 - member, u1, za + sill, zb - member)

    iu0, iu1 = u0 + member, u1 - member
    span = (iu1 - iu0 - (n_panes - 1) * mullion) / n_panes
    gz0, gz1 = za + sill, zb - member
    cursor = iu0
    for i in range(n_panes):
        p0, p1 = cursor, cursor + span
        if face == 'Y':
            B("Glass_" + prefix + str(i + 1), p0 + 0.005, p1 - 0.005,
              gd0, gd1, gz0 + 0.005, gz1 - 0.005, m["glass"])
        else:
            B("Glass_" + prefix + str(i + 1), gd0, gd1,
              p0 + 0.005, p1 - 0.005, gz0 + 0.005, gz1 - 0.005, m["glass"])
        cursor = p1
        if i < n_panes - 1:
            fbox(prefix + "_Mul" + str(i + 1), cursor, cursor + mullion, gz0, gz1)
            cursor += mullion


# ---------------------------------------------------------------- site

def build_site(m):
    rounded_slab("Plinth", 0, 0, 21.0, 16.0, 0.0, Z0, 0.8, m["concrete"])
    # lawn patches (front yard + side strips), thin slabs sunk into plinth top
    B("Lawn_Front", -9.9, 9.9, -7.7, -2.7, -0.01, 0.03, m["lawn"])
    B("Lawn_Left", -9.9, -8.7, -2.7, 7.0, -0.01, 0.03, m["lawn"])
    B("Lawn_Right", 7.7, 9.9, -2.7, 6.8, -0.01, 0.03, m["lawn"])
    grass_tufts("Turf_Front", -9.9, 9.9, -7.7, -2.7, Z0 + 0.03, seed=11,
                avoid=((-6.4, -0.6, -6.75, -3.65),    # pool + coping
                       (-6.4, -0.6, -7.55, -6.5),     # deck
                       (0.0, 2.3, -6.6, -3.4)))       # loungers/umbrella pad
    grass_tufts("Turf_Left", -9.9, -8.7, -2.7, 7.0, Z0 + 0.03, seed=12)
    grass_tufts("Turf_Right", 7.7, 9.9, -2.7, 6.8, Z0 + 0.03, seed=13)

    # pool: concrete rim (basin) + glossy water inside + oak deck strip
    B("Pool_RimN", -6.25, -0.75, -4.05, -3.80, 0.02, 0.16, m["concrete"], bevel=0.04, smooth=True)
    B("Pool_RimS", -6.25, -0.75, -6.60, -6.35, 0.02, 0.16, m["concrete"], bevel=0.04, smooth=True)
    B("Pool_RimW", -6.25, -6.00, -6.60, -3.80, 0.02, 0.16, m["concrete"], bevel=0.04, smooth=True)
    B("Pool_RimE", -1.00, -0.75, -6.60, -3.80, 0.02, 0.16, m["concrete"], bevel=0.04, smooth=True)
    B("Pool_Water", -6.02, -0.98, -6.37, -4.03, 0.02, 0.125, m["water"])
    B("Pool_Deck", -6.25, -0.75, -7.45, -6.58, 0.01, 0.085, m["oak"], bevel=0.012)

    # stepping pavers from terrace to pool
    for i, y in enumerate((-2.95, -3.55)):
        B("Paver%d" % i, -3.75, -3.15, y, y + 0.48, 0.02, 0.055, m["concrete"])

    # pool loungers + umbrella + side table on the east lawn
    for j, yc in enumerate((-5.55, -4.35)):
        B("Lounger%d_Seat" % j, 0.1, 1.8, yc - 0.33, yc + 0.33, 0.10, 0.22,
          m["fabric2"], bevel=0.025, smooth=True)
        B("Lounger%d_Back" % j, 1.45, 2.15, yc - 0.33, yc + 0.33, 0.16, 0.28,
          m["fabric2"], bevel=0.025, smooth=True, rot=(0, math.radians(-38), 0))
        for lx in (0.28, 1.55):
            B("Lounger%d_Leg%s" % (j, lx), lx, lx + 0.06, yc - 0.30, yc + 0.30,
              0.02, 0.10, m["oak"])
    C("Umbrella_Pole", 2.45, -4.95, 0.02, 2.15, 0.035, m["frame"], verts=12)
    C("Umbrella_Canopy", 2.45, -4.95, 1.75, 2.18, 1.25, m["rug"],
      verts=10, rtop=0.05)
    C("SideTable", 1.0, -4.95, 0.02, 0.45, 0.22, m["oak"], verts=16)

    # hedges: back edge line + right edge run
    for i in range(9):
        x = -8.7 + i * 2.05
        B("Hedge_Back%d" % i, x, x + 1.75, 7.35, 7.9, 0.0, 0.78, m["foliage"],
          bevel=0.14, smooth=True)
    for i in range(3):
        y = -1.7 + i * 2.3
        B("Hedge_Right%d" % i, 9.2, 9.85, y, y + 1.9, 0.0, 0.7, m["foliage"],
          bevel=0.14, smooth=True)


def grass_tufts(name, x0, x1, y0, y1, z_top, seed=7, step=0.24, avoid=()):
    """Low-poly turf: crossed-triangle blade clumps scattered over a lawn
    rect. Two green tones on alternating clumps give the surface depth; the
    seeded RNG keeps rebuilds deterministic. ~2 tris per tuft — cheap.
    avoid: (x0,x1,y0,y1) rects (pool, deck...) that get no tufts.
    Blades are small (4-9 cm) so the interior camera reads turf, not
    miniature pine trees."""
    m = mats()
    rng = random.Random(seed)
    bm = bmesh.new()
    yv = y0 + step / 2
    while yv < y1:
        xv = x0 + step / 2
        while xv < x1:
            cx = xv + rng.uniform(-0.09, 0.09)
            cy = yv + rng.uniform(-0.09, 0.09)
            if any(a[0] <= cx <= a[1] and a[2] <= cy <= a[3] for a in avoid):
                xv += step
                continue
            hgt = rng.uniform(0.04, 0.09)
            w = rng.uniform(0.02, 0.04)
            a = rng.uniform(0, math.pi)
            lx = rng.uniform(-0.04, 0.04)
            ly = rng.uniform(-0.04, 0.04)
            mi = 0 if rng.random() < 0.62 else 1
            for k in range(2):
                aa = a + k * math.pi / 2 + rng.uniform(-0.35, 0.35)
                dx, dy = math.cos(aa) * w, math.sin(aa) * w
                v1 = bm.verts.new((cx - dx, cy - dy, z_top))
                v2 = bm.verts.new((cx + dx, cy + dy, z_top))
                v3 = bm.verts.new((cx + lx, cy + ly, z_top + hgt))
                f = bm.faces.new((v1, v2, v3))
                f.material_index = mi
            xv += step
        yv += step
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(m["grass_a"])
    ob.data.materials.append(m["grass_b"])
    return ob


def tree(name, x, y, s, lean=0.0):
    m = mats()
    C(name + "_Trunk", x, y, 0.0, 1.15 * s, 0.10 * s, m["trunk"],
      verts=12, rtop=0.055 * s)
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=2, radius=0.85 * s,
        location=(x + 0.06 * s, y - 0.04 * s, Z0 + 1.45 * s))
    c1 = bpy.context.active_object
    c1.name = name + "_Crown1"
    c1.scale = (1.0, 0.94, 0.82)
    c1.rotation_euler = (0.1, lean, 0.7)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    _finish(c1, m["foliage"], 0.0, True)
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=2, radius=0.52 * s,
        location=(x - 0.22 * s, y + 0.18 * s, Z0 + 2.05 * s))
    c2 = bpy.context.active_object
    c2.name = name + "_Crown2"
    c2.scale = (1.0, 0.9, 0.78)
    c2.rotation_euler = (0.0, -0.15, 1.9)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    _finish(c2, m["foliage2"], 0.0, True)


# ---------------------------------------------------------------- main volume

def build_main(m):
    # outer bounds X -8.5..0.5, Y -0.5..7.5, walls to 6.2, roof to 6.55
    W = m["plaster"]
    B("MainWall_L", -8.5, -8.32, -0.5, 7.5, 0.0, 6.2, W)
    B("MainWall_Back", -8.5, 0.5, 7.32, 7.5, 0.0, 6.2, W)
    # right wall with doorway to the wing (gap Y 0.6..1.8, h 2.2)
    B("MainWall_R1", 0.32, 0.5, -0.5, 0.6, 0.0, 6.2, W)
    B("MainWall_R2", 0.32, 0.5, 1.8, 7.5, 0.0, 6.2, W)
    B("MainWall_R3", 0.32, 0.5, 0.6, 1.8, 2.2, 6.2, W)
    B("Door_Threshold", 0.32, 0.5, 0.6, 1.8, 0.0, 0.05, m["oak"])
    # front: ground-floor piers + header over sliders
    B("MainWall_FP1", -8.5, -8.0, -0.5, -0.32, 0.0, 2.9, W)
    B("MainWall_FP2", 0.0, 0.5, -0.5, -0.32, 0.0, 2.9, W)
    B("MainWall_FHead", -8.5, 0.5, -0.5, -0.32, 2.9, 3.4, W)
    # upper front: sill band, band-side piers, top band
    B("MainWall_FUSill", -8.5, 0.5, -0.5, -0.32, 3.4, 4.0, W)
    B("MainWall_FUP1", -8.5, -7.6, -0.5, -0.32, 4.0, 5.3, W)
    B("MainWall_FUP2", -1.4, 0.5, -0.5, -0.32, 4.0, 5.3, W)
    B("MainWall_FUTop", -8.5, 0.5, -0.5, -0.32, 5.3, 6.2, W)
    # floors / ceiling / roof
    B("Main_FloorGF", -8.32, 0.32, -0.32, 7.32, 0.0, 0.05, m["oak"])
    B("Main_Slab", -8.32, 0.32, -0.32, 7.32, 3.0, 3.25, W)
    B("Main_FloorUp", -8.32, 0.32, -0.32, 7.32, 3.25, 3.30, m["oak"])
    # white ceiling under the roof slab — without it the dark roof underside
    # reads as a black void from the interior camera
    B("Main_CeilUp", -8.32, 0.32, -0.32, 7.32, 6.05, 6.2, W)
    B("Main_Roof", -9.2, 1.2, -1.2, 8.2, 6.2, 6.55, m["frame"], bevel=0.02)

    # glass: ground-floor 4-pane slider wall + upper 3-pane band
    glazed_run("Slider", 'Y', -0.41, -8.0, 0.0, 0.0, 2.9, 4, m)
    glazed_run("Band", 'Y', -0.41, -7.6, -1.4, 4.0, 5.3, 3, m)


# ---------------------------------------------------------------- wing

def slat_wall(prefix, face, fpos, outward, u0, u1, za, zb, m,
              slat_w=0.09, gap=0.055):
    """Vertical oak slats proud of a wall face at plane fpos.

    outward = +1/-1 sign of the face normal along its axis; slats span from
    0.012 inside the face to 0.022 beyond it (always overlapping the wall).
    """
    lo = fpos - 0.012 * outward
    hi = fpos + 0.022 * outward
    u = u0 + 0.03
    i = 0
    while u + slat_w <= u1 - 0.02:
        if face == 'Y':
            B("%s_Slat%d" % (prefix, i), u, u + slat_w, lo, hi, za, zb, m["oak"])
        else:
            B("%s_Slat%d" % (prefix, i), lo, hi, u, u + slat_w, za, zb, m["oak"])
        u += slat_w + gap
        i += 1


def build_wing(m):
    # outer bounds X 0.5..7.5, Y -2.5..3.5, walls to 2.75, roof to 3.08
    O = m["oak"]
    B("WingWall_Back", 0.5, 7.5, 3.32, 3.5, 0.0, 2.75, O)
    B("WingWall_RSolid", 7.32, 7.5, 1.4, 3.5, 0.0, 2.75, O)
    B("WingWall_FPier", 0.5, 2.9, -2.5, -2.32, 0.0, 2.75, O)
    B("WingWall_LFront", 0.5, 0.68, -2.5, -0.5, 0.0, 2.75, O)
    # corner post + headers over the corner glass
    B("Wing_CornerPost", 7.38, 7.5, -2.5, -2.38, 0.0, 2.75, m["frame"])
    B("Wing_HeadF", 2.9, 7.5, -2.5, -2.32, 2.55, 2.75, m["frame"])
    B("Wing_HeadS", 7.32, 7.5, -2.5, 1.4, 2.55, 2.75, m["frame"])
    # floor / ceiling / roof
    B("Wing_Floor", 0.5, 7.32, -2.32, 3.32, 0.0, 0.05, O)
    B("Wing_Ceil", 0.5, 7.32, -2.32, 3.32, 2.60, 2.75, m["plaster"])
    B("Wing_Roof", 0.35, 8.15, -3.1, 4.1, 2.75, 3.08, m["frame"], bevel=0.02)

    # slat cladding on visible solid oak faces
    slat_wall("WingF", 'Y', -2.5, -1, 0.55, 2.85, 0.04, 2.74, m)
    slat_wall("WingR", 'X', 7.5, +1, 1.45, 3.45, 0.04, 2.74, m)
    slat_wall("WingLF", 'X', 0.5, -1, -2.45, -0.55, 0.04, 2.74, m)
    slat_wall("WingB", 'Y', 3.5, +1, 0.55, 7.45, 0.04, 2.74, m)

    # corner glass: 3 panes front + 2 panes side
    glazed_run("WingF", 'Y', -2.41, 2.9, 7.38, 0.0, 2.55, 3, m)
    glazed_run("WingS", 'X', 7.41, -2.38, 1.4, 0.0, 2.55, 2, m)


# ---------------------------------------------------------------- interiors

def build_living(m):
    fl = 0.045   # 5 mm below the oak floor top: bases sink in, no coplanar faces
    B("Rug", -5.9, -2.3, 0.45, 2.95, fl, fl + 0.015, m["rug"])
    # L-sofa facing the sliders
    B("Sofa_Base", -5.8, -3.2, 2.45, 3.35, fl, fl + 0.40, m["fabric"], bevel=0.03, smooth=True)
    B("Sofa_Back", -5.8, -3.2, 3.15, 3.42, fl + 0.40, fl + 0.86, m["fabric"], bevel=0.03, smooth=True)
    B("Sofa_Chaise", -5.8, -4.85, 1.15, 2.45, fl, fl + 0.40, m["fabric"], bevel=0.03, smooth=True)
    B("Sofa_Cush1", -5.72, -4.56, 3.05, 3.32, fl + 0.40, fl + 0.78, m["fabric2"], bevel=0.04, smooth=True)
    B("Sofa_Cush2", -4.46, -3.28, 3.05, 3.32, fl + 0.40, fl + 0.78, m["fabric2"], bevel=0.04, smooth=True)
    B("Sofa_Arm", -3.2, -3.02, 2.45, 3.42, fl, fl + 0.55, m["fabric"], bevel=0.03, smooth=True)
    # coffee table between sofa and armchair
    B("Coffee_Top", -4.75, -3.95, 0.95, 1.55, fl + 0.32, fl + 0.38, m["oak"], bevel=0.012)
    for dx, dy in ((-4.70, 1.00), (-4.05, 1.00), (-4.70, 1.45), (-4.05, 1.45)):
        B("Coffee_Leg", dx, dx + 0.05, dy, dy + 0.05, fl, fl + 0.32, m["frame"])
    # right-side vignette by the sliders: armchair + floor lamp + tall plant
    # (sits inside the InteriorCam view cone, which crosses the room diagonally)
    B("Chair_Seat", -3.75, -3.05, 0.45, 1.15, fl, fl + 0.40, m["fabric"], bevel=0.03, smooth=True)
    B("Chair_Back", -3.75, -3.05, 1.05, 1.30, fl + 0.40, fl + 0.82, m["fabric"], bevel=0.03, smooth=True)
    B("Chair_ArmL", -3.80, -3.72, 0.45, 1.30, fl, fl + 0.56, m["fabric"], bevel=0.025, smooth=True)
    B("Chair_ArmR", -3.08, -3.00, 0.45, 1.30, fl, fl + 0.56, m["fabric"], bevel=0.025, smooth=True)
    C("Lamp_Pole", -2.6, 0.55, fl, fl + 1.42, 0.02, m["frame"], verts=12)
    C("Lamp_Base", -2.6, 0.55, fl, fl + 0.03, 0.14, m["frame"], verts=18)
    C("Lamp_Glow", -2.6, 0.55, fl + 1.42, fl + 1.70, 0.16, m["lamp"], verts=18)
    # tall potted plant near the right end of the sliders
    C("Plant_Pot", -1.9, 0.5, fl, fl + 0.38, 0.19, m["concrete"], verts=16, rtop=0.15)
    C("Plant_Stem", -1.9, 0.5, fl + 0.38, fl + 1.05, 0.025, m["trunk"], verts=8)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.36,
                                          location=(-1.9, 0.5, Z0 + fl + 1.22))
    pl = bpy.context.active_object
    pl.name = "Plant_Leaves"
    pl.scale = (1.0, 0.9, 1.15)
    bpy.ops.object.transform_apply(scale=True)
    _finish(pl, m["foliage"], 0.0, True)
    # wall shelf + sideboard + books on the back wall
    B("Shelf", -6.4, -3.8, 7.10, 7.32, 1.45, 1.50, m["oak"])
    for i, (w, h, mm) in enumerate(((0.28, 0.20, "frame"), (0.35, 0.16, "oak"),
                                    (0.22, 0.22, "fabric"), (0.30, 0.14, "rug"))):
        x = -6.2 + i * 0.62
        B("Shelf_Book%d" % i, x, x + w, 7.14, 7.30, 1.50, 1.50 + h, m[mm])
    B("Sideboard", -6.3, -3.9, 6.85, 7.30, fl, fl + 0.52, m["oak"], bevel=0.015)
    # hint of stairs along the left wall, rising to the back
    for i in range(8):
        y = 4.55 + i * 0.27
        B("Stair%d" % i, -8.32, -7.30, y, y + 0.27, fl, fl + (i + 1) * 0.185, m["oak"])
    # upstairs: console + emissive table lamp tall enough to show in the band
    B("Up_Console", -6.3, -3.9, -0.28, 0.24, 3.295, 3.86, m["oak"], bevel=0.015)
    C("Up_LampBase", -5.9, 0.0, 3.86, 4.04, 0.04, m["frame"], verts=12)
    C("Up_LampGlow", -5.9, 0.0, 4.04, 4.26, 0.10, m["lamp"], verts=14)
    B("Up_Bed", -5.6, -3.4, 4.2, 6.4, 3.295, 3.72, m["fabric2"], bevel=0.04, smooth=True)
    B("Up_BedHead", -5.6, -3.4, 6.4, 6.6, 3.295, 4.15, m["oak"])


def build_kitchen(m):
    fl = 0.045
    # island + oak counter top
    B("Island_Body", 3.0, 5.2, -0.35, 0.55, fl, fl + 0.87, m["plaster"], bevel=0.015)
    B("Island_Top", 2.92, 5.28, -0.43, 0.63, fl + 0.87, fl + 0.93, m["oak"], bevel=0.01)
    # 3 stools on the glass side
    for i, x in enumerate((3.5, 4.1, 4.7)):
        C("Stool%d_Leg" % i, x, -0.85, fl, fl + 0.58, 0.028, m["frame"], verts=12)
        C("Stool%d_Seat" % i, x, -0.85, fl + 0.58, fl + 0.64, 0.17, m["oak"], verts=18)
    # 2 pendant lamps over the island (emissive)
    for i, x in enumerate((3.6, 4.6)):
        C("Pendant%d_Cord" % i, x, 0.1, 1.92, 2.60, 0.008, m["frame"], verts=8)
        C("Pendant%d_Glow" % i, x, 0.1, 1.70, 1.92, 0.15, m["lamp"], verts=18, rtop=0.05)
    # back counter run + open shelf + tall unit
    B("Counter_Body", 1.2, 6.6, 2.75, 3.32, fl, fl + 0.87, m["plaster"], bevel=0.012)
    B("Counter_Top", 1.14, 6.66, 2.70, 3.32, fl + 0.87, fl + 0.92, m["oak"])
    B("Counter_Shelf", 1.4, 6.4, 3.06, 3.30, 1.68, 1.74, m["oak"])
    for i, x in enumerate((2.0, 2.5, 4.9)):
        C("Jar%d" % i, x, 3.05, fl + 0.92, fl + 1.12 + 0.05 * i, 0.07, m["rug"], verts=12)
    B("TallUnit", 6.7, 7.32, 1.5, 2.3, fl, fl + 2.05, m["frame"], bevel=0.012)


# ---------------------------------------------------------------- anchors

def anchors():
    # diagonal sight line: from the left half of the living room out through
    # slider pane 3 toward the pool/loungers — the in-room path is long enough
    # for the armchair/lamp/plant vignette to fall inside a 55 deg view cone.
    cam = bpy.data.objects.new("InteriorCam", None)
    cam.empty_display_size = 0.3
    cam.location = (-6.2, 2.55, Z0 + 1.55)   # ~2.96 m back from the glass
    bpy.context.collection.objects.link(cam)
    tgt = bpy.data.objects.new("InteriorTarget", None)
    tgt.empty_display_size = 0.3
    tgt.location = (-0.2, -4.6, Z0 + 1.40)   # over the pool water, outside
    bpy.context.collection.objects.link(tgt)


# ---------------------------------------------------------------- build

def build():
    m = mats()
    build_site(m)
    build_main(m)
    build_wing(m)
    build_living(m)
    build_kitchen(m)
    tree("TreeA", -9.3, -6.2, 1.5, lean=0.08)
    tree("TreeB", 9.55, -6.9, 1.15, lean=-0.06)
    tree("TreeC", -9.35, 6.5, 1.3, lean=0.05)
    tree("TreeD", 0.7, -7.45, 1.3, lean=-0.04)   # fills the interior-view sky
    anchors()
