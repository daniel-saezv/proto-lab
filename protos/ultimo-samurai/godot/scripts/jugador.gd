extends CharacterBody3D

const COYOTE := 0.12
const BUFFER := 0.12

var mirando := 1.0
var vivo := true
var _coyote := 0.0
var _buffer := 0.0
var _atacando := false
var _tiempo := 0.0
var _paso := 0
var _encadenar := false
var _golpe_dado := false
var _ya: Dictionary = {}
var _iframes := 0.0
var _dash := 0.0
var _frio_kata := 0.0
var _dash_ya: Dictionary = {}
var _bob := 0.0
var _cerca := false
var _ignorar_salto := 0.0
var _visual: Node3D
var _arma: Node3D
var _corte: MeshInstance3D
var _brillo: OmniLight3D
var _hud: Node


func _ready() -> void:
	collision_layer = Reglas.CAPA_JUGADOR
	collision_mask = Reglas.CAPA_MUNDO | Reglas.CAPA_SELLO
	_visual = Figuras.personaje({"cresta": true, "escala": 0.72})
	add_child(_visual)
	_arma = _visual.get_node_or_null("Arma")
	_corte = _visual.get_node_or_null("Corte")
	_brillo = _visual.get_node_or_null("Brillo")
	floor_snap_length = 0.05
	add_to_group("jugador")
	if Partida.control == Reglas.SPAWN:
		Partida.control = global_position


func _unhandled_input(event: InputEvent) -> void:
	if not event.pressed:
		return
	if event is InputEventKey or event is InputEventScreenTouch or event is InputEventJoypadButton:
		Sonido.marcar_gesto()


func _physics_process(delta: float) -> void:
	_frio_kata = maxf(_frio_kata - delta, 0.0)
	_iframes = maxf(_iframes - delta, 0.0)
	_ignorar_salto = maxf(_ignorar_salto - delta, 0.0)
	if not vivo or Partida.pausa:
		velocity.x = 0.0
		return
	if _dash > 0.0:
		_seguir_dash(delta)
		return
	if not is_on_floor():
		velocity.y -= Reglas.GRAVEDAD * delta
		_coyote = maxf(_coyote - delta, 0.0)
	else:
		_coyote = COYOTE
		if velocity.y < 0.0:
			velocity.y = 0.0
	var eje := Input.get_axis("mover_izquierda", "mover_derecha")
	var tactil := _eje_tactil()
	if absf(tactil) > absf(eje):
		eje = tactil
	if _atacando and is_on_floor():
		eje *= 0.35
	if absf(eje) > 0.12:
		mirando = signf(eje)
		velocity.x = move_toward(velocity.x, eje * Reglas.VELOCIDAD, 64.0 * delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 72.0 * delta)
	if _quiere_saltar():
		_buffer = BUFFER
	else:
		_buffer = maxf(_buffer - delta, 0.0)
	if _buffer > 0.0 and _coyote > 0.0 and _ignorar_salto <= 0.0:
		velocity.y = Reglas.SALTO
		_buffer = 0.0
		_coyote = 0.0
		Sonido.suena("salto")
	move_and_slide()
	global_position.z = 0.0
	_combate(delta)
	_santuario()
	if global_position.y < Partida.control.y - 12.0:
		global_position = Partida.control
		velocity = Vector3.ZERO
		recibir(1, global_position, false)
		velocity = Vector3.ZERO


func _process(delta: float) -> void:
	if _visual == null:
		return
	var corre := absf(velocity.x) > 1.2 and is_on_floor() and _dash <= 0.0
	_bob += delta * (9.0 if corre else 2.6)
	_visual.position.y = sin(_bob) * (0.045 if corre else 0.02)
	_visual.rotation.y = 0.0 if mirando > 0.0 else PI
	if _arma and _atacando:
		var duracion := 0.4 if _paso == 1 else 0.34
		var arco := sin(clampf(_tiempo / duracion, 0.0, 1.0) * PI)
		_arma.rotation.z = -arco * (1.35 if _paso == 1 else 1.05)
	elif _arma and _dash <= 0.0:
		_arma.rotation.z = 0.0
	if _corte:
		_corte.visible = _atacando or _dash > 0.0
		_corte.rotation.z = _arma.rotation.z if _arma else 0.0
		_corte.scale = Vector3(1.25, 1.0, 1.0) if _dash > 0.0 else Vector3.ONE
	if _brillo:
		_brillo.light_energy = 1.3 if _iframes > 0.0 and int(_iframes * 18.0) % 2 == 0 else 0.15 if _dash > 0.0 else 0.0


func recibir(cantidad: int, desde: Vector3, embestida: bool) -> void:
	if not vivo or Partida.pausa:
		return
	if _dash > 0.0 and (embestida or cantidad <= 1 and not _es_jefe(desde)):
		return
	if _iframes > 0.0:
		return
	Sonido.suena("dano")
	Efectos.chispa(global_position + Vector3(0, 1.0, 0))
	var lado := signf(global_position.x - desde.x)
	if lado == 0.0:
		lado = -mirando
	velocity.x = lado * (8.0 if embestida else 5.0)
	velocity.y = 3.5
	if Partida.herir(cantidad):
		_morir()
		return
	_iframes = 0.75


func _es_jefe(desde: Vector3) -> bool:
	for nodo in get_tree().get_nodes_in_group("jefe"):
		if nodo is Node3D and nodo.global_position.distance_to(desde) < 1.2:
			return true
	return false


func _seguir_dash(delta: float) -> void:
	_dash = maxf(_dash - delta, 0.0)
	velocity.x = mirando * Reglas.DASH_VELOCIDAD
	velocity.y = 0.0
	collision_mask = Reglas.CAPA_MUNDO
	move_and_slide()
	global_position.z = 0.0
	_barrer_dash()
	if _dash <= 0.0:
		collision_mask = Reglas.CAPA_MUNDO | Reglas.CAPA_SELLO
		velocity.x = mirando * 2.0


func _barrer_dash() -> void:
	for nodo in get_tree().get_nodes_in_group("herible"):
		if _dash_ya.has(nodo):
			continue
		if not _alcanza(nodo, 1.25, 1.15, true):
			continue
		_dash_ya[nodo] = true
		var contra := nodo.has_method("esta_embistiendo") and bool(nodo.esta_embistiendo())
		nodo.recibir(Reglas.danio("tatsumaki", contra), global_position, "contra" if contra else "tatsumaki")
		Sonido.suena("golpe")
		Efectos.chispa(nodo.global_position + Vector3(0, 1.1, 0))
	for sello in get_tree().get_nodes_in_group("sello"):
		if not sello is Node3D or not sello.has_method("romper"):
			continue
		if absf((sello as Node3D).global_position.x - global_position.x) > 1.15:
			continue
		sello.romper()


func _combate(delta: float) -> void:
	if _quiere_kata():
		_empezar_dash()
	if not _atacando:
		if _quiere_ataque():
			_empezar_corte(0)
		return
	_tiempo += delta
	var duracion := 0.42 if _paso == 1 else 0.34
	var inicio := 0.08
	var fin := 0.24 if _paso == 1 else 0.18
	if not _golpe_dado and _tiempo >= inicio and _tiempo <= fin:
		_golpe_dado = true
		var kesa := _paso == 1 and Partida.tiene_kesa
		var kata := "kesa" if kesa else "iai"
		_golpe(1.45 if kesa else 1.2, 1.15, kata)
	if _tiempo > duracion * 0.42 and _tiempo < duracion:
		if _quiere_ataque():
			_encadenar = true
	if _tiempo >= duracion:
		if _paso == 0 and _encadenar:
			_empezar_corte(1)
		else:
			_atacando = false
			if _corte:
				_corte.visible = false


func _empezar_corte(paso: int) -> void:
	_atacando = true
	_paso = paso
	_tiempo = 0.0
	_golpe_dado = false
	_encadenar = false
	_ya.clear()
	Sonido.suena("kata" if paso == 1 and Partida.tiene_kesa else "corte")
	if paso == 0:
		Partida.pista("corte", "El iai es corto. Encadena otro toque para el segundo corte.")


func _empezar_dash() -> void:
	if not Partida.tiene_tatsumaki or _frio_kata > 0.0 or _dash > 0.0:
		return
	_dash = Reglas.DASH_TIEMPO
	_frio_kata = 0.95
	_dash_ya.clear()
	_atacando = false
	Sonido.suena("kata")
	Partida.pista("viento", "Tatsumaki atraviesa el sello y la embestida del general.")


func _golpe(alcance: float, alto: float, kata: String) -> void:
	for nodo in get_tree().get_nodes_in_group("herible"):
		if _ya.has(nodo):
			continue
		if not _alcanza(nodo, alcance, alto, false):
			continue
		_ya[nodo] = true
		nodo.recibir(Reglas.danio(kata, false), global_position, kata)
		Sonido.suena("golpe")
		Efectos.chispa(nodo.global_position + Vector3(0, 1.05, 0))
		if kata == "kesa" and nodo.has_method("elevar"):
			nodo.elevar()


func _alcanza(nodo: Node, alcance: float, alto: float, alrededor: bool) -> bool:
	if not nodo is Node3D:
		return false
	var destino := (nodo as Node3D).global_position
	var delta := destino - global_position
	if absf(delta.y) > alto:
		return false
	if alrededor:
		return absf(delta.x) <= alcance and absf(delta.z) <= 1.4
	if delta.x * mirando < -0.2:
		return false
	return absf(delta.x) <= alcance and absf(delta.z) <= 1.3


func _morir() -> void:
	vivo = false
	velocity = Vector3.ZERO
	collision_mask = Reglas.CAPA_MUNDO
	var giro := create_tween()
	giro.tween_property(_visual, "rotation:z", mirando * 1.15, 0.28)
	giro.tween_interval(0.55)
	giro.tween_callback(_reaparecer)


func _reaparecer() -> void:
	Partida.curar(false)
	global_position = Partida.control
	velocity = Vector3.ZERO
	vivo = true
	_iframes = 1.1
	_dash = 0.0
	_atacando = false
	collision_mask = Reglas.CAPA_MUNDO | Reglas.CAPA_SELLO
	if _visual:
		_visual.rotation = Vector3.ZERO
	get_tree().call_group("reiniciable", "reiniciar")


func _santuario() -> void:
	if not Partida.sello_roto and not Partida.tiene_tatsumaki and global_position.y > 4.0:
		for sello in get_tree().get_nodes_in_group("sello"):
			if sello is Node3D and absf(global_position.x - (sello as Node3D).global_position.x) < 2.2:
				Partida.pista("sello", "Un sello cierra el paso. En el santuario puedes grabar el Tatsumaki.")
				break
	var cerca := absf(global_position.y - Partida.punto_santuario.y) < 0.85 \
		and absf(global_position.x - Partida.punto_santuario.x) < 2.35 \
		and is_on_floor()
	if cerca != _cerca:
		_cerca = cerca
		var interfaz := _interfaz()
		if interfaz and interfaz.has_method("mostrar_meditar"):
			interfaz.mostrar_meditar(cerca)
	if not cerca or Partida.pausa:
		return
	if Input.is_action_just_pressed("meditar") or _pulso("consumir_meditar"):
		var interfaz := _interfaz()
		if interfaz and interfaz.has_method("abrir_santuario"):
			_ignorar_salto = 0.2
			interfaz.abrir_santuario()


func _quiere_saltar() -> bool:
	return Input.is_action_just_pressed("saltar") or _pulso("consumir_salto")


func _quiere_ataque() -> bool:
	return Input.is_action_just_pressed("atacar") or _pulso("consumir_ataque")


func _quiere_kata() -> bool:
	return Input.is_action_just_pressed("kata") or _pulso("consumir_kata")


func _pulso(metodo: String) -> bool:
	var interfaz := _interfaz()
	if interfaz and interfaz.has_method(metodo):
		return bool(interfaz.call(metodo))
	return false


func _eje_tactil() -> float:
	var interfaz := _interfaz()
	if interfaz and "eje_x" in interfaz:
		return float(interfaz.eje_x)
	return 0.0


func _interfaz() -> Node:
	if _hud == null or not is_instance_valid(_hud):
		_hud = get_tree().get_first_node_in_group("hud")
	return _hud
