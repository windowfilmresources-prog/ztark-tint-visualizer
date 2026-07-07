"""Technique D — detail-first brandless sedan.

Simple lofted subsurf body + heavy detailing: full interior, door seams
(boolean grooves), flush handles, mirrors, layered fascias, light clusters,
diffuser, wipers, arch lips, multi-part wheels.
"""
import bpy
import bmesh
import math
import harness
from mathutils import Vector, Matrix

# ---------------------------------------------------------------- helpers

def P(name, color, metallic=0.0, rough=0.5, emission=None, estr=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    if emission is not None:
        for k in ("Emission Color", "Emission"):
            if k in b.inputs:
                b.inputs[k].default_value = (*emission, 1.0)
                break
        if "Emission Strength" in b.inputs:
            b.inputs["Emission Strength"].default_value = estr
    return m


def act(o):
    bpy.context.view_layer.objects.active = o


def smooth(o, quads_only=False):
    for p in o.data.polygons:
        p.use_smooth = (len(p.vertices) == 4) if quads_only else True


def box(name, c, s, mat, rot=(0, 0, 0), bev=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=c)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    o.scale = s
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_euler = rot
    if bev > 0:
        bv = o.modifiers.new("bev", "BEVEL")
        bv.width = bev
        bv.segments = 3
    if mat:
        o.data.materials.append(mat)
    return o


def cyl(name, c, r, depth, mat, rot=(math.pi / 2, 0, 0), verts=48):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts,
                                        location=c, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    if mat:
        o.data.materials.append(mat)
    smooth(o, quads_only=True)
    return o


def torus(name, c, R, r, mat, rot=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r,
                                     location=c, rotation=rot,
                                     major_segments=64, minor_segments=12)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    if mat:
        o.data.materials.append(mat)
    smooth(o)
    return o


def beam(name, p1, p2, w, h, mat):
    p1 = Vector(p1)
    p2 = Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cube_add(size=1, location=(p1 + p2) / 2)
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    o.scale = (w, h, d.length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    if mat:
        o.data.materials.append(mat)
    return o


def panel(name, corners, mat, thick=0.0):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(c) for c in corners], [], [list(range(len(corners)))])
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if thick > 0:
        sm = o.modifiers.new("sol", "SOLIDIFY")
        sm.thickness = thick
        sm.offset = 0
    o.data.materials.append(mat)
    return o


def bool_cut(target, cutter):
    md = target.modifiers.new("bool", "BOOLEAN")
    md.object = cutter
    md.operation = 'DIFFERENCE'
    try:
        md.solver = 'EXACT'
    except Exception:
        pass
    act(target)
    bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def clip_below(o, zmin):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    kill = [v for v in bm.verts if v.co.z < zmin]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(o.data)
    bm.free()


# ---------------------------------------------------------------- body loft
# half profile: (y, z) from top-center down to bottom-center, 7 pts.
SECS = [
    (-2.39, [(0, 0.78), (0.60, 0.765), (0.80, 0.62), (0.79, 0.38), (0.72, 0.235), (0.62, 0.17), (0, 0.165)]),
    (-2.10, [(0, 0.805), (0.64, 0.79), (0.83, 0.70), (0.87, 0.42), (0.79, 0.22), (0.68, 0.16), (0, 0.15)]),
    (-1.60, [(0, 0.83), (0.66, 0.815), (0.865, 0.78), (0.90, 0.45), (0.83, 0.215), (0.72, 0.16), (0, 0.15)]),
    (-0.95, [(0, 0.815), (0.68, 0.81), (0.875, 0.795), (0.915, 0.46), (0.855, 0.21), (0.74, 0.16), (0, 0.145)]),
    (0.00, [(0, 0.815), (0.68, 0.81), (0.875, 0.795), (0.92, 0.46), (0.86, 0.21), (0.75, 0.16), (0, 0.145)]),
    (0.95, [(0, 0.82), (0.68, 0.812), (0.875, 0.795), (0.92, 0.46), (0.86, 0.21), (0.75, 0.16), (0, 0.145)]),
    (1.42, [(0, 0.85), (0.68, 0.835), (0.87, 0.79), (0.92, 0.45), (0.85, 0.21), (0.74, 0.16), (0, 0.145)]),
    (1.80, [(0, 0.82), (0.62, 0.795), (0.83, 0.70), (0.90, 0.43), (0.83, 0.215), (0.72, 0.16), (0, 0.145)]),
    (2.20, [(0, 0.775), (0.55, 0.745), (0.76, 0.62), (0.84, 0.40), (0.78, 0.22), (0.68, 0.16), (0, 0.15)]),
    (2.39, [(0, 0.72), (0.38, 0.685), (0.55, 0.56), (0.62, 0.38), (0.60, 0.24), (0.52, 0.175), (0, 0.17)]),
]


def build_body(M):
    bm = bmesh.new()
    rings = []
    for x, pts in SECS:
        full = list(pts) + [(-y, z) for (y, z) in reversed(pts[1:-1])]
        rings.append([bm.verts.new((x, y, z)) for (y, z) in full])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bm.normal_update()

    cl = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')

    def edge(v1, v2):
        for e in v1.link_edges:
            if e.other_vert(v1) is v2:
                return e
        return None

    for a, b in zip(rings, rings[1:]):
        for i, w in ((2, 0.45), (10, 0.45), (5, 0.6), (7, 0.6)):
            e = edge(a[i], b[i])
            if e:
                e[cl] = w
    for ring in (rings[0], rings[-1]):
        for i in range(n):
            e = edge(ring[i], ring[(i + 1) % n])
            if e:
                e[cl] = 0.85

    me = bpy.data.meshes.new("Body")
    bm.to_mesh(me)
    bm.free()
    body = bpy.data.objects.new("Body", me)
    bpy.context.collection.objects.link(body)
    body.data.materials.append(M["paint"])
    ss = body.modifiers.new("ss", "SUBSURF")
    ss.levels = 3
    ss.render_levels = 3
    act(body)
    bpy.ops.object.modifier_apply(modifier=ss.name)

    # wheel arch pockets
    for x in (1.40, -1.40):
        for s in (1, -1):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.44, depth=0.55, vertices=64,
                                                location=(x, s * 0.785, 0.355),
                                                rotation=(math.pi / 2, 0, 0))
            bool_cut(body, bpy.context.active_object)

    # vertical door seams (both sides)
    for sx in (0.90, -0.13, -0.92):
        for s in (1, -1):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(sx, s * 0.90, 0.48))
            k = bpy.context.active_object
            k.scale = (0.008, 0.24, 0.58)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            bool_cut(body, k)

    # hood + trunk shutlines (top only)
    for sx, yw in ((1.40, 1.60), (-1.62, 1.44)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(sx, 0, 0.88))
        k = bpy.context.active_object
        k.scale = (0.008, yw, 0.22)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bool_cut(body, k)

    smooth(body)
    return body


# ---------------------------------------------------------------- greenhouse
def yf(z):
    """tumblehome: cabin side y at height z (left side)."""
    return 0.862 - 0.45 * (z - 0.80)


def greenhouse(M):
    g = M["glass"]
    # windshield
    panel("Windshield",
          [(1.42, 0.70, 0.83), (1.42, -0.70, 0.83),
           (0.40, -0.56, 1.395), (0.40, 0.56, 1.395)], g, thick=0.006)
    # rear window
    panel("RearWindow",
          [(-1.64, -0.62, 0.80), (-1.64, 0.62, 0.80),
           (-0.74, 0.545, 1.39), (-0.74, -0.545, 1.39)], g, thick=0.006)
    y1, y2 = yf(0.79) + 0.012, yf(1.36) + 0.012
    for s, tag in ((1, "L"), (-1, "R")):
        panel("WindowFront" + tag,
              [(1.36, s * y1, 0.79), (-0.033, s * y1, 0.79),
               (-0.105, s * y2, 1.36), (0.40, s * y2, 1.36)], g, thick=0.005)
        panel("WindowRear" + tag,
              [(-0.133, s * y1, 0.79), (-1.60, s * y1, 0.79),
               (-0.755, s * y2, 1.36), (-0.205, s * y2, 1.36)], g, thick=0.005)

    # roof
    roof = box("Roof", (-0.21, 0, 1.375), (1.26, 1.30, 0.075), M["paint"], bev=0.04)
    smooth(roof)
    # pillars (ruled panels, tucked just inboard of the glass plane)
    for s in (1, -1):
        panel("APillar" + ("L" if s > 0 else "R"),
              [(1.43, s * 0.675, 0.805), (1.32, s * 0.858, 0.79),
               (0.44, s * 0.605, 1.36), (0.40, s * 0.545, 1.385)],
              M["paint"], thick=0.05)
        panel("BPillar" + ("L" if s > 0 else "R"),
              [(-0.01, s * 0.862, 0.77), (-0.16, s * 0.862, 0.77),
               (-0.23, s * 0.60, 1.40), (-0.08, s * 0.60, 1.40)],
              M["trim"], thick=0.03)
        panel("CPillar" + ("L" if s > 0 else "R"),
              [(-1.66, s * 0.60, 0.80), (-1.42, s * 0.858, 0.78),
               (-0.62, s * 0.605, 1.355), (-0.76, s * 0.53, 1.385)],
              M["paint"], thick=0.05)
        # belt molding
        beam("BeltTrim" + ("L" if s > 0 else "R"),
             (1.38, s * 0.878, 0.795), (-1.58, s * 0.878, 0.795),
             0.015, 0.012, M["chrome"])
    # shark fin antenna
    box("Fin", (-0.60, 0, 1.44), (0.14, 0.035, 0.06), M["trim"], rot=(0, math.radians(-8), 0))
    # third brake light behind rear glass top
    box("BrakeLight3", (-0.80, 0, 1.33), (0.02, 0.60, 0.015), M["light_tail"])


# ---------------------------------------------------------------- interior
def seat(M, px, py, name, recline=15.0, scale_w=1.0):
    fabric = P("SeatFabric", (0.30, 0.285, 0.27), rough=0.92)
    w = 0.46 * scale_w
    c = box(name + "_cushion", (px, py, 0.44), (0.52, w, 0.14), fabric, bev=0.04)
    b = box(name + "_back", (px - 0.28, py, 0.74), (0.13, w, 0.58), fabric,
            rot=(0, math.radians(-recline), 0), bev=0.04)
    h = box(name + "_head", (px - 0.36, py, 1.10), (0.10, 0.24, 0.17), fabric,
            rot=(0, math.radians(-recline), 0), bev=0.03)
    for o in (c, b, h):
        smooth(o)


def interior(M):
    dark = M["interior"]
    screen = P("ScreenGlass", (0.01, 0.01, 0.012), rough=0.08)
    # floor tub, door cards, parcel shelf
    box("Tub", (0.01, 0, 0.27), (1.86, 1.55, 0.14), dark)
    box("TubRear", (-1.10, 0, 0.27), (0.55, 1.0, 0.14), dark)
    for s in (1, -1):
        box("DoorCard" + ("L" if s > 0 else "R"), (0.0, s * 0.79, 0.56),
            (1.84, 0.05, 0.44), dark)
    box("ParcelShelf", (-1.42, 0, 0.76), (0.5, 1.30, 0.03), dark)
    # dash + cowl + screen + console
    d = box("Dash", (1.13, 0, 0.62), (0.42, 1.58, 0.42), dark, bev=0.05)
    smooth(d)
    cw = box("DashCowl", (1.08, 0.38, 0.855), (0.28, 0.36, 0.07), dark, bev=0.025)
    smooth(cw)
    box("CenterScreen", (1.00, 0, 0.90), (0.02, 0.34, 0.14), screen,
        rot=(0, math.radians(-8), 0))
    cs = box("Console", (0.35, 0, 0.47), (1.15, 0.26, 0.24), dark, bev=0.03)
    smooth(cs)
    # steering wheel + spokes + column
    wc = Vector((0.78, 0.38, 0.82))
    tilt = math.radians(78)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.185, minor_radius=0.021,
                                     location=wc, rotation=(0, tilt, 0),
                                     major_segments=36, minor_segments=10)
    sw = bpy.context.active_object
    sw.name = "SteeringWheel"
    sw.data.materials.append(dark)
    smooth(sw)
    nrm = Vector((math.sin(tilt), 0, math.cos(tilt)))
    u = Vector((0, 1, 0))
    v = nrm.cross(u)
    for i, ang in enumerate((0.0, math.pi, -math.pi / 2)):
        dirv = u * math.cos(ang) + v * math.sin(ang)
        beam(f"SWspoke{i}", wc, wc + dirv * 0.18, 0.030, 0.014, dark)
    beam("SWcolumn", wc, (1.02, 0.38, 0.87), 0.05, 0.05, dark)
    # rear-view mirror
    box("RVMirror", (0.50, 0, 1.27), (0.05, 0.22, 0.07), M["trim"])
    # seats: 2 front + 2 rear
    seat(M, 0.15, 0.38, "SeatFL")
    seat(M, 0.15, -0.38, "SeatFR")
    seat(M, -0.75, 0.35, "SeatRL", recline=22, scale_w=1.2)
    seat(M, -0.75, -0.35, "SeatRR", recline=22, scale_w=1.2)


# ---------------------------------------------------------------- wheels
def wheel(M, x, s):
    cy = 0.76 * s
    t = cyl(f"Tire_{x}_{s}", (x, cy, 0.355), 0.355, 0.25, M["tire"], verts=64)
    bv = t.modifiers.new("bev", "BEVEL")
    bv.width = 0.045
    bv.segments = 3
    # dark barrel backing
    cyl(f"WheelBarrel_{x}_{s}", (x, cy + 0.01 * s, 0.355), 0.225, 0.16, M["trim"], verts=48)
    # rotor + caliper
    cyl(f"Rotor_{x}_{s}", (x, cy + 0.055 * s, 0.355), 0.165, 0.024, M["chrome"], verts=48)
    box(f"Caliper_{x}_{s}", (x + 0.09, cy + 0.055 * s, 0.44), (0.09, 0.05, 0.09),
        P("CaliperRed", (0.45, 0.02, 0.02), rough=0.4), bev=0.015)
    # spokes + lip + hub at outer face
    fy = cy + 0.115 * s
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.3
        tip = (x + 0.20 * math.cos(a), fy, 0.355 + 0.20 * math.sin(a))
        beam(f"Spoke_{x}_{s}_{k}", (x, fy, 0.355), tip, 0.048, 0.028, M["rim"])
    torus(f"RimLip_{x}_{s}", (x, fy, 0.355), 0.215, 0.022, M["rim"])
    cyl(f"Hub_{x}_{s}", (x, fy + 0.005 * s, 0.355), 0.055, 0.03, M["rim"], verts=24)


# ---------------------------------------------------------------- fascias
def headlight(M, s):
    tag = "L" if s > 0 else "R"
    a = math.radians(26.0) * s
    c = Vector((2.32, 0.47 * s, 0.565))
    R = Matrix.Rotation(a, 4, 'Z')

    def W(loc):
        return c + R @ Vector(loc)

    box("HeadHouse" + tag, W((0, 0, 0)), (0.22, 0.32, 0.07), M["trim"], rot=(0, 0, a))
    box("DRL" + tag, W((0.108, 0, 0.024)), (0.012, 0.27, 0.010), M["light_head"], rot=(0, 0, a))
    for j, k in enumerate((-1, 1)):
        cyl(f"Proj{tag}{j}", W((0.085, 0.062 * k, -0.006)), 0.026, 0.05,
            M["chrome"], rot=(0, math.pi / 2, a), verts=24)
        cyl(f"ProjLens{tag}{j}", W((0.113, 0.062 * k, -0.006)), 0.020, 0.012,
            M["light_head"], rot=(0, math.pi / 2, a), verts=24)
    box("HeadCover" + tag, W((0.125, 0, 0)), (0.006, 0.32, 0.07), M["glass"], rot=(0, 0, a))


def front_fascia(M):
    fin_m = P("DarkFin", (0.10, 0.10, 0.11), rough=0.4)
    # grille
    box("GrilleHouse", (2.345, 0, 0.46), (0.10, 0.66, 0.22), M["trim"])
    for i, z in enumerate((0.40, 0.46, 0.52)):
        box(f"GrilleSlat{i}", (2.365, 0, z), (0.09, 0.60, 0.014), M["chrome"])
    # lower intake + fins
    box("Intake", (2.345, 0, 0.26), (0.10, 1.05, 0.16), M["trim"])
    for i, y in enumerate((-0.40, -0.20, 0.0, 0.20, 0.40)):
        box(f"IntakeFin{i}", (2.365, y, 0.26), (0.09, 0.018, 0.15), fin_m)
    # splitter
    box("Splitter", (2.36, 0, 0.155), (0.16, 1.10, 0.025), M["trim"])
    # corner side intakes
    for s in (1, -1):
        box("SideIntake" + ("L" if s > 0 else "R"), (2.26, s * 0.62, 0.27),
            (0.10, 0.18, 0.10), M["trim"], rot=(0, 0, math.radians(-30) * s))
    headlight(M, 1)
    headlight(M, -1)


def rear_fascia(M):
    plate_m = P("Plate", (0.75, 0.76, 0.74), rough=0.5)
    box("TailHousing", (-2.36, 0, 0.68), (0.05, 1.28, 0.08), M["trim"])
    box("TailBar", (-2.37, 0, 0.68), (0.06, 1.22, 0.045), M["light_tail"])
    for s in (1, -1):
        box("TailCorner" + ("L" if s > 0 else "R"), (-2.335, s * 0.655, 0.68),
            (0.09, 0.10, 0.042), M["light_tail"], rot=(0, 0, math.radians(-25) * s))
    box("PlateRecess", (-2.36, 0, 0.46), (0.06, 0.44, 0.16), M["trim"])
    box("Plate", (-2.395, 0, 0.46), (0.008, 0.36, 0.12), plate_m)
    box("Diffuser", (-2.34, 0, 0.19), (0.14, 1.15, 0.10), M["trim"])
    for i, y in enumerate((-0.40, -0.15, 0.15, 0.40)):
        box(f"DiffFin{i}", (-2.38, y, 0.145), (0.06, 0.02, 0.11), M["trim"])
    for s in (1, -1):
        cyl("Exhaust" + ("L" if s > 0 else "R"), (-2.36, s * 0.68, 0.22), 0.042, 0.12,
            M["chrome"], rot=(0, math.pi / 2, 0), verts=24)
    # ducktail lip
    box("Ducktail", (-2.32, 0, 0.785), (0.16, 1.10, 0.020), M["paint"],
        rot=(0, math.radians(-8), 0))


# ---------------------------------------------------------------- small stuff
def details(M):
    # arch lips
    for x in (1.40, -1.40):
        for s in (1, -1):
            t = torus(f"ArchLip_{x}_{s}", (x, s * 0.895, 0.355), 0.445, 0.014, M["trim"])
            clip_below(t, 0.14)
    # rocker sills
    for s in (1, -1):
        box("Sill" + ("L" if s > 0 else "R"), (0.02, s * 0.86, 0.185),
            (1.85, 0.05, 0.07), M["trim"])
    # mirrors
    for s in (1, -1):
        tag = "L" if s > 0 else "R"
        beam("MirrorStalk" + tag, (1.06, s * 0.85, 0.79), (1.03, s * 0.97, 0.855),
             0.055, 0.022, M["paint"])
        h = box("MirrorHouse" + tag, (1.02, s * 1.00, 0.885), (0.15, 0.12, 0.08),
                M["paint"], bev=0.025)
        smooth(h)
        box("MirrorGlass" + tag, (0.943, s * 1.00, 0.885), (0.006, 0.10, 0.06), M["trim"])
    # flush door handles + recess lines
    for hx in (0.35, -0.55):
        for s in (1, -1):
            box(f"HandleRecess_{hx}_{s}", (hx, s * 0.885, 0.715), (0.19, 0.02, 0.045),
                M["trim"])
            box(f"Handle_{hx}_{s}", (hx, s * 0.893, 0.717), (0.17, 0.024, 0.030),
                M["paint"], bev=0.008)
    # fender vents behind front arches
    for s in (1, -1):
        box("FenderVent" + ("L" if s > 0 else "R"), (0.90, s * 0.895, 0.50),
            (0.035, 0.03, 0.16), M["trim"], rot=(math.radians(-10) * s, math.radians(12), 0))
    # fuel door (right rear fender)
    box("FuelDoorRim", (-1.80, -0.862, 0.63), (0.15, 0.02, 0.15), M["trim"])
    box("FuelDoor", (-1.80, -0.868, 0.63), (0.13, 0.02, 0.13), M["paint"])
    # cowl vent strip at windshield base
    box("CowlVent", (1.38, 0, 0.828), (0.12, 1.42, 0.018), M["trim"],
        rot=(0, math.radians(6), 0))
    # wipers
    beam("WiperBlade1", (1.34, -0.62, 0.887), (1.28, -0.12, 0.92), 0.030, 0.014, M["trim"])
    beam("WiperBlade2", (1.34, -0.02, 0.887), (1.28, 0.48, 0.92), 0.030, 0.014, M["trim"])
    beam("WiperArm1", (1.38, -0.55, 0.864), (1.31, -0.30, 0.905), 0.014, 0.014, M["trim"])
    beam("WiperArm2", (1.38, 0.05, 0.864), (1.31, 0.30, 0.905), 0.014, 0.014, M["trim"])


# ---------------------------------------------------------------- build
def build():
    M = harness.mats()
    # clearer glass: weaker Fresnel so the interior reads through the panes
    gb = M["glass"].node_tree.nodes["Principled BSDF"]
    if "IOR" in gb.inputs:
        gb.inputs["IOR"].default_value = 1.12
    gb.inputs["Roughness"].default_value = 0.02
    build_body(M)
    greenhouse(M)
    interior(M)
    for x in (1.40, -1.40):
        for s in (1, -1):
            wheel(M, x, s)
    front_fascia(M)
    rear_fascia(M)
    details(M)
