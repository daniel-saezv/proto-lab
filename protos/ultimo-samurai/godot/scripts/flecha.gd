extends Area3D

var _viva := false
var _dir := 1.0
var _queda := 0.0


func _ready() -> void:
	collision_layer = 0
	collision_mask = 0
	monitoring = false
	monitorable = false
	add_to_group("reiniciable")
	var malla := MeshInstance3D.new()
	var caja := BoxMesh.new()
	caja.size = Vector3(0.55, 0.06, 0.06)
	malla.mesh = caja
	malla.material_override = Taller.oro
	malla.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(malla)
	visible = false
	global_position = Vector3(0, -40, 0)


func libre() -> bool:
	return not _viva


func activar(origen: Vector3, direccion: float) -> void:
	_viva = true
	_dir = direccion
	_queda = 1.35
	global_position = origen
	visible = true


func _physics_process(delta: float) -> void:
	if not _viva or Partida.pausa:
		return
	global_position.x += _dir * 7.4 * delta
	global_position.y -= 1.4 * delta
	_queda -= delta
	var jugador := get_tree().get_first_node_in_group("jugador") as Node3D
	if jugador and jugador.global_position.distance_to(global_position + Vector3(0, -0.4, 0)) < 0.48:
		if jugador.has_method("recibir"):
			jugador.recibir(1, global_position, false)
		_apagar()
		return
	if _queda <= 0.0:
		_apagar()


func _apagar() -> void:
	_viva = false
	visible = false
	global_position = Vector3(0, -40, 0)


func reiniciar() -> void:
	_apagar()
