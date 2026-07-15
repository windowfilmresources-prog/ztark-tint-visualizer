"""Brandless modern full-size crew-cab pickup — the focused single-model attempt.

Why a truck can work where the sedans stalled: pickup body language is slabs,
hard creases, and squared arches — exactly what a loft + boolean pipeline does
well. No class-A compound curvature to lose.

Architecture:
  Lower body: one loft nose->tail (crowned hood, flat door tops, bed rails),
  mirrored + subsurf, creased beltline/rocker.  Bed cavity is a boolean box
  (leaves rails/floor/walls).  Wheel arches are SUPERELLIPSE prisms (squared
  truck arches) with matching squared flare bands built from the same path.
  Greenhouse: upright cab loft cowl->cab rear, solidified, window openings
  boolean-cut, glass raycast-fitted (named zones per the harness contract).
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
# (same toolkit as polish.py — proven pieces, truck-tuned constants)

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


# ---------------------------------------------------------------- proportions

L_NOSE, L_TAIL = 2.85, -2.88          # 5.73 m overall
AXLE_F, AXLE_R = 1.80, -1.74
WHEEL_R = 0.432
AXLE_Z = 0.432
TIRE_W = 0.320
BELT = 1.418                           # beltline / bed rail height
ROOF = 1.965
COWL = 0.78                            # windshield base x
CAB_REAR = -1.34                       # cab back wall x
BED_FLOOR = 0.80

CAM_SCALE = 1.30       # 5.7 m truck needs wider framing than the sedan default

# station: (x, ymax, ztop_edge, dome, zbot)
# Modern truck cue: tall blunt nose — hood front edge nearly at hood height,
# minimal plan-view taper, hard crease around the nose cap.
BODY_STATIONS = [
    ( 2.85, 0.930, 1.352, 0.026, 0.520),
    ( 2.82, 0.950, 1.372, 0.036, 0.460),
    ( 2.62, 0.962, 1.386, 0.046, 0.430),
    ( 2.18, 0.968, 1.392, 0.052, 0.420),
    ( 1.35, 0.970, 1.400, 0.046, 0.420),
    ( 0.78, 0.975, 1.412, 0.020, 0.420),   # cowl
    ( 0.35, 0.975, 1.405, 0.004, 0.420),   # door tops run flat
    (-0.45, 0.975, 1.405, 0.004, 0.420),
    (-1.34, 0.972, 1.415, 0.006, 0.420),   # cab rear / bed start
    (-2.05, 0.966, 1.428, 0.008, 0.420),
    (-2.62, 0.955, 1.432, 0.008, 0.445),
    (-2.88, 0.940, 1.424, 0.008, 0.510),
]


def body_ring(st):
    x, ym, zte, dome, zb = st
    zrk = zb + 0.075
    zbelt = zte - 0.016
    return [
        (x, 0.0,        zb),
        (x, 0.62 * ym,  zb),
        (x, 0.955 * ym, zrk),                          # rocker crease
        (x, 1.000 * ym, lerp(zrk, zbelt, 0.42)),       # bodyside slab crest
        (x, 0.990 * ym, lerp(zrk, zbelt, 0.60)),       # shadow pocket
        (x, 1.000 * ym, zbelt),                        # beltline crease
        (x, 0.910 * ym, zte),                          # shoulder roll
        (x, 0.520 * ym, zte + dome * 0.72),            # deck
        (x, 0.0,        zte + dome),                   # crowned center
    ]


def superellipse(cx, cz, a, b, n, steps=24):
    """Squared-arch path over the top half (truck fender opening)."""
    pts = []
    for i in range(steps + 1):
        th = math.pi * i / steps                       # 0 (rear) -> pi (front)
        c, s = math.cos(th), math.sin(th)
        px = cx + a * math.copysign(abs(c) ** (2.0 / n), c)
        pz = cz + b * (abs(s) ** (2.0 / n))
        pts.append((px, pz))
    return pts


ARCH_A, ARCH_B, ARCH_N = 0.560, 0.530, 3.4   # hugs the tire (r 0.432 + ~0.10)


def arch_cutter(xa):
    path = superellipse(xa, AXLE_Z, ARCH_A, ARCH_B, ARCH_N)
    path += [(xa + ARCH_A, AXLE_Z - 0.30), (xa - ARCH_A, AXLE_Z - 0.30)][::-1]
    pa = [(x, 1.6, z) for x, z in path]
    pb = [(x, -1.6, z) for x, z in path]
    return prism('cut_arch', pa, pb)


def flare_band(name, xa, ym, m):
    """Squared fender flare: band following the arch path, pushed out in Y."""
    path = [p for p in superellipse(xa, AXLE_Z, ARCH_A + 0.012, ARCH_B + 0.012,
                                    ARCH_N, steps=28) if p[1] > 0.478]
    bm = bmesh.new()
    for sgn in (1, -1):
        rows = []
        for (px, pz) in path:
            # band from arch lip outward+up; thickness in Y beyond the body side
            lift = 0.055
            out = 0.045
            rows.append((
                bm.verts.new(Vector((px, sgn * (ym + 0.004), pz))),
                bm.verts.new(Vector((px, sgn * (ym + out), pz + lift * 0.55))),
                bm.verts.new(Vector((px, sgn * (ym + 0.010), pz + lift))),
            ))
        for r0, r1 in zip(rows, rows[1:]):
            for k in range(2):
                if sgn > 0:
                    bm.faces.new([r0[k], r0[k + 1], r1[k + 1], r1[k]])
                else:
                    bm.faces.new([r1[k], r1[k + 1], r0[k + 1], r0[k]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(name, bm, [m['paint']])
    shade_auto(ob, 55)
    return ob


def build_body(m):
    rings = [body_ring(s) for s in BODY_STATIONS]
    bm = loft('Body', rings,
              long_creases={2: 0.70, 3: 1.0, 4: 0.35, 5: 1.0, 6: 0.35},
              ring_creases={0: 0.95, 1: 0.80, 2: 0.45, len(rings) - 2: 0.70,
                            len(rings) - 1: 0.90})
    body = obj_from_bm('Body', bm, [m['paint'], m['trim']])
    mirror_subsurf(body, 2)

    # bed cavity (leaves rails / front wall / floor / tailgate wall)
    bed = box('cut_bed', ((CAB_REAR - 0.10 + L_TAIL + 0.16) / 2, 0, (BED_FLOOR + 1.90) / 2),
              (abs(L_TAIL - 0.16 - (CAB_REAR + 0.10)), 1.64, 1.90 - BED_FLOOR),
              m['trim'])
    bool_cut(body, bed)

    # squared wheel arches
    for xa in (AXLE_F, AXLE_R):
        bool_cut(body, arch_cutter(xa))

    # arch liner faces + bed interior -> dark trim; lower-body cladding too
    for p in body.data.polygons:
        c = p.center
        for xa in (AXLE_F, AXLE_R):
            if (abs(c.x - xa) < ARCH_A + 0.02 and c.z < AXLE_Z + ARCH_B + 0.02
                    and c.z > 0.15 and abs(p.normal.y) < 0.72 and abs(c.y) < 0.97):
                p.material_index = 1
        if (CAB_REAR - 0.02 < -1 and c.x < CAB_REAR - 0.08 and c.x > L_TAIL + 0.14
                and c.z > BED_FLOOR - 0.03 and abs(c.y) < 0.85 and p.normal.z > -0.5
                and c.z < BELT - 0.01):
            p.material_index = 1
        if c.z < 0.505 and abs(c.x) < 2.70:      # dark rocker cladding band
            p.material_index = 1
        p.use_smooth = True
    shade_auto(body, 35)

    # squared flare bands over all four arches
    for xa, ym in ((AXLE_F, 0.968), (AXLE_R, 0.968)):
        flare_band('Flare', xa, ym, m)
    return body


# ---------------------------------------------------------------- greenhouse

# station: (x, ztop, ybase)  — upright truck cab
CAB_STATIONS = [
    ( COWL, 1.412, 0.958),
    ( 0.60, 1.610, 0.956),
    ( 0.41, 1.800, 0.953),
    ( 0.26, 1.940, 0.950),    # windshield header (crease)
    (-0.30, 1.965, 0.946),    # roof crown
    (-0.90, 1.955, 0.940),
    (-1.16, 1.945, 0.936),    # rear header (crease)
    (-1.30, 1.640, 0.930),
    (-1.34, 1.430, 0.928),    # backlight base at the bed rail
]
CAB_RING_CREASES = {0: 0.55, 3: 0.72, 6: 0.72, 8: 0.55}


def cab_ring(st):
    x, ztop, yb = st
    zsh = min(BELT + 0.015, ztop - 0.02)
    tumble = 0.125 * clamp((ztop - BELT) / (ROOF - BELT), 0.0, 1.0)
    yedge = yb - tumble
    zdrip = max(lerp(zsh, ztop, 0.82), ztop - 0.030)
    return [
        (x, 0.0,                    1.10),
        (x, yb,                     1.10),
        (x, yb,                     zsh),
        (x, lerp(yb, yedge, 0.50),  lerp(zsh, ztop, 0.52)),
        (x, yedge,                  zdrip),
        (x, 0.0,                    ztop),
    ]


WS_B = Vector((COWL, 0, 1.412))
WS_T = Vector((0.26, 0, 1.940))
RW_B = Vector((-1.34, 0, 1.430))
RW_T = Vector((-1.16, 0, 1.945))

# side windows (x, z): tall upright truck DLO, B-pillar at x ~ 0.0
SIDE_F = [(0.64, 1.448), (0.315, 1.852), (0.045, 1.852), (0.045, 1.448)]
SIDE_R = [(-0.035, 1.448), (-0.035, 1.852), (-0.92, 1.852), (-1.05, 1.448)]


def plane_axes(B, T):
    u = (T - B).normalized()
    n = Vector((-u.z, 0, u.x))
    if n.z < 0:
        n = -n
    return u, n, (T - B).length


def build_cabin(m):
    rings = [cab_ring(s) for s in CAB_STATIONS]
    bm = loft('Cabin', rings,
              long_creases={1: 0.60, 2: 0.85, 4: 0.30},
              ring_creases=CAB_RING_CREASES)
    cab = obj_from_bm('Cabin', bm, [m['paint']])
    mirror_subsurf(cab, 2)
    shade_auto(cab, 40)

    bvh = make_bvh(cab)

    sol = cab.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.032
    sol.offset = -1.0
    apply_mods(cab)

    # windshield + backlight openings
    for (B, T, wb, wt, t0, t1, nm) in (
            (WS_B, WS_T, 0.780, 0.650, 0.075, 0.880, 'ws'),
            (RW_B, RW_T, 0.740, 0.660, 0.100, 0.860, 'rw')):
        u, n, L = plane_axes(B, T)
        corners = []
        for t, w in ((t0, lerp(wb, wt, t0)), (t1, lerp(wb, wt, t1))):
            p = B + u * (t * L)
            corners.append((p + Vector((0, -w, 0)), p + Vector((0, w, 0))))
        loop = [corners[0][0], corners[0][1], corners[1][1], corners[1][0]]
        pa = [tuple(p + n * 0.45) for p in loop]
        pb = [tuple(p - n * 0.35) for p in loop]
        bool_cut(cab, prism('cut_' + nm, pa, pb))

    # side window openings
    for poly, nm in ((SIDE_F, 'sf'), (SIDE_R, 'sr')):
        pa = [(x, 1.4, z) for x, z in poly]
        pb = [(x, -1.4, z) for x, z in poly]
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
                    fallback=Vector((x, sgn * 0.86, z)))
        ring.append(bm.verts.new(p))
    ctr = raycast(bvh, (cx, sgn * 1.5, cz), (0, -sgn, 0), inset=-inset,
                  fallback=Vector((cx, sgn * 0.88, cz)))
    vc = bm.verts.new(ctr)
    nr = len(ring)
    for i in range(nr):
        bm.faces.new([ring[i], ring[(i + 1) % nr], vc])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(name, bm, [m['glass']])
    ob.data.name = name
    return ob


def build_glass(m, cab_bvh):
    ws = grid_pane('Windshield', cab_bvh, WS_B, WS_T, 0.800, 0.665, 0.055, 0.905, m)
    rw = grid_pane('RearWindow', cab_bvh, RW_B, RW_T, 0.760, 0.680, 0.085, 0.885, m)
    for ob in (ws, rw):
        shade_auto(ob, 60)
    for side in ('L', 'R'):
        f = side_pane('WindowFront' + side, cab_bvh, SIDE_F, side, m)
        r = side_pane('WindowRear' + side, cab_bvh, SIDE_R, side, m)
        for ob in (f, r):
            shade_auto(ob, 60)


# ---------------------------------------------------------------- interior

def build_interior(m):
    mi = m['interior']
    box('Floor', (-0.30, 0, 1.10), (2.10, 1.50, 0.03), mi)
    box('Dash', (0.52, 0, 1.34), (0.30, 1.48, 0.20), mi, bevel=0.04)
    box('Console', (0.10, 0, 1.26), (0.80, 0.26, 0.14), mi, bevel=0.02)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.185, minor_radius=0.022,
                                     location=(0.38, 0.40, 1.42),
                                     rotation=(0, math.radians(-72), 0))
    sw = bpy.context.active_object
    sw.name = 'SteeringWheel'
    sw.data.materials.append(mi)
    shade_auto(sw, 40)
    for y in (0.40, -0.40):
        box('SeatCushion', (-0.12, y, 1.24), (0.55, 0.52, 0.16), mi, bevel=0.05)
        box('SeatBack', (-0.40, y, 1.53), (0.17, 0.52, 0.52), mi,
            rot=(0, math.radians(-9), 0), bevel=0.05)
    box('RearCushion', (-0.92, 0, 1.24), (0.50, 1.35, 0.16), mi, bevel=0.05)
    box('RearBack', (-1.16, 0, 1.52), (0.17, 1.35, 0.50), mi,
        rot=(0, math.radians(-12), 0), bevel=0.05)


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


TIRE_YC = 0.838        # tire centerline; outer face ~0.99, flush with the flare


def lathe_tire(name, x, yc, mat):
    hw = TIRE_W / 2.0
    prof = [
        (0.288,  hw * 0.96),
        (0.356,  hw),
        (0.402,  hw * 0.88),
        (0.427,  hw * 0.52),
        (0.432,  0.0),
        (0.427, -hw * 0.52),
        (0.402, -hw * 0.88),
        (0.356, -hw),
        (0.288, -hw * 0.96),
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
    bm = bmesh.new()
    r0, r1 = 0.066, 0.280
    w0, w1 = 0.062, 0.034               # chunky truck spokes
    yo = 0.926
    th = 0.030
    ring = []
    for (r, w, yf) in ((r0, w0, yo), (r1, w1, yo - 0.010)):
        for (dw, y) in ((-w, yf), (w, yf), (w, yf - th), (-w, yf - th)):
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
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.007, segments=2,
                    profile=0.7, affect='EDGES', clamp_overlap=True)
    ob = obj_from_bm(name, bm, [mat])
    shade_auto(ob, 45)
    return ob


def build_wheels(m):
    calm = caliper_mat()
    # dark satin rims read "truck" better than bright alloys
    rim_dark = bpy.data.materials.new('RimDark')
    rim_dark.use_nodes = True
    b = rim_dark.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.13, 0.135, 0.145, 1.0)
    b.inputs['Metallic'].default_value = 0.85
    b.inputs['Roughness'].default_value = 0.38

    for x in (AXLE_F, AXLE_R):
        for sgn in (1, -1):
            yc = TIRE_YC * sgn
            lathe_tire('Tire', x, yc, m['tire'])
            # inner-well wall stays INSIDE the body shell (z 0.48..0.92)
            box('WellWall', (x, 0.60 * sgn, 0.70), (0.92, 0.02, 0.44), m['trim'])
            cyl('Barrel', (x, 0.815 * sgn, AXLE_Z), 0.252, 0.20, m['trim'], verts=48)
            bpy.ops.mesh.primitive_torus_add(
                major_radius=0.284, minor_radius=0.017,
                location=(x, 0.916 * sgn, AXLE_Z),
                rotation=(math.pi / 2, 0, 0),
                major_segments=64, minor_segments=12)
            lip = bpy.context.active_object
            lip.name = 'RimLip'
            lip.data.materials.append(rim_dark)
            shade_auto(lip, 40)
            cyl('Brake', (x, 0.848 * sgn, AXLE_Z), 0.184, 0.024, m['chrome'], verts=48)
            ac = math.radians(62) * (1 if x > 0 else -1)
            box('Caliper',
                (x + math.sin(ac) * 0.142, 0.850 * sgn, AXLE_Z + math.cos(ac) * 0.142),
                (0.082, 0.056, 0.170), calm, rot=(0, ac, 0), bevel=0.015, smooth=True)
            cyl('Hub', (x, 0.908 * sgn, AXLE_Z), 0.072, 0.046, rim_dark, verts=32)
            cyl('HubCap', (x, 0.926 * sgn, AXLE_Z), 0.034, 0.013, m['chrome'], verts=24)
            for k in range(6):
                a = k * 2.0 * math.pi / 6 + 0.26
                spoke('Spoke', x, sgn, a, rim_dark)


# ---------------------------------------------------------------- fascias

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


def build_front(m):
    gm = mesh_mat()
    # grille: wide dark panel sitting PROUD of the nose, 3 satin cross-bars
    box('GrillePanel', (2.872, 0, 1.045), (0.060, 1.42, 0.50), gm)
    for k in range(3):
        z = 0.905 + k * 0.135
        box('GrilleBar', (2.906, 0, z),
            (0.030, 1.38, 0.042), m['trim'], bevel=0.008, smooth=True)
    # full-width light bar above the grille + slim lamps at its ends
    box('LightBar', (2.880, 0, 1.336), (0.028, 1.44, 0.026), m['light_head'])
    for sgn in (1, -1):
        box('Headlamp', (2.868, 0.700 * sgn, 1.238), (0.050, 0.24, 0.095),
            m['light_head'], rot=(0, 0, math.radians(6 * sgn)),
            bevel=0.012, smooth=True)
        box('LampBrow', (2.872, 0.700 * sgn, 1.305), (0.040, 0.26, 0.020),
            m['trim'], rot=(0, 0, math.radians(6 * sgn)), bevel=0.006)
    # bumper: two-tier slab, body-color cap over dark lower
    box('BumperCap', (2.925, 0, 0.775), (0.150, 1.94, 0.115), m['paint'],
        bevel=0.026, smooth=True)
    box('BumperLow', (2.910, 0, 0.585), (0.155, 1.76, 0.240), m['trim'],
        bevel=0.024, smooth=True)
    box('SkidPlate', (2.885, 0, 0.450), (0.17, 0.66, 0.10), m['chrome'],
        rot=(0, math.radians(14), 0), bevel=0.018, smooth=True)
    # fog pockets
    for sgn in (1, -1):
        box('Fog', (2.955, 0.72 * sgn, 0.585), (0.035, 0.17, 0.065), gm,
            bevel=0.008)


def build_rear(m):
    gm = mesh_mat()
    # tailgate face panel with a horizontal crease band
    box('TailPanel', (-2.895, 0, 1.10), (0.030, 1.62, 0.56), m['paint'],
        bevel=0.010)
    box('TailBand', (-2.908, 0, 1.15), (0.022, 1.55, 0.055), m['trim'],
        bevel=0.006)
    # vertical taillight towers at the bed corners
    for sgn in (1, -1):
        box('Taillight', (-2.878, 0.842 * sgn, 1.12), (0.062, 0.085, 0.54),
            m['light_tail'], bevel=0.012, smooth=True)
    box('BumperRearCap', (-2.930, 0, 0.760), (0.115, 1.90, 0.085), m['paint'],
        bevel=0.018, smooth=True)
    box('BumperRear', (-2.905, 0, 0.595), (0.125, 1.76, 0.215), m['trim'],
        bevel=0.020, smooth=True)
    box('HitchStep', (-2.955, 0, 0.50), (0.08, 0.44, 0.09), gm, bevel=0.012)


def build_details(m):
    gm = mesh_mat()
    # running boards — chunky, proud of the rocker
    for sgn in (1, -1):
        box('RunningBoard', (-0.28, 1.005 * sgn, 0.455), (1.95, 0.17, 0.065),
            m['trim'], bevel=0.018, smooth=True)
    # door seam strips (shallow, read as shut-lines from viewer distance)
    for sgn in (1, -1):
        for xs in (0.70, 0.005, -0.88):
            box('Seam', (xs, 0.9835 * sgn, 0.96), (0.012, 0.012, 0.80),
                m['trim'])
    # tow mirrors on stalks
    for sgn in (1, -1):
        box('MirrorStalk', (0.615, 0.985 * sgn, 1.508), (0.030, 0.135, 0.026),
            m['trim'], rot=(math.radians(12 * sgn), 0, 0))
        box('Mirror', (0.60, 1.075 * sgn, 1.535), (0.055, 0.045, 0.155),
            m['trim'], bevel=0.010, smooth=True)
    # door handles
    for sgn in (1, -1):
        for xh in (0.22, -0.62):
            box('Handle', (xh, 0.972 * sgn, 1.27), (0.13, 0.018, 0.026),
                m['chrome'], bevel=0.006, smooth=True)
    # bed rail caps + tailgate top
    for sgn in (1, -1):
        box('RailCap', ((CAB_REAR - 0.02 + L_TAIL) / 2, 0.905 * sgn, BELT + 0.012),
            (abs(L_TAIL - (CAB_REAR - 0.02)), 0.135, 0.024), m['trim'],
            bevel=0.008, smooth=True)
    box('GateCap', (L_TAIL + 0.075, 0, BELT + 0.012), (0.145, 1.66, 0.024),
        m['trim'], bevel=0.008, smooth=True)
    # bed floor ribs
    for k in range(6):
        x = CAB_REAR - 0.28 - k * 0.22
        box('BedRib', (x, 0, BED_FLOOR + 0.012), (0.05, 1.56, 0.020), gm)
    # cowl / wiper strip at windshield base
    box('CowlStrip', (COWL + 0.035, 0, 1.406), (0.075, 1.52, 0.018), m['trim'])


def tune_mats(m):
    """Glass -> alpha-blended tinted-neutral so the cab reads; nicer paint."""
    g = m['glass']
    b = g.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.22, 0.25, 0.28, 1.0)
    b.inputs['Roughness'].default_value = 0.04
    g.blend_method = 'BLEND'
    if hasattr(g, 'show_transparent_back'):
        g.show_transparent_back = False
    b.inputs['Alpha'].default_value = 0.55
    p = m['paint']
    pb = p.node_tree.nodes['Principled BSDF']
    pb.inputs['Base Color'].default_value = (0.058, 0.098, 0.165, 1.0)  # deep navy metallic
    pb.inputs['Metallic'].default_value = 0.40
    pb.inputs['Roughness'].default_value = 0.30


# ---------------------------------------------------------------- build

def build():
    m = harness.mats()
    tune_mats(m)
    build_body(m)
    cab, bvh = build_cabin(m)
    build_glass(m, bvh)
    build_interior(m)
    build_wheels(m)
    build_front(m)
    build_rear(m)
    build_details(m)
