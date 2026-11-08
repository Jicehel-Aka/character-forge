"""Rendu « turntable » d'un modèle 3D sous N angles, fond transparent, caméra orthographique.

Lancement (via `python -m forge turntable`) :
    blender -b --python render_turntable.py -- MESH OUTDIR N SIZE

Formats : .glb/.gltf, .obj, .fbx, .vrm (.vrm demande l'add-on VRM pour Blender).
NON TESTÉ dans cet environnement (pas de Blender) : à valider sur ta machine."""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
mesh_path, out_dir, n_angles, size = argv[0], argv[1], int(argv[2]), int(argv[3])
frame_step = int(argv[4]) if len(argv) > 4 else 0   # >0 : rend aussi l'animation (1 image sur N)
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

ext = os.path.splitext(mesh_path)[1].lower()
if ext in (".glb", ".gltf"):
    bpy.ops.import_scene.gltf(filepath=mesh_path)
elif ext == ".obj":
    if hasattr(bpy.ops.wm, "obj_import"):
        bpy.ops.wm.obj_import(filepath=mesh_path)
    else:
        bpy.ops.import_scene.obj(filepath=mesh_path)
elif ext == ".fbx":
    bpy.ops.import_scene.fbx(filepath=mesh_path)
elif ext == ".vrm":
    bpy.ops.import_scene.vrm(filepath=mesh_path)
else:
    raise SystemExit(f"format non géré : {ext}")

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("aucun mesh importé")

# CharacterGen exporte des COULEURS PAR SOMMET (matériau blanc) : on les branche en émission
# pour obtenir des couleurs fidèles et un rendu plat, stable d'un angle à l'autre.
for o in meshes:
    attrs = getattr(o.data, "color_attributes", None)
    if attrs and len(attrs):
        mat = bpy.data.materials.new("vertex_color_flat")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = attrs[0].name
        emit = nt.nodes.new("ShaderNodeEmission")
        out_node = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(vc.outputs["Color"], emit.inputs["Color"])
        nt.links.new(emit.outputs["Emission"], out_node.inputs["Surface"])
        o.data.materials.clear()
        o.data.materials.append(mat)

# Boîte englobante monde
corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
mn = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
mx = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
center = (mn + mx) / 2
dims = mx - mn

# Pivot au centre : on le fait tourner, la caméra reste fixe
pivot = bpy.data.objects.new("pivot", None)
bpy.context.scene.collection.objects.link(pivot)
pivot.location = center
for o in bpy.context.scene.objects:
    if o is not pivot and o.parent is None:
        o.parent = pivot
        o.matrix_parent_inverse = pivot.matrix_world.inverted()

# Caméra orthographique de face (le devant du modèle regarde -Y dans Blender)
cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = max(dims.x, dims.y, dims.z) * 1.15
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.scene.collection.objects.link(cam)
cam.location = (center.x, center.y - max(dims) * 3, center.z)
cam.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.camera = cam

# Lumières + ambiance
sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 3.0
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
bpy.context.scene.collection.objects.link(sun)
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
bpy.context.scene.world = world

scene = bpy.context.scene
for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        continue
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = size
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

animated = frame_step > 0 and scene.frame_end > scene.frame_start
for i in range(n_angles):
    pivot.rotation_euler.z = math.radians(360.0 * i / n_angles)
    if not animated:
        scene.render.filepath = os.path.join(out_dir, f"frame_{i:02d}.png")
        bpy.ops.render.render(write_still=True)
    else:
        # un sous-dossier par angle : angle_00/anim_000.png ... (une spritesheet par angle)
        sub = os.path.join(out_dir, f"angle_{i:02d}")
        os.makedirs(sub, exist_ok=True)
        for k, f in enumerate(range(scene.frame_start, scene.frame_end + 1, frame_step)):
            scene.frame_set(f)
            scene.render.filepath = os.path.join(sub, f"anim_{k:03d}.png")
            bpy.ops.render.render(write_still=True)
print(f"rendu terminé ({'animation' if animated else 'statique'}) : {n_angles} angles dans {out_dir}")
