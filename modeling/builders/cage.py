"""Brandless modern 4-door sedan — Technique A: subdivision-surface cage.

Lower body: coarse quad loft (11 stations x 8 ring verts, half), mirrored across Y,
subsurf 2, creased beltline/rocker, boolean wheel arches + beveled lip.
Greenhouse: separate subsurf canopy, solidified to a shell, boolean window openings.
Glass: 6 named panes raycast-fitted to the canopy surface, inset ~11mm.
"""
import bpy
import bmesh
import math
import harness
from mathutils import Vector
from mathutils.bvhtree import BVHTree


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
    """rings: list of stations, each a list of (x,y,z) from bottom-center to top-center."""
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
                e = edge_between(row[0], row[-1])  # centerline chord of the cap
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
    set_active(target)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    me = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    bpy.data.meshes.remove(me)


def prism(name, pts_a, pts_b):
    """Closed prism from two matching point loops."""
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


def box(name, loc, size, mat, rot=(0, 0, 0), bevel=0.0, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = ob.modifiers.new('bv', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        apply_mods(ob)
    ob.data.materials.append(mat)
    if smooth:
        shade_auto(ob, 50)
    return ob


def cyl(name, loc, r, depth, mat, rot=(math.pi / 2, 0, 0), verts=48, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth,
                                        location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    if smooth:
        shade_auto(ob, 40)
    return ob


# ---------------------------------------------------------------- lower body

# station: (x, ymax, ztop, zbot, zrocker, zbelt)
BODY_STATIONS = [
    ( 2.40, 0.720, 0.700, 0.280, 0.330, 0.580),
    ( 2.32, 0.810, 0.710, 0.200, 0.260, 0.615),
    ( 2.10, 0.870, 0.730, 0.150, 0.180, 0.655),
    ( 1.85, 0.895, 0.760, 0.135, 0.165, 0.700),
    ( 1.40, 0.910, 0.790, 0.130, 0.160, 0.745),
    ( 0.85, 0.920, 0.840, 0.130, 0.160, 0.775),
    ( 0.20, 0.920, 0.848, 0.130, 0.160, 0.785),
    (-0.60, 0.920, 0.852, 0.130, 0.160, 0.790),
    (-1.35, 0.915, 0.852, 0.130, 0.160, 0.795),
    (-1.85, 0.895, 0.850, 0.140, 0.170, 0.790),
    (-2.20, 0.860, 0.850, 0.170, 0.220, 0.775),
    (-2.37, 0.820, 0.820, 0.240, 0.300, 0.710),
    (-2.46, 0.750, 0.760, 0.290, 0.340, 0.660),
]


def body_ring(st):
    x, ym, ztop, zb, zrk, zbelt = st
    return [
        (x, 0.0,        zb),
        (x, 0.60 * ym,  zb),
        (x, 0.94 * ym,  zrk),
        (x, 0.995 * ym, lerp(zrk, zbelt, 0.42)),
        (x, 1.00 * ym,  lerp(zrk, zbelt, 0.78)),
        (x, 0.99 * ym,  zbelt),
        (x, 0.84 * ym,  zbelt + 0.055),
        (x, 0.0,        ztop),
    ]


def build_body(m):
    rings = [body_ring(s) for s in BODY_STATIONS]
    bm = loft('Body', rings,
              long_creases={2: 0.75, 5: 0.80, 6: 0.30},
              ring_creases={0: 0.85, 1: 0.50, len(rings) - 2: 0.50,
                            len(rings) - 1: 0.85})
    body = obj_from_bm('Body', bm, [m['paint'], m['trim']])
    mirror_subsurf(body, 2)

    # wheel arches
    for xa in (1.40, -1.40):
        cutter = cyl('cut', (xa, 0, 0.355), 0.43, 3.0, m['trim'], verts=64, smooth=False)
        bool_cut(body, cutter)

    # arch lip bevel
    bmx = bmesh.new()
    bmx.from_mesh(body.data)
    lip = []
    for e in bmx.edges:
        ok = True
        for v in e.verts:
            near = False
            for xa in (1.40, -1.40):
                d = math.hypot(v.co.x - xa, v.co.z - 0.355)
                if abs(d - 0.43) < 0.012 and abs(v.co.y) > 0.55:
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
        for xa in (1.40, -1.40):
            d = math.hypot(c.x - xa, c.z - 0.355)
            if d < 0.425 and c.z > 0.10 and abs(p.normal.y) < 0.7 and abs(c.y) < 0.95:
                p.material_index = 1
        p.use_smooth = True
    shade_auto(body, 35)
    return body


# ---------------------------------------------------------------- greenhouse

# station: (x, ztop, ybase)
CAB_STATIONS = [
    ( 1.00, 0.885, 0.845),
    ( 0.62, 1.100, 0.865),
    ( 0.28, 1.300, 0.875),
    ( 0.02, 1.415, 0.878),   # A-pillar top knuckle
    (-0.40, 1.440, 0.875),
    (-0.85, 1.435, 0.865),
    (-1.15, 1.330, 0.858),   # C-pillar top knuckle
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


WS_B = Vector((0.90, 0, 0.900))   # windshield base (center)
WS_T = Vector((0.10, 0, 1.380))   # windshield top
RW_B = Vector((-1.78, 0, 0.885))  # rear window base
RW_T = Vector((-0.98, 0, 1.360))  # rear window top

SIDE_F = [(0.72, 0.870), (0.34, 1.190), (0.02, 1.265), (0.02, 0.870)]
SIDE_R = [(-0.08, 0.870), (-0.08, 1.265), (-0.86, 1.265), (-1.34, 0.870)]


def plane_axes(B, T):
    u = (T - B).normalized()
    n = Vector((-u.z, 0, u.x))  # outward-ish
    if n.x * (T.x - B.x) > 0 and n.z < 0:
        n = -n
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

    # windshield + rear window openings
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

    # side window openings (full-width prisms cut both sides)
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
    # expand polygon in XZ about centroid, subdivide edges, raycast onto canopy
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


# ---------------------------------------------------------------- interior

def sill_trim(name, bvh, x0, x1, z, m, n=14):
    """Chrome strip along the window sill, raycast onto the canopy sides."""
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


def build_interior(m):
    mi = m['interior']
    box('Floor', (-0.35, 0, 0.85), (2.40, 1.42, 0.03), mi)
    box('Dash', (0.48, 0, 0.90), (0.26, 1.40, 0.14), mi, bevel=0.03)
    box('Console', (0.05, 0, 0.90), (0.75, 0.25, 0.10), mi, bevel=0.02)
    # steering wheel
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.021,
                                     location=(0.36, 0.36, 1.00),
                                     rotation=(0, math.radians(-75), 0))
    sw = bpy.context.active_object
    sw.name = 'SteeringWheel'
    sw.data.materials.append(mi)
    shade_auto(sw, 40)
    # front seats
    for y in (0.36, -0.36):
        box('SeatCushion', (-0.18, y, 0.93), (0.55, 0.50, 0.15), mi, bevel=0.04)
        box('SeatBack', (-0.44, y, 1.11), (0.16, 0.50, 0.40), mi,
            rot=(0, math.radians(-10), 0), bevel=0.04)
    # rear bench
    box('RearCushion', (-1.05, 0, 0.93), (0.55, 1.10, 0.15), mi, bevel=0.04)
    box('RearBack', (-1.15, 0, 1.00), (0.16, 1.10, 0.28), mi,
        rot=(0, math.radians(-14), 0), bevel=0.04)
    box('ParcelShelf', (-1.52, 0, 0.87), (0.50, 1.30, 0.02), mi)


# ---------------------------------------------------------------- wheels

def build_wheels(m):
    for x in (1.40, -1.40):
        for sgn in (1, -1):
            yc = 0.775 * sgn
            t = cyl('Tire', (x, yc, 0.355), 0.355, 0.235, m['tire'])
            mod = t.modifiers.new('bv', 'BEVEL')
            mod.width = 0.04
            mod.segments = 3
            apply_mods(t)
            shade_auto(t, 40)
            cyl('RimBack', (x, 0.880 * sgn, 0.355), 0.245, 0.02, m['trim'])
            cyl('Hub', (x, 0.895 * sgn, 0.355), 0.062, 0.04, m['rim'])
            cyl('Brake', (x, 0.852 * sgn, 0.355), 0.16, 0.015, m['chrome'])
            for k in range(5):
                a = k * 2 * math.pi / 5 + 0.3
                box('Spoke', (x + math.sin(a) * 0.135, 0.892 * sgn,
                              0.355 + math.cos(a) * 0.135),
                    (0.05, 0.040, 0.20), m['rim'], rot=(0, a, 0), bevel=0.008)


# ---------------------------------------------------------------- accessories

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
    # door seams
    for x0 in (0.78, 0.02, -0.75):
        seam_strip('Seam_%0.2f' % x0, body_bvh, x0, 0.19, 0.78, m)
    # hood + trunk cutlines
    top_seam('SeamHood', body_bvh, 0.98, -0.70, 0.70, m)
    top_seam('SeamTrunk', body_bvh, -1.88, -0.72, 0.72, m)

    # door handles
    for x0 in (0.30, -0.50):
        for sgn in (1, -1):
            p = raycast(body_bvh, (x0, sgn * 1.4, 0.71), (0, -sgn, 0), inset=-0.006)
            if p:
                box('Handle', tuple(p), (0.15, 0.024, 0.030), m['chrome'], bevel=0.008)

    # headlights: slim blades swept back with the nose plan
    for sgn in (1, -1):
        p = raycast(body_bvh, (3.2, sgn * 0.50, 0.620), (-1, 0, 0), inset=-0.014)
        if p:
            hit, nrm, _, _ = body_bvh.ray_cast(Vector((3.2, sgn * 0.50, 0.620)),
                                               Vector((-1, 0, 0)), 10.0)
            yaw = math.atan2(nrm.y, nrm.x) if nrm else 0.0
            box('Headlight', tuple(p), (0.04, 0.34, 0.06), m['light_head'],
                rot=(0, 0, yaw), bevel=0.012)

    # taillight bar (full width) + side wraps
    p = raycast(body_bvh, (-3.4, 0, 0.680), (1, 0, 0), inset=-0.030)
    if p:
        box('TailBar', tuple(p), (0.10, 1.36, 0.05), m['light_tail'], bevel=0.014)
    for sgn in (1, -1):
        q = raycast(body_bvh, (-2.10, sgn * 1.4, 0.650), (0, -sgn, 0), inset=-0.020)
        if q:
            box('TailWrap', tuple(q), (0.24, 0.05, 0.05), m['light_tail'],
                rot=(0, 0, math.radians(-22 * sgn)), bevel=0.012)

    # grille + lower intake
    p = raycast(body_bvh, (3.4, 0, 0.48), (-1, 0, 0), inset=-0.020)
    if p:
        box('Grille', tuple(p), (0.05, 0.95, 0.17), m['trim'], bevel=0.015)
    p = raycast(body_bvh, (3.4, 0, 0.24), (-1, 0, 0), inset=-0.020)
    if p:
        box('Intake', tuple(p), (0.05, 1.10, 0.09), m['trim'], bevel=0.012)

    # side mirrors on stalks at the A-pillar base
    for sgn in (1, -1):
        box('MirrorStalk', (0.64, sgn * 0.88, 0.92), (0.06, 0.14, 0.026), m['trim'])
        box('MirrorShell', (0.63, sgn * 0.995, 0.945), (0.085, 0.19, 0.10),
            m['paint'], bevel=0.03, smooth=True)

    # shark-fin antenna on the rear roof
    box('Antenna', (-0.95, 0, 1.410), (0.15, 0.035, 0.055), m['trim'],
        rot=(0, math.radians(-12), 0), bevel=0.012)

    # twin exhaust tips
    for sgn in (1, -1):
        cyl('Exhaust', (-2.37, sgn * 0.55, 0.30), 0.042, 0.16, m['chrome'],
            rot=(0, math.pi / 2, 0), verts=24)


def build_sill(m, cab_bvh):
    sill_trim('SillTrim', cab_bvh, 0.74, -1.36, 0.862, m)


# ---------------------------------------------------------------- build

def build():
    m = harness.mats()
    body = build_body(m)
    body_bvh = make_bvh(body)
    cab, cab_bvh = build_cabin(m)
    build_glass(m, cab_bvh)
    build_sill(m, cab_bvh)
    build_interior(m)
    build_wheels(m)
    build_accents(m, body_bvh)
