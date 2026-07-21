"""ARCHVIZ DIORAMA: 3-story boutique office on a rounded-rect plinth.

Premium architectural-diorama style: crisp rectilinear volumes, small bevels,
matte materials, no text/logos.  Iso quadrant is +X/+Y: the front (+Y) and
right (+X) facades are full curtain wall (mullion grid ~1.75-1.67 m, per-floor
spandrel line, one Glass_ pane per grid cell).  Back/left are solid white
plaster with punched Glass_ windows.  Interiors furnished on all 3 floors
(lobby + 2 office floors).  Empties InteriorCam / InteriorTarget on floor 2
(middle office level) looking out through the front curtain wall.

Contract:
  * every pane is its own mesh named Glass_*, all sharing ONE material
    "Building_Glass" (transmission 1.0, rough 0.05, white, IOR 1.45)
  * nothing else has 'glass'/'window' in mesh or material names
  * origin centered, plinth bottom at Z = 0
"""
import bpy
import bmesh
import math
import random

from mathutils import Vector

CAM_SCALE = 3.6  # harness studio shots need wide framing for a 20 m plinth

# ------------------------------------------------------------------ layout
PLINTH_W, PLINTH_D, PLINTH_H, PLINTH_R = 20.0, 16.5, 0.35, 0.8
Z0 = PLINTH_H                      # ground level on top of the plinth
FH = 3.6                           # storey height
BX0, BX1 = -8.5, 5.5               # building footprint X  (14 m)
BY0, BY1 = -7.0, 3.0               # building footprint Y  (10 m)
WALL_T = 0.25
ROOF_Z = Z0 + 3 * FH               # 11.15
PAR_TOP = ROOF_Z + 0.80            # parapet top

# curtain-wall grid
FRONT_XS = [BX0 + i * (BX1 - BX0) / 8 for i in range(9)]    # 8 bays @1.75
RIGHT_YS = [BY0 + i * (BY1 - BY0) / 6 for i in range(7)]    # 6 bays @1.667
ENTRY_I = (3, 4)                   # recessed double-height entry bays
EX0, EX1 = FRONT_XS[3], FRONT_XS[5]        # -3.25 .. 0.25
EY = 1.5                           # recessed entry glass plane
SOFFIT = Z0 + 2 * FH - 0.45        # 7.10  top of the double-height recess

# vision glass zones per storey k: (bottom, top)
VIS = [(Z0 + 0.15, Z0 + FH - 0.45),
       (Z0 + FH + 0.45, Z0 + 2 * FH - 0.45),
       (Z0 + 2 * FH + 0.45, Z0 + 3 * FH - 0.45)]
SPANDREL = [(Z0 + FH - 0.45, Z0 + FH + 0.45),
            (Z0 + 2 * FH - 0.45, Z0 + 2 * FH + 0.45),
            (Z0 + 3 * FH - 0.45, ROOF_Z)]
FLOOR_TOP = [Z0 + 0.04, Z0 + FH + 0.38, Z0 + 2 * FH + 0.38]   # wood tops
CEIL = [Z0 + FH + 0.05, Z0 + 2 * FH + 0.05, ROOF_Z - 0.30]    # undersides

RNG = random.Random(7)

# ------------------------------------------------------------------ materials
_M = {}


def mat(name, color, rough=0.5, metal=0.0, transmission=0.0, ior=None,
        emit=None, estr=0.0):
    if name in _M:
        return _M[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if transmission:
        for k in ("Transmission Weight", "Transmission"):
            if k in b.inputs:
                b.inputs[k].default_value = transmission
                break
    if ior is not None and "IOR" in b.inputs:
        b.inputs["IOR"].default_value = ior
    if emit is not None:
        for k in ("Emission Color", "Emission"):
            if k in b.inputs:
                b.inputs[k].default_value = (*emit, 1.0)
                break
        if "Emission Strength" in b.inputs:
            b.inputs["Emission Strength"].default_value = estr
    _M[name] = m
    return m


def mats():
    return {
        "plaster": mat("Plaster_White", (0.90, 0.90, 0.88), rough=0.8),
        "concrete": mat("Concrete_Warm", (0.58, 0.55, 0.49), rough=0.85),
        "path": mat("Concrete_Path", (0.68, 0.64, 0.57), rough=0.85),
        "oak": mat("Oak_Warm", (0.33, 0.17, 0.065), rough=0.6),
        "frame": mat("Frame_Dark", (0.13, 0.14, 0.15), rough=0.5, metal=0.3),
        "glass": mat("Building_Glass", (1.0, 1.0, 1.0), rough=0.05,
                     transmission=1.0, ior=1.45),
        "foliage": mat("Foliage", (0.075, 0.16, 0.045), rough=0.8),
        "foliage2": mat("Foliage_Deep", (0.048, 0.105, 0.028), rough=0.85),
        "grass_a": mat("Grass_Blade_A", (0.16, 0.27, 0.07), rough=0.85),
        "grass_b": mat("Grass_Blade_B", (0.19, 0.25, 0.05), rough=0.85),
        "lawn": mat("Lawn", (0.14, 0.23, 0.06), rough=0.9),
        "trunk": mat("Trunk", (0.19, 0.12, 0.06), rough=0.8),
        "wfurn": mat("Furniture_White", (0.78, 0.775, 0.74), rough=0.5),
        "dfurn": mat("Furniture_Dark", (0.10, 0.10, 0.11), rough=0.6),
        "pot": mat("Pot_Dark", (0.18, 0.18, 0.19), rough=0.7),
        "hvac": mat("HVAC_Grey", (0.72, 0.73, 0.74), rough=0.6, metal=0.2),
        "gravel": mat("Roof_Gravel", (0.40, 0.375, 0.33), rough=0.95),
        "emit": mat("Pendant_Emit", (1.0, 0.8, 0.55), rough=0.4,
                    emit=(1.0, 0.75, 0.45), estr=2.0),
        "rug": mat("Rug_Warm", (0.24, 0.20, 0.155), rough=0.9),
    }


# ------------------------------------------------------------------ helpers
GROUPS = {}


def bucket(key, ob):
    GROUPS.setdefault(key, []).append(ob)
    return ob


def set_active(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def box(name, m, x0, x1, y0, y1, z0, z1, bevel=0.0, group=None):
    """Axis-aligned box from min/max extents."""
    bpy.ops.mesh.primitive_cube_add(
        size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = ((x1 - x0), (y1 - y0), (z1 - z0))
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        bv = ob.modifiers.new('bv', 'BEVEL')
        bv.width = bevel
        bv.segments = 2
        bv.use_clamp_overlap = True
        set_active(ob)
        bpy.ops.object.modifier_apply(modifier=bv.name)
    ob.data.materials.append(m)
    if group:
        bucket(group, ob)
    return ob


def cyl(name, m, loc, r, depth, verts=20, rot=(0, 0, 0), group=None,
        r2=None, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r,
                                            depth=depth, location=loc,
                                            rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2,
                                        depth=depth, location=loc,
                                        rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(m)
    if smooth:
        set_active(ob)
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            bpy.ops.object.shade_smooth()
    if group:
        bucket(group, ob)
    return ob


def bool_cut(target, cutter):
    md = target.modifiers.new('bool', 'BOOLEAN')
    md.object = cutter
    md.operation = 'DIFFERENCE'
    set_active(target)
    bpy.ops.object.modifier_apply(modifier=md.name)
    me = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.data.meshes.remove(me)


def join(name, objs):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.4
    e.location = loc
    bpy.context.collection.objects.link(e)
    return e


GLASS_COUNT = 0


def pane(name, m, x0, x1, y0, y1, z0, z1):
    global GLASS_COUNT
    ob = box(name, m, x0, x1, y0, y1, z0, z1)
    ob.data.name = name
    ob.visible_shadow = False       # let sun light the interior in previews
    GLASS_COUNT += 1
    return ob


# ------------------------------------------------------------------ plinth
def build_plinth(M):
    bm = bmesh.new()
    hw, hd, r = PLINTH_W / 2, PLINTH_D / 2, PLINTH_R
    seg = 7
    pts = []
    for cx, cy, a0 in ((hw - r, hd - r, 0), (-(hw - r), hd - r, 90),
                       (-(hw - r), -(hd - r), 180), (hw - r, -(hd - r), 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90.0 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    verts = [bm.verts.new((x, y, 0.0)) for x, y in pts]
    face = bm.faces.new(verts)
    ret = bmesh.ops.extrude_face_region(bm, geom=[face])
    up = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=up, vec=(0, 0, PLINTH_H))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("Plinth")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Plinth", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(M["concrete"])
    bv = ob.modifiers.new('bv', 'BEVEL')
    bv.width = 0.05
    bv.segments = 2
    bv.angle_limit = math.radians(35)
    set_active(ob)
    bpy.ops.object.modifier_apply(modifier=bv.name)
    return ob


# ------------------------------------------------------------------ shell
def build_shell(M):
    pl, co = M["plaster"], M["concrete"]
    # back + left solid walls
    back = box("Wall_Back", pl, BX0, BX1, BY0, BY0 + WALL_T, Z0, ROOF_Z)
    left = box("Wall_Left", pl, BX0, BX0 + WALL_T, BY0, BY1, Z0, ROOF_Z)

    # punched windows: back (3 per storey) and left (2 per storey)
    punched = []   # (wall, axis, center, k)
    for k in range(3):
        sill = Z0 + k * FH + 1.0
        for i, cx in enumerate((-4.2, -0.8, 2.6)):
            punched.append((back, 'x', cx, k, i, sill))
        for i, cy in enumerate((-2.6, 0.4)):
            punched.append((left, 'y', cy, k, i, sill))
    W, H = 1.6, 1.5
    for wall, axis, c, k, i, sill in punched:
        if axis == 'x':
            cut = box("cut", pl, c - W / 2, c + W / 2, BY0 - 0.2,
                      BY0 + WALL_T + 0.2, sill, sill + H)
        else:
            cut = box("cut", pl, BX0 - 0.2, BX0 + WALL_T + 0.2,
                      c - W / 2, c + W / 2, sill, sill + H)
        bool_cut(wall, cut)
    # frames + panes for punched openings
    fr = M["frame"]
    t = 0.06
    for wall, axis, c, k, i, sill in punched:
        if axis == 'x':
            y0, y1 = BY0 + 0.02, BY0 + 0.14
            box("PunchTrim", fr, c - W / 2, c + W / 2, y0, y1, sill, sill + t,
                group="frame")
            box("PunchTrim", fr, c - W / 2, c + W / 2, y0, y1,
                sill + H - t, sill + H, group="frame")
            box("PunchTrim", fr, c - W / 2, c - W / 2 + t, y0, y1,
                sill + t, sill + H - t, group="frame")
            box("PunchTrim", fr, c + W / 2 - t, c + W / 2, y0, y1,
                sill + t, sill + H - t, group="frame")
            pane("Glass_B%d_%d" % (k, i), M["glass"], c - W / 2 + t,
                 c + W / 2 - t, BY0 + 0.06, BY0 + 0.08, sill + t, sill + H - t)
        else:
            x0, x1 = BX0 + 0.02, BX0 + 0.14
            box("PunchTrim", fr, x0, x1, c - W / 2, c + W / 2, sill, sill + t,
                group="frame")
            box("PunchTrim", fr, x0, x1, c - W / 2, c + W / 2,
                sill + H - t, sill + H, group="frame")
            box("PunchTrim", fr, x0, x1, c - W / 2, c - W / 2 + t,
                sill + t, sill + H - t, group="frame")
            box("PunchTrim", fr, x0, x1, c + W / 2 - t, c + W / 2,
                sill + t, sill + H - t, group="frame")
            pane("Glass_L%d_%d" % (k, i), M["glass"], BX0 + 0.06, BX0 + 0.08,
                 c - W / 2 + t, c + W / 2 - t, sill + t, sill + H - t)

    # floor slabs (concrete), roof slab, service core
    for k in (1, 2):
        z = Z0 + k * FH
        slab = box("Slab_%d" % k, co, BX0 + 0.1, BX1 - 0.22,
                   BY0 + 0.1, BY1 - 0.22, z - 0.30, z, group="slabs")
        if k == 1:   # double-height entry void
            cut = box("cut", co, EX0, EX1, -0.5, 1.7, z - 0.5, z + 0.2)
            bool_cut(slab, cut)
    box("Slab_Roof", co, BX0, BX1, BY0, BY1, ROOF_Z - 0.30, ROOF_Z,
        group="slabs")
    box("Roof_Topping", M["gravel"], BX0 + 0.28, BX1 - 0.24, BY0 + 0.28,
        BY1 - 0.24, ROOF_Z, ROOF_Z + 0.02, group="slabs")
    box("Core", pl, BX0 + WALL_T, -5.6, BY0 + WALL_T, -4.6, Z0, ROOF_Z - 0.31,
        group="white")

    # parapet ring + dark coping
    box("Parapet_F", pl, BX0 - 0.04, BX1 + 0.08, BY1 - 0.20, BY1 + 0.08,
        ROOF_Z, PAR_TOP, group="white")
    box("Parapet_B", pl, BX0 - 0.04, BX1 + 0.08, BY0 - 0.04, BY0 + 0.24,
        ROOF_Z, PAR_TOP, group="white")
    box("Parapet_L", pl, BX0 - 0.04, BX0 + 0.24, BY0 + 0.24, BY1 - 0.20,
        ROOF_Z, PAR_TOP, group="white")
    box("Parapet_R", pl, BX1 - 0.20, BX1 + 0.08, BY0 + 0.24, BY1 - 0.20,
        ROOF_Z, PAR_TOP, group="white")
    fr = M["frame"]
    box("Coping_F", fr, BX0 - 0.10, BX1 + 0.14, BY1 - 0.26, BY1 + 0.14,
        PAR_TOP, PAR_TOP + 0.06, group="frame")
    box("Coping_B", fr, BX0 - 0.10, BX1 + 0.14, BY0 - 0.10, BY0 + 0.30,
        PAR_TOP, PAR_TOP + 0.06, group="frame")
    box("Coping_L", fr, BX0 - 0.10, BX0 + 0.30, BY0 + 0.30, BY1 - 0.26,
        PAR_TOP, PAR_TOP + 0.06, group="frame")
    box("Coping_R", fr, BX1 - 0.26, BX1 + 0.14, BY0 + 0.30, BY1 - 0.26,
        PAR_TOP, PAR_TOP + 0.06, group="frame")

    # rooftop HVAC
    hv = M["hvac"]
    box("HVAC_1", hv, -7.0, -5.3, -5.9, -4.8, ROOF_Z, ROOF_Z + 0.85,
        bevel=0.03, group="hvac")
    box("HVAC_2", hv, -4.6, -3.5, -6.1, -5.0, ROOF_Z, ROOF_Z + 0.60,
        bevel=0.03, group="hvac")
    box("HVAC_3", hv, 1.4, 2.8, -5.6, -4.7, ROOF_Z, ROOF_Z + 0.70,
        bevel=0.03, group="hvac")
    box("HVAC_Louver", M["frame"], -6.9, -5.4, -4.83, -4.79,
        ROOF_Z + 0.25, ROOF_Z + 0.65, group="frame")
    cyl("HVAC_Fan", M["frame"], (2.1, -5.15, ROOF_Z + 0.70), 0.30, 0.06,
        verts=20, group="hvac")


# ------------------------------------------------------------------ curtain walls
def curtain_front(M):
    fr, gl, pl = M["frame"], M["glass"], M["plaster"]
    Y = BY1
    # vertical mullions
    for i, x in enumerate(FRONT_XS):
        if i == 8:
            continue    # corner column instead
        if i in (3, 4, 5):
            box("MullionV", fr, x - 0.045, x + 0.045, Y - 0.08, Y + 0.08,
                SOFFIT, ROOF_Z, group="frame")
        else:
            box("MullionV", fr, x - 0.045, x + 0.045, Y - 0.08, Y + 0.08,
                Z0, ROOF_Z, group="frame")
    # transoms: split lines avoid the entry recess, high lines run full
    for z in (Z0 + 0.15, VIS[0][1], VIS[1][0]):
        for x0, x1 in ((BX0, EX0), (EX1, BX1)):
            box("Transom", fr, x0, x1, Y - 0.06, Y + 0.06, z - 0.04, z + 0.04,
                group="frame")
    for z in (VIS[1][1], VIS[2][0], VIS[2][1]):
        box("Transom", fr, BX0, BX1, Y - 0.06, Y + 0.06, z - 0.04, z + 0.04,
            group="frame")
    # spandrel panels (white, recessed) + dark base channel
    for si, (s0, s1) in enumerate(SPANDREL):
        segs = ((BX0, EX0), (EX1, BX1)) if si == 0 else ((BX0, BX1),)
        for x0, x1 in segs:
            box("Spandrel", pl, x0 + 0.02, x1 - 0.02, Y - 0.20, Y - 0.09,
                s0, s1, group="white")
    for x0, x1 in ((BX0, EX0), (EX1, BX1)):
        box("BaseChan", fr, x0, x1, Y - 0.10, Y + 0.04, Z0, Z0 + 0.15,
            group="frame")
    # panes: one per bay per storey, skipping the entry recess on k=0,1
    for k in range(3):
        vb, vt = VIS[k]
        for i in range(8):
            if k < 2 and i in ENTRY_I:
                continue
            x0, x1 = FRONT_XS[i] + 0.045, FRONT_XS[i + 1] - 0.045
            pane("Glass_F%d_%d" % (k, i), gl, x0, x1,
                 Y - 0.0425, Y - 0.0175, vb + 0.02, vt - 0.02)


def curtain_right(M):
    fr, gl, pl = M["frame"], M["glass"], M["plaster"]
    X = BX1
    for i, y in enumerate(RIGHT_YS):
        if i == 6:
            continue    # corner column
        box("MullionV", fr, X - 0.08, X + 0.08, y - 0.045, y + 0.045,
            Z0, ROOF_Z, group="frame")
    for z in (Z0 + 0.15, VIS[0][1], VIS[1][0], VIS[1][1], VIS[2][0],
              VIS[2][1]):
        box("Transom", fr, X - 0.06, X + 0.06, BY0, BY1, z - 0.04, z + 0.04,
            group="frame")
    for s0, s1 in SPANDREL:
        box("Spandrel", pl, X - 0.20, X - 0.09, BY0 + 0.02, BY1 - 0.02,
            s0, s1, group="white")
    box("BaseChan", fr, X - 0.10, X + 0.04, BY0, BY1, Z0, Z0 + 0.15,
        group="frame")
    for k in range(3):
        vb, vt = VIS[k]
        for i in range(6):
            y0, y1 = RIGHT_YS[i] + 0.045, RIGHT_YS[i + 1] - 0.045
            pane("Glass_R%d_%d" % (k, i), gl, X - 0.0425, X - 0.0175,
                 y0, y1, vb + 0.02, vt - 0.02)
    # corner column where the two curtain walls meet
    box("CornerCol", fr, BX1 - 0.10, BX1 + 0.10, BY1 - 0.10, BY1 + 0.10,
        Z0, ROOF_Z, group="frame")


def entry(M):
    fr, gl, pl = M["frame"], M["glass"], M["plaster"]
    xm = (EX0 + EX1) / 2      # -1.5
    # recess reveals + soffit (white)
    for xc in (EX0, EX1):
        box("Reveal", pl, xc - 0.075, xc + 0.075, EY - 0.05, BY1 + 0.05,
            Z0, SOFFIT, group="white")
    box("Soffit", pl, EX0 - 0.075, EX1 + 0.075, EY - 0.05, BY1 + 0.05,
        SOFFIT - 0.15, SOFFIT + 0.02, group="white")
    # entry curtain: verticals, door-head transom, base channel
    for x in (EX0, xm, EX1):
        box("EntryMull", fr, x - 0.045, x + 0.045, EY - 0.08, EY + 0.08,
            Z0, SOFFIT, group="frame")
    box("EntryTransom", fr, EX0, EX1, EY - 0.06, EY + 0.06, 2.72, 2.82,
        group="frame")
    box("EntryBase", fr, EX0, EX1, EY - 0.10, EY + 0.04, Z0, Z0 + 0.15,
        group="frame")
    # 4 panes: two door bays below the transom, two double-height uppers
    for j, (x0, x1) in enumerate(((EX0 + 0.045, xm - 0.045),
                                  (xm + 0.045, EX1 - 0.045))):
        pane("Glass_E_D%d" % j, gl, x0, x1, EY - 0.0425, EY - 0.0175,
             Z0 + 0.17, 2.70)
        pane("Glass_E_U%d" % j, gl, x0, x1, EY - 0.0425, EY - 0.0175,
             2.84, SOFFIT - 0.02)
    # door pulls
    for dx in (-0.16, 0.16):
        box("DoorPull", fr, xm + dx - 0.02, xm + dx + 0.02,
            EY - 0.14, EY - 0.10, Z0 + 0.55, Z0 + 1.65, group="frame")
    # thin canopy slab with dark fascia
    box("Canopy", pl, EX0 - 0.35, EX1 + 0.35, EY - 0.15, EY + 3.0,
        3.32, 3.44, bevel=0.015, group="white")
    box("CanopyFascia", fr, EX0 - 0.35, EX1 + 0.35, EY + 2.92, EY + 3.02,
        3.30, 3.46, group="frame")


# ------------------------------------------------------------------ interiors
def wood_floors(M):
    ok = M["oak"]
    g = "wood"
    # ground floor (skip the exterior recess zone)
    box("FloorG_A", ok, BX0 + WALL_T, EX0, BY0 + WALL_T, BY1 - 0.15,
        Z0 + 0.005, FLOOR_TOP[0], group=g)
    box("FloorG_B", ok, EX0, EX1, BY0 + WALL_T, EY - 0.08,
        Z0 + 0.005, FLOOR_TOP[0], group=g)
    box("FloorG_C", ok, EX1, BX1 - 0.15, BY0 + WALL_T, BY1 - 0.15,
        Z0 + 0.005, FLOOR_TOP[0], group=g)
    # floor 1 (void over the lobby) and floor 2
    z = Z0 + FH
    box("Floor1_A", ok, BX0 + WALL_T, EX0, BY0 + 0.15, BY1 - 0.25,
        z + 0.005, FLOOR_TOP[1], group=g)
    box("Floor1_B", ok, EX0, EX1, BY0 + 0.15, -0.5,
        z + 0.005, FLOOR_TOP[1], group=g)
    box("Floor1_C", ok, EX1, BX1 - 0.25, BY0 + 0.15, BY1 - 0.25,
        z + 0.005, FLOOR_TOP[1], group=g)
    z = Z0 + 2 * FH
    box("Floor2", ok, BX0 + WALL_T, BX1 - 0.25, BY0 + 0.15, BY1 - 0.25,
        z + 0.005, FLOOR_TOP[2], group=g)
    # void guardrail on floor 1 (dark, thin)
    fr = M["frame"]
    zr0, zr1 = FLOOR_TOP[1] + 0.90, FLOOR_TOP[1] + 0.96
    box("Rail", fr, EX0 - 0.02, EX1 + 0.02, -0.54, -0.48, zr0, zr1,
        group="frame")
    box("Rail", fr, EX0 - 0.04, EX0 + 0.02, -0.54, 1.55, zr0, zr1,
        group="frame")
    box("Rail", fr, EX1 - 0.02, EX1 + 0.04, -0.54, 1.55, zr0, zr1,
        group="frame")
    for px, py in ((EX0, -0.51), (EX1, -0.51), (EX0, 1.45),
                   (EX1, 1.45), ((EX0 + EX1) / 2, -0.51)):
        box("RailPost", fr, px - 0.02, px + 0.02, py - 0.02, py + 0.02,
            FLOOR_TOP[1], zr0, group="frame")


def desk(M, x, y, z):
    """White desk + dark task chair + small monitor slab; chair on -Y side."""
    wf, df = M["wfurn"], M["dfurn"]
    objs = []
    objs.append(box("DeskTop", wf, x - 0.75, x + 0.75, y - 0.375, y + 0.375,
                    z + 0.70, z + 0.745, bevel=0.01))
    for sx in (-0.71, 0.71):
        objs.append(box("DeskLeg", wf, x + sx - 0.02, x + sx + 0.02,
                        y - 0.34, y + 0.34, z, z + 0.70))
    objs.append(box("Monitor", df, x - 0.26, x + 0.26, y + 0.13, y + 0.16,
                    z + 0.80, z + 1.12))
    objs.append(box("MonFoot", df, x - 0.06, x + 0.06, y + 0.08, y + 0.18,
                    z + 0.745, z + 0.80))
    cy = y - 0.78
    seat = box("ChairSeat", df, x - 0.22, x + 0.22, cy - 0.22, cy + 0.22,
               z + 0.42, z + 0.47, bevel=0.015)
    back = box("ChairBack", df, x - 0.21, x + 0.21, cy - 0.26, cy - 0.21,
               z + 0.47, z + 1.00, bevel=0.015)
    post = cyl("ChairPost", df, (x, cy, z + 0.28), 0.025, 0.30, verts=10,
               smooth=False)
    base = cyl("ChairBase", df, (x, cy, z + 0.045), 0.20, 0.035, verts=14,
               smooth=False)
    for o in objs:
        bucket("wfurn" if o.name.startswith("Desk") else "dfurn", o)
    for o in (seat, back, post, base):
        bucket("dfurn", o)
    return objs


def plant(M, x, y, z, s=1.0):
    cyl("PlantPot", M["pot"], (x, y, z + 0.18 * s), 0.15 * s, 0.36 * s,
        verts=14, group="pot", smooth=False)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.26 * s,
                                          location=(x, y, z + 0.55 * s))
    ob = bpy.context.active_object
    ob.name = "PlantHead"
    ob.scale = (1.0, 0.92, 1.15)
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(M["foliage"])
    set_active(ob)
    bpy.ops.object.shade_smooth()
    bucket("foliage_in", ob)


def pendant(M, x, y, shade_z, ceil_z):
    df = M["dfurn"]
    cyl("PendRod", df, (x, y, (shade_z + 0.16 + ceil_z) / 2), 0.012,
        ceil_z - shade_z - 0.16, verts=8, group="dfurn", smooth=False)
    cyl("PendShade", df, (x, y, shade_z + 0.09), 0.16, 0.18, verts=16,
        r2=0.05, rot=(math.pi, 0, 0), group="dfurn", smooth=False)
    cyl("PendLamp", M["emit"], (x, y, shade_z), 0.11, 0.025, verts=14,
        group="emit", smooth=False)


def tree(M, idx, x, y, h, base_z=Z0):
    th = h * 0.42
    cyl("TreeTrunk", M["trunk"], (x, y, base_z + th / 2), 0.125 * h / 2.8,
        th, verts=10, r2=0.07 * h / 2.8)
    trunk = bpy.context.active_object
    heads = []
    for j, (dz, r, sq) in enumerate(((h * 0.62, h * 0.30, 1.05),
                                     (h * 0.85, h * 0.20, 0.92))):
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=2, radius=r,
            location=(x + RNG.uniform(-0.1, 0.1) * h * 0.1,
                      y + RNG.uniform(-0.1, 0.1) * h * 0.1, base_z + dz))
        ob = bpy.context.active_object
        ob.scale = (1.0, 0.95, sq)
        ob.rotation_euler = (0, 0, RNG.uniform(0, 3.1))
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        ob.data.materials.append(M["foliage2"] if j else M["foliage"])
        set_active(ob)
        bpy.ops.object.shade_smooth()
        heads.append(ob)
    return join("Tree_%d" % idx, [trunk] + heads)


def lobby(M):
    z = FLOOR_TOP[0]
    ok, wf, df = M["oak"], M["wfurn"], M["dfurn"]
    # reception counter facing the entry
    box("Counter", ok, -3.0, 0.0, -2.55, -1.90, z, z + 1.02, bevel=0.02,
        group="wood")
    box("CounterTop", df, -3.06, 0.06, -2.61, -1.84, z + 1.02, z + 1.07,
        group="dfurn")
    box("CounterDeskIn", wf, -2.7, -0.3, -3.15, -2.55, z, z + 0.72,
        group="wfurn")
    # rug on the entry axis
    box("LobbyRug", M["rug"], -3.1, 0.1, -1.3, 0.9, z, z + 0.015,
        group="wood")
    # bench near the front glass + two potted lobby trees
    box("BenchSeat", ok, 1.7, 3.5, 1.75, 2.20, z + 0.40, z + 0.48,
        bevel=0.015, group="wood")
    for bx in (1.85, 3.35):
        box("BenchLeg", df, bx - 0.03, bx + 0.03, 1.80, 2.15, z, z + 0.40,
            group="dfurn")
    for tx, ty in ((-5.6, 1.6), (4.3, 0.7)):
        cyl("LobbyPot", M["pot"], (tx, ty, z + 0.25), 0.30, 0.5, verts=16,
            group="pot", smooth=False)
        t = tree(M, 90 + int(tx), tx, ty, 2.1, base_z=z + 0.4)
        t.name = "LobbyTree"
    # pendants: two over reception, two tall drops in the double-height void
    for px in (-2.3, -0.7):
        pendant(M, px, -2.2, z + 2.30, CEIL[0])
    for px in (-2.2, -0.8):
        pendant(M, px, 0.55, z + 3.9, SOFFIT - 0.13)
    plant(M, 4.9, -6.2, z, 1.1)
    plant(M, -7.7, 2.3, z, 1.0)


def office_floor(M, k):
    z = FLOOR_TOP[k]
    for yrow in (0.9, -1.3):
        for xd in (-4.5, -1.5, 1.5):
            desk(M, xd, yrow, z)
    for xd in (-4.5, -1.5, 1.5):
        pendant(M, xd, -0.2, z + 2.30, CEIL[k])
    plant(M, 4.8, 2.2, z, 1.0)
    plant(M, -6.6, 2.0, z, 0.9)
    plant(M, 4.8, -6.0, z, 1.05)
    if k == 1:
        # lounge pair near the right curtain wall
        df, ok = M["dfurn"], M["oak"]
        box("SofaBase", df, 3.4, 4.3, -4.4, -2.6, z + 0.12, z + 0.42,
            bevel=0.03, group="dfurn")
        box("SofaBack", df, 4.05, 4.3, -4.4, -2.6, z + 0.42, z + 0.80,
            bevel=0.03, group="dfurn")
        box("CoffeeTable", ok, 2.4, 2.9, -4.0, -3.0, z + 0.28, z + 0.34,
            bevel=0.01, group="wood")
    if k == 2:
        # meeting table + chairs near the right curtain wall
        ok, df = M["oak"], M["dfurn"]
        box("MeetTop", ok, 2.6, 4.6, -4.2, -3.2, z + 0.70, z + 0.75,
            bevel=0.01, group="wood")
        box("MeetBase", df, 3.3, 3.9, -3.95, -3.45, z, z + 0.70,
            group="dfurn")
        for cx in (3.0, 4.2):
            for cy in (-4.65, -2.75):
                box("MeetChair", df, cx - 0.2, cx + 0.2, cy - 0.2, cy + 0.2,
                    z + 0.42, z + 0.47, bevel=0.015, group="dfurn")
                byy = (cy - 0.24, cy - 0.19) if cy < -3.7 else (cy + 0.19,
                                                                cy + 0.24)
                box("MeetChairB", df, cx - 0.19, cx + 0.19, byy[0], byy[1],
                    z + 0.47, z + 0.95, bevel=0.015, group="dfurn")


# ------------------------------------------------------------------ landscape
def grass_tufts(M, name, x0, x1, y0, y1, z_top, seed=7, step=0.24):
    """Low-poly turf: small crossed-triangle blade clumps (4-9 cm), two
    green tones, seeded for deterministic rebuilds (~2 tris per tuft)."""
    rng = random.Random(seed)
    bm = bmesh.new()
    yv = y0 + step / 2
    while yv < y1:
        xv = x0 + step / 2
        while xv < x1:
            cx = xv + rng.uniform(-0.09, 0.09)
            cy = yv + rng.uniform(-0.09, 0.09)
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
    ob.data.materials.append(M["grass_a"])
    ob.data.materials.append(M["grass_b"])
    return ob


def landscape(M):
    z = Z0
    # pathway from the entry to the plinth edge
    box("Path", M["path"], -2.8, -0.2, EY, 8.18, z, z + 0.025, group="path")
    # lawns
    box("Lawn_FL", M["lawn"], -9.3, -3.1, 4.0, 7.6, z, z + 0.018,
        group="lawn")
    box("Lawn_FR", M["lawn"], 0.3, 9.3, 4.0, 7.5, z, z + 0.018, group="lawn")
    box("Lawn_R", M["lawn"], 6.6, 9.4, -6.8, 3.4, z, z + 0.018, group="lawn")
    grass_tufts(M, "Turf_FL", -9.3, -3.1, 4.0, 7.6, z + 0.018, seed=21)
    grass_tufts(M, "Turf_FR", 0.3, 9.3, 4.0, 7.5, z + 0.018, seed=22)
    grass_tufts(M, "Turf_R", 6.6, 9.4, -6.8, 3.4, z + 0.018, seed=23)
    # hedges along the base
    hg = M["foliage"]
    box("Hedge_FL", hg, BX0 + 0.3, EX0 - 0.45, 3.32, 3.78, z, z + 0.52,
        bevel=0.03, group="hedge")
    box("Hedge_FR", hg, EX1 + 0.45, BX1 - 0.1, 3.32, 3.78, z, z + 0.52,
        bevel=0.03, group="hedge")
    box("Hedge_R", hg, 5.95, 6.41, BY0 + 0.5, 2.4, z, z + 0.52,
        bevel=0.03, group="hedge")
    box("Hedge_Path", hg, -0.05, 0.41, 4.6, 7.4, z, z + 0.45,
        bevel=0.03, group="hedge")
    # stylized trees
    tree(M, 0, -6.2, 5.6, 3.0)
    tree(M, 1, -4.1, 6.9, 2.4)
    tree(M, 2, 2.9, 5.9, 3.2)
    tree(M, 3, 7.8, -3.2, 2.6)
    tree(M, 4, 5.3, 6.4, 3.4)   # in view from InteriorCam
    # exterior bench beside the path
    box("PathBench", M["oak"], 0.9, 2.5, 4.35, 4.78, z + 0.38, z + 0.46,
        bevel=0.015, group="wood")
    for bx in (1.05, 2.35):
        box("PathBenchLeg", M["dfurn"], bx - 0.03, bx + 0.03, 4.40, 4.73,
            z, z + 0.38, group="dfurn")


# ------------------------------------------------------------------ build
def build():
    M = mats()
    build_plinth(M)
    build_shell(M)
    curtain_front(M)
    curtain_right(M)
    entry(M)
    wood_floors(M)
    lobby(M)
    office_floor(M, 1)
    office_floor(M, 2)
    landscape(M)

    # interior camera anchors (floor 2 = middle office level, eye 1.55 m,
    # in the open office bay clear of the entry void / reveal walls)
    # ground-floor lobby, diagonal sight line: reception/pendants at the frame
    # edges, looking out through the entry glazing at the path, hedge and trees
    empty("InteriorCam", (1.4, -0.8, FLOOR_TOP[0] + 1.55))
    empty("InteriorTarget", (6.2, 12.0, FLOOR_TOP[0] + 0.85))

    # consolidate repeated elements into single meshes (glass stays separate)
    join("Facade_Frames", GROUPS.get("frame", []))
    join("Shell_White", GROUPS.get("white", []))
    join("Slabs", GROUPS.get("slabs", []))
    join("Wood_Elements", GROUPS.get("wood", []))
    join("Desks_White", GROUPS.get("wfurn", []))
    join("Furniture_Dk", GROUPS.get("dfurn", []) + GROUPS.get("pot", []))
    join("Pendant_Lamps", GROUPS.get("emit", []))
    join("Lawns", GROUPS.get("lawn", []))
    join("Hedges", GROUPS.get("hedge", []))
    join("Plants_In", GROUPS.get("foliage_in", []))
    join("Roof_HVAC", GROUPS.get("hvac", []))
    join("Paths", GROUPS.get("path", []))

    n_glass = sum(1 for o in bpy.context.scene.objects
                  if o.type == 'MESH' and o.name.startswith("Glass_"))
    print("OFFICE BUILD DONE: %d glass panes" % n_glass)
