extends Node

var _mal := 0.0
var _escalon := 0
var _luz: DirectionalLight3D
var _entorno: Environment


func _ready() -> void:
	var vp := get_viewport()
	vp.msaa_3d = Viewport.MSAA_2X
	vp.scaling_3d_scale = 1.0
	_luz = get_tree().get_first_node_in_group("luna") as DirectionalLight3D
	var mundo := get_tree().get_first_node_in_group("entorno")
	if mundo is WorldEnvironment and (mundo as WorldEnvironment).environment:
		_entorno = (mundo as WorldEnvironment).environment


func _process(delta: float) -> void:
	var fps := Engine.get_frames_per_second()
	if fps <= 0:
		return
	if fps < 50:
		_mal += delta
	else:
		_mal = maxf(_mal - delta * 0.35, 0.0)
	if _mal > 2.6 and _escalon < 4:
		_mal = 0.0
		_escalon += 1
		_bajar()


func _bajar() -> void:
	var vp := get_viewport()
	# Un nivel de calidad para todos. Si el fotograma no llega, se abarata
	# el mismo arte: resolución 3D, brillo, partículas y al final la sombra.
	match _escalon:
		1:
			vp.scaling_3d_scale = 0.8
		2:
			if _entorno:
				_entorno.glow_enabled = false
			if _luz:
				_luz.shadow_blur = 0.0
		3:
			vp.scaling_3d_scale = 0.62
			Efectos.reducir()
		4:
			if _luz:
				_luz.shadow_enabled = false
			vp.msaa_3d = Viewport.MSAA_DISABLED
