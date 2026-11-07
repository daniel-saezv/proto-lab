extends Camera3D

var objetivo: Node3D
var _sacudida := 0.0


func _ready() -> void:
	add_to_group("camara")
	keep_aspect = KEEP_WIDTH
	fov = 48.0
	near = 0.06
	far = 55.0
	current = true


func seguir(nodo: Node3D) -> void:
	objetivo = nodo
	encuadrar()


func encuadrar() -> void:
	if objetivo == null:
		return
	var mira := _mira()
	global_position = mira + Vector3(0, 0.55, 5.6)
	look_at(mira, Vector3.UP)


func sacudir(fuerza: float) -> void:
	_sacudida = maxf(_sacudida, fuerza)


func _process(delta: float) -> void:
	if objetivo == null:
		return
	var mira := _mira()
	var destino := mira + Vector3(0, 0.55, 5.6)
	global_position = global_position.lerp(destino, 1.0 - exp(-6.5 * delta))
	if _sacudida > 0.0:
		global_position += Vector3(randf_range(-1, 1), randf_range(-1, 1), 0) * _sacudida * 0.08
		_sacudida = move_toward(_sacudida, 0.0, delta * 3.5)
	look_at(mira, Vector3.UP)


func _mira() -> Vector3:
	var avance := 0.0
	if objetivo is Jugador:
		avance = float((objetivo as Jugador).mirando) * 0.85
	return objetivo.global_position + Vector3(avance, 1.25, 0)
