class_name Jugador
extends CharacterBody3D

enum Fase { LIBRE, ATAQUE, DASH, KASUMI, HERIDO, MUERTO }

var fase := Fase.LIBRE
var mirando := 1
var fase_t := 0.0
var combo := 0

var _eje := 0.0
var _abajo := false
var _buffer_salto := 0.0
var _coyote := 0.0
var _saltos_extra := 0
var _salto_usado := false
var _orden_corte := false
var _orden_kata := false
var _orden_meditar := false
var _combo_tiempo := 0.0
var _combo_abre := 0.1
var _ataque_fin := 0.2
var _tipo := "corte"
var _danno := 1
var _ya := {}
var _pulsos := -1
var _iframes := 0.0
var _hitstop := 0.0
var _pogo := false
var _piel: StandardMaterial3D
var _base_piel: Color
var _flash := 0.0
var _muriendo := false

var filo: Area3D
var forma_filo: CollisionShape3D
var pivote: Node3D
var anim: AnimationPlayer
var malla: Node3D
var _caja_filo: BoxShape3D


func _ready() -> void:
	add_to_group("jugador")
	collision_layer = Datos.CAPA_JUGADOR
	collision_mask = Datos.CAPA_MUNDO
	floor_snap_length = 0.22
	floor_max_angle = deg_to_rad(52.0)
	floor_block_on_wall = false
	floor_constant_speed = true
	safe_margin = 0.08
	up_direction = Vector3.UP
	Arte.preparar()
	var forma := CollisionShape3D.new()
	var capsula := CapsuleShape3D.new()
	capsula.radius = 0.26
	capsula.height = 1.42
	forma.shape = capsula
	forma.position = Vector3(0, 0.71, 0)
	add_child(forma)
	malla = Node3D.new()
	malla.name = "Malla"
	add_child(malla)
	pivote = Node3D.new()
	pivote.name = "Pivote"
	malla.add_child(pivote)
	filo = Area3D.new()
	filo.name = "Filo"
	add_child(filo)
	forma_filo = CollisionShape3D.new()
	filo.add_child(forma_filo)
	anim = AnimationPlayer.new()
	anim.name = "Anim"
	add_child(anim)
	_registrar_input()
	_crear_malla()
	_crear_filo()
	_crear_anim()


func colocar(pos: Vector3) -> void:
	global_position = pos
	velocity = Vector3.ZERO
	fase = Fase.LIBRE
	_muriendo = false
	_hitstop = 0.0


func recibir_golpe(desde: Vector3, cantidad: int = 1) -> void:
	if fase == Fase.MUERTO or _muriendo or Estado.en_santuario:
		return
	if _iframes > 0.0 or Estado.inmune:
		return
	Estado.herir(cantidad)
	_iframes = 0.65
	fase = Fase.HERIDO
	fase_t = 0.0
	_cerrar_logica()
	var signo := signf(global_position.x - desde.x)
	if signo == 0.0:
		signo = -float(mirando)
	velocity = Vector3(signo * 8.0, 6.2, 0.0)
	_flash = 0.12
	AudioJuego.tono("herida")
	get_tree().call_group("camara", "sacudir", 0.7)
	if Estado.salud <= 0:
		_morir()


func rebotar() -> void:
	if _pogo:
		return
	_pogo = true
	velocity.y = Datos.SALTO_V * 0.92


func _registrar_input() -> void:
	_accion("mover_izq", [KEY_A, KEY_LEFT])
	_accion("mover_der", [KEY_D, KEY_RIGHT])
	_accion("saltar", [KEY_SPACE, KEY_W])
	_accion("cortar", [KEY_J])
	_accion("kata", [KEY_K])
	_accion("abajo", [KEY_S, KEY_DOWN])
	_accion("meditar", [KEY_E, KEY_UP])


func _accion(nombre: String, teclas: Array[Key]) -> void:
	if not InputMap.has_action(nombre):
		InputMap.add_action(nombre, 0.2)
	for codigo in teclas:
		var ev := InputEventKey.new()
		ev.physical_keycode = codigo as Key
		InputMap.action_add_event(nombre, ev)


func _physics_process(delta: float) -> void:
	if _hitstop > 0.0:
		_hitstop = maxf(0.0, _hitstop - delta)
		return
	_leer()
	if _muriendo:
		return
	if Estado.en_santuario:
		velocity.x = move_toward(velocity.x, 0.0, 90.0 * delta)
		velocity.y -= Datos.GRAVEDAD * delta
		move_and_slide()
		global_position.z = 0.0
		return
	fase_t += delta
	_iframes = maxf(0.0, _iframes - delta)
	_combo_tiempo = maxf(0.0, _combo_tiempo - delta)
	_buffer_salto = maxf(0.0, _buffer_salto - delta)
	if is_on_floor():
		_coyote = 0.1
		_salto_usado = false
		_saltos_extra = 1 if Estado.tiene("fujin") else 0
	else:
		_coyote = maxf(0.0, _coyote - delta)
	if _orden_corte:
		_intentar_corte()
	if _orden_kata:
		_intentar_kata()
	if _orden_meditar:
		_meditar()
	_aplicar_fase(delta)
	if _buffer_salto > 0.0:
		_intentar_salto()
	if fase != Fase.DASH and not is_on_floor() and velocity.y > 0.0 and not _salto_pulsado():
		velocity.y *= 0.55
	move_and_slide()
	global_position.z = 0.0
	if global_position.y < -11.0 and not Estado.inmune:
		_morir()
	_filo_tick()
	_visual(delta)
	_orden_corte = false
	_orden_kata = false
	_orden_meditar = false


func _leer() -> void:
	var teclado := Input.get_axis("mover_izq", "mover_der")
	if absf(Estado.eje_virtual) > 0.12:
		_eje = Estado.eje_virtual
	else:
		_eje = teclado
	_abajo = Input.is_action_pressed("abajo") or Estado.abajo_virtual
	if _eje != 0.0 and fase != Fase.DASH and fase != Fase.HERIDO:
		mirando = 1 if _eje > 0.0 else -1
	if Input.is_action_just_pressed("saltar") or Estado.pulso_salto:
		_buffer_salto = 0.12
		Estado.tocado = true
	if Input.is_action_just_pressed("cortar") or Estado.pulso_corte:
		_orden_corte = true
		Estado.tocado = true
	if Input.is_action_just_pressed("kata") or Estado.pulso_kata:
		_orden_kata = true
		Estado.tocado = true
	if Input.is_action_just_pressed("meditar") or Estado.pulso_meditar:
		_orden_meditar = true
		Estado.tocado = true
	if absf(_eje) > 0.2:
		Estado.tocado = true
	Estado.pulso_salto = false
	Estado.pulso_corte = false
	Estado.pulso_kata = false
	Estado.pulso_meditar = false


func _salto_pulsado() -> bool:
	return Input.is_action_pressed("saltar") or Estado.salto_mantenido


func _aplicar_fase(delta: float) -> void:
	match fase:
		Fase.LIBRE:
			_desplazar(_eje, delta)
			velocity.y -= Datos.GRAVEDAD * delta
		Fase.ATAQUE:
			_desplazar(_eje * 0.45, delta)
			velocity.y -= Datos.GRAVEDAD * delta
			if fase_t >= _ataque_fin:
				fase = Fase.LIBRE
		Fase.KASUMI:
			_desplazar(_eje * 0.25, delta)
			velocity.y -= Datos.GRAVEDAD * delta
			if fase_t >= _ataque_fin:
				fase = Fase.LIBRE
		Fase.DASH:
			velocity.x = float(mirando) * Datos.DASH
			velocity.y -= Datos.GRAVEDAD * 0.3 * delta
			if fase_t >= Datos.tiempo_dash():
				fase = Fase.LIBRE
		Fase.HERIDO:
			velocity.y -= Datos.GRAVEDAD * delta
			if fase_t >= 0.24:
				fase = Fase.LIBRE
		Fase.MUERTO:
			velocity = Vector3.ZERO
	if is_on_floor() and velocity.y < 0.0 and fase != Fase.DASH:
		velocity.y = -0.04


func _desplazar(valor: float, delta: float) -> void:
	var meta := valor * Datos.vel_correr()
	if is_on_floor():
		velocity.x = move_toward(velocity.x, meta, Datos.vel_correr() * 9.0 * delta)
	else:
		var tope := Datos.aire_max()
		var meta_aire := clampf(meta, -tope, tope)
		velocity.x = move_toward(velocity.x, meta_aire, Datos.FRENADO_AIRE * delta)


func _intentar_salto() -> void:
	if fase == Fase.DASH or fase == Fase.HERIDO or fase == Fase.MUERTO or fase == Fase.KASUMI:
		return
	if (is_on_floor() or _coyote > 0.0) and not _salto_usado:
		velocity.y = Datos.SALTO_V
		_salto_usado = true
		_coyote = 0.0
		_buffer_salto = 0.0
		AudioJuego.tono("salto")
		return
	if _saltos_extra > 0 and Estado.tiene("fujin") and not is_on_floor():
		velocity.y = Datos.SALTO2_V
		_saltos_extra = 0
		_salto_usado = true
		_buffer_salto = 0.0
		AudioJuego.tono("salto")


func _intentar_corte() -> void:
	if fase == Fase.DASH or fase == Fase.HERIDO or fase == Fase.MUERTO or fase == Fase.KASUMI:
		return
	if not is_on_floor() and _abajo and Estado.tiene("kesa"):
		_empezar_kesa()
		return
	if fase == Fase.ATAQUE and fase_t < _combo_abre:
		return
	if _combo_tiempo <= 0.0:
		combo = 1
	else:
		combo = combo % 3 + 1
	_combo_tiempo = 0.36
	var dano := 1 + Datos.bonus() + (1 if combo == 3 else 0)
	_empezar_ataque("corte", 0.18, dano)
	if anim.has_animation("santoku/corte_%d" % combo):
		anim.play("santoku/corte_%d" % combo)
		anim.speed_scale = 1.0 / Datos.factor_ataque()


func _intentar_kata() -> void:
	if fase == Fase.HERIDO or fase == Fase.MUERTO or fase == Fase.DASH or fase == Fase.KASUMI:
		return
	if not is_on_floor() and _abajo and Estado.tiene("kesa"):
		_empezar_kesa()
		return
	if is_on_floor() and absf(_eje) < 0.25 and Estado.tiene("kasumi"):
		_empezar_kasumi()
		return
	if Estado.tiene("iai"):
		_empezar_iai()
		return
	if not is_on_floor() and Estado.tiene("kesa"):
		_empezar_kesa()


func _empezar_ataque(tipo: String, dur: float, dano: int) -> void:
	fase = Fase.ATAQUE
	fase_t = 0.0
	var escala := Datos.factor_ataque()
	_ataque_fin = dur * escala
	_combo_abre = 0.1 * escala
	_tipo = tipo
	_danno = dano
	_ya.clear()
	_pogo = false
	AudioJuego.tono("corte")


func _empezar_kesa() -> void:
	_empezar_ataque("kesa", 0.5, 2 + Datos.bonus())
	velocity.y = -16.0
	if anim.has_animation("santoku/kesa"):
		anim.play("santoku/kesa")


func _empezar_kasumi() -> void:
	fase = Fase.KASUMI
	fase_t = 0.0
	_ataque_fin = 0.58 * Datos.factor_ataque()
	_tipo = "kasumi"
	_danno = 1 + Datos.bonus()
	_pulsos = -1
	_ya.clear()
	_pogo = false
	AudioJuego.tono("corte")
	if anim.has_animation("santoku/kasumi"):
		anim.play("santoku/kasumi")


func _empezar_iai() -> void:
	if absf(_eje) > 0.2:
		mirando = 1 if _eje > 0.0 else -1
	fase = Fase.DASH
	fase_t = 0.0
	_tipo = "iai"
	_danno = 2 + Datos.bonus()
	_ya.clear()
	_pogo = false
	if is_on_floor():
		velocity.y = 5.0
	elif velocity.y < 0.0:
		velocity.y = 0.8
	AudioJuego.tono("dash")
	if anim.has_animation("santoku/iai"):
		anim.play("santoku/iai")


func _filo_activo() -> bool:
	if fase == Fase.ATAQUE and _tipo == "kesa":
		return fase_t >= 0.03 and fase_t < _ataque_fin and not _pogo
	if fase == Fase.DASH and _tipo == "iai":
		return fase_t >= 0.04 and fase_t <= Datos.tiempo_dash()
	if fase == Fase.KASUMI:
		if fase_t >= _ataque_fin:
			return false
		var pulso := int(fase_t / 0.1)
		if pulso != _pulsos and pulso < 5:
			_pulsos = pulso
			_ya.clear()
		var ventana := fmod(fase_t, 0.1)
		return pulso < 5 and ventana < 0.06
	if fase == Fase.ATAQUE:
		var escala := Datos.factor_ataque()
		return fase_t >= 0.05 * escala and fase_t <= 0.14 * escala
	return false


func _filo_tick() -> void:
	if _tipo == "kesa":
		filo.position = Vector3(0.15 * mirando, 0.05, 0.0)
		_caja_filo.size = Vector3(0.9, 1.05, 0.8)
	else:
		filo.position = Vector3(0.9 * mirando, 0.95, 0.0)
		_caja_filo.size = Vector3(1.15, 0.5, 0.75)
	if not _filo_activo():
		return
	var tocados: Array[Node] = []
	for cuerpo in filo.get_overlapping_bodies():
		if cuerpo is Node:
			tocados.append(cuerpo)
	for nodo in get_tree().get_nodes_in_group("obstaculo"):
		if not nodo is Obstaculo:
			continue
		var obs := nodo as Obstaculo
		var dx := absf(global_position.x - obs.global_position.x)
		var dy := global_position.y - obs.global_position.y
		var cerca := false
		if _tipo == "kesa" and obs.clase == "grieta":
			cerca = dx < 1.45 and dy > -0.6 and dy < 2.4
		elif _tipo == "iai" and obs.clase == "puerta":
			cerca = dx < 1.7 and absf(dy) < 2.6
		elif _tipo == "kasumi" and obs.clase == "sello":
			cerca = dx < 1.9 and absf(dy) < 3.0
		if cerca:
			tocados.append(obs)
	for cuerpo in tocados:
		var id := cuerpo.get_instance_id()
		if _ya.has(id):
			continue
		if not cuerpo.has_method("recibir"):
			continue
		_ya[id] = true
		cuerpo.recibir(_danno, _tipo, global_position.x)
		_hitstop = 0.03
		Arte.chispa(filo.global_position, Color("ffd2a8"))
		get_tree().call_group("camara", "sacudir", 0.35)
		if _tipo == "kesa":
			rebotar()


func _cerrar_logica() -> void:
	_ya.clear()


func _meditar() -> void:
	var mejor: Node = null
	var mejor_d := 1.8
	for nodo in get_tree().get_nodes_in_group("interaccion"):
		var d := global_position.distance_to(nodo.global_position)
		if d < mejor_d:
			mejor_d = d
			mejor = nodo
	if mejor and mejor.has_method("activar"):
		mejor.activar()


func _morir() -> void:
	if _muriendo:
		return
	_muriendo = true
	fase = Fase.MUERTO
	Estado.salud = 0
	Estado.cambio.emit()
	AudioJuego.tono("caida")
	await get_tree().create_timer(0.55).timeout
	if not is_inside_tree():
		return
	Estado.reintento.emit()
	var destino := Estado.punto()
	colocar(destino)
	Estado.salud = Estado.salud_guardada
	Estado.cambio.emit()
	_iframes = 1.15
	_muriendo = false


func _visual(delta: float) -> void:
	malla.rotation.y = 0.0 if mirando > 0 else PI
	if _flash > 0.0:
		_flash -= delta
		if _piel:
			_piel.albedo_color = Color("ffe0d0")
	elif _piel:
		_piel.albedo_color = _base_piel
	if anim.is_playing():
		return
	var meta := 0.2 if fase == Fase.LIBRE and absf(velocity.x) > 1.0 and is_on_floor() else 0.05
	var bob := sin(Time.get_ticks_msec() * 0.012) * 0.08 if absf(velocity.x) > 1.0 and is_on_floor() else 0.0
	pivote.rotation.z = lerpf(pivote.rotation.z, meta + bob, 1.0 - exp(-10.0 * delta))


func _crear_malla() -> void:
	_piel = Arte.copia(Arte.tela)
	_base_piel = _piel.albedo_color
	var hakama := Arte.caja(Vector3(0.52, 0.62, 0.38), Arte.hakama)
	hakama.position = Vector3(0, 0.42, 0)
	malla.add_child(hakama)
	var torso := Arte.caja(Vector3(0.42, 0.42, 0.3), _piel)
	torso.position = Vector3(0, 0.95, 0)
	malla.add_child(torso)
	var faja := Arte.caja(Vector3(0.46, 0.1, 0.32), Arte.cinabrio)
	faja.position = Vector3(0, 0.78, 0)
	malla.add_child(faja)
	var cabeza := Arte.esfera(0.16, Arte.piel)
	cabeza.position = Vector3(0, 1.32, 0)
	malla.add_child(cabeza)
	var moño := Arte.esfera(0.07, Arte.hakama)
	moño.position = Vector3(0, 1.5, -0.02)
	malla.add_child(moño)
	var hoja := Arte.caja(Vector3(0.08, 0.92, 0.03), Arte.hoja)
	hoja.position = Vector3(0.42, 0.15, 0)
	pivote.add_child(hoja)
	var tsuka := Arte.caja(Vector3(0.07, 0.22, 0.05), Arte.madera_osc)
	tsuka.position = Vector3(0.42, -0.38, 0)
	pivote.add_child(tsuka)
	pivote.position = Vector3(0, 0.95, 0)


func _crear_filo() -> void:
	_caja_filo = BoxShape3D.new()
	_caja_filo.size = Vector3(1.1, 0.45, 0.7)
	forma_filo.shape = _caja_filo
	filo.collision_layer = Datos.CAPA_FILO
	filo.collision_mask = Datos.MASCARA_FILO
	filo.monitoring = true
	filo.monitorable = false


func _crear_anim() -> void:
	var lib := AnimationLibrary.new()
	lib.add_animation("corte_1", _anim_giro(0.18, 0.8, -1.35))
	lib.add_animation("corte_2", _anim_giro(0.18, -0.7, 1.25))
	lib.add_animation("corte_3", _anim_giro(0.2, 1.2, -1.6))
	lib.add_animation("kesa", _anim_giro(0.26, 1.4, -1.8))
	lib.add_animation("iai", _anim_giro(0.2, 0.4, -0.2))
	lib.add_animation("kasumi", _anim_giro(0.5, 0.6, -0.8))
	anim.add_animation_library("santoku", lib)


func _anim_giro(dur: float, desde: float, hasta: float) -> Animation:
	var animacion := Animation.new()
	animacion.length = dur
	var pista := animacion.add_track(Animation.TYPE_ROTATION_3D)
	animacion.track_set_path(pista, NodePath("Malla/Pivote"))
	animacion.rotation_track_insert_key(pista, 0.0, Quaternion.from_euler(Vector3(0, 0, desde)))
	animacion.rotation_track_insert_key(pista, dur * 0.45, Quaternion.from_euler(Vector3(0, 0, hasta)))
	animacion.rotation_track_insert_key(pista, dur, Quaternion.from_euler(Vector3(0, 0, 0.15)))
	return animacion
