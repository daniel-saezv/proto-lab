extends Node3D

## Corte jugable: elegir oficio, moverse con el pulgar y aguantar tres rondas.
## Fuera: mundo abierto, botín, pueblos enteros y más mapas.

const Oficios := preload("res://oficios.gd")
const EscenaJugador := preload("res://jugador.tscn")
const EscenaRival := preload("res://rival.tscn")
const MenuScript := preload("res://menu.gd")
const HudScript := preload("res://hud.gd")
const SonidoScript := preload("res://sonido.gd")
const PlazaScript := preload("res://plaza.gd")

const RONDAS := [
	{"n": 5, "vida": 28, "velocidad": 2.85, "mordisco": 7},
	{"n": 8, "vida": 34, "velocidad": 3.35, "mordisco": 8},
	{"n": 11, "vida": 42, "velocidad": 3.75, "mordisco": 10},
]

static var repetir := ""

var estado := "menu"
var oficio: Dictionary = {}
var jugador
var ronda := 1
var por_salir := 0
var vivas := 0
var espera := 0.0
var pivote: Node3D
var camara: Camera3D
var plaza
var menu
var hud
var sacudida := 0.0
var orbita := 0.4


func _ready() -> void:
	_cielo()
	plaza = PlazaScript.new()
	add_child(plaza)
	plaza.construir()
	plaza.rotulos(false)
	_camara()
	add_child(SonidoScript.new())
	menu = MenuScript.new()
	add_child(menu)
	menu.arrancar.connect(_empezar)
	hud = HudScript.new()
	add_child(hud)
	hud.otra.connect(_otra_ronda)
	hud.cambiar.connect(_cambiar_oficio)
	hud.cerrar()
	if repetir != "":
		var id := repetir
		repetir = ""
		_empezar(id)


func _process(delta: float) -> void:
	if estado == "menu":
		orbita += delta * 0.32
		pivote.global_position = Vector3(sin(orbita) * 3.6, 0.0, cos(orbita) * 3.6)
		camara.look_at(Vector3(0, 1.05, 0), Vector3.UP)
	elif jugador and is_instance_valid(jugador):
		var meta: Vector3 = jugador.global_position
		pivote.global_position = pivote.global_position.lerp(meta, 1.0 - exp(-7.5 * delta))
		camara.look_at(pivote.global_position + Vector3(0, 0.9, 0), Vector3.UP)
	if sacudida > 0.0:
		sacudida = maxf(0.0, sacudida - delta * 2.6)
		camara.h_offset = randf_range(-1.0, 1.0) * sacudida * 0.12
		camara.v_offset = randf_range(-1.0, 1.0) * sacudida * 0.1
	else:
		camara.h_offset = 0.0
		camara.v_offset = 0.0


func _physics_process(delta: float) -> void:
	if estado != "juego" or jugador == null:
		return
	jugador.orden = hud.direccion(camara)
	if hud:
		hud.seguir(jugador, ronda, vivas + por_salir)
	_oleada(delta)


func _empezar(id: String) -> void:
	oficio = Oficios.nuevo(id)
	if oficio.is_empty():
		return
	estado = "juego"
	menu.cerrar()
	plaza.ocultar_muestras()
	plaza.rotulos(true)
	jugador = EscenaJugador.instantiate()
	jugador.position = Vector3(0, 0, 1.2)
	add_child(jugador)
	jugador.preparar(oficio)
	jugador.muere.connect(_derrota)
	jugador.sacude.connect(_sacudir)
	hud.abrir(oficio)
	ronda = 1
	vivas = 0
	_abrir_ronda()
	pivote.global_position = jugador.global_position
	hud.aviso("Ronda 1")


func _abrir_ronda() -> void:
	var datos: Dictionary = RONDAS[ronda - 1]
	por_salir = int(datos["n"])
	espera = 0.45


func _oleada(delta: float) -> void:
	if por_salir <= 0:
		return
	espera -= delta
	if espera > 0.0:
		return
	_soltar()
	espera = 0.7


func _soltar() -> void:
	var datos: Dictionary = RONDAS[ronda - 1]
	var rival = EscenaRival.instantiate()
	var bando := "tvresn" if por_salir % 2 == 0 else "ajgulzil"
	rival.configurar(int(datos["vida"]), float(datos["velocidad"]), int(datos["mordisco"]), bando)
	var lateral := randf_range(-5.2, 5.2)
	var fondo := randf_range(6.3, 8.6)
	var pos := Vector3(fondo, 0.0, lateral)
	if bando == "tvresn":
		pos.x = -fondo
	var plano := Vector2(pos.x, pos.z)
	if plano.length() > 9.2:
		plano = plano.normalized() * 9.2
		pos = Vector3(plano.x, 0.0, plano.y)
	if jugador and pos.distance_to(jugador.global_position) < 3.2:
		pos = -pos if pos.length() > 0.2 else Vector3(0, 0, 8)
	add_child(rival)
	rival.global_position = pos
	rival.cayo.connect(_al_caer)
	vivas += 1
	por_salir -= 1


func _al_caer() -> void:
	vivas = maxi(0, vivas - 1)
	if estado != "juego":
		return
	if vivas > 0 or por_salir > 0:
		return
	if ronda >= RONDAS.size():
		_victoria()
		return
	ronda += 1
	_abrir_ronda()
	hud.aviso("Ronda %d" % ronda)


func _victoria() -> void:
	if estado != "juego":
		return
	estado = "fin"
	_parar()
	hud.mostrar_fin(true, str(oficio.get("nombre", "")))
	_tocar("victoria")


func _derrota() -> void:
	if estado != "juego":
		return
	estado = "fin"
	_parar()
	hud.mostrar_fin(false, str(oficio.get("nombre", "")))
	_tocar("derrota")


func _parar() -> void:
	hud.jugando = false
	if jugador:
		jugador.orden = Vector3.ZERO
		jugador.set_physics_process(false)
	for grupo in ["foes", "aliados", "tiros"]:
		for nodo in get_tree().get_nodes_in_group(grupo):
			if is_instance_valid(nodo):
				nodo.set_physics_process(false)


func _otra_ronda() -> void:
	repetir = str(oficio.get("id", "jarra"))
	get_tree().reload_current_scene()


func _cambiar_oficio() -> void:
	repetir = ""
	get_tree().reload_current_scene()


func _sacudir(fuerza: float) -> void:
	sacudida = maxf(sacudida, fuerza)


func _tocar(nombre: String) -> void:
	var nodo := get_tree().get_first_node_in_group("sonido")
	if nodo:
		nodo.tocar(nombre)


func _camara() -> void:
	pivote = Node3D.new()
	add_child(pivote)
	camara = Camera3D.new()
	camara.fov = 48.0
	camara.keep_aspect = Camera3D.KEEP_WIDTH
	camara.current = true
	camara.position = Vector3(0, 13.4, 9.6)
	pivote.add_child(camara)


func _cielo() -> void:
	var entorno := Environment.new()
	entorno.background_mode = Environment.BG_SKY
	var cielo := Sky.new()
	var materia := ProceduralSkyMaterial.new()
	materia.sky_top_color = Color(0.05, 0.03, 0.1)
	materia.sky_horizon_color = Color(0.32, 0.12, 0.18)
	materia.ground_bottom_color = Color(0.06, 0.04, 0.05)
	materia.ground_horizon_color = Color(0.18, 0.08, 0.1)
	materia.sun_angle_max = 0.0
	cielo.sky_material = materia
	entorno.sky = cielo
	entorno.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	entorno.ambient_light_color = Color(0.42, 0.32, 0.46)
	entorno.ambient_light_energy = 0.85
	var mundo := WorldEnvironment.new()
	mundo.environment = entorno
	add_child(mundo)
	var sol := DirectionalLight3D.new()
	sol.rotation_degrees = Vector3(-54, -32, 0)
	sol.light_color = Color(1.0, 0.92, 0.82)
	sol.light_energy = 1.2
	sol.shadow_enabled = false
	add_child(sol)
