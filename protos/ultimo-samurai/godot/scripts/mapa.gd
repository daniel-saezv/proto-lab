extends Node3D

var _faroles: Array[OmniLight3D] = []
var _cintas: Array[Node3D] = []
var _flechas: Array[Area3D] = []
var _t := 0.0


static func piezas() -> Array[Dictionary]:
	return [
		{"id": "suelo", "x": 0.75, "top": 0.0, "sx": 3.3, "sy": 0.32, "sz": 3.4, "piedra": false, "lado": "antes"},
		{"id": "p1", "x": -3.8, "top": 1.2, "sx": 3.3, "sy": 0.32, "sz": 2.4, "piedra": true, "lado": "antes"},
		{"id": "p2", "x": -8.35, "top": 2.4, "sx": 3.3, "sy": 0.32, "sz": 2.4, "piedra": false, "lado": "antes"},
		{"id": "p3", "x": -12.9, "top": 3.6, "sx": 3.3, "sy": 0.32, "sz": 2.6, "piedra": true, "lado": "antes"},
		{"id": "santuario", "x": -22.9, "top": 4.8, "sx": 14.2, "sy": 0.34, "sz": 3.2, "piedra": true, "lado": "antes"},
		{"id": "corte", "x": -32.9, "top": 6.0, "sx": 3.3, "sy": 0.32, "sz": 2.8, "piedra": true, "lado": "despues"},
		{"id": "p9", "x": -37.45, "top": 7.2, "sx": 3.3, "sy": 0.32, "sz": 2.3, "piedra": false, "lado": "despues"},
		{"id": "p10", "x": -42.0, "top": 8.4, "sx": 3.3, "sy": 0.32, "sz": 2.5, "piedra": true, "lado": "despues"},
		{"id": "arena", "x": -48.2, "top": 9.6, "sx": 6.4, "sy": 0.36, "sz": 3.6, "piedra": true, "lado": "despues"},
		{"id": "muro_fondo", "x": -51.2, "top": 12.2, "sx": 0.5, "sy": 2.6, "sz": 3.4, "piedra": true, "lado": "muro"},
	]


static func sello() -> Dictionary:
	return {"x": -23.2, "sx": 0.42, "top": 18.0, "sy": 18.0}


static func encuentros() -> Array[Dictionary]:
	return [
		{"tipo": "ashigaru", "id": "p1", "patrulla": 0.9},
		{"tipo": "arquero", "id": "p2", "patrulla": 0.0},
		{"tipo": "ashigaru", "id": "p3", "patrulla": 0.9},
		{"tipo": "ronin", "id": "corte", "patrulla": 0.9},
		{"tipo": "ashigaru", "id": "p9", "patrulla": 0.8},
		{"tipo": "arquero", "id": "p10", "patrulla": 0.0},
		{"tipo": "jefe", "id": "arena"},
	]


func _ready() -> void:
	add_to_group("arsenal")
	_construir()
	_decorar()
	_flechas_pool()
	_habitar()
	if Partida.lista:
		_aplicar_carga()
	else:
		Partida.cargada.connect(_aplicar_carga)


func _process(delta: float) -> void:
	_t += delta
	for i in _faroles.size():
		_faroles[i].light_energy = 1.15 + sin(_t * 3.1 + float(i) * 1.3) * 0.22
	for i in _cintas.size():
		_cintas[i].rotation.z = sin(_t * 1.6 + float(i) * 0.7) * 0.2


func lanzar(origen: Vector3, direccion: float) -> void:
	for flecha in _flechas:
		if flecha.has_method("libre") and bool(flecha.libre()):
			flecha.activar(origen, direccion)
			return


func _construir() -> void:
	for pieza in piezas():
		_plataforma(pieza)
	var puerta := sello()
	var muro := StaticBody3D.new()
	muro.set_script(load("res://scripts/sello.gd"))
	muro.position = Vector3(float(puerta.x), float(puerta.top) - float(puerta.sy) * 0.5, 0)
	add_child(muro)


func _plataforma(pieza: Dictionary) -> void:
	var tam := Vector3(float(pieza.sx), float(pieza.sy), float(pieza.sz))
	var centro := Vector3(float(pieza.x), float(pieza.top) - tam.y * 0.5, 0)
	var cuerpo := StaticBody3D.new()
	cuerpo.collision_layer = Reglas.CAPA_MUNDO
	cuerpo.collision_mask = 0
	cuerpo.position = centro
	var forma := CollisionShape3D.new()
	var caja := BoxShape3D.new()
	caja.size = tam
	forma.shape = caja
	cuerpo.add_child(forma)
	var malla := MeshInstance3D.new()
	var bloque := BoxMesh.new()
	bloque.size = tam
	malla.mesh = bloque
	malla.material_override = Taller.piedra if bool(pieza.piedra) else Taller.madera
	cuerpo.add_child(malla)
	if not bool(pieza.get("muro", false)) and str(pieza.lado) != "muro":
		var losa := MeshInstance3D.new()
		var tapa := BoxMesh.new()
		tapa.size = Vector3(tam.x * 0.92, 0.08, tam.z * 0.86)
		losa.mesh = tapa
		losa.material_override = Taller.losa
		losa.position.y = tam.y * 0.5 - 0.02
		losa.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		cuerpo.add_child(losa)
	add_child(cuerpo)


func _decorar() -> void:
	_monte(Vector3(-4.5, 4.0, -7.5), Vector3(4.5, 9.0, 3.0))
	_monte(Vector3(6.5, 6.0, -8.0), Vector3(5.0, 12.0, 3.2))
	_monte(Vector3(1.0, 9.0, -9.0), Vector3(7.0, 8.0, 2.5))
	var luna := MeshInstance3D.new()
	var esfera := SphereMesh.new()
	esfera.radius = 1.6
	esfera.height = 3.2
	esfera.radial_segments = 16
	esfera.rings = 12
	luna.mesh = esfera
	var luz_luna := StandardMaterial3D.new()
	luz_luna.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	luz_luna.albedo_color = Color("ffe1b0")
	luz_luna.emission_enabled = true
	luz_luna.emission = Color("ffd19a")
	luz_luna.emission_energy_multiplier = 2.2
	luna.material_override = luz_luna
	luna.position = Vector3(3.2, 22.0, -16.0)
	luna.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(luna)
	_torii(Vector3(-20.4, 4.8, -1.15))
	_farol(Vector3(1.6, 0.0, -0.9))
	_farol(Vector3(-4.6, 1.2, -0.95))
	_farol(Vector3(-18.4, 4.8, -1.05))
	_farol(Vector3(-24.6, 4.8, -1.0))
	_farol(Vector3(-47.0, 9.6, -1.1))
	_cintas_en(Vector3(-0.2, 1.35, -0.4))


func _monte(pos: Vector3, tam: Vector3) -> void:
	var malla := MeshInstance3D.new()
	var caja := BoxMesh.new()
	caja.size = tam
	malla.mesh = caja
	malla.material_override = Taller.monte
	malla.position = pos
	malla.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(malla)


func _torii(base: Vector3) -> void:
	_viga(base + Vector3(-0.7, 1.3, 0), Vector3(0.16, 2.6, 0.16))
	_viga(base + Vector3(0.7, 1.3, 0), Vector3(0.16, 2.6, 0.16))
	_viga(base + Vector3(0, 2.55, 0), Vector3(1.9, 0.16, 0.18))
	_viga(base + Vector3(0, 2.25, 0), Vector3(1.55, 0.1, 0.12))


func _viga(pos: Vector3, tam: Vector3) -> void:
	var malla := MeshInstance3D.new()
	var caja := BoxMesh.new()
	caja.size = tam
	malla.mesh = caja
	malla.material_override = Taller.bermellon
	malla.position = pos
	add_child(malla)


func _farol(suelo: Vector3) -> void:
	var poste := MeshInstance3D.new()
	var caja := BoxMesh.new()
	caja.size = Vector3(0.08, 1.15, 0.08)
	poste.mesh = caja
	poste.material_override = Taller.madera
	poste.position = suelo + Vector3(0, 0.58, 0)
	add_child(poste)
	var llama := MeshInstance3D.new()
	var cubo := BoxMesh.new()
	cubo.size = Vector3(0.22, 0.28, 0.22)
	llama.mesh = cubo
	llama.material_override = Taller.oro
	llama.position = suelo + Vector3(0, 1.25, 0)
	llama.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(llama)
	var luz := OmniLight3D.new()
	luz.position = llama.position
	luz.light_color = Color("ff9a42")
	luz.light_energy = 1.15
	luz.omni_range = 4.8
	luz.shadow_enabled = false
	add_child(luz)
	_faroles.append(luz)


func _cintas_en(origen: Vector3) -> void:
	for i in 3:
		var nudo := Node3D.new()
		nudo.position = origen + Vector3(float(i) * 0.28 - 0.28, 0, 0)
		var tela := MeshInstance3D.new()
		var caja := BoxMesh.new()
		caja.size = Vector3(0.12, 0.7, 0.03)
		tela.mesh = caja
		tela.material_override = Taller.laca if i != 1 else Taller.tela
		tela.position.y = -0.35
		tela.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		nudo.add_child(tela)
		add_child(nudo)
		_cintas.append(nudo)


func _flechas_pool() -> void:
	for _i in 6:
		var flecha := Area3D.new()
		flecha.set_script(load("res://scripts/flecha.gd"))
		add_child(flecha)
		_flechas.append(flecha)


func _habitar() -> void:
	var por_id := {}
	for pieza in piezas():
		por_id[str(pieza.id)] = pieza
	var sant: Dictionary = por_id["santuario"]
	Partida.punto_santuario = Vector3(-18.6, float(sant.top) + 0.08, 0)
	for cita in encuentros():
		var pieza: Dictionary = por_id[str(cita.id)]
		var pos := Vector3(float(pieza.x), float(pieza.top) + 0.06, 0)
		if str(cita.tipo) == "jefe":
			var jefe := CharacterBody3D.new()
			jefe.set_script(load("res://scripts/jefe.gd"))
			jefe.origen = pos
			jefe.limite_izq = float(pieza.x) - float(pieza.sx) * 0.5 + 0.7
			jefe.limite_der = float(pieza.x) + float(pieza.sx) * 0.5 - 0.7
			jefe.position = pos
			add_child(jefe)
			continue
		var enemigo := CharacterBody3D.new()
		enemigo.set_script(load("res://scripts/enemigo.gd"))
		enemigo.tipo = str(cita.tipo)
		enemigo.origen = pos
		enemigo.patrulla = float(cita.get("patrulla", 0.6))
		enemigo.position = pos
		add_child(enemigo)


func _aplicar_carga() -> void:
	if Partida.sello_roto:
		for nodo in get_tree().get_nodes_in_group("sello"):
			if nodo.has_method("romper"):
				nodo.romper(true)
	if Partida.jefe_vencido:
		for nodo in get_tree().get_nodes_in_group("jefe"):
			if nodo.has_method("retirar"):
				nodo.retirar()
	if not Partida.santuario:
		return
	var jugador := get_tree().get_first_node_in_group("jugador") as Node3D
	if jugador and jugador.global_position.distance_to(Reglas.SPAWN) < 2.0:
		jugador.global_position = Partida.punto_santuario
		Partida.control = Partida.punto_santuario
