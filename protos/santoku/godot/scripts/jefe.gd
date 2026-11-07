class_name Jefe
extends CharacterBody3D

var id := "takeoni"
var nombre := "Takeoni"
var vida := 16
var vida_max := 16
var activo := false
var muerto := false
var fase2 := false
var patron := "calma"
var edad := 0.0
var paso := 0
var mirando := -1
var guion: Array[String] = []
var _ya_hirio := false
var _flash := 0.0
var _piel: StandardMaterial3D
var _base: Color
var _arma: Node3D
var _escudo: MeshInstance3D
var _marca: MeshInstance3D
var _pinchos: Array[MeshInstance3D] = []
var _ondas: MeshInstance3D
var _proyectiles: Array[Dictionary] = []
var muro: StaticBody3D
var _cerrado := false
var x_min := 0.0
var x_max := 10.0


func configurar(ident: String, titulo: String, minimo: float, maximo: float) -> void:
	id = ident
	nombre = titulo
	x_min = minimo
	x_max = maximo


func _ready() -> void:
	add_to_group("jefe")
	collision_layer = Datos.CAPA_ENEMIGO
	collision_mask = Datos.CAPA_MUNDO
	up_direction = Vector3.UP
	floor_snap_length = 0.2
	if id == "tetsu":
		vida_max = 22
		guion = ["abanicos", "calma", "escudo", "calma", "onda", "calma"]
		_base = Color("8e98a6")
		_piel = Arte.copia(Arte.hierro)
	else:
		vida_max = 16
		guion = ["barrido", "calma", "clavo", "calma", "pinchos", "calma"]
		_base = Color("6e8f45")
		_piel = Arte.copia(Arte.oni)
	vida = vida_max
	_armar()
	_pool()
	if Estado.jefe_muerto(id):
		colocar_vencido()
	if not Estado.reintento.is_connected(_al_reintento):
		Estado.reintento.connect(_al_reintento)
	if not Estado.descanso_hecho.is_connected(_al_descanso):
		Estado.descanso_hecho.connect(_al_descanso)


func colocar_vencido() -> void:
	muerto = true
	activo = false
	vida = 0
	collision_layer = 0
	rotation.z = 0.8 if id == "takeoni" else -0.8
	if _escudo:
		_escudo.visible = false


func recibir(dano: int, tipo: String, desde_x: float) -> void:
	if muerto or not activo:
		return
	if id == "tetsu" and patron == "escudo" and tipo != "kesa" and _de_frente(desde_x):
		Estado.decir("El escudo de Tetsu niega el corte.")
		AudioJuego.tono("bloqueo")
		return
	vida -= dano
	_flash = 0.08
	AudioJuego.tono("impacto")
	if not fase2 and float(vida) <= float(vida_max) * 0.5:
		_entrar_fase2()
	if vida <= 0:
		_morir()


func _de_frente(desde_x: float) -> bool:
	return signf(desde_x - global_position.x) == float(mirando)


func _physics_process(delta: float) -> void:
	if _flash > 0.0:
		_flash -= delta
		if _piel:
			_piel.albedo_color = Color("fff1e4")
	elif _piel:
		_piel.albedo_color = _base
	_volar(delta)
	if muerto:
		_hud(false)
		return
	var jugador := get_tree().get_first_node_in_group("jugador") as Node3D
	if jugador == null:
		return
	var dx := jugador.global_position.x - global_position.x
	if not activo:
		if not Estado.jefe_muerto(id) and jugador.global_position.x > x_min + 1.2 and jugador.global_position.x < x_max:
			activo = true
			Estado.decir(nombre)
			_cerrar_muro()
		_hud(false)
		return
	if Estado.en_santuario or Estado.pausa_ia:
		_hud(true)
		return
	if not _cerrado and jugador.global_position.x > x_min + 1.4:
		_cerrar_muro()
	mirando = 1 if dx > 0.0 else -1
	edad += delta
	if edad >= _duracion():
		_siguiente()
	_ejecutar(delta, jugador, dx)
	global_position.x = clampf(global_position.x, x_min + 0.8, x_max - 0.8)
	global_position.z = 0.0
	if _arma:
		_arma.rotation.y = 0.0 if mirando > 0 else PI
	_hud(true)


func _duracion() -> float:
	var base := 1.05
	match patron:
		"calma":
			base = 0.72
		"escudo":
			base = 1.35
		"frenesi":
			base = 1.25
		"pinchos", "onda", "abanicos":
			base = 1.15
	return base * (0.78 if fase2 else 1.0)


func _siguiente() -> void:
	if guion.is_empty():
		return
	paso = (paso + 1) % guion.size()
	patron = guion[paso]
	edad = 0.0
	_ya_hirio = false
	_ocultar_marcas()


func _entrar_fase2() -> void:
	fase2 = true
	if id == "takeoni":
		guion = ["barrido", "salto", "clavo", "pinchos"]
		Estado.decir("Takeoni suelta el bosque.")
	else:
		guion = ["frenesi", "abanicos", "onda", "frenesi"]
		Estado.decir("Tetsu rompe el yelmo.")
		if _escudo:
			_escudo.visible = false
	paso = 0
	patron = guion[0]
	edad = 0.0


func _ejecutar(delta: float, jugador: Node3D, dx: float) -> void:
	velocity.x = 0.0
	match patron:
		"calma":
			velocity.x = float(mirando) * (4.2 if fase2 else 3.0)
		"barrido":
			if _arma:
				_arma.rotation.z = lerpf(0.8, -1.3, clampf(edad / 0.55, 0.0, 1.0))
			if edad > 0.42 and edad < 0.68:
				_herir_si(jugador, absf(dx) < 1.85 and jugador.global_position.y < global_position.y + 0.85)
		"clavo":
			if _marca:
				_marca.visible = true
				_marca.global_position = Vector3(global_position.x, 0.05, 0)
			if edad > 0.62 and edad < 0.82:
				_herir_si(jugador, absf(dx) < 2.15 and jugador.global_position.y < 1.05)
		"salto":
			velocity.x = float(mirando) * 8.0
			if edad > 0.45 and edad < 0.7:
				_herir_si(jugador, absf(dx) < 1.5 and jugador.global_position.y < 1.2)
		"pinchos":
			_pinchos_tick(jugador)
		"abanicos":
			if edad > 0.38 and edad < 0.46:
				_lanzar(jugador)
		"escudo":
			velocity.x = float(mirando) * 2.4
			if _escudo:
				_escudo.visible = true
			if edad > 0.3:
				_herir_si(jugador, absf(dx) < 0.95 and jugador.global_position.y < 1.4)
		"onda":
			_onda_tick(jugador)
		"frenesi":
			velocity.x = float(mirando) * 5.5
			var ciclo := fmod(edad, 0.32)
			if ciclo > 0.16 and ciclo < 0.28:
				_herir_si(jugador, absf(dx) < 1.55 and jugador.global_position.y < 0.95)
				if ciclo > 0.26:
					_ya_hirio = false
	if not is_on_floor():
		velocity.y -= Datos.GRAVEDAD * delta
	else:
		velocity.y = 0.0
	move_and_slide()


func _herir_si(jugador: Node3D, condicion: bool) -> void:
	if _ya_hirio or not condicion:
		return
	if jugador is Jugador:
		_ya_hirio = true
		(jugador as Jugador).recibir_golpe(global_position, 1)
		if _marca:
			_marca.visible = true


func _pinchos_tick(jugador: Node3D) -> void:
	var seguro := paso % 3
	for i in _pinchos.size():
		var pincho := _pinchos[i]
		var x := global_position.x + (float(i) - 1.0) * 2.15
		pincho.global_position = Vector3(x, 0.15, 0)
		var peligro := i != seguro and edad > 0.48 and edad < 0.86
		pincho.visible = true
		pincho.scale = Vector3(1, 1.8 if peligro else 0.35, 1)
		if peligro:
			_herir_si(jugador, absf(jugador.global_position.x - x) < 0.72 and jugador.global_position.y < 1.1)


func _onda_tick(jugador: Node3D) -> void:
	if _ondas == null:
		return
	_ondas.visible = edad > 0.28
	var radio := clampf((edad - 0.28) * 9.0, 0.2, 6.5)
	_ondas.global_position = Vector3(global_position.x, 0.12, 0)
	_ondas.scale = Vector3(radio, 1, 1)
	if edad > 0.28:
		var borde := absf(jugador.global_position.x - global_position.x)
		_herir_si(jugador, borde < radio and borde > radio - 1.1 and jugador.global_position.y < 0.8)


func _lanzar(_jugador: Node3D) -> void:
	if _proyectiles.is_empty():
		return
	var usados := 0
	for item in _proyectiles:
		if float(item["vida"]) > 0.0:
			usados += 1
	if usados > 0:
		return
	var alturas := [2.6, 1.2, 0.35]
	var i := 0
	for item in _proyectiles:
		if i >= 3:
			break
		var nodo := item["nodo"] as Area3D
		nodo.visible = true
		nodo.global_position = global_position + Vector3(float(mirando) * 0.8, 1.2, 0)
		item["vel"] = Vector3(float(mirando) * 8.0, alturas[i], 0)
		item["vida"] = 1.6
		i += 1


func _volar(delta: float) -> void:
	var jugador := get_tree().get_first_node_in_group("jugador") as Node3D
	for item in _proyectiles:
		var vida_p := float(item["vida"])
		if vida_p <= 0.0:
			continue
		var nodo := item["nodo"] as Area3D
		var vel: Vector3 = item["vel"]
		vel.y -= 7.5 * delta
		item["vel"] = vel
		item["vida"] = vida_p - delta
		nodo.global_position += vel * delta
		if jugador and nodo.overlaps_body(jugador) and jugador is Jugador:
			(jugador as Jugador).recibir_golpe(nodo.global_position, 1)
			item["vida"] = 0.0
		if nodo.global_position.y < 0.05 or float(item["vida"]) <= 0.0:
			item["vida"] = 0.0
			nodo.visible = false


func _cerrar_muro() -> void:
	_cerrado = true
	if muro:
		muro.collision_layer = Datos.CAPA_MUNDO
		muro.visible = true


func _abrir_muro() -> void:
	_cerrado = false
	if muro:
		muro.collision_layer = 0
		muro.visible = false


func _morir() -> void:
	if muerto:
		return
	muerto = true
	activo = false
	collision_layer = 0
	_abrir_muro()
	_ocultar_marcas()
	rotation.z = 0.9 if id == "takeoni" else -0.75
	Estado.vencer(id)
	Estado.ganar_espiritu(3)
	if id == "takeoni":
		Estado.aprender("fujin")
		Estado.decir("Takeoni cae. El viento abre la cornisa.")
	else:
		Estado.victoria = true
		Estado.decir("Tetsu cae. Santoku guarda el filo.")
	AudioJuego.tono("campana")
	Guardado.guardar()
	_hud(false)


func _al_reintento() -> void:
	if muerto:
		return
	vida = vida_max
	fase2 = false
	activo = false
	patron = "calma"
	edad = 0.0
	_abrir_muro()
	_restaurar_guion()


func _al_descanso() -> void:
	if muerto:
		return
	vida = vida_max
	fase2 = false
	activo = false
	patron = "calma"
	_abrir_muro()
	_restaurar_guion()


func _restaurar_guion() -> void:
	if id == "tetsu":
		guion = ["abanicos", "calma", "escudo", "calma", "onda", "calma"]
		if _escudo:
			_escudo.visible = true
	else:
		guion = ["barrido", "calma", "clavo", "calma", "pinchos", "calma"]


func _hud(mostrar: bool) -> void:
	if not mostrar or vida_max <= 0:
		get_tree().call_group("hud", "mostrar_jefe", "", -1.0)
		return
	get_tree().call_group("hud", "mostrar_jefe", nombre, clampf(float(vida) / float(vida_max), 0.0, 1.0))


func _ocultar_marcas() -> void:
	if _marca:
		_marca.visible = false
	if _ondas:
		_ondas.visible = false
	for pincho in _pinchos:
		pincho.visible = false


func _pool() -> void:
	for i in 3:
		var area := Area3D.new()
		area.monitoring = true
		area.monitorable = false
		area.collision_layer = Datos.CAPA_GOLPE
		area.collision_mask = Datos.CAPA_JUGADOR
		var hoja := Arte.caja(Vector3(0.55, 0.08, 0.32), Arte.cinabrio, false)
		area.add_child(hoja)
		area.visible = false
		add_child(area)
		_proyectiles.append({"nodo": area, "vel": Vector3.ZERO, "vida": 0.0})
	_marca = Arte.cilindro(1.15, 0.06, Arte.cinabrio, 10)
	_marca.visible = false
	_marca.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	get_parent().add_child(_marca)
	_ondas = Arte.caja(Vector3(1.0, 0.18, 2.4), Arte.oro, false)
	_ondas.visible = false
	get_parent().add_child(_ondas)
	for i in 3:
		var pincho := Arte.cono(0.18, 0.9, Arte.musgo)
		pincho.visible = false
		get_parent().add_child(pincho)
		_pinchos.append(pincho)


func _armar() -> void:
	var escala := 1.55 if id == "takeoni" else 1.7
	var forma := CollisionShape3D.new()
	var capsula := CapsuleShape3D.new()
	capsula.radius = 0.42 * escala
	capsula.height = 1.5 * escala
	forma.shape = capsula
	forma.position = Vector3(0, 0.78 * escala, 0)
	add_child(forma)
	var piernas := Arte.caja(Vector3(0.7 * escala, 0.7 * escala, 0.45), Arte.hakama)
	piernas.position = Vector3(0, 0.4 * escala, 0)
	add_child(piernas)
	var torso := Arte.caja(Vector3(0.72 * escala, 0.55 * escala, 0.46), _piel)
	torso.position = Vector3(0, 0.95 * escala, 0)
	add_child(torso)
	_arma = Node3D.new()
	add_child(_arma)
	if id == "takeoni":
		var cuerno_i := Arte.cono(0.1, 0.38, Arte.oro)
		cuerno_i.position = Vector3(-0.16, 1.7, 0)
		cuerno_i.rotation.z = 0.5
		add_child(cuerno_i)
		var cuerno_d := Arte.cono(0.1, 0.38, Arte.oro)
		cuerno_d.position = Vector3(0.16, 1.7, 0)
		cuerno_d.rotation.z = -0.5
		add_child(cuerno_d)
		var maza := Arte.cilindro(0.14, 1.5, Arte.madera_osc, 7)
		maza.rotation.z = PI * 0.5
		maza.position = Vector3(0.7, 1.0, 0)
		_arma.add_child(maza)
	else:
		var hombrera := Arte.caja(Vector3(1.15, 0.22, 0.55), Arte.hierro_osc)
		hombrera.position = Vector3(0, 1.25, 0)
		add_child(hombrera)
		var yelmo := Arte.caja(Vector3(0.46, 0.28, 0.46), Arte.hierro)
		yelmo.position = Vector3(0, 1.6, 0)
		add_child(yelmo)
		_escudo = Arte.caja(Vector3(0.18, 1.15, 0.9), Arte.cinabrio)
		_escudo.position = Vector3(0.7, 1.0, 0)
		_arma.add_child(_escudo)
		var abanico := Arte.caja(Vector3(0.7, 0.08, 0.45), Arte.papel, false)
		abanico.position = Vector3(-0.55, 1.05, 0)
		_arma.add_child(abanico)
