extends Node

var luz: DirectionalLight3D
var entorno: Environment
var paso := 0
var malo := 0.0


func _process(delta: float) -> void:
	if DisplayServer.get_name() == "headless":
		return
	var fps := Engine.get_frames_per_second()
	if fps > 0 and fps < 50:
		malo += delta
	else:
		malo = maxf(0.0, malo - delta)
	if malo > 2.6 and paso < 5:
		_bajar()
		malo = 0.0


func _bajar() -> void:
	paso += 1
	var vp := get_viewport()
	match paso:
		1:
			if entorno:
				entorno.ssao_enabled = false
		2:
			vp.msaa_3d = Viewport.MSAA_DISABLED
		3:
			if luz:
				luz.directional_shadow_max_distance = 14.0
				luz.shadow_blur = 0.0
		4:
			vp.scaling_3d_scale = 0.75
		5:
			if entorno:
				entorno.glow_enabled = false
			vp.scaling_3d_scale = 0.55
