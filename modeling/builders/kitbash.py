"""Kitbash-mass sedan: primitive masses + booleans + big bevel + subsurf.

Fictional EV crossover-sedan. +X nose, +Z up, meters.
"""
import bpy
import bmesh
from math import radians, sin, cos, pi
from mathutils import Vector

import harness

M = {}

# ---------------------------------------------------------------- helpers

def _link(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def loft(name, secs, mat):
    """secs: (x, y_half_bottom, y_half_top, z_bottom, z_top) — 4-vert rings."""
    bm = bmesh.new()
    rings = []
    for (x, yhb, yht, zb, zt) in secs:
        rings.append([bm.verts.new(v) for v in
                      ((x, -yhb, zb), (x, yhb, zb), (x, yht, zt), (x, -yht, zt))])
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _link(name, bm, mat)


def box(name, loc, half, mat, rz=0.0, ry=0.0, rx=0.0):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc, rotation=(rx, ry, rz))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = half
    if mat:
        ob.data.materials.append(mat)
    return ob


def cyl(name, r, depth, loc, mat, rot=(pi / 2, 0, 0), verts=48):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc,
                                        rotation=rot, vertices=verts)
    ob = bpy.context.active_object
    ob.name = name
    if mat:
        ob.data.materials.append(mat)
    return ob


def torus(name, R, r, loc, mat, squash=1.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc,
                                     rotation=(pi / 2, 0, 0),
                                     major_segments=48, minor_segments=12)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (1, 1, squash)  # local z == world y after the rotation
    if mat:
        ob.data.materials.append(mat)
    return ob


def slab_prism(name, quad, depth, mat=None):
    q = [Vector(p) for p in quad]
    n = (q[1] - q[0]).cross(q[2] - q[0]).normalized()
    bm = bmesh.new()
    lo = [bm.verts.new(p - n * depth) for p in q]
    hi = [bm.verts.new(p + n * depth) for p in q]
    bm.faces.new(lo)
    bm.faces.new(list(reversed(hi)))
    for i in range(4):
        bm.faces.new((lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _link(name, bm, mat)


def prism_y(name, pts, y0, y1, mat=None):
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for (x, z) in pts]
    b = [bm.verts.new((x, y1, z)) for (x, z) in pts]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    n = len(pts)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _link(name, bm, mat)


def thin(name, outer_pts, inner_pts, mat):
    bm = bmesh.new()
    o = [bm.verts.new(Vector(p)) for p in outer_pts]
    i = [bm.verts.new(Vector(p)) for p in inner_pts]
    bm.faces.new(o)
    bm.faces.new(list(reversed(i)))
    for k in range(4):
        bm.faces.new((o[k], o[(k + 1) % 4], i[(k + 1) % 4], i[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _link(name, bm, mat)


def bool_op(target, cutter, op='DIFFERENCE'):
    md = target.modifiers.new("bool", 'BOOLEAN')
    md.object = cutter
    md.operation = op
    try:
        md.solver = 'EXACT'
    except Exception:
        pass
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def bevel(ob, w, seg, ang):
    md = ob.modifiers.new("bev", 'BEVEL')
    md.width = w
    md.segments = seg
    md.limit_method = 'ANGLE'
    md.angle_limit = radians(ang)
    md.miter_outer = 'MITER_ARC'


def subsurf(ob, lv):
    md = ob.modifiers.new("subd", 'SUBSURF')
    md.levels = lv
    md.render_levels = lv


def smooth(ob, angle=40):
    for p in ob.data.polygons:
        p.use_smooth = True
    for sel in list(bpy.context.selected_objects):
        sel.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    try:
        bpy.ops.object.shade_auto_smooth(angle=radians(angle))
    except Exception:
        pass


def shrink(poly, f=0.93):
    cx = sum(p[0] for p in poly) / len(poly)
    cz = sum(p[1] for p in poly) / len(poly)
    return [(cx + (x - cx) * f, cz + (z - cz) * f) for (x, z) in poly]


def loft6(name, secs, mat):
    """secs: (x, yhb, ymid, yht, zb, zmid, zt) — 6-vert crowned rings."""
    bm = bmesh.new()
    rings = []
    for (x, yhb, ymid, yht, zb, zmid, zt) in secs:
        rings.append([bm.verts.new(v) for v in
                      ((x, -yhb, zb), (x, yhb, zb), (x, ymid, zmid),
                       (x, yht, zt), (x, -yht, zt), (x, -ymid, zmid))])
    n = 6
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _link(name, bm, mat)


BS = [(-2.38, 0.62, 0.72, 0.70, 0.30, 0.62, 0.75),
      (-2.24, 0.70, 0.80, 0.775, 0.22, 0.62, 0.785),
      (-2.05, 0.75, 0.86, 0.835, 0.175, 0.62, 0.80),
      (-1.35, 0.80, 0.92, 0.885, 0.155, 0.62, 0.795),
      (-0.20, 0.82, 0.925, 0.895, 0.155, 0.60, 0.79),
      (0.90, 0.81, 0.915, 0.885, 0.155, 0.58, 0.775),
      (1.60, 0.78, 0.885, 0.855, 0.16, 0.56, 0.745),
      (2.10, 0.72, 0.83, 0.80, 0.19, 0.53, 0.685),
      (2.26, 0.67, 0.78, 0.75, 0.235, 0.50, 0.645),
      (2.34, 0.60, 0.70, 0.67, 0.32, 0.48, 0.60)]


def body_wall_y(x, z):
    xs = [s[0] for s in BS]
    x = min(max(x, xs[0]), xs[-1])
    a, b = BS[0], BS[1]
    for i in range(len(BS) - 1):
        if x <= BS[i + 1][0]:
            a, b = BS[i], BS[i + 1]
            break
    t = (x - a[0]) / (b[0] - a[0])
    yhb, ymid, yht, zb, zmid, zt = [a[k] + (b[k] - a[k]) * t for k in range(1, 7)]
    if z <= zmid:
        u = min(max((z - zb) / max(zmid - zb, 1e-6), 0.0), 1.0)
        return yhb + (ymid - yhb) * u
    u = min(max((z - zmid) / max(zt - zmid, 1e-6), 0.0), 1.0)
    return ymid + (yht - ymid) * u


def seam(name, xx, s, z0, z1, steps=7):
    bm = bmesh.new()
    prev = None
    for i in range(steps):
        z = z0 + (z1 - z0) * i / (steps - 1)
        y = body_wall_y(xx, z) - 0.002
        vo1 = bm.verts.new((xx - 0.0045, s * y, z))
        vo2 = bm.verts.new((xx + 0.0045, s * y, z))
        vi1 = bm.verts.new((xx - 0.0045, s * (y - 0.035), z))
        vi2 = bm.verts.new((xx + 0.0045, s * (y - 0.035), z))
        if prev:
            po1, po2, pi1, pi2 = prev
            bm.faces.new((po1, po2, vo2, vo1))
            bm.faces.new((po1, vo1, vi1, pi1))
            bm.faces.new((po2, pi2, vi2, vo2))
        prev = (vo1, vo2, vi1, vi2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _link(name, bm, M["trim"])


# ------------------------------------------------------------- greenhouse math

CS = [(-1.95, 0.75, 0.64, 0.72, 0.89),
      (-0.75, 0.845, 0.565, 0.72, 1.425),
      (-0.10, 0.855, 0.575, 0.72, 1.435),
      (1.05, 0.80, 0.73, 0.72, 0.84)]


def wall_y(x, z):
    xs = [s[0] for s in CS]
    x = min(max(x, xs[0]), xs[-1])
    a, b = CS[0], CS[1]
    for i in range(len(CS) - 1):
        if x <= CS[i + 1][0]:
            a, b = CS[i], CS[i + 1]
            break
    t = (x - a[0]) / (b[0] - a[0])
    yhb = a[1] + (b[1] - a[1]) * t
    yht = a[2] + (b[2] - a[2]) * t
    zb = a[3] + (b[3] - a[3]) * t
    zt = a[4] + (b[4] - a[4]) * t
    u = min(max((z - zb) / max(zt - zb, 1e-6), 0.0), 1.0)
    return yhb + (yht - yhb) * u


FP = [(0.80, 0.88), (-0.28, 0.88), (-0.28, 1.33), (-0.067, 1.33)]
RP = [(-0.37, 0.88), (-1.30, 0.88), (-0.98, 1.28), (-0.39, 1.325)]

WS_GLASS = [(0.982, -0.666, 0.875), (0.982, 0.666, 0.875),
            (-0.0614, 0.525, 1.415), (-0.0614, -0.525, 1.415)]
WS_CUT = [(0.934, -0.614, 0.90), (0.934, 0.614, 0.90),
          (-0.0227, 0.485, 1.395), (-0.0227, -0.485, 1.395)]
RW_GLASS = [(-1.824, -0.577, 0.955), (-1.824, 0.577, 0.955),
            (-0.841, 0.516, 1.385), (-0.841, -0.516, 1.385)]
RW_CUT = [(-1.744, -0.527, 0.99), (-1.744, 0.527, 0.99),
          (-0.910, 0.475, 1.355), (-0.910, -0.475, 1.355)]


def side_pane(name, poly, s):
    outer, inner = [], []
    for (x, z) in poly:
        y = wall_y(x, z) - 0.010
        outer.append((x, s * y, z))
        inner.append((x, s * (y - 0.012), z))
    if s < 0:  # keep winding sane
        outer = list(reversed(outer))
        inner = list(reversed(inner))
    return thin(name, outer, inner, M["glass"])


def plane_pane(name, quad):
    q = [Vector(p) for p in quad]
    n = (q[1] - q[0]).cross(q[2] - q[0]).normalized()
    if n.z < 0:
        n = -n
    outer = [p + n * 0.004 for p in q]
    inner = [p - n * 0.010 for p in q]
    return thin(name, outer, inner, M["glass"])


# ---------------------------------------------------------------- big parts

def build_body():
    body = loft6("Body", BS, M["paint"])

    hood = loft("_hood", [(0.80, 0.79, 0.85, 0.55, 0.86),
                          (1.75, 0.76, 0.825, 0.55, 0.795),
                          (2.31, 0.58, 0.67, 0.44, 0.66)], None)
    bool_op(body, hood, 'UNION')
    trunk = loft("_trunk", [(-2.37, 0.60, 0.69, 0.55, 0.85),
                            (-2.10, 0.68, 0.775, 0.55, 0.88),
                            (-1.35, 0.74, 0.83, 0.55, 0.865)], None)
    bool_op(body, trunk, 'UNION')

    for x in (1.40, -1.40):
        for s in (1, -1):
            c = cyl("_arch", 0.415, 0.5, (x, s * 0.80, 0.355), None)
            bool_op(body, c, 'DIFFERENCE')

    bevel(body, 0.045, 3, 26)
    subsurf(body, 2)
    smooth(body, 40)
    return body


def build_cabin():
    cab = loft("Greenhouse", CS[::-1], M["paint"])

    hollow = box("_hollow", (-0.525, 0, 1.04), (1.325, 0.72, 0.30), None)
    bool_op(cab, hollow, 'DIFFERENCE')

    for poly in (FP, RP):
        cut = prism_y("_wincut", shrink(poly, 0.93), -1.02, 1.02)
        bool_op(cab, cut, 'DIFFERENCE')

    bool_op(cab, slab_prism("_wscut", WS_CUT, 0.35), 'DIFFERENCE')
    bool_op(cab, slab_prism("_rwcut", RW_CUT, 0.35), 'DIFFERENCE')

    bevel(cab, 0.03, 2, 30)
    smooth(cab, 60)
    return cab


def build_glass():
    plane_pane("Windshield", WS_GLASS)
    plane_pane("RearWindow", RW_GLASS)
    side_pane("WindowFrontL", FP, 1)
    side_pane("WindowFrontR", FP, -1)
    side_pane("WindowRearL", RP, 1)
    side_pane("WindowRearR", RP, -1)


def build_interior():
    im = M["interior"]
    box("Int_Floor", (-0.50, 0, 0.80), (1.35, 0.71, 0.012), im)
    prism_y("Int_Dash", [(0.46, 0.79), (0.92, 0.79), (0.92, 0.885), (0.46, 1.10)],
            -0.70, 0.70, im)
    box("Int_Console", (0.10, 0, 0.85), (0.42, 0.11, 0.06), im)
    box("Int_Shelf", (-1.57, 0, 0.945), (0.15, 0.70, 0.010), im)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.022,
                                     location=(0.42, 0.36, 1.02),
                                     rotation=(0, radians(-75), 0),
                                     major_segments=32, minor_segments=10)
    sw = bpy.context.active_object
    sw.name = "Int_Wheel"
    sw.data.materials.append(im)
    smooth(sw)
    cyl("Int_Column", 0.030, 0.24, (0.50, 0.36, 0.985), im, rot=(0, radians(-75), 0), verts=16)
    for s in (1, -1):
        box("Int_SeatBase", (-0.20, s * 0.38, 0.86), (0.26, 0.24, 0.075), im)
        box("Int_SeatBack", (-0.52, s * 0.38, 1.03), (0.06, 0.23, 0.16), im, ry=radians(-12))
        box("Int_HeadRest", (-0.58, s * 0.38, 1.25), (0.045, 0.09, 0.055), im)
    box("Int_BenchBase", (-1.00, 0, 0.86), (0.28, 0.63, 0.07), im)
    box("Int_BenchBack", (-1.32, 0, 0.96), (0.06, 0.62, 0.15), im, ry=radians(-18))


def build_wheel(x, s):
    y = s * 0.775
    t = cyl("Tire", 0.355, 0.25, (x, y, 0.355), M["tire"])
    bevel(t, 0.05, 2, 40)
    smooth(t, 50)
    b = cyl("RimBarrel", 0.215, 0.22, (x, y, 0.355), M["rim"], verts=32)
    smooth(b, 50)
    d = cyl("RimDisc", 0.25, 0.035, (x, s * 0.9025, 0.355), M["rim"], verts=32)
    bevel(d, 0.012, 2, 40)
    smooth(d, 50)
    for i in range(5):
        a = i * 2 * pi / 5 + 0.35
        box("RimSlot", (x + 0.145 * cos(a), s * 0.921, 0.355 + 0.145 * sin(a)),
            (0.068, 0.0045, 0.022), M["trim"], ry=-a)
    cyl("HubCap", 0.05, 0.016, (x, s * 0.924, 0.355), M["chrome"], verts=24)


def build_arch_lips():
    for x in (1.40, -1.40):
        for s in (1, -1):
            cyl("WellCap", 0.40, 0.07, (x, s * 0.585, 0.405), M["trim"], verts=32)
            liner = cyl("WellLiner", 0.412, 0.33, (x, s * 0.755, 0.355), M["trim"], verts=40)
            inner = cyl("_linercut", 0.364, 0.40, (x, s * 0.755, 0.355), None, verts=40)
            bool_op(liner, inner, 'DIFFERENCE')
            below = box("_linerlow", (x, s * 0.755, -0.16), (0.6, 0.35, 0.22), None)
            bool_op(liner, below, 'DIFFERENCE')
            smooth(liner, 50)


def chrome_mat():
    return M["chrome"]


def build_details():
    tm, hd, tl, pm = M["trim"], M["light_head"], M["light_tail"], M["paint"]
    box("Underpan", (0, 0, 0.135), (1.85, 0.62, 0.035), tm)
    for s in (1, -1):
        box("Rocker", (0, s * 0.895, 0.19), (0.96, 0.03, 0.045), tm)
    # front fascia
    box("LightBar_F", (2.29, 0, 0.625), (0.045, 0.54, 0.016), hd)
    for s in (1, -1):
        box("HeadLamp", (2.28, s * 0.50, 0.48), (0.06, 0.18, 0.022), hd, rz=s * radians(-14))
    box("Intake_F", (2.28, 0, 0.33), (0.05, 0.40, 0.075), tm)
    box("Lip_F", (2.20, 0, 0.16), (0.12, 0.60, 0.05), tm)
    # rear fascia
    box("LightBar_R", (-2.34, 0, 0.80), (0.05, 0.68, 0.022), tl)
    box("Trim_R", (-2.33, 0, 0.32), (0.05, 0.44, 0.07), tm)
    box("Diffuser", (-2.24, 0, 0.17), (0.13, 0.55, 0.055), tm)
    box("PlateRecess", (-2.345, 0, 0.55), (0.03, 0.20, 0.085), tm)
    box("Ducktail", (-2.32, 0, 0.862), (0.08, 0.52, 0.012), pm)
    # dark panoramic roof panel
    thin("Roof_Panel",
         [(-0.12, -0.44, 1.4405), (-0.12, 0.44, 1.4405),
          (-0.74, 0.44, 1.4310), (-0.74, -0.44, 1.4310)],
         [(-0.12, -0.44, 1.4285), (-0.12, 0.44, 1.4285),
          (-0.74, 0.44, 1.4190), (-0.74, -0.44, 1.4190)], tm)
    # cowl trim at windshield base
    thin("CowlTrim",
         [(1.052, -0.728, 0.838), (1.052, 0.728, 0.838),
          (0.982, 0.720, 0.874), (0.982, -0.720, 0.874)],
         [(1.052, -0.728, 0.824), (1.052, 0.728, 0.824),
          (0.982, 0.720, 0.860), (0.982, -0.720, 0.860)], tm)
    # mirrors
    for s in (1, -1):
        box("MirrorStalk", (0.60, s * 0.945, 0.815), (0.028, 0.075, 0.013), tm, rx=s * radians(32))
        mh = box("MirrorHead", (0.58, s * 1.035, 0.875), (0.048, 0.062, 0.040), tm)
        bevel(mh, 0.018, 2, 30)
        smooth(mh, 40)
        box("MirrorFace", (0.534, s * 1.035, 0.875), (0.004, 0.055, 0.034), chrome_mat())


# ---------------------------------------------------------------- entry point

def build():
    global M
    M = harness.mats()
    g = M["glass"]
    try:
        bsdf = g.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Alpha"].default_value = 0.42
        bsdf.inputs["Base Color"].default_value = (0.55, 0.62, 0.68, 1.0)
        g.blend_method = 'BLEND'
        g.use_backface_culling = False
    except Exception:
        pass
    build_body()
    build_cabin()
    build_glass()
    build_interior()
    for x in (1.40, -1.40):
        for s in (1, -1):
            build_wheel(x, s)
    build_arch_lips()
    build_details()
