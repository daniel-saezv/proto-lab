extends Camera3D

var _objetivo: Node3D
var _distancia := 9.0
var _sacudida := 0.0
const _ALTO := 13.2


func _ready() -> void:
	keep_aspect = KEEP_WIDTH
	fov = 48.0
	near = 0.08
	far = 90.0
	current = true
	_objetivo = get_tree().get_first_node_in_group("jugador") as Node3D
	if _objetivo:
		_encuadrar()
		global_position = _meta()
		look_at(_objetivo.global_position + Vector3(0, 1.15, 0), Vector3.UP)


func _process(delta: float) -> void:
	if _objetivo == null or not is_instance_valid(_objetivo):
		_objetivo = get_tree().get_first_node_in_group("jugador") as Node3D
	if _objetivo == null:
		return
	_encuadrar()
	_sacudida = maxf(_sacudida - delta * 1.4, 0.0)
	global_position = global_position.lerp(_meta(), 1.0 - exp(-5.2 * delta))
	var mira := _objetivo.global_position + Vector3(0, 1.15, 0)
	if _sacudida > 0.0:
		mira.x += sin(_sacudida * 40.0) * _sacudida * 0.35
	look_at(mira, Vector3.UP)


func sacudir(fuerza: float) -> void:
	_sacudida = maxf(_sacudida, fuerza)


func _meta() -> Vector3:
	return _objetivo.global_position + Vector3(0, 2.05, _distancia)


func _encuadrar() -> void:
	var rect := get_viewport().get_visible_rect().size
	var relacion := rect.x / maxf(rect.y, 1.0)
	var fov_h := deg_to_rad(fov)
	var fov_v := 2.0 * atan(tan(fov_h * 0.5) / maxf(relacion, 0.25))
	var distancia := (_ALTO * 0.5) / tan(maxf(fov_v * 0.5, 0.2))
	_distancia = clampf(distancia, 8.0, 22.0)
