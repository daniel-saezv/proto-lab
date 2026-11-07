extends Node3D


func _ready() -> void:
	_entorno()
	_luz()


func _entorno() -> void:
	var entorno := Environment.new()
	entorno.background_mode = Environment.BG_SKY
	var cielo := Sky.new()
	var materia := ProceduralSkyMaterial.new()
	materia.sky_top_color = Color("1a1033")
	materia.sky_horizon_color = Color("e07a48")
	materia.sky_curve = 0.14
	materia.ground_bottom_color = Color("140e0c")
	materia.ground_horizon_color = Color("a85a38")
	materia.ground_curve = 0.08
	materia.sun_angle_max = 26.0
	materia.sun_curve = 0.1
	cielo.sky_material = materia
	entorno.sky = cielo
	entorno.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	entorno.ambient_light_energy = 0.72
	entorno.tonemap_mode = Environment.TONE_MAPPER_AGX
	entorno.tonemap_exposure = 1.08
	entorno.tonemap_white = 6.0
	entorno.adjustment_enabled = true
	entorno.adjustment_brightness = 1.03
	entorno.adjustment_contrast = 1.08
	entorno.adjustment_saturation = 1.16
	entorno.glow_enabled = true
	entorno.glow_intensity = 0.42
	entorno.glow_strength = 0.72
	entorno.glow_bloom = 0.14
	entorno.glow_hdr_threshold = 0.9
	entorno.fog_enabled = true
	entorno.fog_mode = Environment.FOG_MODE_DEPTH
	entorno.fog_light_color = Color("3a2438")
	entorno.fog_density = 0.018
	entorno.fog_depth_begin = 14.0
	entorno.fog_depth_end = 48.0
	entorno.fog_aerial_perspective = 0.4
	entorno.fog_sky_affect = 0.45
	var nodo := get_node_or_null("Entorno") as WorldEnvironment
	if nodo:
		nodo.environment = entorno


func _luz() -> void:
	var luz := get_node_or_null("Luna") as DirectionalLight3D
	if luz == null:
		return
	luz.rotation_degrees = Vector3(-40, 32, 0)
	luz.light_color = Color("ffd0a6")
	luz.light_energy = 1.55
	luz.shadow_enabled = true
	luz.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	luz.directional_shadow_max_distance = 34.0
	luz.directional_shadow_blend_splits = true
	luz.shadow_bias = 0.04
	luz.shadow_normal_bias = 0.55
	luz.directional_shadow_fade_start = 0.8
