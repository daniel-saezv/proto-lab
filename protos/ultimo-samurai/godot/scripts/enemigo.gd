extends CharacterBody3D

var tipo := "ashigaru"
var origen := Vector3.ZERO
var patrulla := 0.7
var mirando := -1.0
var vidas := 2
var _estado := "patrol"
var _reloj := 0.0
var _fase := 0.0
var _contacto := 0.0
var _golpe := false
var _muerto := false
var _visual: Node3D
var _arma: Node3D
var _brillo: OmniLight3D
var _base_vidas := 2


func _ready() -> void:
	collision_layer = Reglas.CAPA_ENEMIGO
	collision_mask = Reglas.CAPA_MUNDO
	floor_snap_length = 0.05
	add_to_group("herible")
	add_to_group("reiniciable")
	_base_vidas = _vidas_de()
	vidas = _base_vidas
	_fase = randf() * TAU
	var opciones := {
		"laca": Taller.oliva,
		"tela": Taller.arco,
		"metal": Taller.metal,
		"cresta": false,
		"lanza": true,
		"escala": 0.72,
	}
	if tipo == "arquero":
		opciones = {
			"laca": Taller.noche,
			"tela": Taller.tela,
			"metal": Taller.arco,
			"cresta": false,
			"arco": true,
			"lanza": false,
			"escala": 0.72,
		}
		mirando = -1.0
	elif tipo == "ronin":
		opciones = {
			"laca": Taller.noche,
			"tela": Taller.laca,
			"metal": Taller.metal,
			"cresta": true,
			"cresta_mat": Taller.laca,
			"lanza": false,
			"escala": 0.8,
		}
	_visual = Figuras.personaje(opciones)
	add_child(_visual)
	_arma = _visual.get_node_or_null("Arma")
	_brillo = _visual.get_node_or_null("Brillo")
	var forma := CollisionShape3D.new()
	var capsula := CapsuleShape3D.new()
	capsula.radius = 0.26 if tipo == "ronin" else 0.22
	capsula.height = 1.2 if tipo == "ronin" else 1.12
	forma.shape = capsula
	forma.position.y = capsula.height * 0.5
	add_child(forma)


func _vidas_de() -> int:
	if tipo == "arquero":
		return Reglas.VIDAS_ARQUERO
	if tipo == "ronin":
		return Reglas.VIDAS_RONIN
	return Reglas.VIDAS_ASHIGARU


func _physics_process(delta: float) -> void:
	if Partida.pausa or _muerto:
		return
	if not is_on_floor():
		velocity.y -= Reglas.GRAVEDAD * delta
	else:
		velocity.y = 0.0
	var jugador := _buscar_jugador()
	var dx := 0.0
	var cerca := false
	if jugador:
		dx = jugador.global_position.x - global_position.x
		cerca = absf(dx) < _rango() and absf(jugador.global_position.y - global_position.y) < 1.5
		if absf(dx) > 0.2:
			mirando = signf(dx)
	_reloj -= delta
	_contacto = maxf(_contacto - delta, 0.0)
	if tipo == "arquero":
		velocity.x = 0.0
		if _estado == "patrol" and cerca and _reloj <= 0.0:
			_estado = "prepara"
			_reloj = 0.48
		elif _estado == "prepara" and _reloj <= 0.0:
			_disparar()
			_estado = "recupera"
			_reloj = 0.4
		elif _estado == "recupera" and _reloj <= 0.0:
			_estado = "patrol"
			_reloj = 1.5
	else:
		_cuerpo(delta, cerca, dx)
	move_and_slide()
	global_position.z = 0.0
	_tocar(jugador)
	_posar()


func _cuerpo(delta: float, cerca: bool, dx: float) -> void:
	if _estado == "patrol":
		if cerca and _reloj <= 0.0:
			_estado = "prepara"
			_reloj = 0.38 if tipo == "ashigaru" else 0.5
			velocity.x = 0.0
			return
		_fase += delta * 0.85
		var meta := origen.x + sin(_fase) * patrulla
		var dir := signf(meta - global_position.x)
		velocity.x = dir * 2.1
		if absf(meta - global_position.x) > 0.15:
			mirando = dir
	elif _estado == "prepara" and _reloj <= 0.0:
		_estado = "golpe"
		_golpe = true
		_reloj = 0.22
		velocity.x = mirando * (6.4 if tipo == "ashigaru" else 4.6)
	elif _estado == "golpe" and _reloj <= 0.0:
		_golpe = false
		_estado = "recupera"
		_reloj = 0.45
		velocity.x = 0.0
	elif _estado == "recupera" and _reloj <= 0.0:
		_estado = "patrol"
		_reloj = 0.35
	elif _estado == "prepara":
		velocity.x = 0.0


func _rango() -> float:
	if tipo == "arquero":
		return 7.5
	if tipo == "ronin":
		return 1.7
	return 1.35


func _tocar(jugador: Node3D) -> void:
	if jugador == null or _contacto > 0.0:
		return
	if tipo == "arquero":
		return
	var dx := absf(jugador.global_position.x - global_position.x)
	var dy := absf(jugador.global_position.y - global_position.y)
	var cuerpo := dx < 0.58 and dy < 1.0
	var estocada := _golpe and dx < (1.15 if tipo == "ronin" else 0.95) and dy < 1.05 and (jugador.global_position.x - global_position.x) * mirando > 0.0
	if cuerpo or estocada:
		if jugador.has_method("recibir"):
			jugador.recibir(1, global_position, false)
			_contacto = 0.8


func _disparar() -> void:
	var arsenal := get_tree().get_first_node_in_group("arsenal")
	if arsenal and arsenal.has_method("lanzar"):
		arsenal.lanzar(global_position + Vector3(mirando * 0.45, 1.05, 0), mirando)
	Sonido.suena("corte")


func _posar() -> void:
	if _visual:
		_visual.rotation.y = 0.0 if mirando > 0.0 else PI
	if _arma:
		if _estado == "prepara":
			_arma.rotation.z = -0.8
		elif _estado == "golpe":
			_arma.rotation.z = 0.6
		else:
			_arma.rotation.z = 0.0
	if _brillo:
		_brillo.light_energy = 0.9 if _estado == "prepara" else 0.0
		_brillo.light_color = Color(1.0, 0.45, 0.25)


func recibir(danio: int, desde: Vector3, kata: String = "iai") -> void:
	if _muerto or vidas <= 0:
		return
	var de_frente := (desde.x - global_position.x) * mirando > 0.0
	if tipo == "ronin" and Reglas.ronin_bloquea(kata, de_frente) and _estado != "golpe":
		if _brillo:
			_brillo.light_energy = 1.4
			_brillo.light_color = Color(0.7, 0.85, 1.0)
		Sonido.suena("corte")
		Partida.pista("bloqueo", "El ronin para el iai de frente. El kesa, por la espalda o el tatsumaki, sí entran.")
		return
	vidas -= danio
	Efectos.chispa(global_position + Vector3(0, 1.0, 0))
	velocity.x = signf(global_position.x - desde.x) * 3.0
	if vidas <= 0:
		_caer()


func elevar() -> void:
	velocity.y = 4.5 if tipo == "ronin" else 6.5


func _caer() -> void:
	if _muerto:
		return
	_muerto = true
	vidas = 0
	remove_from_group("herible")
	collision_layer = 0
	set_physics_process(false)
	visible = false
	Partida.registrar_asesinato()
	Sonido.suena("golpe")


func reiniciar() -> void:
	if not is_inside_tree():
		return
	_muerto = false
	visible = true
	collision_layer = Reglas.CAPA_ENEMIGO
	set_physics_process(true)
	if not is_in_group("herible"):
		add_to_group("herible")
	global_position = origen
	velocity = Vector3.ZERO
	vidas = _base_vidas
	_estado = "patrol"
	_golpe = false
	_reloj = 0.2


func _buscar_jugador() -> Node3D:
	var nodo := get_tree().get_first_node_in_group("jugador")
	return nodo as Node3D
