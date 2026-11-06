extends CharacterBody3D

var vida := 28
var vida_max := 28
var rapidez := 3.0
var mordisco := 8
var equipo := "tvresn"
var empuje_vel := Vector3.ZERO
var lento := 1.0
var lento_queda := 0.0
var boca := 0.0
var muerto := false
var mat_cuerpo: StandardMaterial3D
var color := Color.WHITE
var flash: Tween

signal cayo


func configurar(puntos: int, vel: float, dano: int, bando: String) -> void:
	vida_max = puntos
	vida = puntos
	rapidez = vel
	mordisco = dano
	equipo = bando


func _ready() -> void:
	add_to_group("foes")
	collision_layer = 4
	collision_mask = 1
	floor_snap_length = 0.2
	color = Color(0.86, 0.42, 0.16) if equipo == "tvresn" else Color(0.46, 0.3, 0.82)
	mat_cuerpo = StandardMaterial3D.new()
	mat_cuerpo.albedo_color = color
	mat_cuerpo.roughness = 0.74
	$Bob/Cuerpo.material_override = mat_cuerpo
	var cabeza := StandardMaterial3D.new()
	cabeza.albedo_color = color.lightened(0.2)
	cabeza.roughness = 0.7
	$Bob/Cabeza.material_override = cabeza
	var gorra := StandardMaterial3D.new()
	gorra.albedo_color = color.darkened(0.2)
	$Bob/Gorra.material_override = gorra
	_idle()
	_sombra()


func sufrir(cantidad: int, empuje: Vector3 = Vector3.ZERO, numero := true) -> void:
	if muerto or cantidad <= 0:
		if empuje.length() > 0.2 and not muerto:
			empuje_vel = empuje
		return
	vida -= cantidad
	empuje_vel = empuje
	_flash()
	if numero:
		_numero(cantidad)
	if vida <= 0:
		_morir()


func frenar(segundos: float, factor: float) -> void:
	if muerto:
		return
	lento = factor
	lento_queda = maxf(lento_queda, segundos)


func _physics_process(delta: float) -> void:
	if muerto:
		return
	boca = maxf(0.0, boca - delta)
	lento_queda = maxf(0.0, lento_queda - delta)
	if lento_queda <= 0.0:
		lento = 1.0
	if not is_on_floor():
		velocity.y -= 22.0 * delta
	else:
		velocity.y = 0.0
	if empuje_vel.length() > 0.35:
		velocity.x = empuje_vel.x
		velocity.z = empuje_vel.z
		empuje_vel = empuje_vel.lerp(Vector3.ZERO, 1.0 - exp(-9.0 * delta))
	else:
		empuje_vel = Vector3.ZERO
		var blanco := _blanco()
		var dir := Vector3.ZERO
		if blanco:
			dir = blanco.global_position - global_position
			dir.y = 0.0
			var dist := dir.length()
			if dist < 1.15 and boca <= 0.0 and blanco.has_method("sufrir"):
				boca = 0.85
				blanco.sufrir(mordisco)
			elif dist > 0.15:
				dir = dir.normalized()
			else:
				dir = Vector3.ZERO
		dir += _separar()
		if dir.length() > 1.0:
			dir = dir.normalized()
		velocity.x = dir.x * rapidez * lento
		velocity.z = dir.z * rapidez * lento
		if dir.length() > 0.2:
			look_at(global_position + Vector3(dir.x, 0, dir.z), Vector3.UP)
	move_and_slide()
	var plano := Vector2(global_position.x, global_position.z)
	if plano.length() > 10.2:
		plano = plano.normalized() * 10.2
		global_position.x = plano.x
		global_position.z = plano.y


func _blanco() -> Node:
	var mejor: Node = null
	var mejor_d := 1.0e9
	for grupo in ["player", "aliados"]:
		for nodo in get_tree().get_nodes_in_group(grupo):
			if not is_instance_valid(nodo) or not nodo.has_method("sufrir"):
				continue
			var puntos = nodo.get("vida")
			if puntos == null or int(puntos) <= 0:
				continue
			var dist := global_position.distance_to(nodo.global_position)
			if dist < mejor_d:
				mejor_d = dist
				mejor = nodo
	return mejor


func _separar() -> Vector3:
	var empuje := Vector3.ZERO
	for otro in get_tree().get_nodes_in_group("foes"):
		if otro == self or not is_instance_valid(otro):
			continue
		var lejos: Vector3 = global_position - otro.global_position
		lejos.y = 0.0
		var dist: float = lejos.length()
		if dist < 0.85 and dist > 0.001:
			empuje += lejos.normalized() * (0.85 - dist)
	return empuje


func _morir() -> void:
	if muerto:
		return
	muerto = true
	remove_from_group("foes")
	collision_layer = 0
	collision_mask = 0
	set_physics_process(false)
	cayo.emit()
	var tw := create_tween()
	tw.tween_property(self, "scale", Vector3(0.04, 0.04, 0.04), 0.22)
	tw.tween_callback(queue_free)


func _flash() -> void:
	if flash:
		flash.kill()
	mat_cuerpo.albedo_color = Color(1, 0.95, 0.85)
	flash = create_tween()
	flash.tween_property(mat_cuerpo, "albedo_color", color, 0.1)


func _numero(cantidad: int) -> void:
	var rotulo := Label3D.new()
	rotulo.text = str(cantidad)
	rotulo.font_size = 48
	rotulo.pixel_size = 0.01
	rotulo.modulate = Color(1, 0.92, 0.72)
	rotulo.outline_size = 8
	rotulo.outline_modulate = Color(0.05, 0.02, 0.04)
	rotulo.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	rotulo.no_depth_test = true
	get_tree().current_scene.add_child(rotulo)
	rotulo.global_position = global_position + Vector3(randf_range(-0.2, 0.2), 1.45, 0)
	var tw := rotulo.create_tween()
	tw.tween_property(rotulo, "global_position:y", rotulo.global_position.y + 0.7, 0.38)
	tw.parallel().tween_property(rotulo, "modulate:a", 0.0, 0.38)
	tw.tween_callback(rotulo.queue_free)


func _sombra() -> void:
	var disco := MeshInstance3D.new()
	var malla := CylinderMesh.new()
	malla.top_radius = 0.36
	malla.bottom_radius = 0.36
	malla.height = 0.02
	disco.mesh = malla
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0, 0, 0, 0.32)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	disco.material_override = mat
	disco.position = Vector3(0, 0.03, 0)
	disco.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(disco)


func _idle() -> void:
	var anim := Animation.new()
	anim.length = 0.64
	anim.loop_mode = Animation.LOOP_LINEAR
	var pista := anim.add_track(Animation.TYPE_VALUE)
	anim.track_set_path(pista, NodePath("Bob:position"))
	anim.track_insert_key(pista, 0.0, Vector3.ZERO)
	anim.track_insert_key(pista, 0.32, Vector3(0, 0.06, 0))
	anim.track_insert_key(pista, 0.64, Vector3.ZERO)
	anim.value_track_set_update_mode(pista, Animation.UPDATE_CONTINUOUS)
	var lib := AnimationLibrary.new()
	lib.add_animation("idle", anim)
	$AnimationPlayer.add_animation_library("cuerpo", lib)
	$AnimationPlayer.play("cuerpo/idle")
