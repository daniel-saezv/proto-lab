extends CharacterBody3D

var origen := Vector3.ZERO
var limite_izq := 2.2
var limite_der := 6.2
var mirando := -1.0
var _vidas := Reglas.VIDAS_JEFE
var _activo := false
var _estado := "calma"
var _movimiento := ""
var _reloj := 0.6
var _indice := 0
var _onda := 0.0
var _onda_viva := false
var _golpe_hecho := false
var _visual: Node3D
var _brillo: OmniLight3D
var _anillo: MeshInstance3D


func _ready() -> void:
	collision_layer = Reglas.CAPA_ENEMIGO
	collision_mask = Reglas.CAPA_MUNDO
	floor_snap_length = 0.05
	add_to_group("herible")
	add_to_group("reiniciable")
	add_to_group("jefe")
	_visual = Figuras.personaje({
		"laca": Taller.hueso,
		"tela": Taller.laca,
		"metal": Taller.cuerno,
		"hoja": Taller.hoja,
		"piel": Taller.hueso,
		"cresta": false,
		"cuernos": true,
		"ojos": true,
		"escala": 1.48,
		"faja": Taller.laca,
	})
	add_child(_visual)
	_brillo = _visual.get_node_or_null("Brillo")
	var forma := CollisionShape3D.new()
	var capsula := CapsuleShape3D.new()
	capsula.radius = 0.46
	capsula.height = 2.05
	forma.shape = capsula
	forma.position.y = 1.05
	add_child(forma)
	_anillo = MeshInstance3D.new()
	var tubo := TorusMesh.new()
	tubo.inner_radius = 0.55
	tubo.outer_radius = 0.78
	tubo.rings = 8
	tubo.ring_segments = 18
	_anillo.mesh = tubo
	_anillo.material_override = Taller.corte
	_anillo.visible = false
	_anillo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_anillo)
	if Partida.jefe_vencido:
		retirar()


func _physics_process(delta: float) -> void:
	if Partida.jefe_vencido or Partida.pausa:
		velocity.x = 0.0
		return
	if not is_on_floor():
		velocity.y -= Reglas.GRAVEDAD * delta
	else:
		velocity.y = 0.0
	var jugador := get_tree().get_first_node_in_group("jugador") as Node3D
	if jugador and absf(jugador.global_position.x - global_position.x) > 0.2:
		mirando = signf(jugador.global_position.x - global_position.x)
	if not _activo:
		velocity.x = 0.0
		_esperar(jugador)
		move_and_slide()
		_posar()
		return
	_reloj -= delta
	match _estado:
		"calma":
			velocity.x = move_toward(velocity.x, 0.0, 20.0 * delta)
			if _reloj <= 0.0:
				_preparar()
		"prepara":
			velocity.x = 0.0
			if _movimiento == "onda":
				velocity.y = 7.5
			if _reloj <= 0.0:
				_activar()
		"activo":
			_durante(delta, jugador)
		"recupera":
			velocity.x = move_toward(velocity.x, 0.0, 16.0 * delta)
			if _reloj <= 0.0:
				_estado = "calma"
				_reloj = 0.38 if _vidas <= 4 else 0.62
	move_and_slide()
	global_position.x = clampf(global_position.x, limite_izq, limite_der)
	global_position.z = 0.0
	_posar()


func _esperar(jugador: Node3D) -> void:
	if jugador == null:
		return
	var dy := absf(jugador.global_position.y - origen.y)
	var dentro := dy < 1.2 and jugador.global_position.x > limite_izq - 0.4 and jugador.global_position.x < limite_der + 0.4
	if not dentro:
		return
	_activo = true
	Partida.control = origen + Vector3(0, 0.1, 0)
	Partida.jefe_cambio.emit(_vidas, Reglas.VIDAS_JEFE)
	Partida.anuncio.emit("Kagemaru, general de ceniza. Lee el brillo antes del tajo.")
	Sonido.suena("jefe")
	var interfaz := get_tree().get_first_node_in_group("hud")
	if interfaz and interfaz.has_method("ver_jefe"):
		interfaz.ver_jefe(true)
	var camara := get_tree().get_first_node_in_group("camara")
	if camara and camara.has_method("sacudir"):
		camara.sacudir(0.18)


func _patron() -> PackedStringArray:
	if _vidas > 8:
		return PackedStringArray(["tajo", "tajo", "barrido"])
	if _vidas > 4:
		return PackedStringArray(["embestida", "tajo", "barrido"])
	return PackedStringArray(["onda", "embestida", "tajo"])


func _preparar() -> void:
	var lista := _patron()
	_movimiento = lista[_indice % lista.size()]
	_indice += 1
	_estado = "prepara"
	_golpe_hecho = false
	match _movimiento:
		"tajo":
			_reloj = 0.5
			Partida.pista("tajo", "El brillo naranja es un tajo. Apártate del filo.")
		"barrido":
			_reloj = 0.58
			Partida.pista("barrido", "El barrido va bajo. Salta.")
		"embestida":
			_reloj = 0.72
			Partida.pista("embestida", "La embestida es roja. Atraviésala con Tatsumaki.")
		"onda":
			_reloj = 0.46
			Partida.pista("onda", "Cuando el anillo sale, salta al pasar.")
	if _movimiento == "embestida" or _movimiento == "onda":
		Sonido.suena("jefe")


func _activar() -> void:
	_estado = "activo"
	_golpe_hecho = false
	match _movimiento:
		"tajo":
			_reloj = 0.2
		"barrido":
			_reloj = 0.22
		"embestida":
			_reloj = 0.4
			velocity.x = mirando * 13.0
		"onda":
			_reloj = 0.7
			_onda = 0.4
			_onda_viva = true
			velocity.y = -16.0
			if _anillo:
				_anillo.visible = true


func _durante(delta: float, jugador: Node3D) -> void:
	if _movimiento == "embestida":
		velocity.x = mirando * 13.0
		if global_position.x <= limite_izq + 0.05 or global_position.x >= limite_der - 0.05:
			_reloj = 0.0
		if jugador and not _golpe_hecho and _solapa(jugador, 1.05, 1.3):
			_golpe_hecho = true
			_herir(jugador, Reglas.DANIO_EMBESTIDA, true)
	elif _movimiento == "onda":
		velocity.x = 0.0
		if _onda_viva:
			_onda += delta * 7.5
			if _anillo:
				_anillo.scale = Vector3(_onda, 1.0, _onda)
				_anillo.position.y = 0.15
			if jugador and not _golpe_hecho:
				var dist := absf(jugador.global_position.x - global_position.x)
				var bajo := jugador.global_position.y < global_position.y + 0.75
				if bajo and absf(dist - _onda) < 0.55:
					_golpe_hecho = true
					_herir(jugador, 1, false)
					var camara := get_tree().get_first_node_in_group("camara")
					if camara and camara.has_method("sacudir"):
						camara.sacudir(0.22)
	else:
		velocity.x = 0.0
		if jugador and not _golpe_hecho:
			if _movimiento == "tajo" and _enfrente(jugador, 1.75):
				_golpe_hecho = true
				_herir(jugador, 1, false)
			elif _movimiento == "barrido" and absf(jugador.global_position.x - global_position.x) < 2.35 and jugador.global_position.y < global_position.y + 0.7:
				_golpe_hecho = true
				_herir(jugador, 1, false)
	if _reloj <= 0.0:
		_estado = "recupera"
		_reloj = 0.5
		_onda_viva = false
		if _anillo:
			_anillo.visible = false
		velocity.x = 0.0


func _solapa(jugador: Node3D, alcance: float, alto: float) -> bool:
	return absf(jugador.global_position.x - global_position.x) < alcance and absf(jugador.global_position.y - global_position.y) < alto


func _enfrente(jugador: Node3D, alcance: float) -> bool:
	var dx := jugador.global_position.x - global_position.x
	return dx * mirando > 0.15 and absf(dx) < alcance and absf(jugador.global_position.y - global_position.y) < 1.4


func _herir(jugador: Node3D, cantidad: int, embestida: bool) -> void:
	if jugador.has_method("recibir"):
		jugador.recibir(cantidad, global_position, embestida)


func esta_embistiendo() -> bool:
	return _activo and _movimiento == "embestida" and _estado == "activo"


func recibir(danio: int, desde: Vector3, _kata: String = "iai") -> void:
	if Partida.jefe_vencido or _vidas <= 0:
		return
	if not _activo:
		_esperar(get_tree().get_first_node_in_group("jugador") as Node3D)
	_vidas -= danio
	Efectos.chispa(global_position + Vector3(0, 1.3, 0))
	velocity.x = signf(global_position.x - desde.x) * 2.0
	Partida.jefe_cambio.emit(maxi(_vidas, 0), Reglas.VIDAS_JEFE)
	if _vidas <= 0:
		_vencer()


func elevar() -> void:
	velocity.y = 3.0


func _vencer() -> void:
	Partida.jefe_vencido = true
	Partida.guardar()
	remove_from_group("herible")
	_activo = false
	_onda_viva = false
	if _anillo:
		_anillo.visible = false
	velocity = Vector3.ZERO
	Sonido.suena("victoria")
	Partida.anuncio.emit("Kagemaru cae. El santuario queda en silencio y el kata, contigo.")
	Partida.jefe_cambio.emit(0, Reglas.VIDAS_JEFE)
	if _visual:
		var giro := create_tween()
		giro.tween_property(_visual, "rotation:z", 1.2, 0.45)
		giro.parallel().tween_property(_visual, "position:y", -0.2, 0.45)


func retirar() -> void:
	Partida.jefe_vencido = true
	remove_from_group("herible")
	_activo = false
	visible = false
	collision_layer = 0


func reiniciar() -> void:
	if Partida.jefe_vencido:
		return
	_vidas = Reglas.VIDAS_JEFE
	_activo = false
	_estado = "calma"
	var interfaz := get_tree().get_first_node_in_group("hud")
	if interfaz and interfaz.has_method("ver_jefe"):
		interfaz.ver_jefe(false)
	_reloj = 0.8
	_onda_viva = false
	_indice = 0
	if _anillo:
		_anillo.visible = false
	global_position = origen
	velocity = Vector3.ZERO
	if _visual:
		_visual.rotation = Vector3.ZERO
		_visual.position = Vector3.ZERO
	Partida.jefe_cambio.emit(_vidas, Reglas.VIDAS_JEFE)


func _posar() -> void:
	if _visual:
		_visual.rotation.y = 0.0 if mirando > 0.0 else PI
		if _estado == "prepara" and _movimiento == "barrido":
			_visual.scale = Vector3(1.48, 1.2, 1.48)
			_visual.position.y = 0.0
		elif _estado == "prepara" and _movimiento == "embestida":
			_visual.scale = Vector3.ONE * 1.48
			_visual.position.y = -0.15
		else:
			_visual.scale = Vector3.ONE * 1.48
			_visual.position.y = 0.0
	if _brillo == null:
		return
	if _estado != "prepara":
		_brillo.light_energy = 0.2 if _activo else 0.0
		return
	_brillo.light_energy = 1.8
	match _movimiento:
		"tajo":
			_brillo.light_color = Color(1.0, 0.45, 0.15)
		"barrido":
			_brillo.light_color = Color(1.0, 0.85, 0.3)
		"embestida":
			_brillo.light_color = Color(1.0, 0.18, 0.12)
		_:
			_brillo.light_color = Color(0.85, 0.9, 1.0)
