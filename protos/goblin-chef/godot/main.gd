extends Node3D

const PUEBLO := preload("res://pueblo.tscn")
const EXPEDICION := preload("res://expedicion.tscn")

var salida_num := 1
var en_caza := false
var muerto := false
var saliendo := false
var nispero := false
var vida_max := 14
var vida := 14
var dano := 2
var armadura := 0
var velocidad := 4.3
var cadencia := 0.48
var iframes := 0.0
var inventario := Recetas.vacio()
var cesto := Recetas.vacio()
var mejoras := {}
var nivel: Node
var hud: CanvasLayer
var jugador: CharacterBody3D
var audio: Node

@onready var _mundo: Node3D = $Mundo
@onready var _camara: Camera3D = $Camara
@onready var _entorno: WorldEnvironment = $Entorno

var _cielo: ProceduralSkyMaterial
var _dado := RandomNumberGenerator.new()


func _ready() -> void:
	hud = $HUD
	jugador = $Jugador
	jugador.juego = self
	audio = AudioCocina.new()
	audio.name = "Audio"
	add_child(audio)
	_preparar_luz()
	hud.golpe.connect(_al_golpe)
	hud.usar.connect(_al_usar)
	hud.cocinar.connect(_al_cocinar)
	hud.contratar.connect(_al_contratar)
	hud.volver.connect(_al_volver)
	hud.cerrar_panel.connect(cerrar_panel)
	_dado.randomize()
	entrar_pueblo()
	_seguir(1.0, true)


func _process(delta: float) -> void:
	if iframes > 0.0:
		iframes -= delta
	_seguir(delta, false)
	hud.refrescar(self)


func _input(event: InputEvent) -> void:
	var gesto := false
	if event is InputEventScreenTouch and event.pressed:
		gesto = true
	elif event is InputEventMouseButton and event.pressed:
		gesto = true
	elif event is InputEventKey and event.pressed and not event.echo:
		gesto = true
	if gesto:
		audio.saludo()


func _unhandled_input(event: InputEvent) -> void:
	if hud.panel_abierto():
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_SPACE or event.keycode == KEY_J:
			_al_golpe()
		elif event.keycode == KEY_E:
			_al_usar()
	elif event is InputEventScreenTouch and event.pressed and not hud.ocupa(event.position):
		_marcar_destino(event.position)


func entrar_pueblo() -> void:
	en_caza = false
	_cambiar(PUEBLO)
	nivel.montar(self)
	jugador.global_position = Vector3(0, 0.55, 1.6)
	jugador.velocity = Vector3.ZERO
	jugador.tiene_destino = false
	jugador.congelado = false
	_camara.size = 11.0
	_teñir(0)


func entrar_caza() -> void:
	en_caza = true
	muerto = false
	saliendo = false
	cesto = Recetas.vacio()
	vida = vida_max
	var datos := Mapa.generar(salida_num, _dado.randi())
	_cambiar(EXPEDICION)
	nivel.montar(self, datos)
	var spawn: Vector3 = Mapa.mundo(datos["inicio"], int(datos["n"]))
	jugador.global_position = spawn + Vector3(0, 0.55, 0)
	jugador.velocity = Vector3.ZERO
	jugador.tiene_destino = false
	jugador.congelado = false
	_camara.size = 9.0
	_teñir(salida_num)
	hud.cartel("Salida %d. Recoge, golpea y toca el pilar para volver." % salida_num)


func estacion_cercana() -> String:
	if en_caza:
		return ""
	var mejor := ""
	var dist := 1.85
	for marca in get_tree().get_nodes_in_group("estacion"):
		var a := Vector2(marca.global_position.x, marca.global_position.z)
		var b := Vector2(jugador.global_position.x, jugador.global_position.z)
		var d := a.distance_to(b)
		if d < dist:
			dist = d
			mejor = str(marca.get_meta("tipo"))
	return mejor


func recibir_dano(cantidad: int) -> void:
	if muerto or saliendo or iframes > 0.0 or not en_caza:
		return
	vida -= maxi(1, cantidad - armadura)
	iframes = 0.7
	jugador.flash()
	audio.dano()
	if vida <= 0:
		vida = 0
		muerto = true
		jugador.congelado = true
		cesto = Recetas.vacio()
		hud.abrir_fin(false, "Te han dejado seco. El cesto de esta salida se pierde.")


func recoger(tipo: String) -> void:
	var bolsa: Dictionary = cesto if en_caza else inventario
	bolsa[tipo] = int(bolsa.get(tipo, 0)) + 1
	audio.recoger()


func soltar_botin(tipo: String, pos: Vector3) -> void:
	if nivel == null or not nivel.has_method("_soltar"):
		return
	var n := 0
	for id in Recetas.botin(tipo):
		nivel._soltar(str(id), pos + Vector3(0.32 * n, 0.15, 0.1 * n))
		n += 1


func llegar_a_casa() -> void:
	if saliendo or muerto:
		return
	saliendo = true
	jugador.congelado = true
	hud.abrir_fin(true, "El cesto vuelve al pueblo. La próxima salida será más dura.")


func cerrar_panel() -> void:
	if muerto or saliendo:
		return
	jugador.congelado = false


func aplicar_efecto(stat: String, valor: float, veces: int) -> void:
	var cantidad := valor * float(veces)
	match stat:
		"dano":
			dano += roundi(cantidad)
		"vida":
			var suma := roundi(cantidad)
			vida_max += suma
			vida += suma
		"armadura":
			armadura += roundi(cantidad)
		"velocidad":
			velocidad = minf(7.4, velocidad + cantidad)
		"cadencia":
			cadencia = maxf(0.28, cadencia + cantidad)


func _al_golpe() -> void:
	if not en_caza or hud.panel_abierto() or not jugador.puede_golpear():
		return
	jugador.animar_golpe()
	audio.golpe()
	for enemigo in get_tree().get_nodes_in_group("enemigo"):
		if jugador.en_arco(enemigo):
			enemigo.recibir(dano)


func _al_usar() -> void:
	if en_caza or hud.panel_abierto():
		return
	match estacion_cercana():
		"cocina":
			jugador.congelado = true
			hud.abrir_cocina(self)
		"pinche":
			jugador.congelado = true
			hud.abrir_pinche(self)
		"caza":
			entrar_caza()


func _al_cocinar(a: String, b: String) -> void:
	if a == "" or b == "":
		hud.nota("Elige dos ingredientes.")
		return
	var resultado := Recetas.intentar(inventario, mejoras, a, b, nispero)
	if not bool(resultado["ok"]):
		hud.nota("No tienes bastante." if str(resultado["motivo"]) == "falta" else "Esa pareja no da plato.")
		return
	var plato: Dictionary = resultado["plato"]
	aplicar_efecto(str(plato["stat"]), float(plato["valor"]), int(resultado["veces"]))
	var texto := "Plato: %s." % str(plato["nombre"])
	if int(resultado["veces"]) > 1:
		texto += " Níspero lo duplica."
	for extra in resultado["sinergias"]:
		aplicar_efecto(str(extra["stat"]), float(extra["valor"]), 1)
		texto += " Combinación: %s." % str(extra["nombre"])
	audio.cocinar()
	hud.nota(texto)
	hud.abrir_cocina(self)
	hud.nota(texto)


func _al_contratar() -> void:
	if nispero:
		hud.nota("Níspero ya está en el caldero.")
		return
	if int(inventario.get("hueso", 0)) < 2:
		hud.nota("Hacen falta 2 huesos. Los sueltan las criaturas.")
		hud.abrir_pinche(self)
		hud.nota("Hacen falta 2 huesos. Los sueltan las criaturas.")
		return
	inventario["hueso"] = int(inventario["hueso"]) - 2
	nispero = true
	audio.contratar()
	hud.abrir_pinche(self)
	hud.nota("Níspero se ata el delantal. Cada plato cuenta dos veces.")


func _al_volver() -> void:
	if saliendo and not muerto:
		for id in Recetas.ORDEN:
			inventario[id] = int(inventario.get(id, 0)) + int(cesto.get(id, 0))
		salida_num += 1
	cesto = Recetas.vacio()
	muerto = false
	saliendo = false
	vida = vida_max
	hud.cerrar()
	entrar_pueblo()


func _cambiar(escena: PackedScene) -> void:
	if nivel != null:
		_mundo.remove_child(nivel)
		nivel.free()
		nivel = null
	nivel = escena.instantiate()
	_mundo.add_child(nivel)


func _marcar_destino(pantalla: Vector2) -> void:
	var origen := _camara.project_ray_origin(pantalla)
	var dir := _camara.project_ray_normal(pantalla)
	var golpe = Plane(Vector3.UP, 0.0).intersects_ray(origen, dir)
	if golpe == null:
		return
	jugador.destino = golpe
	jugador.tiene_destino = true


func _seguir(delta: float, instantaneo: bool) -> void:
	var ancla := jugador.global_position + Vector3(0, 0.7, 0)
	var deseada := ancla + Vector3(9.0, 7.2, 9.0)
	if instantaneo:
		_camara.global_position = deseada
	else:
		var t := 1.0 - exp(-6.0 * delta)
		_camara.global_position = _camara.global_position.lerp(deseada, t)
	_camara.look_at(ancla, Vector3.UP)


func _preparar_luz() -> void:
	var ambiente := Environment.new()
	var sky := Sky.new()
	_cielo = ProceduralSkyMaterial.new()
	sky.sky_material = _cielo
	ambiente.background_mode = Environment.BG_SKY
	ambiente.sky = sky
	ambiente.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	ambiente.ambient_light_color = Color("cbb89a")
	ambiente.ambient_light_energy = 0.9
	_entorno.environment = ambiente
	var luz := $Luz as DirectionalLight3D
	luz.rotation_degrees = Vector3(-50, 32, 0)
	luz.light_color = Color("fff1d6")
	luz.light_energy = 1.05
	# Sin sombra proyectada: el claro se lee con la direccional y el ambiente,
	# y en el móvil el relleno pesa más que el mapa de sombras.
	luz.shadow_enabled = false
	_camara.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camara.keep_aspect = Camera3D.KEEP_WIDTH
	_camara.current = true
	_teñir(0)


func _teñir(profundidad: int) -> void:
	if profundidad <= 0:
		_cielo.sky_top_color = Color("5c8ec4")
		_cielo.sky_horizon_color = Color("f0b87a")
		_cielo.ground_horizon_color = Color("8a9a62")
		_cielo.ground_bottom_color = Color("3e5a32")
	elif profundidad == 2:
		_cielo.sky_top_color = Color("3c4e86")
		_cielo.sky_horizon_color = Color("d48a6a")
	elif profundidad >= 3:
		_cielo.sky_top_color = Color("2c3340")
		_cielo.sky_horizon_color = Color("a87868")
		_cielo.ground_bottom_color = Color("3a332e")
	else:
		_cielo.sky_top_color = Color("4f86b8")
		_cielo.sky_horizon_color = Color("e7c48a")
		_cielo.ground_bottom_color = Color("3e5a32")
