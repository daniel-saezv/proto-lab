class_name Arte
extends RefCounted

static var listo := false
static var madera: StandardMaterial3D
static var madera_osc: StandardMaterial3D
static var musgo: StandardMaterial3D
static var piedra: StandardMaterial3D
static var hierro: StandardMaterial3D
static var hierro_osc: StandardMaterial3D
static var papel: StandardMaterial3D
static var cinabrio: StandardMaterial3D
static var oro: StandardMaterial3D
static var acero: StandardMaterial3D
static var piel: StandardMaterial3D
static var tela: StandardMaterial3D
static var hakama: StandardMaterial3D
static var oni: StandardMaterial3D
static var cuervo: StandardMaterial3D
static var hoja: StandardMaterial3D
static var farol: StandardMaterial3D
static var noche: StandardMaterial3D
static var ancla: Node3D
static var _chispas: Array[MeshInstance3D] = []
static var _libre: Array[int] = []


static func preparar(padre: Node3D = null) -> void:
	if not listo:
		_materiales()
		listo = true
	if padre == null or not _chispas.is_empty():
		return
	ancla = padre
	for i in 8:
		var m := caja(Vector3(0.12, 0.12, 0.12), oro)
		m.visible = false
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		padre.add_child(m)
		_chispas.append(m)
		_libre.append(i)


static func _materiales() -> void:
	madera = _mat(Color("8a5a3a"), 0.82, 0.0)
	madera_osc = _mat(Color("4e2e22"), 0.9, 0.0)
	musgo = _mat(Color("2f6a45"), 0.78, 0.0)
	piedra = _mat(Color("6d645c"), 0.9, 0.05)
	hierro = _mat(Color("8e98a6"), 0.42, 0.55)
	hierro_osc = _mat(Color("3c4450"), 0.55, 0.35)
	papel = _mat(Color("f3e6cf"), 0.7, 0.0)
	cinabrio = _mat(Color("c4372c"), 0.62, 0.08)
	oro = _mat(Color("e2b15a"), 0.48, 0.35, Color("ffb15a"), 0.4)
	acero = _mat(Color("d5dde6"), 0.28, 0.72)
	piel = _mat(Color("e0b394"), 0.7, 0.0)
	tela = _mat(Color("ece6dc"), 0.8, 0.0)
	hakama = _mat(Color("1c1a22"), 0.84, 0.0)
	oni = _mat(Color("6e8f45"), 0.7, 0.05)
	cuervo = _mat(Color("221820"), 0.65, 0.1)
	hoja = _mat(Color("f7fbff"), 0.22, 0.85, Color("d7ecff"), 0.85)
	farol = _mat(Color("ffb15a"), 0.4, 0.0, Color("ff9a3c"), 1.6)
	noche = _mat(Color("140e18"), 1.0, 0.0)


static func _mat(albedo: Color, rugosidad: float, metal: float, emision: Color = Color(0, 0, 0), energia: float = 0.0) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = albedo
	mat.roughness = rugosidad
	mat.metallic = metal
	mat.rim_enabled = true
	mat.rim = 0.28
	mat.rim_tint = 0.45
	if energia > 0.0:
		mat.emission_enabled = true
		mat.emission = emision
		mat.emission_energy_multiplier = energia
	return mat


static func caja(tam: Vector3, mat: Material, sombra: bool = true) -> MeshInstance3D:
	var nodo := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = tam
	nodo.mesh = mesh
	nodo.material_override = mat
	nodo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if sombra else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return nodo


static func esfera(radio: float, mat: Material) -> MeshInstance3D:
	var nodo := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = radio
	mesh.height = radio * 2.0
	mesh.radial_segments = 12
	mesh.rings = 6
	nodo.mesh = mesh
	nodo.material_override = mat
	return nodo


static func cilindro(radio: float, alto: float, mat: Material, segmentos: int = 8) -> MeshInstance3D:
	var nodo := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = radio
	mesh.bottom_radius = radio
	mesh.height = alto
	mesh.radial_segments = segmentos
	nodo.mesh = mesh
	nodo.material_override = mat
	return nodo


static func cono(radio: float, alto: float, mat: Material) -> MeshInstance3D:
	var nodo := cilindro(radio, alto, mat, 7)
	var mesh := nodo.mesh as CylinderMesh
	mesh.top_radius = 0.01
	return nodo


static func chispa(origen: Vector3, color: Color) -> void:
	if DisplayServer.get_name() == "headless" or _libre.is_empty() or ancla == null:
		return
	var idx: int = _libre.pop_back()
	var nodo := _chispas[idx]
	nodo.visible = true
	nodo.global_position = origen
	var mat := nodo.material_override as StandardMaterial3D
	if mat:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = 2.0
	var dir := Vector3(randf_range(-1, 1), randf_range(0.4, 1.4), randf_range(-0.4, 0.4))
	var tw := ancla.create_tween()
	tw.tween_property(nodo, "global_position", origen + dir, 0.22)
	tw.tween_callback(func() -> void:
		nodo.visible = false
		_libre.append(idx)
	)


static func copia(base: StandardMaterial3D) -> StandardMaterial3D:
	return base.duplicate() as StandardMaterial3D
