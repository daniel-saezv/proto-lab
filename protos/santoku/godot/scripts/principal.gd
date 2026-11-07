extends Node3D

var jugador: Jugador
var camara: Camera3D
var sol: DirectionalLight3D
var ambiente: WorldEnvironment
var calidad: Node


func _ready() -> void:
	Arte.preparar($Mundo)
	jugador = $Jugador as Jugador
	camara = $Camara as Camera3D
	sol = $Sol as DirectionalLight3D
	ambiente = $Ambiente as WorldEnvironment
	calidad = $Calidad
	_entorno()
	_luz()
	var vp := get_viewport()
	if DisplayServer.get_name() != "headless":
		vp.msaa_3d = Viewport.MSAA_2X
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
		vp.scaling_3d_scale = 1.0
	Nivel.construir($Mundo)
	if camara.has_method("seguir"):
		camara.seguir(jugador)
	calidad.set("luz", sol)
	calidad.set("entorno", ambiente.environment)
	print("SANTOKU_BOOT")
	Guardado.cargar(_tras_carga)


func _tras_carga() -> void:
	if is_instance_valid(jugador) and not Estado.tocado:
		jugador.colocar(Estado.punto())
	if camara.has_method("encuadrar"):
		camara.encuadrar()
	_avisar_lienzo()
	if _quiere_sim():
		var sim := Simulacion.new()
		add_child(sim)


func _process(_delta: float) -> void:
	if jugador == null:
		return
	var mapa := "Patio del Bambú" if jugador.global_position.x < Datos.MAPA2_X else "Santuario de Hierro"
	if mapa != Estado.mapa_nombre:
		Estado.mapa_nombre = mapa
		Estado.decir(mapa)
		Estado.cambio.emit()


func _input(evento: InputEvent) -> void:
	var despertar := false
	if evento is InputEventScreenTouch and (evento as InputEventScreenTouch).pressed:
		despertar = true
	elif evento is InputEventMouseButton and evento.pressed:
		despertar = true
	elif evento is InputEventKey and evento.pressed and not evento.echo:
		despertar = true
	if despertar:
		AudioJuego.despertar()


func _quiere_sim() -> bool:
	return OS.get_cmdline_user_args().has("sim")


func _entorno() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var cielo := Sky.new()
	var materia := ProceduralSkyMaterial.new()
	materia.sky_top_color = Color("10162e")
	materia.sky_horizon_color = Color("e07a48")
	materia.ground_bottom_color = Color("120e0c")
	materia.ground_horizon_color = Color("3a241c")
	materia.sun_angle_max = 28.0
	cielo.sky_material = materia
	env.sky = cielo
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.62
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.08
	env.adjustment_saturation = 1.14
	env.fog_enabled = true
	env.fog_light_color = Color("2a2040")
	env.fog_density = 0.012
	env.fog_aerial_perspective = 0.25
	if DisplayServer.get_name() != "headless":
		env.glow_enabled = true
		env.glow_intensity = 0.35
		env.glow_strength = 0.75
		env.glow_bloom = 0.08
		env.glow_hdr_threshold = 0.85
		env.ssao_enabled = true
		env.ssao_radius = 1.1
		env.ssao_intensity = 0.7
	ambiente.environment = env


func _luz() -> void:
	sol.rotation_degrees = Vector3(-42, -36, 0)
	sol.light_color = Color("ffe2c4")
	sol.light_energy = 1.3
	sol.shadow_enabled = true
	sol.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sol.directional_shadow_max_distance = 26.0
	sol.directional_shadow_fade_start = 0.85
	sol.shadow_bias = 0.05


func _avisar_lienzo() -> void:
	if not Engine.has_singleton("JavaScriptBridge"):
		return
	var js: Object = Engine.get_singleton("JavaScriptBridge")
	var ventana: Object = js.call("get_interface", "window")
	if ventana == null:
		return
	ventana.set("__protoLabMotionReady", true)
