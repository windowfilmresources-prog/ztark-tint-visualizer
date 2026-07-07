"""Pipeline smoke test: a box on wheels with one 'window'."""
import bpy
import harness


def build():
    m = harness.mats()
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0.6))
    body = bpy.context.active_object
    body.name = "BodyShell"
    body.scale = (2.2, 0.9, 0.4)
    body.data.materials.append(m["paint"])

    bpy.ops.mesh.primitive_cube_add(location=(0.3, 0, 1.2))
    glass = bpy.context.active_object
    glass.name = "WindowFrontL"
    glass.scale = (0.8, 0.85, 0.25)
    glass.data.materials.append(m["glass"])

    for x in (1.4, -1.4):
        for y in (0.92, -0.92):
            bpy.ops.mesh.primitive_torus_add(location=(x, y, 0.36), rotation=(1.5708, 0, 0),
                                             major_radius=0.28, minor_radius=0.09)
            w = bpy.context.active_object
            w.name = f"Wheel_{x}_{y}"
            w.data.materials.append(m["tire"])
