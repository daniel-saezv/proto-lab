extends CharacterBody3D

var juego: Node
var congelado := false
var tiene_destino := false
var destino := Vector3.ZERO
var mirada := Vector3(0, 0, 1)
var enfriamiento := 0.0
var _atasco := 0.0
var _mat_cuerpo: StandardMaterial3D
var _color_cuerpo: Color


func _ready() -> void:
	add_to_group("jugador")
	var visual := $Visual/Bob as Node3D
	var partes := Mallas.goblin(visual, false)
	var cuerpo: MeshInstance3D = partes["cuerpo"]
	_mat_cuerpo = (cuerpo.material_override as StandardMaterial3D).duplicate()
	cuerpo.material_override = _mat_cuerpo
	_color_cuerpo = _mat_cuerpo.albedo_color
	var bob := create_tween().set_loops()
	bob.tween_property(visual, "position:y", -0.42, 0.48).set_trans(Tween.TRANS_SINE)
	bob.tween_property(visual, "position:y", -0.55, 0.48).set_trans(Tween.TRANS_SINE)


func _physics_process(delta: float) -> void:
	if enfriamiento > 0.0:
		enfriamiento -= delta
	if not is_on_floor():
		velocity.y -= 24.0 * delta
	else:
		velocity.y = -1.0
	var dir := Vector3.ZERO
	if congelado:
		tiene_destino = false
	else:
		dir = _entrada()
	if dir.length() > 0.1:
		dir = dir.normalized()
		mirada = dir
		rotation.y = atan2(dir.x, dir.z)
		var rapidez := float(juego.velocidad) if juego != null else 4.3
		velocity.x = dir.x * rapidez
		velocity.z = dir.z * rapidez
	else:
		velocity.x = move_toward(velocity.x, 0.0, 18.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 18.0 * delta)
	var antes := global_position
	move_and_slide()
	if tiene_destino and antes.distance_to(global_position) < 0.02:
		_atasco += delta
		if _atasco > 0.4:
			tiene_destino = false
	else:
		_atasco = 0.0


func puede_golpear() -> bool:
	return enfriamiento <= 0.0 and not congelado


func animar_golpe() -> void:
	enfriamiento = float(juego.cadencia) if juego != null else 0.48
	var visual := $Visual as Node3D
	var salto := create_tween()
	salto.tween_property(visual, "position", Vector3(0, 0, 0.35), 0.08)
	salto.tween_property(visual, "position", Vector3.ZERO, 0.12)


func en_arco(objetivo: Node3D) -> bool:
	var hacia := objetivo.global_position - global_position
	hacia.y = 0.0
	if hacia.length() > 1.75:
		return false
	if hacia.length() < 0.25:
		return true
	return hacia.normalized().dot(mirada) > 0.12


func flash() -> void:
	if _mat_cuerpo == null:
		return
	_mat_cuerpo.albedo_color = Color("ffb1a1")
	var vuelta := create_tween()
	vuelta.tween_property(_mat_cuerpo, "albedo_color", _color_cuerpo, 0.28)


func _entrada() -> Vector3:
	var manual := Vector2.ZERO
	if juego != null and juego.hud != null:
		manual = juego.hud.direccion
	var teclas := _teclado()
	if manual.length() < 0.12:
		manual = teclas
	if manual.length() > 0.12:
		tiene_destino = false
		if manual.length() > 1.0:
			manual = manual.normalized()
		return _desde_camara(manual)
	if tiene_destino:
		var resto := destino - global_position
		resto.y = 0.0
		if resto.length() < 0.25:
			tiene_destino = false
			return Vector3.ZERO
		return resto
	return Vector3.ZERO


func _teclado() -> Vector2:
	var v := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		v.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		v.x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		v.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		v.y += 1.0
	return v


func _desde_camara(joy: Vector2) -> Vector3:
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return Vector3(joy.x, 0, joy.y)
	var adelante := -cam.global_transform.basis.z
	adelante.y = 0.0
	adelante = adelante.normalized()
	var derecha := cam.global_transform.basis.x
	derecha.y = 0.0
	derecha = derecha.normalized()
	return derecha * joy.x + adelante * -joy.y
