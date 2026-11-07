class_name Enemigo
extends CharacterBody3D

var tipo := "ashigaru"
var marca := ""
var limite_izq := 0.0
var limite_der := 1.0
var vida := 3
var vida_max := 3
var modo := "patrulla"
var edad := 0.0
var sentido := 1
var muerto := false
var cobrado := false
var hogar := Vector3.ZERO
var _golpe := false
var _alcance := 1.1
var _flash := 0.0
var _piel: StandardMaterial3D
var _base: Color
var _aviso: MeshInstance3D
var _sonda: RayCast3D


func configurar(clase: String, id: String, izq: float, der: float) -> void:
	tipo = clase
	marca = id
	limite_izq = izq
	limite_der = der


func _ready() -> void:
	add_to_group("enemigo")
	hogar = global_position
	cobrado = Estado.ya_cobrado(marca)
	collision_mask = Datos.CAPA_MUNDO
	collision_layer = Datos.CAPA_ENEMIGO
	floor_snap_length = 0.2
	up_direction = Vector3.UP
	match tipo:
		"karasu":
			vida_max = 3
			motion_mode = MOTION_MODE_FLOATING
			collision_mask = 0
		"yari":
			vida_max = 6
		"oni":
			vida_max = 5
		_:
			vida_max = 4
	vida = vida_max
	_armar()
	_sonda = RayCast3D.new()
	_sonda.target_position = Vector3(0.45, -1.1, 0)
	_sonda.collision_mask = Datos.CAPA_MUNDO
	add_child(_sonda)
	if not Estado.descanso_hecho.is_connected(_revivir):
		Estado.descanso_hecho.connect(_revivir)
	if not Estado.reintento.is_connected(_revivir):
		Estado.reintento.connect(_revivir)


func recibir(dano: int, _tipo: String, desde_x: float) -> void:
	if muerto or _flash > 0.05:
		return
	vida -= dano
	_flash = 0.09
	var signo := signf(global_position.x - desde_x)
	if signo == 0.0:
		signo = -float(sentido)
	velocity.x = signo * 4.0
	AudioJuego.tono("impacto")
	if vida <= 0:
		_morir()


func _physics_process(delta: float) -> void:
	if _flash > 0.0:
		_flash -= delta
		if _piel:
			_piel.albedo_color = Color("ffe6d8")
	elif _piel:
		_piel.albedo_color = _base
	if muerto:
		return
	if Estado.en_santuario or Estado.pausa_ia:
		velocity.x = 0.0
		if tipo != "karasu":
			velocity.y -= Datos.GRAVEDAD * delta
			move_and_slide()
		return
	edad += delta
	var jugador := get_tree().get_first_node_in_group("jugador") as Node3D
	var dx := 0.0
	var dy := 0.0
	if jugador:
		dx = jugador.global_position.x - global_position.x
		dy = jugador.global_position.y - global_position.y
	_golpe = false
	match tipo:
		"karasu":
			_ia_vuelo(delta, dx, dy)
		"oni":
			_ia_carga(delta, dx, dy)
		"yari":
			_ia_soldado(delta, dx, dy, 7.2, 8.0, 0.4, 0.2, 1.85)
		_:
			_ia_soldado(delta, dx, dy, 6.2, 10.5, 0.3, 0.26, 1.15)
	if _aviso:
		_aviso.visible = modo == "aviso"
	move_and_slide()
	global_position.z = 0.0
	if _golpe and jugador is Jugador:
		var alcance := _alcance
		if absf(dx) < alcance and absf(dy) < 1.15:
			(jugador as Jugador).recibir_golpe(global_position)


func _ia_soldado(delta: float, dx: float, dy: float, vista: float, vel: float, aviso: float, activo: float, alcance: float) -> void:
	_alcance = alcance
	if not is_on_floor():
		velocity.y -= Datos.GRAVEDAD * delta
	elif velocity.y < 0.0:
		velocity.y = 0.0
	if modo == "patrulla":
		if absf(dx) < vista and absf(dy) < 1.7:
			modo = "aviso"
			edad = 0.0
			sentido = 1 if dx > 0.0 else -1
			velocity.x = 0.0
		else:
			velocity.x = float(sentido) * 2.6
			if global_position.x < limite_izq:
				sentido = 1
			elif global_position.x > limite_der:
				sentido = -1
			_sonda.target_position = Vector3(0.55 * sentido, -1.15, 0)
			_sonda.force_raycast_update()
			if is_on_floor() and not _sonda.is_colliding():
				sentido *= -1
	elif modo == "aviso":
		velocity.x = 0.0
		sentido = 1 if dx > 0.0 else -1
		if edad >= aviso:
			modo = "ataque"
			edad = 0.0
			velocity.x = float(sentido) * vel
	elif modo == "ataque":
		_golpe = true
		if edad >= activo:
			modo = "espera"
			edad = 0.0
			velocity.x = 0.0
	else:
		velocity.x = move_toward(velocity.x, 0.0, 20.0 * delta)
		if edad >= 0.48:
			modo = "patrulla"
			edad = 0.0


func _ia_carga(delta: float, dx: float, dy: float) -> void:
	_alcance = 1.25
	if not is_on_floor():
		velocity.y -= Datos.GRAVEDAD * delta
	elif velocity.y < 0.0:
		velocity.y = 0.0
	if modo == "patrulla":
		velocity.x = float(sentido) * 2.2
		if global_position.x < limite_izq or global_position.x > limite_der:
			sentido *= -1
		if absf(dx) < 8.0 and absf(dy) < 1.8:
			modo = "aviso"
			edad = 0.0
			sentido = 1 if dx > 0.0 else -1
	elif modo == "aviso":
		velocity.x = 0.0
		if edad >= 0.32:
			modo = "ataque"
			edad = 0.0
			velocity.x = float(sentido) * 13.0
	elif modo == "ataque":
		_golpe = true
		if edad >= 0.42:
			modo = "espera"
			edad = 0.0
			velocity.x = 0.0
	else:
		velocity.x = 0.0
		if edad >= 0.7:
			modo = "patrulla"
			edad = 0.0


func _ia_vuelo(delta: float, dx: float, dy: float) -> void:
	_alcance = 0.95
	var meta := hogar
	if modo == "patrulla":
		meta.y = hogar.y + sin(edad * 2.4) * 0.25
		if absf(dx) < 5.5 and dy < 0.4:
			modo = "aviso"
			edad = 0.0
	elif modo == "aviso":
		meta = global_position
		if edad >= 0.28:
			modo = "ataque"
			edad = 0.0
			sentido = 1 if dx > 0.0 else -1
	elif modo == "ataque":
		_golpe = true
		velocity = Vector3(float(sentido) * 7.0, -9.0, 0.0)
		if edad >= 0.38 or global_position.y < hogar.y - 1.8:
			modo = "espera"
			edad = 0.0
			velocity = Vector3.ZERO
		return
	else:
		meta = hogar
		if global_position.distance_to(hogar) < 0.4 and edad > 0.3:
			modo = "patrulla"
			edad = 0.0
	var dir := meta - global_position
	velocity = dir * 3.2
	if velocity.length() < 0.2:
		velocity += Vector3(sin(edad) * 0.4, 0, 0)


func _morir() -> void:
	muerto = true
	_golpe = false
	visible = false
	collision_layer = 0
	if not cobrado:
		cobrado = true
		Estado.marcar_cobrado(marca)
		Estado.ganar_espiritu(1)
		Guardado.guardar()
	AudioJuego.tono("impacto")


func _revivir() -> void:
	if not is_inside_tree():
		return
	muerto = false
	vida = vida_max
	modo = "patrulla"
	edad = 0.0
	visible = true
	collision_layer = Datos.CAPA_ENEMIGO
	global_position = hogar
	velocity = Vector3.ZERO


func _armar() -> void:
	match tipo:
		"karasu":
			_base = Color("221820")
			_piel = Arte.copia(Arte.cuervo)
			var forma := CollisionShape3D.new()
			var esfera := SphereShape3D.new()
			esfera.radius = 0.32
			forma.shape = esfera
			forma.position = Vector3(0, 0.4, 0)
			add_child(forma)
			var cuerpo := Arte.esfera(0.28, _piel)
			cuerpo.position = Vector3(0, 0.4, 0)
			add_child(cuerpo)
			var ala := Arte.caja(Vector3(0.7, 0.06, 0.28), _piel)
			ala.position = Vector3(0, 0.45, 0)
			add_child(ala)
		"yari":
			_base = Color("ece6dc")
			_piel = Arte.copia(Arte.tela)
			_cuerpo_humano(1.15, Arte.hierro)
			var lanza := Arte.cilindro(0.04, 1.7, Arte.acero, 6)
			lanza.rotation.z = PI * 0.5
			lanza.position = Vector3(0.7, 1.0, 0)
			add_child(lanza)
		"oni":
			_base = Color("8a3a32")
			_piel = Arte.copia(Arte.cinabrio)
			_cuerpo_humano(1.25, _piel)
		_:
			_base = Color("ece6dc")
			_piel = Arte.copia(Arte.tela)
			_cuerpo_humano(1.0, Arte.musgo)
			var sombrero := Arte.cono(0.28, 0.22, Arte.madera_osc)
			sombrero.position = Vector3(0, 1.55, 0)
			add_child(sombrero)
	_aviso = Arte.esfera(0.08, Arte.cinabrio)
	_aviso.position = Vector3(0, 1.75, 0)
	_aviso.visible = false
	add_child(_aviso)


func _cuerpo_humano(escala: float, mat_extra: Material) -> void:
	var forma := CollisionShape3D.new()
	var capsula := CapsuleShape3D.new()
	capsula.radius = 0.28 * escala
	capsula.height = 1.2 * escala
	forma.shape = capsula
	forma.position = Vector3(0, 0.62 * escala, 0)
	add_child(forma)
	var piernas := Arte.caja(Vector3(0.4 * escala, 0.55 * escala, 0.3), Arte.hakama)
	piernas.position = Vector3(0, 0.35 * escala, 0)
	add_child(piernas)
	var torso := Arte.caja(Vector3(0.42 * escala, 0.4 * escala, 0.3), _piel)
	torso.position = Vector3(0, 0.85 * escala, 0)
	add_child(torso)
	var yelmo := Arte.caja(Vector3(0.34 * escala, 0.16 * escala, 0.34), mat_extra)
	yelmo.position = Vector3(0, 1.22 * escala, 0)
	add_child(yelmo)
