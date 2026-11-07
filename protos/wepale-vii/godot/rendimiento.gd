extends RefCounted

## Límites y ayudas de dibujado para la web en Compatibility (móvil).

const Visuales := preload("res://visuales.gd")


static func aplicar_en_web(rama: SceneTree) -> void:
	if not OS.has_feature("web"):
		return
	Engine.physics_ticks_per_second = 30
	RenderingServer.set_default_clear_color(Color(0.07, 0.04, 0.08, 1))


static func _primera_malla(raiz: Node) -> Mesh:
	if raiz is MeshInstance3D:
		return (raiz as MeshInstance3D).mesh
	for hijo in raiz.get_children():
		var hallada := _primera_malla(hijo)
		if hallada != null:
			return hallada
	return null


static var _mallas: Dictionary = {}


static func malla_de(escena: PackedScene) -> Mesh:
	var llave := str(escena.resource_path)
	if _mallas.has(llave):
		return _mallas[llave]
	var prueba: Node3D = escena.instantiate()
	var malla := _primera_malla(prueba)
	prueba.free()
	if malla != null:
		_mallas[llave] = malla
	return malla


## Cada entrada: { "pos": Vector3, "rot": float, "escala": float }
static func multimesh(
	padre: Node3D,
	escena: PackedScene,
	lugares: Array,
	defecto_escala: float,
) -> MultiMeshInstance3D:
	var malla := malla_de(escena)
	if malla == null or lugares.is_empty():
		for dato in lugares:
			var escala: float = float(dato.get("escala", defecto_escala))
			var rot: float = float(dato.get("rot", 0.0))
			Visuales.prop(padre, escena, dato["pos"], escala, rot)
		return null
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = malla
	mm.instance_count = lugares.size()
	for i in lugares.size():
		var dato: Dictionary = lugares[i]
		var escala: float = float(dato.get("escala", defecto_escala))
		var rot: float = float(dato.get("rot", 0.0))
		var tr := Transform3D.IDENTITY
		tr = tr.scaled(Vector3.ONE * escala)
		tr = tr.rotated(Vector3.UP, rot)
		tr.origin = dato["pos"]
		mm.set_instance_transform(i, tr)
	var nodo := MultiMeshInstance3D.new()
	nodo.multimesh = mm
	nodo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	nodo.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	padre.add_child(nodo)
	return nodo
