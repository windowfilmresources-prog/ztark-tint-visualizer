"""Profile-curve driven brandless sedan.

Technique B: side profile + plan outline defined as data tables first,
validated numerically, then lofted with bmesh station rings + subsurf.
Greenhouse is a separate linear loft (no subsurf) so windshield / rear
glass rake lines stay perfectly straight.

Key numbers (target / plan):
  length 4.75 (cage 4.81, subsurf shrink ~0.05)   width 1.84 (cage bulge 1.015*w)
  height 1.44 (cabin exact)   wheelbase 2.80 axles +-1.40   rocker 0.16
  belt 0.78   windshield rake atan(0.52/0.87)=30.9 deg   rear atan(0.49/1.0)=26.1 deg
  roof half width 0.57 = 0.62 * 1.84
"""
import bpy
import bmesh
import math
import harness
from mathutils import Vector

# ---------------------------------------------------------------- profiles
# x, half_width, z_bottom, z_belt, z_top(centerline)   nose -> tail
SECS = [
    ( 2.38, 0.620, 0.32, 0.63, 0.700),
    ( 2.34, 0.720, 0.24, 0.67, 0.745),
    ( 2.22, 0.800, 0.18, 0.71, 0.785),
    ( 2.05, 0.850, 0.16, 0.735, 0.812),
    ( 1.80, 0.875, 0.16, 0.76, 0.832),
    ( 1.50, 0.895, 0.16, 0.775, 0.858),
    ( 1.20, 0.905, 0.16, 0.785, 0.885),
    ( 1.00, 0.910, 0.16, 0.790, 0.910),   # cowl / hood trailing edge
    ( 0.60, 0.915, 0.16, 0.785, 0.800),
    ( 0.20, 0.920, 0.16, 0.780, 0.795),
    (-0.30, 0.920, 0.16, 0.780, 0.795),
    (-0.80, 0.915, 0.16, 0.785, 0.800),
    (-1.30, 0.905, 0.16, 0.795, 0.815),
    (-1.75, 0.890, 0.16, 0.810, 0.875),   # decklid leading edge
    (-2.05, 0.865, 0.17, 0.825, 0.890),
    (-2.25, 0.820, 0.20, 0.830, 0.875),
    (-2.38, 0.730, 0.26, 0.800, 0.845),
    (-2.43, 0.620, 0.33, 0.720, 0.780),
]

# cabin stations: x, y_base, z_base, y_top, z_top
CST = [
    ( 1.05, 0.835, 0.775, 0.665, 0.915),   # cowl (windshield base)
    ( 0.18, 0.855, 0.760, 0.570, 1.440),   # A pillar top
    (-0.85, 0.845, 0.770, 0.570, 1.420),   # C pillar top
    (-1.80, 0.780, 0.830, 0.650, 0.940),   # rear glass base on deck
]

WS_N = Vector((0.5166, 0.0, 0.8562))  # windshield plane outward normal
RW_N = Vector((-0.4510, 0.0, 0.8925)) # rear glass plane outward normal

AXLE_F, AXLE_R = 1.40, -1.40
WHEEL_R, TIRE_W, WHEEL_Y = 0.355, 0.245, 0.75
ARCH_R = 0.415


# ---------------------------------------------------------------- helpers
def _link(name, bm, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat is not None:
        me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def _apply_mod(ob, name):
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=name)


def _bool_cut(target, cutter):
    md = target.modifiers.new("boolcut", 'BOOLEAN')
    md.object = cutter
    md.operation = 'DIFFERENCE'
    _apply_mod(target, md.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def _box(name, loc, size, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    if mat is not None:
        ob.data.materials.append(mat)
    return ob


def _cyl(name, loc, r, depth, mat, verts=48, rot=(math.pi / 2, 0, 0), smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth,
                                        location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    if mat is not None:
        ob.data.materials.append(mat)
    if smooth:
        bpy.ops.object.shade_smooth()
    return ob


def _prism(name, poly, dirv, dist, mat=None):
    """Closed prism: polygon swept +-dist along dirv (boolean cutter)."""
    bm = bmesh.new()
    d = Vector(dirv) * dist
    a = [bm.verts.new(Vector(p) - d) for p in poly]
    b = [bm.verts.new(Vector(p) + d) for p in poly]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    n = len(poly)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _link(name, bm, mat)


def _shrink(poly, f):
    c = Vector((0, 0, 0))
    for p in poly:
        c += Vector(p)
    c /= len(poly)
    return [c + (Vector(p) - c) * f for p in poly]


def _pane(name, poly, mat, out_dir):
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(p)) for p in poly]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(Vector(out_dir)) < 0:
        f.normal_flip()
    f.smooth = False
    return _link(name, bm, mat)


# ---------------------------------------------------------------- cabin math
def cab_edges(x):
    xs = [s[0] for s in CST]
    x = min(max(x, xs[-1]), xs[0])
    for i in range(len(CST) - 1):
        x0, x1 = CST[i][0], CST[i + 1][0]
        if x1 <= x <= x0:
            t = (x0 - x) / (x0 - x1)
            a, b = CST[i], CST[i + 1]
            return tuple(a[j] + t * (b[j] - a[j]) for j in (1, 2, 3, 4))
    return CST[-1][1:]


def side_y(x, z):
    yb, zb, yt, zt = cab_edges(x)
    t = (z - zb) / max(zt - zb, 1e-6)
    return yb + t * (yt - yb)


# ---------------------------------------------------------------- body
def section_pts(w, zb, belt, top):
    d1, d2 = belt - zb, top - belt
    return [
        (0.00, zb),
        (0.55 * w, zb),
        (0.88 * w, zb + 0.03),
        (1.015 * w, zb + 0.42 * d1),   # widest bulge (compensates subsurf shrink)
        (1.005 * w, zb + 0.80 * d1),
        (0.955 * w, belt),             # shoulder / character line
        (0.80 * w, belt + 0.55 * d2),
        (0.45 * w, belt + 0.92 * d2),
        (0.00, top),
    ]


def build_body(m):
    bm = bmesh.new()
    rings = []
    for (x, w, zb, belt, top) in SECS:
        pts = section_pts(w, zb, belt, top)
        ring = [bm.verts.new((x, 0.0, pts[0][1]))]
        for j in range(1, 8):
            ring.append(bm.verts.new((x, pts[j][0], pts[j][1])))
        ring.append(bm.verts.new((x, 0.0, pts[8][1])))
        for j in range(7, 0, -1):
            ring.append(bm.verts.new((x, -pts[j][0], pts[j][1])))
        rings.append(ring)
    nr = len(rings)
    for i in range(nr - 1):
        for j in range(16):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % 16],
                          rings[i + 1][(j + 1) % 16], rings[i + 1][j]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    cl = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    bm.edges.ensure_lookup_table()
    for i in range(nr - 1):
        for idx, val in ((5, 0.85), (11, 0.85), (2, 0.45), (14, 0.45)):
            e = bm.edges.get((rings[i][idx], rings[i + 1][idx]))
            if e:
                e[cl] = val

    body = _link("BodyShell", bm, m["paint"], smooth=True)
    md = body.modifiers.new("sub", 'SUBSURF')
    md.levels = 2
    md.render_levels = 2
    _apply_mod(body, md.name)

    # wheel arches (separate per side so the underbody keeps its floor)
    for x in (AXLE_F, AXLE_R):
        for s in (1, -1):
            cut = _cyl("cut", (x, s * 0.83, WHEEL_R), ARCH_R, 0.62, None, verts=64)
            _bool_cut(body, cut)
    # door shutlines as thin boolean grooves (follow the surface exactly)
    for s_ in (1, -1):
        for gx, z0, z1 in ((0.85, 0.18, 0.79), (-0.28, 0.18, 0.79), (-1.02, 0.55, 0.79)):
            g = _box("groove", (gx, s_ * 0.905, (z0 + z1) * 0.5),
                     (0.012, 0.10, z1 - z0), None)
            bpy.ops.object.transform_apply(scale=True)
            _bool_cut(body, g)
    for gx, gz in ((1.06, 0.895), (-1.82, 0.885)):
        g = _box("groove", (gx, 0, gz), (0.012, 1.30, 0.12), None)
        bpy.ops.object.transform_apply(scale=True)
        _bool_cut(body, g)
    try:
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.shade_auto_smooth(angle=math.radians(38))
    except Exception:
        bpy.ops.object.shade_smooth()

    # dark wheel-well liners
    for x in (AXLE_F, AXLE_R):
        for s in (1, -1):
            _cyl("WellLiner", (x, s * 0.68, 0.40), 0.398, 0.34, m["trim"], verts=48)
    return body


# ---------------------------------------------------------------- cabin
def build_cabin(m):
    bm = bmesh.new()
    rings = []
    for (x, yb, zb, yt, zt) in CST:
        ring = [bm.verts.new((x, yb, zb)), bm.verts.new((x, yt, zt)),
                bm.verts.new((x, -yt, zt)), bm.verts.new((x, -yb, zb))]
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(4):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % 4],
                          rings[i + 1][(j + 1) % 4], rings[i + 1][j]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cabin = _link("Cabin", bm, m["paint"])

    sol = cabin.modifiers.new("sol", 'SOLIDIFY')
    sol.thickness = 0.035
    sol.offset = -1.0
    _apply_mod(cabin, sol.name)

    # window opening cutters
    ws = [Vector(( 1.05,  0.665, 0.915)), Vector((1.05, -0.665, 0.915)),
          Vector(( 0.18, -0.57, 1.44)), Vector((0.18,  0.57, 1.44))]
    _bool_cut(cabin, _prism("cutWS", _shrink(ws, 0.94), WS_N, 0.22))
    rw = [Vector((-0.85,  0.57, 1.42)), Vector((-0.85, -0.57, 1.42)),
          Vector((-1.80, -0.65, 0.94)), Vector((-1.80,  0.65, 0.94))]
    _bool_cut(cabin, _prism("cutRW", _shrink(rw, 0.94), RW_N, 0.22))

    fr_dlo = [(0.99, 0.795), (0.10, 1.365), (-0.245, 1.37), (-0.245, 0.795)]
    rr_dlo = [(-0.315, 0.795), (-0.315, 1.37), (-0.86, 1.36), (-1.32, 0.80)]
    for s in (1, -1):
        for tag, dlo in (("F", fr_dlo), ("R", rr_dlo)):
            poly = [Vector((x, s * side_y(x, z), z)) for (x, z) in dlo]
            _bool_cut(cabin, _prism("cutSide" + tag, poly, (0, s, 0), 0.30))

    return fr_dlo, rr_dlo


# ---------------------------------------------------------------- glass
def build_glass(m, fr_dlo, rr_dlo):
    g = m["glass"]
    try:
        g.surface_render_method = 'BLENDED'
    except Exception:
        try:
            g.blend_method = 'BLEND'
        except Exception:
            pass
    bsdf = g.node_tree.nodes["Principled BSDF"]
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.50
    bsdf.inputs["Base Color"].default_value = (0.08, 0.10, 0.11, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.05

    ws = [Vector(( 1.05,  0.665, 0.915)), Vector((1.05, -0.665, 0.915)),
          Vector(( 0.18, -0.57, 1.44)), Vector((0.18,  0.57, 1.44))]
    _pane("Windshield", [p + WS_N * 0.012 for p in _shrink(ws, 0.985)], g, WS_N)
    rw = [Vector((-0.85,  0.57, 1.42)), Vector((-0.85, -0.57, 1.42)),
          Vector((-1.80, -0.65, 0.94)), Vector((-1.80,  0.65, 0.94))]
    _pane("RearWindow", [p + RW_N * 0.012 for p in _shrink(rw, 0.985)], g, RW_N)

    for s, sfx in ((1, "L"), (-1, "R")):
        for tag, dlo in (("Front", fr_dlo), ("Rear", rr_dlo)):
            c = [sum(p[0] for p in dlo) / len(dlo), sum(p[1] for p in dlo) / len(dlo)]
            grown = [(c[0] + (x - c[0]) * 1.02, c[1] + (z - c[1]) * 1.02) for (x, z) in dlo]
            poly = [Vector((x, s * (side_y(x, z) + 0.014), z)) for (x, z) in grown]
            _pane("Window" + tag + sfx, poly, g, (0, s, 0))


# ---------------------------------------------------------------- interior
def build_bpillar(m):
    for sgn in (1, -1):
        pts = [(-0.235, 0.79), (-0.235, 1.36), (-0.325, 1.36), (-0.325, 0.79)]
        poly = [Vector((x, sgn * (side_y(x, z) + 0.016), z)) for (x, z) in pts]
        _pane("BPillarTrim", poly, m["trim"], (0, sgn, 0))


def build_interior(m):
    it = m["interior"]
    _box("IntFloor", (-0.45, 0, 0.74), (2.60, 1.62, 0.10), it)
    _box("IntDash", (0.78, 0, 0.825), (0.40, 1.40, 0.13), it)
    _box("IntConsole", (0.05, 0, 0.82), (0.90, 0.28, 0.12), it)
    _box("IntShelf", (-1.58, 0, 0.845), (0.44, 1.40, 0.04), it)
    # steering wheel + column (driver = +Y left)
    bpy.ops.mesh.primitive_torus_add(location=(0.42, 0.36, 0.97),
                                     rotation=(0, math.radians(-72), 0),
                                     major_radius=0.17, minor_radius=0.022)
    sw = bpy.context.active_object
    sw.name = "IntWheel"
    sw.data.materials.append(it)
    bpy.ops.object.shade_smooth()
    _cyl("IntColumn", (0.56, 0.36, 0.94), 0.030, 0.30, it, verts=16,
         rot=(0, math.radians(-72), 0))
    for s in (1, -1):
        _box("IntSeatCush", (-0.10, s * 0.37, 0.84), (0.52, 0.50, 0.13), it)
        _box("IntSeatBack", (-0.38, s * 0.37, 1.05), (0.14, 0.50, 0.42), it, rot=(0, -0.20, 0))
        _box("IntHeadrest", (-0.47, s * 0.37, 1.30), (0.10, 0.26, 0.15), it, rot=(0, -0.20, 0))
    _box("IntBenchCush", (-1.15, 0, 0.84), (0.50, 1.46, 0.13), it)
    _box("IntBenchBack", (-1.42, 0, 1.02), (0.14, 1.46, 0.36), it, rot=(0, -0.25, 0))


# ---------------------------------------------------------------- wheels
def build_wheels(m):
    for x in (AXLE_F, AXLE_R):
        for s in (1, -1):
            tire = _cyl("Tire", (x, s * WHEEL_Y, WHEEL_R), WHEEL_R, TIRE_W, m["tire"])
            bv = tire.modifiers.new("bev", 'BEVEL')
            bv.width = 0.05
            bv.segments = 3
            bv.angle_limit = math.radians(50)
            _cyl("RimBack", (x, s * 0.856, WHEEL_R), 0.245, 0.02, m["trim"], verts=40)
            for k in range(5):
                a = k * 2 * math.pi / 5
                _box("Spoke",
                     (x + 0.105 * math.sin(a), s * 0.870, WHEEL_R + 0.105 * math.cos(a)),
                     (0.040, 0.026, 0.19), m["rim"], rot=(0, a, 0))
            _cyl("Hub", (x, s * 0.876, WHEEL_R), 0.050, 0.035, m["rim"], verts=24)
            bpy.ops.mesh.primitive_torus_add(location=(x, s * 0.872, WHEEL_R),
                                             rotation=(math.pi / 2, 0, 0),
                                             major_radius=0.215, minor_radius=0.012)
            ring = bpy.context.active_object
            ring.name = "RimRing"
            ring.data.materials.append(m["rim"])
            bpy.ops.object.shade_smooth()


# ---------------------------------------------------------------- details
def build_details(m):
    tr, ch, pa = m["trim"], m["chrome"], m["paint"]
    # door seams + handles + sills + mirrors
    for s in (1, -1):
        _box("Handle1", (0.30, s * 0.882, 0.72), (0.17, 0.035, 0.03), tr,
             rot=(s * 0.18, 0, 0))
        _box("Handle2", (-0.68, s * 0.878, 0.72), (0.17, 0.035, 0.03), tr,
             rot=(s * 0.18, 0, 0))
        _box("Sill", (0.0, s * 0.865, 0.19), (1.90, 0.06, 0.09), tr)
        _box("MirrorStalk", (0.80, s * 0.875, 0.79), (0.05, 0.09, 0.025), tr)
        _box("MirrorHead", (0.79, s * 0.965, 0.83), (0.10, 0.15, 0.09), pa,
             rot=(0, 0, s * 0.15))
        # headlight blade
        _box("HeadLamp", (2.33, s * 0.50, 0.655), (0.12, 0.32, 0.045), m["light_head"],
             rot=(0, 0, s * 0.25))
        _box("TailWrap", (-2.33, s * 0.68, 0.80), (0.10, 0.12, 0.045), m["light_tail"],
             rot=(0, 0, -s * 0.45))
    _box("TailBar", (-2.37, 0, 0.80), (0.07, 1.32, 0.045), m["light_tail"])
    _box("CowlVent", (1.00, 0, 0.888), (0.10, 1.28, 0.02), tr)
    _box("Grille", (2.36, 0, 0.50), (0.09, 0.70, 0.14), tr, rot=(0, -0.10, 0))
    _box("GrilleTrim", (2.37, 0, 0.595), (0.05, 0.74, 0.02), ch, rot=(0, -0.10, 0))
    _box("Intake", (2.34, 0, 0.26), (0.10, 1.00, 0.12), tr)
    _box("Diffuser", (-2.28, 0, 0.24), (0.10, 0.98, 0.10), tr)
    _box("Plate", (-2.415, 0, 0.52), (0.02, 0.40, 0.13), ch)


# ---------------------------------------------------------------- report
def report():
    bpy.context.view_layer.update()
    lo = Vector((9e9, 9e9, 9e9))
    hi = Vector((-9e9, -9e9, -9e9))
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.name.startswith(("Studio_", "IntFloor")):
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    print("CHECK length=%.3f width=%.3f height=%.3f" %
          (hi.x - lo.x, hi.y - lo.y, hi.z - lo.z))
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.name.startswith("Studio_"):
            continue
        xs, ys, zs = [], [], []
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
        if max(xs) > 2.5 or min(xs) < -2.55 or max(zs) > 1.5 or max(ys) > 1.15:
            print("OUTLIER %s x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]" %
                  (ob.name, min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
    print("CHECK ws_rake=%.1f rear_rake=%.1f" %
          (math.degrees(math.atan2(1.44 - 0.92, 1.05 - 0.18)),
           math.degrees(math.atan2(1.42 - 0.93, 1.85 - 0.85))))


def _debug_scene():
    bpy.context.view_layer.update()
    cab = bpy.data.objects.get("Cabin")
    if cab:
        roof = [pl for pl in cab.data.polygons if pl.center.z > 1.40]
        if roof:
            xs = [pl.center.x for pl in roof]
            print("DBG roof faces=%d x[%.2f..%.2f]" % (len(roof), min(xs), max(xs)))
            up = sum(1 for pl in roof if pl.normal.z > 0.5)
            print("DBG roof up-normals=%d" % up)
        print("DBG cabin maxz=%.3f" % max(v.co.z for v in cab.data.vertices))
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.name.startswith("Studio_"):
            continue
        zs = [(ob.matrix_world @ Vector(c)).z for c in ob.bound_box]
        if max(zs) > 1.30:
            print("DBG tall: %s maxz=%.3f" % (ob.name, max(zs)))


def build():
    m = harness.mats()
    build_body(m)
    fr, rr = build_cabin(m)
    build_glass(m, fr, rr)
    build_bpillar(m)
    build_interior(m)
    build_wheels(m)
    build_details(m)
    _debug_scene()
    report()
