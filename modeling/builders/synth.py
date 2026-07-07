"""Synth sedan — clean-sheet synthesis of the four prototypes.

Steals:
  cage.py    — subsurf quad-cage lower body + solidified canopy, raycast-fit glass
  kitbash.py — multi-part wheel (tire/barrel/flush disc/slots/hub) + well liner/cap
  detail.py  — layered fascias (grille slats, projector lamps, diffuser fins),
               flush door handles, wipers, B-pillar trim
  profile.py — numeric proportion validation before rendering

Fixes vs the judged round:
  * wheel track derived from the MEASURED fender-lip y of the built body, so the
    tire outer face sits 1.5 cm inboard of the arch — never floating outboard.
  * per-side arch cuts (floor stays closed), dark liners + well caps seat wheels.
  * firmer nose: higher z_top at the nose stations + strong nose-ring crease.
"""
import bpy
import bmesh
import math
import harness
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

AXLE_F, AXLE_R = 1.40, -1.40
WHEEL_R = 0.355
ARCH_R = 0.43


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


# ---------------------------------------------------------------- mesh helpers

def obj_from_bm(name, bm, mats, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    for m in mats:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def set_active(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def apply_mods(ob):
    set_active(ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def shade_auto(ob, angle=38.0):
    set_active(ob)
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()


def loft(name, rings, long_creases=None, ring_creases=None, cap=True):
    """rings: list of stations, each a list of (x,y,z)."""
    bm = bmesh.new()
    cl = bm.edges.layers.float.new('crease_edge')
    rows = [[bm.verts.new(Vector(p)) for p in ring] for ring in rings]
    n = len(rows[0])
    for a, b in zip(rows, rows[1:]):
        for i in range(n - 1):
            bm.faces.new([a[i], a[i + 1], b[i + 1], b[i]])
    if cap:
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])

    def edge_between(v1, v2):
        for e in v1.link_edges:
            if e.other_vert(v1) is v2:
                return e
        return None

    if long_creases:
        for idx, c in long_creases.items():
            for a, b in zip(rows, rows[1:]):
                e = edge_between(a[idx], b[idx])
                if e:
                    e[cl] = c
    if ring_creases:
        for si, c in ring_creases.items():
            row = rows[si]
            for i in range(n - 1):
                e = edge_between(row[i], row[i + 1])
                if e:
                    e[cl] = c
            if cap and si in (0, len(rows) - 1):
                e = edge_between(row[0], row[-1])
                if e:
                    e[cl] = c
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def mirror_subsurf(ob, levels=2):
    mir = ob.modifiers.new('mir', 'MIRROR')
    mir.use_axis = (False, True, False)
    mir.use_clip = True
    mir.merge_threshold = 0.001
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = levels
    sub.render_levels = levels
    apply_mods(ob)


def bool_cut(target, cutter):
    mod = target.modifiers.new('bool', 'BOOLEAN')
    mod.object = cutter
    mod.operation = 'DIFFERENCE'
    try:
        mod.solver = 'EXACT'
    except Exception:
        pass
    set_active(target)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    me = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.data.meshes.remove(me)


def prism(name, pts_a, pts_b):
    bm = bmesh.new()
    va = [bm.verts.new(Vector(p)) for p in pts_a]
    vb = [bm.verts.new(Vector(p)) for p in pts_b]
    bm.faces.new(list(reversed(va)))
    bm.faces.new(vb)
    n = len(va)
    for i in range(n):
        bm.faces.new([va[i], va[(i + 1) % n], vb[(i + 1) % n], vb[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, [], smooth=False)


def make_bvh(ob):
    me = ob.data
    me.calc_loop_triangles()
    verts = [tuple(v.co) for v in me.vertices]
    tris = [tuple(t.vertices) for t in me.loop_triangles]
    return BVHTree.FromPolygons(verts, tris)


def raycast(bvh, origin, direction, inset=0.0, fallback=None):
    d = Vector(direction).normalized()
    hit, normal, _, _ = bvh.ray_cast(Vector(origin), d, 10.0)
    if hit is None:
        return fallback
    n = normal.normalized()
    if n.dot(d) > 0:
        n = -n
    return hit + n * inset


def surf(bvh, origin, direction):
    d = Vector(direction).normalized()
    hit, normal, _, _ = bvh.ray_cast(Vector(origin), d, 10.0)
    if hit is None:
        return None, None
    n = normal.normalized()
    if n.dot(d) > 0:
        n = -n
    return hit, n


def box(name, loc, size, mat=None, rot=(0, 0, 0), bevel=0.0, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = ob.modifiers.new('bv', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        apply_mods(ob)
    if mat:
        ob.data.materials.append(mat)
    if smooth:
        shade_auto(ob, 50)
    return ob


def cyl(name, loc, r, depth, mat=None, rot=(math.pi / 2, 0, 0), verts=48, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth,
                                        location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    if mat:
        ob.data.materials.append(mat)
    if smooth:
        shade_auto(ob, 40)
    return ob


def beam(name, p1, p2, w, h, mat):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cube_add(size=1, location=(p1 + p2) / 2)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    ob.scale = (w, h, d.length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    if mat:
        ob.data.materials.append(mat)
    return ob


# ---------------------------------------------------------------- lower body
# station: (x, ymax, ztop, zbot, zrocker, zbelt)
BODY_STATIONS = [
    ( 2.42, 0.700, 0.740, 0.300, 0.360, 0.600),
    ( 2.36, 0.790, 0.762, 0.210, 0.270, 0.632),
    ( 2.15, 0.860, 0.788, 0.155, 0.185, 0.668),
    ( 1.85, 0.895, 0.806, 0.135, 0.165, 0.706),
    ( 1.40, 0.910, 0.826, 0.130, 0.160, 0.746),
    ( 0.85, 0.920, 0.854, 0.130, 0.160, 0.776),
    ( 0.20, 0.920, 0.860, 0.130, 0.160, 0.786),
    (-0.60, 0.920, 0.860, 0.130, 0.160, 0.790),
    (-1.35, 0.915, 0.858, 0.130, 0.160, 0.795),
    (-1.85, 0.895, 0.855, 0.140, 0.170, 0.790),
    (-2.20, 0.862, 0.852, 0.170, 0.220, 0.775),
    (-2.37, 0.822, 0.826, 0.240, 0.300, 0.716),
    (-2.46, 0.748, 0.772, 0.300, 0.350, 0.666),
]


def body_ring(st):
    x, ym, ztop, zb, zrk, zbelt = st
    return [
        (x, 0.0,        zb),
        (x, 0.60 * ym,  zb),
        (x, 0.94 * ym,  zrk),
        (x, 1.020 * ym, lerp(zrk, zbelt, 0.42)),   # widest bulge (subsurf comp)
        (x, 1.005 * ym, lerp(zrk, zbelt, 0.78)),
        (x, 0.99 * ym,  zbelt),
        (x, 0.84 * ym,  zbelt + 0.055),
        (x, 0.0,        ztop),
    ]


def build_body(m):
    rings = [body_ring(s) for s in BODY_STATIONS]
    bm = loft('Body', rings,
              long_creases={2: 0.75, 5: 0.80, 6: 0.30},
              ring_creases={0: 0.92, 1: 0.65, len(rings) - 2: 0.60,
                            len(rings) - 1: 0.92})
    body = obj_from_bm('Body', bm, [m['paint'], m['trim']])
    mirror_subsurf(body, 2)

    # per-side wheel arches (floor stays closed)
    for xa in (AXLE_F, AXLE_R):
        for s in (1, -1):
            cutter = cyl('cut', (xa, s * 0.72, WHEEL_R), ARCH_R, 0.55, None,
                         verts=64, smooth=False)
            bool_cut(body, cutter)

    # arch lip bevel
    bmx = bmesh.new()
    bmx.from_mesh(body.data)
    lip = []
    for e in bmx.edges:
        ok = True
        for v in e.verts:
            near = False
            for xa in (AXLE_F, AXLE_R):
                d = math.hypot(v.co.x - xa, v.co.z - WHEEL_R)
                if abs(d - ARCH_R) < 0.012 and abs(v.co.y) > 0.55:
                    near = True
            ok = ok and near
        if ok:
            lip.append(e)
    if lip:
        bmesh.ops.bevel(bmx, geom=lip, offset=0.010, offset_type='OFFSET',
                        segments=2, profile=0.72, affect='EDGES', clamp_overlap=True)
    bmx.to_mesh(body.data)
    bmx.free()

    # arch liner faces -> dark trim
    for p in body.data.polygons:
        c = p.center
        for xa in (AXLE_F, AXLE_R):
            d = math.hypot(c.x - xa, c.z - WHEEL_R)
            if d < 0.425 and c.z > 0.10 and abs(p.normal.y) < 0.7 and abs(c.y) < 0.95:
                p.material_index = 1
        p.use_smooth = True
    shade_auto(body, 35)
    return body


def arch_lip_y(body, ax):
    """Measured outer fender y at the arch rim — drives the wheel track."""
    best = 0.0
    for v in body.data.vertices:
        if abs(v.co.x - ax) < 0.50 and v.co.z > 0.30:
            d = math.hypot(v.co.x - ax, v.co.z - WHEEL_R)
            if 0.38 < d < 0.47:
                best = max(best, abs(v.co.y))
    return best


# ---------------------------------------------------------------- greenhouse
# station: (x, ztop, ybase)
CAB_STATIONS = [
    ( 1.00, 0.885, 0.845),
    ( 0.62, 1.100, 0.865),
    ( 0.28, 1.300, 0.875),
    ( 0.02, 1.415, 0.878),
    (-0.40, 1.440, 0.875),
    (-0.85, 1.435, 0.865),
    (-1.15, 1.330, 0.858),
    (-1.50, 1.100, 0.845),
    (-1.80, 0.875, 0.830),
]
CAB_RING_CREASES = {0: 0.40, 3: 0.45, 6: 0.35, 8: 0.40}


def cab_ring(st):
    x, ztop, yb = st
    s = clamp((ztop - 0.88) / (1.44 - 0.88), 0.0, 1.0)
    yedge = lerp(yb - 0.10, 0.575, s)
    return [
        (x, 0.0,                          0.70),
        (x, yb,                           0.70),
        (x, yb,                           0.795),
        (x, lerp(yb, yedge, 0.5) + 0.02,  lerp(0.795, ztop, 0.55)),
        (x, yedge,                        ztop - 0.045),
        (x, 0.0,                          ztop),
    ]


WS_B = Vector((0.90, 0, 0.900))
WS_T = Vector((0.10, 0, 1.380))
RW_B = Vector((-1.78, 0, 0.885))
RW_T = Vector((-0.98, 0, 1.360))

SIDE_F = [(0.72, 0.870), (0.34, 1.190), (0.02, 1.265), (0.02, 0.870)]
SIDE_R = [(-0.08, 0.870), (-0.08, 1.265), (-0.86, 1.265), (-1.34, 0.870)]


def plane_axes(B, T):
    u = (T - B).normalized()
    n = Vector((-u.z, 0, u.x))
    if n.z < 0:
        n = -n
    return u, n, (T - B).length


def build_cabin(m):
    rings = [cab_ring(s) for s in CAB_STATIONS]
    bm = loft('Cabin', rings,
              long_creases={1: 0.60, 2: 0.85, 4: 0.25},
              ring_creases=CAB_RING_CREASES)
    cab = obj_from_bm('Cabin', bm, [m['paint']])
    mirror_subsurf(cab, 2)
    shade_auto(cab, 40)

    bvh = make_bvh(cab)  # outer surface, before solidify

    sol = cab.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.030
    sol.offset = -1.0
    apply_mods(cab)

    for (B, T, wb, wt, t0, t1, nm) in (
            (WS_B, WS_T, 0.615, 0.510, 0.08, 0.87, 'ws'),
            (RW_B, RW_T, 0.595, 0.490, 0.07, 0.87, 'rw')):
        u, n, L = plane_axes(B, T)
        corners = []
        for t, w in ((t0, lerp(wb, wt, t0)), (t1, lerp(wb, wt, t1))):
            p = B + u * (t * L)
            corners.append((p + Vector((0, -w, 0)), p + Vector((0, w, 0))))
        loop = [corners[0][0], corners[0][1], corners[1][1], corners[1][0]]
        pa = [tuple(p + n * 0.40) for p in loop]
        pb = [tuple(p - n * 0.30) for p in loop]
        bool_cut(cab, prism('cut_' + nm, pa, pb))

    for poly, nm in ((SIDE_F, 'sf'), (SIDE_R, 'sr')):
        pa = [(x, 1.3, z) for x, z in poly]
        pb = [(x, -1.3, z) for x, z in poly]
        bool_cut(cab, prism('cut_' + nm, pa, pb))

    shade_auto(cab, 40)
    return cab, bvh


# ---------------------------------------------------------------- glass panes

def grid_pane(name, bvh, B, T, wb, wt, t0, t1, m, nu=9, nv=5, inset=0.011):
    u, n, L = plane_axes(B, T)
    bm = bmesh.new()
    grid = []
    for i in range(nu):
        t = lerp(t0, t1, i / (nu - 1))
        w = lerp(wb, wt, clamp(t, 0, 1))
        row = []
        for j in range(nv):
            v = lerp(-w, w, j / (nv - 1))
            p0 = B + u * (t * L) + Vector((0, v, 0))
            p = raycast(bvh, p0 + n * 0.6, -n, inset=-inset, fallback=p0 - n * inset)
            row.append(bm.verts.new(p))
        grid.append(row)
    for a, b in zip(grid, grid[1:]):
        for j in range(nv - 1):
            bm.faces.new([a[j], a[j + 1], b[j + 1], b[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(name, bm, [m['glass']])
    ob.data.name = name
    return ob


def side_pane(name, bvh, poly, side, m, expand=0.025, inset=0.011):
    cx = sum(p[0] for p in poly) / len(poly)
    cz = sum(p[1] for p in poly) / len(poly)
    pts = []
    np_ = len(poly)
    for i in range(np_):
        x0, z0 = poly[i]
        x1, z1 = poly[(i + 1) % np_]
        for k in range(4):
            t = k / 4.0
            x, z = lerp(x0, x1, t), lerp(z0, z1, t)
            dx, dz = x - cx, z - cz
            dl = math.hypot(dx, dz) or 1.0
            pts.append((x + dx / dl * expand, z + dz / dl * expand))
    bm = bmesh.new()
    sgn = 1.0 if side == 'L' else -1.0
    ring = []
    for x, z in pts:
        p = raycast(bvh, (x, sgn * 1.5, z), (0, -sgn, 0), inset=-inset,
                    fallback=Vector((x, sgn * 0.80, z)))
        ring.append(bm.verts.new(p))
    ctr = raycast(bvh, (cx, sgn * 1.5, cz), (0, -sgn, 0), inset=-inset,
                  fallback=Vector((cx, sgn * 0.82, cz)))
    vc = bm.verts.new(ctr)
    nr = len(ring)
    for i in range(nr):
        bm.faces.new([ring[i], ring[(i + 1) % nr], vc])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(name, bm, [m['glass']])
    ob.data.name = name
    return ob


def build_glass(m, cab_bvh):
    ws = grid_pane('Windshield', cab_bvh, WS_B, WS_T, 0.670, 0.565, -0.02, 0.95, m)
    rw = grid_pane('RearWindow', cab_bvh, RW_B, RW_T, 0.650, 0.545, -0.02, 0.94, m)
    for ob in (ws, rw):
        shade_auto(ob, 60)
    for side in ('L', 'R'):
        f = side_pane('WindowFront' + side, cab_bvh, SIDE_F, side, m)
        r = side_pane('WindowRear' + side, cab_bvh, SIDE_R, side, m)
        for ob in (f, r):
            shade_auto(ob, 60)


# ---------------------------------------------------------------- canopy trim

def strip_on_side(name, bvh, x0, z0, z1, half_w, mat, n=8, inset=0.003):
    bm = bmesh.new()
    for sgn in (1, -1):
        rows = []
        for i in range(n):
            z = lerp(z0, z1, i / (n - 1))
            p = raycast(bvh, (x0, sgn * 1.5, z), (0, -sgn, 0), inset=inset)
            if p is None:
                continue
            rows.append((bm.verts.new(p + Vector((-half_w, 0, 0))),
                         bm.verts.new(p + Vector((half_w, 0, 0)))))
        for a, b in zip(rows, rows[1:]):
            bm.faces.new([a[0], a[1], b[1], b[0]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, [mat], smooth=False)


def sill_trim(name, bvh, x0, x1, z, m, n=14):
    bm = bmesh.new()
    for sgn in (1, -1):
        rows = []
        for i in range(n):
            x = lerp(x0, x1, i / (n - 1))
            p = raycast(bvh, (x, sgn * 1.5, z), (0, -sgn, 0), inset=0.002)
            if p is None:
                continue
            rows.append((bm.verts.new(p + Vector((0, 0, -0.005))),
                         bm.verts.new(p + Vector((0, 0, 0.005)))))
        for a, b in zip(rows, rows[1:]):
            bm.faces.new([a[0], a[1], b[1], b[0]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, [m['chrome']], smooth=False)


# ---------------------------------------------------------------- interior

def build_interior(m):
    mi = m['interior']
    box('Int_Floor', (-0.35, 0, 0.78), (2.60, 1.42, 0.04), mi)
    d = box('Int_Dash', (0.55, 0, 0.93), (0.46, 1.48, 0.18), mi, bevel=0.03)
    shade_auto(d, 50)
    scr = harness._principled('ScreenGlass', (0.01, 0.01, 0.012), roughness=0.08)
    box('Int_Screen', (0.40, 0, 1.04), (0.02, 0.36, 0.10), scr,
        rot=(0, math.radians(-8), 0))
    box('Int_Console', (0.05, 0, 0.86), (0.80, 0.24, 0.12), mi, bevel=0.02)
    # steering wheel + column
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.021,
                                     location=(0.36, 0.36, 1.00),
                                     rotation=(0, math.radians(-75), 0),
                                     major_segments=32, minor_segments=10)
    sw = bpy.context.active_object
    sw.name = 'Int_SteeringWheel'
    sw.data.materials.append(mi)
    shade_auto(sw, 40)
    cyl('Int_Column', (0.46, 0.36, 0.98), 0.030, 0.26, mi,
        rot=(0, math.radians(-75), 0), verts=16)
    # front seats
    for y in (0.36, -0.36):
        box('Int_SeatCushion', (-0.15, y, 0.83), (0.52, 0.46, 0.13), mi, bevel=0.03)
        box('Int_SeatBack', (-0.44, y, 1.02), (0.14, 0.44, 0.42), mi,
            rot=(0, math.radians(-12), 0), bevel=0.03)
        box('Int_HeadRest', (-0.53, y, 1.28), (0.09, 0.22, 0.13), mi,
            rot=(0, math.radians(-12), 0), bevel=0.02)
    # rear bench + shelf
    box('Int_BenchCushion', (-1.02, 0, 0.83), (0.54, 1.16, 0.13), mi, bevel=0.03)
    box('Int_BenchBack', (-1.24, 0, 0.99), (0.14, 1.14, 0.30), mi,
        rot=(0, math.radians(-16), 0), bevel=0.03)
    box('Int_Shelf', (-1.55, 0, 0.868), (0.46, 1.32, 0.03), mi)


# ---------------------------------------------------------------- wheels

def build_wheel(m, x, s, lip):
    out = lip - 0.015                    # tire outer face 1.5cm inboard of fender
    yc = s * (out - 0.125)               # tire depth 0.25
    t = cyl('Tire', (x, yc, WHEEL_R), WHEEL_R, 0.25, m['tire'], verts=64)
    bv = t.modifiers.new('bev', 'BEVEL')
    bv.width = 0.05
    bv.segments = 3
    apply_mods(t)
    shade_auto(t, 50)
    cyl('RimBarrel', (x, yc, WHEEL_R), 0.215, 0.20, m['rim'], verts=36)
    disc_out = out + 0.012   # disc face proud of the tire sidewall (kitbash look)
    d = cyl('RimDisc', (x, s * (disc_out - 0.0175), WHEEL_R), 0.245, 0.035,
            m['rim'], verts=36)
    bd = d.modifiers.new('bev', 'BEVEL')
    bd.width = 0.012
    bd.segments = 2
    apply_mods(d)
    shade_auto(d, 50)
    for i in range(5):
        a = i * 2 * math.pi / 5 + 0.35
        box('RimSlot', (x + 0.145 * math.cos(a), s * (disc_out + 0.001),
                        WHEEL_R + 0.145 * math.sin(a)),
            (0.136, 0.009, 0.044), m['trim'], rot=(0, -a, 0))
    cyl('HubCap', (x, s * (disc_out + 0.004), WHEEL_R), 0.05, 0.016,
        m['chrome'], verts=24)


def build_well(m, x, s, lip):
    cyl('WellCap', (x, s * 0.50, 0.405), 0.40, 0.06, m['trim'], verts=40)
    lc = s * (lip - 0.16)
    liner = cyl('WellLiner', (x, lc, WHEEL_R), 0.418, 0.30, m['trim'], verts=48)
    inner = cyl('_linercut', (x, lc, WHEEL_R), 0.366, 0.40, None, verts=48,
                smooth=False)
    bool_cut(liner, inner)
    below = box('_linerlow', (x, lc, -0.15), (1.2, 0.72, 0.44), None)
    bool_cut(liner, below)
    shade_auto(liner, 50)


# ---------------------------------------------------------------- fascias

def headlamp(m, bvh, s):
    hit, nrm = surf(bvh, (3.4, s * 0.50, 0.635), (-1, 0, 0))
    if hit is None:
        return
    yaw = math.atan2(nrm.y, nrm.x)
    out = Vector((math.cos(yaw), math.sin(yaw), 0))
    R = Matrix.Rotation(yaw, 4, 'Z')
    c = Vector(hit) - out * 0.080 + Vector((0, 0, -0.018))
    tag = 'L' if s > 0 else 'R'
    box('HeadHouse' + tag, tuple(c), (0.11, 0.27, 0.070), m['trim'],
        rot=(0, 0, yaw))
    box('DRL' + tag, tuple(c + out * 0.058 + Vector((0, 0, 0.022))),
        (0.014, 0.24, 0.014), m['light_head'], rot=(0, 0, yaw))
    for j, k in enumerate((-1, 1)):
        pc = c + out * 0.040 + R @ Vector((0, 0.060 * k, -0.008))
        cyl(f'Proj{tag}{j}', tuple(pc), 0.024, 0.05, m['chrome'],
            rot=(0, math.pi / 2, yaw), verts=24)
        cyl(f'ProjLens{tag}{j}', tuple(pc + out * 0.028), 0.019, 0.012,
            m['light_head'], rot=(0, math.pi / 2, yaw), verts=24)
    # corner-wrap marker blade seen from the side
    q = raycast(bvh, (2.24, s * 1.4, 0.640), (0, -s, 0), inset=-0.004)
    if q:
        box('HeadWrap' + tag, tuple(q), (0.15, 0.035, 0.032), m['light_head'],
            rot=(0, 0, math.radians(26 * s)), bevel=0.010)


def front_fascia(m, bvh):
    # grille recess + chrome slats
    hit, _ = surf(bvh, (3.4, 0, 0.50), (-1, 0, 0))
    gx = hit.x if hit else 2.36
    box('GrilleHouse', (gx - 0.05, 0, 0.50), (0.12, 0.70, 0.20), m['trim'])
    for i, z in enumerate((0.44, 0.50, 0.56)):
        box(f'GrilleSlat{i}', (gx + 0.006, 0, z), (0.10, 0.62, 0.014), m['chrome'])
    # lower intake + fins
    hit, _ = surf(bvh, (3.4, 0, 0.285), (-1, 0, 0))
    ix = hit.x if hit else 2.30
    box('Intake', (ix - 0.04, 0, 0.275), (0.12, 1.04, 0.13), m['trim'])
    fin = harness._principled('DarkFin', (0.10, 0.10, 0.11), roughness=0.4)
    for i, y in enumerate((-0.38, -0.19, 0.0, 0.19, 0.38)):
        box(f'IntakeFin{i}', (ix + 0.005, y, 0.275), (0.10, 0.018, 0.12), fin)
    box('Splitter', (2.22, 0, 0.175), (0.26, 1.12, 0.05), m['trim'])
    headlamp(m, bvh, 1)
    headlamp(m, bvh, -1)


def rear_fascia(m, bvh):
    hit, _ = surf(bvh, (-3.4, 0, 0.72), (1, 0, 0))
    tx = hit.x if hit else -2.40
    box('TailHousing', (tx + 0.05, 0, 0.715), (0.10, 1.10, 0.085), m['trim'])
    box('TailBar', (tx - 0.005, 0, 0.715), (0.06, 1.18, 0.046), m['light_tail'])
    for s in (1, -1):
        q = raycast(bvh, (-2.18, s * 1.4, 0.70), (0, -s, 0), inset=-0.006)
        if q:
            box('TailWrap' + ('L' if s > 0 else 'R'), tuple(q),
                (0.20, 0.04, 0.044), m['light_tail'],
                rot=(0, 0, math.radians(-22 * s)), bevel=0.010)
    hit, _ = surf(bvh, (-3.4, 0, 0.50), (1, 0, 0))
    px = hit.x if hit else -2.42
    box('PlateRecess', (px + 0.03, 0, 0.50), (0.06, 0.44, 0.16), m['trim'])
    plate = harness._principled('Plate', (0.75, 0.76, 0.74), roughness=0.5)
    box('Plate', (px - 0.005, 0, 0.50), (0.01, 0.36, 0.12), plate)
    box('Diffuser', (-2.30, 0, 0.20), (0.22, 1.14, 0.10), m['trim'])
    for i, y in enumerate((-0.40, -0.15, 0.15, 0.40)):
        box(f'DiffFin{i}', (-2.38, y, 0.155), (0.07, 0.02, 0.10), m['trim'])
    for s in (1, -1):
        cyl('Exhaust' + ('L' if s > 0 else 'R'), (-2.40, s * 0.55, 0.26),
            0.042, 0.14, m['chrome'], rot=(0, math.pi / 2, 0), verts=24)


# ---------------------------------------------------------------- accents

def seam_strip(name, bvh, x0, z0, z1, m, n=7):
    bm = bmesh.new()
    for sgn in (1, -1):
        rows = []
        for i in range(n):
            z = lerp(z0, z1, i / (n - 1))
            p = raycast(bvh, (x0, sgn * 1.4, z), (0, -sgn, 0), inset=0.0015)
            if p is None:
                continue
            rows.append((bm.verts.new(p + Vector((-0.0028, 0, 0))),
                         bm.verts.new(p + Vector((0.0028, 0, 0)))))
        for a, b in zip(rows, rows[1:]):
            bm.faces.new([a[0], a[1], b[1], b[0]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, [m['trim']], smooth=False)


def top_seam(name, bvh, x0, y0, y1, m, n=9):
    bm = bmesh.new()
    rows = []
    for i in range(n):
        y = lerp(y0, y1, i / (n - 1))
        p = raycast(bvh, (x0, y, 1.4), (0, 0, -1), inset=0.0015)
        if p is None:
            continue
        rows.append((bm.verts.new(p + Vector((-0.0035, 0, 0))),
                     bm.verts.new(p + Vector((0.0035, 0, 0)))))
    for a, b in zip(rows, rows[1:]):
        bm.faces.new([a[0], a[1], b[1], b[0]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm, [m['trim']], smooth=False)


def build_accents(m, body_bvh):
    # door seams + hood/trunk shutlines
    for x0 in (0.78, 0.02, -0.75):
        seam_strip('Seam_%0.2f' % x0, body_bvh, x0, 0.19, 0.78, m)
    top_seam('SeamHood', body_bvh, 1.00, -0.70, 0.70, m)
    top_seam('SeamTrunk', body_bvh, -1.88, -0.72, 0.72, m)

    # flush door handles (detail-style): dark recess + paint blade
    for hx in (0.32, -0.50):
        for s in (1, -1):
            p = raycast(body_bvh, (hx, s * 1.4, 0.715), (0, -s, 0))
            if p is None:
                continue
            box(f'HandleRecess_{hx}_{s}',
                tuple(Vector(p) + Vector((0, -s * 0.006, 0))),
                (0.20, 0.024, 0.05), m['trim'])
            box(f'Handle_{hx}_{s}',
                tuple(Vector(p) + Vector((0, s * 0.004, 0))),
                (0.17, 0.020, 0.030), m['paint'], bevel=0.006)

    # rockers + underpan
    for s in (1, -1):
        box('Rocker' + ('L' if s > 0 else 'R'), (0, s * 0.865, 0.185),
            (1.90, 0.05, 0.075), m['trim'])
    box('Underpan', (0, 0, 0.115), (3.90, 1.22, 0.07), m['trim'])

    # mirrors
    for s in (1, -1):
        tag = 'L' if s > 0 else 'R'
        box('MirrorStalk' + tag, (0.64, s * 0.88, 0.92), (0.06, 0.14, 0.026),
            m['trim'])
        box('MirrorShell' + tag, (0.63, s * 0.995, 0.945), (0.085, 0.19, 0.10),
            m['paint'], bevel=0.03, smooth=True)
        box('MirrorFace' + tag, (0.585, s * 0.995, 0.945), (0.008, 0.16, 0.08),
            m['trim'])

    # tucked cowl strip + slim wipers lying on the glass (detail steal)
    box('CowlVent', (0.97, 0, 0.864), (0.12, 1.24, 0.016), m['trim'],
        rot=(0, math.radians(8), 0))
    beam('WiperBlade1', (0.95, -0.58, 0.886), (0.87, -0.10, 0.924), 0.018, 0.010,
         m['trim'])
    beam('WiperBlade2', (0.95, -0.02, 0.886), (0.87, 0.44, 0.924), 0.018, 0.010,
         m['trim'])

    # shark-fin antenna
    box('Antenna', (-0.95, 0, 1.412), (0.15, 0.035, 0.055), m['trim'],
        rot=(0, math.radians(-12), 0), bevel=0.012)


# ---------------------------------------------------------------- validation

def validate(lips):
    bpy.context.view_layer.update()
    lo = Vector((9e9, 9e9, 9e9))
    hi = Vector((-9e9, -9e9, -9e9))
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.name not in ('Body', 'Cabin'):
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    L, W, H = hi.x - lo.x, hi.y - lo.y, hi.z  # height = ground(z=0) to roof
    print('CHECK body length=%.3f width=%.3f height=%.3f (target 4.75/1.84/1.43)'
          % (L, W, H))
    # outlier scan (profile steal): any part escaping the car envelope
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.name.startswith('Studio_'):
            continue
        xs, ys, zs = [], [], []
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
        if (max(xs) > 2.55 or min(xs) < -2.60 or max(ys) > 1.12 or
                min(ys) < -1.12 or max(zs) > 1.47 or min(zs) < -0.03):
            print('OUTLIER %s x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]' %
                  (ob.name, min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
    print('CHECK wheelbase=%.2f tire_r=%.3f arch_r=%.3f' %
          (AXLE_F - AXLE_R, WHEEL_R, ARCH_R))
    for ax, lip in lips.items():
        print('CHECK fender_lip x=%.2f y=%.3f tire_outer=%.3f (inboard %.1f mm)'
              % (ax, lip, lip - 0.015, 15.0))
    assert 4.55 < L < 5.00, 'length out of range: %.3f' % L
    assert 1.68 < W < 1.95, 'width out of range: %.3f' % W
    assert 1.36 < H < 1.50, 'height out of range: %.3f' % H
    for ax, lip in lips.items():
        assert 0.80 < lip < 0.95, 'fender lip %.3f suspicious at x=%.2f' % (lip, ax)
    assert abs(lips[AXLE_F] - lips[AXLE_R]) < 0.05, 'front/rear track mismatch'


# ---------------------------------------------------------------- build

def build():
    m = harness.mats()
    # tinted, alpha-blended glass so the interior reads through panes in EEVEE
    try:
        bsdf = m['glass'].node_tree.nodes['Principled BSDF']
        bsdf.inputs['Alpha'].default_value = 0.40
        bsdf.inputs['Base Color'].default_value = (0.40, 0.47, 0.52, 1.0)
        try:
            m['glass'].surface_render_method = 'BLENDED'
        except Exception:
            m['glass'].blend_method = 'BLEND'
        m['glass'].use_backface_culling = False
    except Exception:
        pass

    body = build_body(m)
    body_bvh = make_bvh(body)
    lips = {ax: arch_lip_y(body, ax) for ax in (AXLE_F, AXLE_R)}

    cab, cab_bvh = build_cabin(m)
    build_glass(m, cab_bvh)
    sill_trim('SillTrim', cab_bvh, 0.74, -1.36, 0.862, m)
    strip_on_side('BPillarTrim', cab_bvh, -0.03, 0.885, 1.24, 0.030, m['trim'])

    build_interior(m)
    for x in (AXLE_F, AXLE_R):
        for s in (1, -1):
            build_wheel(m, x, s, lips[x])
            build_well(m, x, s, lips[x])

    front_fascia(m, body_bvh)
    rear_fascia(m, body_bvh)
    build_accents(m, body_bvh)
    validate(lips)
