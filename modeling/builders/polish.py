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
    ( 2.40, 0.720, 0.800, 0.260, 0.330, 0.640),
    ( 2.32, 0.810, 0.815, 0.195, 0.260, 0.665),
    ( 2.10, 0.870, 0.827, 0.150, 0.180, 0.700),
    ( 1.85, 0.895, 0.833, 0.135, 0.165, 0.725),
    ( 1.40, 0.910, 0.838, 0.130, 0.160, 0.755),
    ( 0.85, 0.920, 0.845, 0.130, 0.160, 0.778),
    ( 0.20, 0.920, 0.848, 0.130, 0.160, 0.785),
    (-0.60, 0.920, 0.852, 0.130, 0.160, 0.790),
    (-1.35, 0.915, 0.852, 0.130, 0.160, 0.795),
    (-1.70, 0.905, 0.852, 0.130, 0.160, 0.792),
    (-2.00, 0.885, 0.850, 0.135, 0.165, 0.788),
    (-2.25, 0.855, 0.846, 0.150, 0.190, 0.778),
    (-2.40, 0.815, 0.834, 0.220, 0.280, 0.758),
    (-2.46, 0.760, 0.800, 0.280, 0.330, 0.732),
]


def body_ring(st):
    x, ym, ztop, zb, zrk, zbelt = st
    return [
        (x, 0.0,        zb),
        (x, 0.60 * ym,  zb),
        (x, 0.94 * ym,  zrk),
        (x, 0.984 * ym, lerp(zrk, zbelt, 0.38)),
        (x, 1.016 * ym, lerp(zrk, zbelt, 0.52)),   # bodyside character line crest
        (x, 0.988 * ym, lerp(zrk, zbelt, 0.66)),   # shadow pocket above the line
        (x, 1.000 * ym, lerp(zrk, zbelt, 0.86)),
        (x, 0.988 * ym, zbelt),                    # beltline crease
        (x, 0.84 * ym,  zbelt + 0.055),
        (x, 0.0,        ztop),
    ]


def build_body(m):
    rings = [body_ring(s) for s in BODY_STATIONS]
    bm = loft('Body', rings,
              long_creases={2: 0.75, 4: 1.0, 5: 0.35, 7: 1.0, 8: 0.30},
              ring_creases={0: 0.85, 1: 0.50, len(rings) - 2: 0.65,
                            len(rings) - 1: 0.85})
    body = obj_from_bm('Body', bm, [m['paint'], m['trim']])
    mirror_subsurf(body, 2)

    # wheel arches
    for xa in (1.40, -1.40):
        cutter = cyl('cut', (xa, 0, 0.355), 0.43, 3.0, m['trim'], verts=96, smooth=False)
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
        bmesh.ops.bevel(bmx, geom=lip, offset=0.013, offset_type='OFFSET',
                        segments=3, profile=0.74, affect='EDGES', clamp_overlap=True)
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
# Stations 0-3 are collinear (straight windshield plane, ~31 deg rake) and
# stations 5-7 are collinear (straight backlight, ~34 deg); creased header
# rings at 3 and 5 keep those planes flat under subsurf, roof flat between.
CAB_STATIONS = [
    ( 1.05, 0.845, 0.880),   # cowl foot on the shoulders
    ( 0.80, 0.996, 0.880),
    ( 0.45, 1.206, 0.878),
    ( 0.12, 1.405, 0.875),   # windshield header (crease)
    (-0.38, 1.420, 0.872),   # roof crown
    (-0.80, 1.415, 0.868),   # rear header (crease)
    (-1.15, 1.145, 0.860),
    (-1.52, 0.860, 0.850),   # backlight base at the rear deck
]
CAB_RING_CREASES = {0: 0.55, 3: 0.70, 5: 0.70, 7: 0.55}


def cab_ring(st):
    x, ztop, yb = st
    zsh = min(0.800, ztop - 0.02)                       # shoulder / DLO base
    yedge = yb - 0.28 * clamp((ztop - 0.80) / 0.62, 0.0, 1.0)
    zdrip = max(lerp(zsh, ztop, 0.80), ztop - 0.030)    # drip rail
    return [
        (x, 0.0,                    0.70),
        (x, yb,                     0.70),
        (x, yb,                     zsh),
        (x, lerp(yb, yedge, 0.55),  lerp(zsh, ztop, 0.50)),
        (x, yedge,                  zdrip),
        (x, 0.0,                    ztop),
    ]


WS_B = Vector((1.05, 0, 0.845))   # windshield base (center) — on station line
WS_T = Vector((0.12, 0, 1.405))   # windshield top
RW_B = Vector((-1.52, 0, 0.860))  # rear window base
RW_T = Vector((-0.80, 0, 1.415))  # rear window top

# side DLO polys (x, z); front edges run parallel to the pillar planes
SIDE_F = [(0.89, 0.870), (0.275, 1.240), (0.02, 1.240), (0.02, 0.870)]
SIDE_R = [(-0.08, 0.870), (-0.08, 1.240), (-0.90, 1.240), (-1.14, 0.870)]


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
            (WS_B, WS_T, 0.700, 0.545, 0.080, 0.865, 'ws'),
            (RW_B, RW_T, 0.660, 0.530, 0.090, 0.850, 'rw')):
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

def grid_pane(name, bvh, B, T, wb, wt, t0, t1, m, nu=9, nv=5, inset=0.012):
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
            p = raycast(bvh, p0 + n * 0.6, -n, inset=-inset,
                        fallback=p0 - n * (inset + 0.02))
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
    ws = grid_pane('Windshield', cab_bvh, WS_B, WS_T, 0.720, 0.555, 0.060, 0.890, m)
    rw = grid_pane('RearWindow', cab_bvh, RW_B, RW_T, 0.685, 0.550, 0.075, 0.875, m)
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
    box('RearCushion', (-0.98, 0, 0.93), (0.55, 1.10, 0.15), mi, bevel=0.04)
    box('RearBack', (-1.06, 0, 0.98), (0.16, 1.10, 0.26), mi,
        rot=(0, math.radians(-14), 0), bevel=0.04)
    box('ParcelShelf', (-1.32, 0, 0.825), (0.36, 1.20, 0.02), mi)


# ---------------------------------------------------------------- wheels

def caliper_mat():
    m = bpy.data.materials.get('Caliper')
    if m is None:
        m = bpy.data.materials.new('Caliper')
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.42, 0.03, 0.035, 1.0)
        b.inputs['Roughness'].default_value = 0.42
        b.inputs['Metallic'].default_value = 0.1
    return m


WHEEL_R = 0.355        # tire radius (target)
AXLE_Z = 0.355
TIRE_W = 0.245
TIRE_YC = 0.788        # outer face 0.8775 -> ~1-2cm inboard of the fender


def lathe_tire(name, x, yc, mat):
    """Annular tire (no center cap): closed profile lathed around the Y axle."""
    hw = TIRE_W / 2.0
    prof = [  # (radius, axial offset) — bead -> sidewall -> shoulder -> tread
        (0.238,  hw * 0.96),
        (0.300,  hw),
        (0.336,  hw * 0.90),
        (0.352,  hw * 0.55),
        (0.355,  0.0),
        (0.352, -hw * 0.55),
        (0.336, -hw * 0.90),
        (0.300, -hw),
        (0.238, -hw * 0.96),
    ]
    bm = bmesh.new()
    verts = [bm.verts.new(Vector((x, yc + dy, AXLE_Z + r))) for r, dy in prof]
    n = len(verts)
    edges = [bm.edges.new((verts[i], verts[(i + 1) % n])) for i in range(n)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=Vector((x, yc, AXLE_Z)),
                   axis=Vector((0.0, 1.0, 0.0)), angle=2.0 * math.pi, steps=64)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(name, bm, [mat])
    shade_auto(ob, 40)
    return ob


def spoke(name, x, sgn, a, mat):
    """One tapered alloy spoke: bmesh wedge from hub to rim, dished inboard."""
    bm = bmesh.new()
    r0, r1 = 0.055, 0.229              # radial span hub -> rim lip
    w0, w1 = 0.052, 0.026              # tangential half-width taper (wide at hub)
    yo, yi = 0.874, 0.852              # outer face (dish: sinks toward rim)
    th = 0.026                         # spoke thickness (axial)
    ring = []
    for (r, w, yf) in ((r0, w0, yo), (r1, w1, yo - 0.008)):
        for (dw, y) in ((-w, yf), (w, yf), (w, yf - th), (-w, yf - th)):
            # local frame: radial dir (sin a, cos a) in XZ, tangential perp
            px = x + math.sin(a) * r + math.cos(a) * dw
            pz = AXLE_Z + math.cos(a) * r - math.sin(a) * dw
            ring.append(bm.verts.new(Vector((px, y * sgn, pz))))
    va, vb = ring[:4], ring[4:]
    quads = ([va[3], va[2], va[1], va[0]], vb,
             [va[0], va[1], vb[1], vb[0]], [va[1], va[2], vb[2], vb[1]],
             [va[2], va[3], vb[3], vb[2]], [va[3], va[0], vb[0], vb[3]])
    for q in quads:
        f = bm.faces.new(q)
        f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.006, segments=2,
                    profile=0.7, affect='EDGES', clamp_overlap=True)
    ob = obj_from_bm(name, bm, [mat])
    shade_auto(ob, 45)
    return ob


def build_wheels(m):
    calm = caliper_mat()
    for x in (1.40, -1.40):
        for sgn in (1, -1):
            yc = TIRE_YC * sgn
            # tire: open-center lathed annulus, outer face tucked inside the fender
            lathe_tire('Tire', x, yc, m['tire'])
            # dark inner-well wall so you can't see through the arch tunnel
            # (box clipped above the rocker so nothing pokes below the body)
            box('WellWall', (x, 0.60 * sgn, 0.475), (0.87, 0.02, 0.63), m['trim'])
            # dark rim barrel giving the wheel visual depth behind the spokes
            cyl('Barrel', (x, 0.77 * sgn, AXLE_Z), 0.206, 0.18, m['trim'], verts=48)
            # bright outer rim lip (dished ring the spokes land on)
            bpy.ops.mesh.primitive_torus_add(
                major_radius=0.232, minor_radius=0.014,
                location=(x, 0.864 * sgn, AXLE_Z),
                rotation=(math.pi / 2, 0, 0),
                major_segments=64, minor_segments=12)
            lip = bpy.context.active_object
            lip.name = 'RimLip'
            lip.data.materials.append(m['rim'])
            shade_auto(lip, 40)
            # brake disc + caliper visible between the spokes
            cyl('Brake', (x, 0.80 * sgn, AXLE_Z), 0.152, 0.022, m['chrome'], verts=48)
            ac = math.radians(62) * (1 if x > 0 else -1)
            box('Caliper',
                (x + math.sin(ac) * 0.125, 0.802 * sgn, AXLE_Z + math.cos(ac) * 0.125),
                (0.075, 0.052, 0.155), calm, rot=(0, ac, 0), bevel=0.014, smooth=True)
            # hub + center cap
            cyl('Hub', (x, 0.858 * sgn, AXLE_Z), 0.064, 0.042, m['rim'], verts=32)
            cyl('HubCap', (x, 0.874 * sgn, AXLE_Z), 0.030, 0.012, m['chrome'], verts=24)
            # five tapered alloy spokes
            for k in range(5):
                a = k * 2.0 * math.pi / 5 + 0.30
                spoke('Spoke', x, sgn, a, m['rim'])


# ---------------------------------------------------------------- fascias

def plate_mat():
    m = bpy.data.materials.get('Plate')
    if m is None:
        m = bpy.data.materials.new('Plate')
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.72, 0.73, 0.75, 1.0)
        b.inputs['Roughness'].default_value = 0.5
    return m


def mesh_mat():
    m = bpy.data.materials.get('GrilleMesh')
    if m is None:
        m = bpy.data.materials.new('GrilleMesh')
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.035, 0.038, 0.042, 1.0)
        b.inputs['Metallic'].default_value = 0.55
        b.inputs['Roughness'].default_value = 0.42
    return m


def tune_mats(m):
    """Glass -> alpha-blended so the interior reads through; interior lifted."""
    g = m['glass']
    b = g.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.22, 0.25, 0.28, 1.0)
    b.inputs['Roughness'].default_value = 0.08
    if 'Alpha' in b.inputs:
        b.inputs['Alpha'].default_value = 0.24
    for key in ('Transmission Weight', 'Transmission'):
        if key in b.inputs:
            b.inputs[key].default_value = 0.0
            break
    for attr, val in (('surface_render_method', 'BLENDED'),
                      ('blend_method', 'BLEND')):
        try:
            setattr(g, attr, val)
        except Exception:
            pass
    bi = m['interior'].node_tree.nodes['Principled BSDF']
    bi.inputs['Base Color'].default_value = (0.105, 0.105, 0.115, 1.0)
    bh = m['light_head'].node_tree.nodes['Principled BSDF']
    if 'Emission Strength' in bh.inputs:
        bh.inputs['Emission Strength'].default_value = 5.0


def radial_band(name, bvh, cx, z0, z1, a0, a1, peak, mat,
                nz=5, na=16, sink=0.012, both=False, thick=0.012,
                ez=0.30, ea=0.15):
    """Shrink-wrapped band: rays fan out from the (cx,0) axis in plan, hit the
    body, verts offset along the surface normal.  Edges sink into the body so
    the band reads as sculpted volume, not a floating slab.  a=0 faces +X for
    cx near the nose; pass a-range around pi for the tail (use negative cos)."""
    bm = bmesh.new()
    sides = (1, -1) if both else (1,)
    for sgn in sides:
        grid = []
        for i in range(nz):
            tz = i / (nz - 1)
            z = lerp(z0, z1, tz)
            row = []
            for j in range(na):
                ta = j / (na - 1)
                a = lerp(a0, a1, ta)
                d = Vector((math.cos(a), sgn * math.sin(a), 0.0))
                hit, nrm, _, _ = bvh.ray_cast(Vector((cx, 0.0, z)), d, 10.0)
                if hit is None:
                    row.append(None)
                    continue
                n = nrm.normalized()
                if n.dot(d) < 0:
                    n = -n

                def ew(t, frac):
                    v = clamp(min(t, 1.0 - t) / frac, 0.0, 1.0)
                    return v * v * (3.0 - 2.0 * v)
                w = ew(tz, ez) * ew(ta, ea)
                row.append(bm.verts.new(hit + n * lerp(-sink, peak, w)))
            grid.append(row)
        for ra, rb in zip(grid, grid[1:]):
            for j in range(na - 1):
                q = [ra[j], ra[j + 1], rb[j + 1], rb[j]]
                if all(v is not None for v in q):
                    f = bm.faces.new(q)
                    f.smooth = True
    bm.normal_update()
    for f in bm.faces:
        co = f.calc_center_median()
        if f.normal.dot(Vector((co.x - cx, co.y, 0.0))) < 0:
            f.normal_flip()
    ob = obj_from_bm(name, bm, [mat])
    sol = ob.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = thick
    sol.offset = -1.0
    apply_mods(ob)
    shade_auto(ob, 45)
    return ob


def cut_recess(body, x_probe, dirx, y_half, z0, z1, depth, m, probe_ys):
    """Boolean a shallow rectangular recess into the nose/tail face; the recess
    walls+floor go dark trim.  Returns the floor plane x."""
    bvh = make_bvh(body)
    zc = (z0 + z1) / 2.0
    xs = []
    for y in probe_ys:
        for s in (1, -1):
            hit, _, _, _ = bvh.ray_cast(Vector((x_probe, y * s, zc)),
                                        Vector((dirx, 0, 0)), 10.0)
            if hit:
                xs.append(hit.x)
    if not xs:
        return None
    if dirx < 0:                       # front face
        back = min(xs) - depth
        ctr_x = back + 0.15
    else:                              # rear face
        back = max(xs) + depth
        ctr_x = back - 0.15
    cutter = box('cut_recess', (ctr_x, 0, zc), (0.30, y_half * 2, z1 - z0),
                 m['trim'], bevel=0.02)
    bool_cut(body, cutter)
    for p in body.data.polygons:
        c = p.center
        inx = c.x > back - 0.003 if dirx < 0 else c.x < back + 0.003
        deep = c.x < max(xs) + 0.004 if dirx < 0 else c.x > min(xs) - 0.004
        if inx and deep and abs(c.y) < y_half - 0.001 and z0 + 0.001 < c.z < z1 - 0.001:
            p.material_index = 1
        p.use_smooth = True
    shade_auto(body, 35)
    return back


def groove(body, samples, wdir, half_w=0.0035, depth=0.018, out=0.045,
           name='Groove'):
    """Boolean a shutline groove into the body.  samples = [(origin, dir)]
    rays; the cutter is a thin tube that follows the hit surface, extending
    `out` outside and `depth` inside along each ray."""
    bvh = make_bvh(body)
    pts = []
    for o, d in samples:
        dv = Vector(d).normalized()
        hit, _, _, _ = bvh.ray_cast(Vector(o), dv, 10.0)
        if hit is not None:
            pts.append((hit, dv))
    if len(pts) < 2:
        return
    w = Vector(wdir).normalized() * half_w
    bm = bmesh.new()
    rows = []
    for p, dv in pts:
        a = p - dv * out
        b = p + dv * depth
        rows.append([bm.verts.new(a - w), bm.verts.new(a + w),
                     bm.verts.new(b + w), bm.verts.new(b - w)])
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(4):
            bm.faces.new([r0[i], r0[(i + 1) % 4], r1[(i + 1) % 4], r1[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bool_cut(body, obj_from_bm(name, bm, [], smooth=False))


def fan_rays(cx, z, a0, a1, n, sgn=1.0, flip=False):
    """Horizontal ray fan from (cx, 0, z); flip mirrors around pi for the tail."""
    out = []
    for i in range(n):
        a = lerp(a0, a1, i / (n - 1))
        if flip:
            a = math.pi - a
        out.append(((cx, 0.0, z), (math.cos(a), sgn * math.sin(a), 0.0)))
    return out


def add_shutlines(body):
    """Door / hood / trunk / bumper shutlines as ~6mm boolean grooves."""
    X = (1, 0, 0)
    Y = (0, 1, 0)
    Z = (0, 0, 1)
    # door cutlines (vertical, both sides)
    for x0 in (0.78, 0.02, -0.75):
        for sgn in (1, -1):
            smp = [((x0, sgn * 1.4, lerp(0.175, 0.778, i / 13.0)), (0, -sgn, 0))
                   for i in range(14)]
            groove(body, smp, X, name='GrooveDoor')
    # hood: transverse cowl line + tapered side lines
    smp = [((1.14, lerp(-0.70, 0.70, i / 14.0), 1.4), (0, 0, -1))
           for i in range(15)]
    groove(body, smp, X, name='GrooveHood')
    for sgn in (1, -1):
        smp = [((lerp(1.12, 2.05, t), sgn * lerp(0.68, 0.58, t), 1.4),
                (0, 0, -1)) for t in [i / 9.0 for i in range(10)]]
        groove(body, smp, Y, name='GrooveHoodSide')
    # trunk: transverse line + side lines
    smp = [((-1.62, lerp(-0.72, 0.72, i / 14.0), 1.4), (0, 0, -1))
           for i in range(15)]
    groove(body, smp, X, name='GrooveTrunk')
    for sgn in (1, -1):
        smp = [((lerp(-1.60, -2.28, t), sgn * lerp(0.70, 0.56, t), 1.4),
                (0, 0, -1)) for t in [i / 7.0 for i in range(8)]]
        groove(body, smp, Y, name='GrooveTrunkSide')
    # bumper-to-body cutlines wrapping nose and tail
    groove(body, fan_rays(1.90, 0.575, -1.52, 1.52, 29), Z, name='GrooveBumpF')
    groove(body, fan_rays(-1.85, 0.635, -1.52, 1.52, 29, flip=True), Z,
           name='GrooveBumpR')


def cut_lamp_recesses(body):
    """Shallow sculpted recesses at the front corners for the light clusters."""
    for sgn in (1, -1):
        smp = fan_rays(1.90, 0.653, 0.70, 1.34, 12, sgn=sgn)
        groove(body, smp, (0, 0, 1), half_w=0.058, depth=0.026, out=0.05,
               name='LampRecess')


def darken_recesses(body, ref_bvh, min_d=0.0045):
    """Any face sunk below the pre-groove surface -> dark trim (groove walls,
    groove floors, lamp recess floors)."""
    for p in body.data.polygons:
        loc, _, _, dist = ref_bvh.find_nearest(Vector(p.center))
        if loc is not None and dist > min_d:
            p.material_index = 1
        p.use_smooth = True
    shade_auto(body, 35)


def front_fascia(m, bvh, grille_back):
    # sculpted bumper mass wrapping the whole nose (below the bumper cutline)
    radial_band('BumperF', bvh, 1.90, 0.268, 0.470, -1.38, 1.38, 0.048,
                m['paint'], nz=8, na=33, thick=0.020, ez=0.16, ea=0.10)
    # light clusters set INTO the boolean corner recesses: emissive DRL blade
    # sunk below the outer skin, clear cover just inside the recess mouth
    radial_band('DRL', bvh, 1.90, 0.632, 0.676, 0.74, 1.28, 0.014,
                m['light_head'], nz=5, na=16, both=True, thick=0.008)
    radial_band('LampCoverF', bvh, 1.90, 0.618, 0.690, 0.72, 1.30, 0.021,
                m['glass'], nz=5, na=16, both=True, thick=0.006)
    # dark mesh slats inside the grille recess
    if grille_back is not None:
        gm = mesh_mat()
        for i in range(11):
            y = lerp(-0.37, 0.37, i / 10.0)
            box('GrilleSlat', (grille_back + 0.012, y, 0.506),
                (0.018, 0.022, 0.095), gm, bevel=0.004)
    # lower valance + splitter lip
    box('ValanceF', (2.20, 0, 0.215), (0.38, 1.26, 0.17), m['trim'],
        bevel=0.045, smooth=True)
    box('Splitter', (2.25, 0, 0.145), (0.34, 1.10, 0.035), m['trim'], bevel=0.012)


def rear_fascia(m, bvh, plate_back):
    # rear bumper mass
    radial_band('BumperR', bvh, -1.85, 0.255, 0.400,
                math.pi - 1.30, math.pi + 1.30, 0.032, m['paint'], nz=6, na=25)
    # full-width light bar just under the trunk lip, in a dark housing
    radial_band('TailHousing', bvh, -1.85, 0.678, 0.766,
                math.pi - 1.06, math.pi + 1.06, 0.012, m['trim'], nz=6, na=23)
    radial_band('TailBar', bvh, -1.85, 0.694, 0.750,
                math.pi - 1.00, math.pi + 1.00, 0.026, m['light_tail'],
                nz=5, na=23, thick=0.008)
    # license plate sitting in its boolean recess
    if plate_back is not None:
        box('LicensePlate', (plate_back - 0.005, 0, 0.50), (0.010, 0.50, 0.13),
            plate_mat())
    # diffuser with vertical fins
    box('DiffuserR', (-2.28, 0, 0.20), (0.36, 1.24, 0.16), m['trim'],
        bevel=0.04, smooth=True)
    for y in (-0.40, -0.20, 0.0, 0.20, 0.40):
        box('DiffFin', (-2.36, y, 0.13), (0.20, 0.016, 0.09), m['trim'])


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


def build_accents(m, body_bvh, grille_back, plate_back):
    # (door/hood/trunk shutlines are boolean grooves cut in build())
    # flush door handles: dark recess plate + near-flush chrome blade
    for x0 in (0.30, -0.50):
        for sgn in (1, -1):
            p = raycast(body_bvh, (x0, sgn * 1.4, 0.715), (0, -sgn, 0), inset=-0.003)
            if p:
                box('HandleBase', tuple(p), (0.175, 0.010, 0.044), m['trim'])
            q = raycast(body_bvh, (x0, sgn * 1.4, 0.715), (0, -sgn, 0), inset=0.002)
            if q:
                box('Handle', tuple(q), (0.150, 0.008, 0.026), m['chrome'],
                    bevel=0.003)

    front_fascia(m, body_bvh, grille_back)
    rear_fascia(m, body_bvh, plate_back)

    # side mirrors: stalk, painted housing, dark mirror face on the back
    for sgn in (1, -1):
        box('MirrorStalk', (0.64, sgn * 0.88, 0.92), (0.06, 0.14, 0.026), m['trim'])
        box('MirrorShell', (0.63, sgn * 0.995, 0.945), (0.085, 0.19, 0.10),
            m['paint'], bevel=0.03, smooth=True)
        box('MirrorGlass', (0.585, sgn * 0.995, 0.945), (0.012, 0.150, 0.072),
            m['trim'])

    # shark-fin antenna on the rear roof (ahead of the rear header)
    box('Antenna', (-0.68, 0, 1.400), (0.15, 0.035, 0.055), m['trim'],
        rot=(0, math.radians(-12), 0), bevel=0.012)

    # twin exhaust tips
    for sgn in (1, -1):
        cyl('Exhaust', (-2.37, sgn * 0.55, 0.30), 0.042, 0.16, m['chrome'],
            rot=(0, math.pi / 2, 0), verts=24)


def build_sill(m, cab_bvh):
    sill_trim('SillTrim', cab_bvh, 0.86, -1.18, 0.858, m)


# ---------------------------------------------------------------- build

def build():
    m = harness.mats()
    tune_mats(m)
    body = build_body(m)
    grille_back = cut_recess(body, 3.4, -1, 0.40, 0.452, 0.560, 0.036, m,
                             (0.0, 0.20, 0.36))
    plate_back = cut_recess(body, -3.4, 1, 0.31, 0.405, 0.595, 0.014, m,
                            (0.0, 0.15, 0.29))
    ref_bvh = make_bvh(body)          # pre-groove skin for recess detection
    cut_lamp_recesses(body)
    add_shutlines(body)
    darken_recesses(body, ref_bvh)
    body_bvh = make_bvh(body)
    cab, cab_bvh = build_cabin(m)
    build_glass(m, cab_bvh)
    build_sill(m, cab_bvh)
    build_interior(m)
    build_wheels(m)
    build_accents(m, body_bvh, grille_back, plate_back)
