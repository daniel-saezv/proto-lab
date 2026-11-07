extends StaticBody3D

var _roto := false
var _malla: MeshInstance3D


func _ready() -> void:
	collision_layer = Reglas.CAPA_SELLO
	collision_mask = 0
	add_to_group("sello")
	var forma := CollisionShape3D.new()
	var caja := BoxShape3D.new()
	caja.size = Vector3(0.42, 18.0, 2.8)
	forma.shape = caja
	add_child(forma)
	_malla = MeshInstance3D.new()
	var bloque := BoxMesh.new()
	bloque.size = Vector3(0.42, 18.0, 2.6)
	_malla.mesh = bloque
	_malla.material_override = Taller.sello
	_malla.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_malla)
	if Partida.sello_roto:
		romper(true)


func romper(silencio: bool = false) -> void:
	if _roto:
		return
	_roto = true
	collision_layer = 0
	if _malla:
		var anim := create_tween()
		anim.tween_property(_malla, "scale", Vector3(0.04, 1, 1), 0.28)
		anim.tween_callback(_malla.hide)
	if silencio:
		return
	Partida.sello_roto = true
	Partida.guardar()
	Sonido.suena("kata")
	Efectos.chispa(global_position + Vector3(0, 1.2, 0))
	Partida.anuncio.emit("El sello cede. El piso de arriba queda abierto.")
