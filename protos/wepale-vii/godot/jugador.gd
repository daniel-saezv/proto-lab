extends CharacterBody3D

const ESCENA_TIRO := preload("res://tiro.tscn")
const ESCENA_CHARCO := preload("res://charco.tscn")
const ESCENA_INVITADO := preload("res://invitado.tscn")
const MASCARA_RIVALES := 4

var orden := Vector3.ZERO
var aim := Vector3(0, 0, -1)
var vida := 1
var vida_max := 1
var rapidez := 5.0
var prisa := 1.0
var prisa_queda := 0.0
var invulnerable := 0.0
var envite_queda := 0.0
var envite_dir := Vector3.ZERO
var envite_dano := 0
var envite_empuje := 0.0
var envite_tocados := {}
var cds := {}
var duraciones := {}
var oficio: Dictionary = {}
var color := Color.WHITE
var mat_cuerpo: StandardMaterial3D
var mat_cabeza: StandardMaterial3D
var mat_arma: StandardMaterial3D
var golpe_malla: MeshInstance3D
var golpe_queda := 0.0
var flash: Tween

signal muere
signal sacude(fuerza: float)
signal cambio


func _ready() -> void:
	add_to_group("player")
	floor_snap_length = 0.2
	mat_cuerpo = _material(Color(0.85, 0.85, 0.85))
	mat_cabeza = _material(Color(0.92, 0.92, 0.92))
	mat_arma = _material(Color(0.95, 0.9, 0.75))
	$Bob/Cuerpo.material_override = mat_cuerpo
	$Bob/Cabeza.material_override = mat_cabeza
	$Bob/Arma.material_override = mat_arma
	_idle($AnimationPlayer, NodePath("Bob:position"))
	_sombra()


func preparar(datos: Dictionary) -> void:
	oficio = datos
	color = datos["color"]
	vida_max = int(datos["vida"])
	vida = vida_max
	rapidez = float(datos["velocidad"])
	mat_cuerpo.albedo_color = color
	mat_cabeza.albedo_color = color.lightened(0.32)
	mat_arma.albedo_color = color.lightened(0.12)
	_poner_arma(str(datos["id"]))
	_registrar(datos["ataque"])
	for hab in datos["habilidades"]:
		_registrar(hab)
	cambio.emit()


func intentar(slot: String) -> void:
	if vida <= 0 or oficio.is_empty():
		return
	var hab: Dictionary = {}
	if slot == "ataque":
		hab = oficio["ataque"]
	else:
		var indice := slot.to_int()
		var lista: Array = oficio["habilidades"]
		if indice < 0 or indice >= lista.size():
			return
		hab = lista[indice]
	var id := str(hab["id"])
	if float(cds.get(id, 0.0)) > 0.0:
		return
	if not _ejecutar(hab):
		return
	cds[id] = float(hab["cd"])
	_sonar("golpe" if slot == "ataque" else "habilidad")
	sacude.emit(0.28 if slot == "ataque" else 0.85)
	cambio.emit()


func fraccion(id: String) -> float:
	var total := float(duraciones.get(id, 0.0))
	if total <= 0.0:
		return 0.0
	return clampf(float(cds.get(id, 0.0)) / total, 0.0, 1.0)


func segundos(id: String) -> float:
	return float(cds.get(id, 0.0))


func sufrir(cantidad: int) -> void:
	if vida <= 0 or invulnerable > 0.0 or cantidad <= 0:
		return
	vida -= cantidad
	invulnerable = 0.42
	_flash(mat_cuerpo, color)
	_sonar("herida")
	sacude.emit(1.15)
	cambio.emit()
	if vida <= 0:
		vida = 0
		set_physics_process(false)
		muere.emit()


func _physics_process(delta: float) -> void:
	if vida <= 0:
		return
	invulnerable = maxf(0.0, invulnerable - delta)
	prisa_queda = maxf(0.0, prisa_queda - delta)
	if prisa_queda <= 0.0:
		prisa = 1.0
	for clave in cds.keys():
		cds[clave] = maxf(0.0, float(cds[clave]) - delta)
	if orden.length() > 0.18:
		aim = Vector3(orden.x, 0.0, orden.z).normalized()
	_encarar()
	if not is_on_floor():
		velocity.y -= 22.0 * delta
	else:
		velocity.y = 0.0
	if envite_queda > 0.0:
		envite_queda -= delta
		velocity.x = envite_dir.x * 16.0
		velocity.z = envite_dir.z * 16.0
		_envite_golpe()
		if envite_queda <= 0.0:
			envite_tocados.clear()
	else:
		var vel := rapidez * prisa
		velocity.x = orden.x * vel
		velocity.z = orden.z * vel
	move_and_slide()
	if golpe_malla and golpe_queda > 0.0:
		golpe_queda -= delta
		if golpe_queda <= 0.0:
			golpe_malla.visible = false
	var plano := Vector2(global_position.x, global_position.z)
	if plano.length() > 10.15:
		plano = plano.normalized() * 10.15
		global_position.x = plano.x
		global_position.z = plano.y


func _ejecutar(hab: Dictionary) -> bool:
	_apuntar()
	_encarar()
	match str(hab["tipo"]):
		"arco":
			_arco(float(hab["fondo"]), float(hab["ancho"]), int(hab["dano"]), float(hab["empuje"]))
			_balancear()
			return true
		"nova":
			_nova(float(hab["radio"]), int(hab["dano"]), float(hab["empuje"]))
			return true
		"cura":
			vida = mini(vida_max, vida + int(hab["cantidad"]))
			prisa = float(hab.get("prisa", 1.0))
			prisa_queda = float(hab.get("prisa_s", 0.0))
			_sonar("cura")
			if float(hab.get("nova", 0.0)) > 0.0:
				_nova(float(hab["nova"]), int(hab.get("dano", 0)), float(hab.get("empuje", 0.0)))
			return true
		"envite":
			envite_dir = aim
			envite_queda = maxf(0.12, float(hab["distancia"]) / 16.0)
			envite_dano = int(hab["dano"])
			envite_empuje = float(hab["empuje"])
			envite_tocados.clear()
			invulnerable = maxf(invulnerable, envite_queda + 0.06)
			return true
		"rafaga":
			_rafaga(hab)
			return true
		"charco":
			_charco(hab)
			return true
		"invitar":
			return _invitar()
		_:
			return false


func _apuntar() -> void:
	if orden.length() > 0.2:
		aim = Vector3(orden.x, 0.0, orden.z).normalized()
		return
	var mejor: Node3D = null
	var mejor_d := 14.0
	for nodo in get_tree().get_nodes_in_group("foes"):
		if not is_instance_valid(nodo):
			continue
		var dist := global_position.distance_to(nodo.global_position)
		if dist < mejor_d:
			mejor_d = dist
			mejor = nodo
	if mejor == null:
		return
	var hacia := mejor.global_position - global_position
	hacia.y = 0.0
	if hacia.length() > 0.12:
		aim = hacia.normalized()


func _encarar() -> void:
	if aim.length_squared() < 0.001:
		return
	look_at(global_position + aim, Vector3.UP)


func _arco(fondo: float, ancho: float, dano: int, empuje: float) -> void:
	var caja := BoxShape3D.new()
	caja.size = Vector3(ancho, 1.4, fondo)
	var origen := global_position + Vector3(0, 0.7, 0) + aim * (fondo * 0.42)
	_golpear_forma(caja, origen, dano, empuje, true)
	_marcar_golpe(fondo, ancho)


func _nova(radio: float, dano: int, empuje: float) -> void:
	var esfera := SphereShape3D.new()
	esfera.radius = radio
	var params := PhysicsShapeQueryParameters3D.new()
	params.shape = esfera
	params.transform = Transform3D(Basis.IDENTITY, global_position + Vector3(0, 0.7, 0))
	params.collision_mask = MASCARA_RIVALES
	params.collide_with_bodies = true
	params.collide_with_areas = false
	params.exclude = [get_rid()]
	_aplicar(get_world_3d().direct_space_state.intersect_shape(params, 16), dano, empuje, false)


func _golpear_forma(forma: Shape3D, origen: Vector3, dano: int, empuje: float, hacia_aim: bool) -> void:
	var params := PhysicsShapeQueryParameters3D.new()
	params.shape = forma
	params.transform = Transform3D(_base_aim(), origen)
	params.collision_mask = MASCARA_RIVALES
	params.collide_with_bodies = true
	params.collide_with_areas = false
	params.exclude = [get_rid()]
	_aplicar(get_world_3d().direct_space_state.intersect_shape(params, 16), dano, empuje, hacia_aim)


func _aplicar(golpes: Array, dano: int, empuje: float, hacia_aim: bool) -> void:
	var vistos := {}
	for hit in golpes:
		var cuerpo = hit.get("collider")
		if cuerpo == null or not cuerpo.is_in_group("foes"):
			continue
		var clave: int = cuerpo.get_instance_id()
		if vistos.has(clave):
			continue
		vistos[clave] = true
		var dir := aim
		if not hacia_aim:
			dir = cuerpo.global_position - global_position
			dir.y = 0.0
			dir = aim if dir.length() < 0.1 else dir.normalized()
		cuerpo.sufrir(dano, dir * empuje)


func _envite_golpe() -> void:
	if envite_dano <= 0:
		return
	var esfera := SphereShape3D.new()
	esfera.radius = 0.85
	var origen := global_position + Vector3(0, 0.7, 0) + envite_dir * 0.45
	var params := PhysicsShapeQueryParameters3D.new()
	params.shape = esfera
	params.transform = Transform3D(Basis.IDENTITY, origen)
	params.collision_mask = MASCARA_RIVALES
	params.collide_with_bodies = true
	params.exclude = [get_rid()]
	for hit in get_world_3d().direct_space_state.intersect_shape(params, 12):
		var cuerpo = hit.get("collider")
		if cuerpo == null or not cuerpo.is_in_group("foes"):
			continue
		var clave: int = cuerpo.get_instance_id()
		if envite_tocados.has(clave):
			continue
		envite_tocados[clave] = true
		cuerpo.sufrir(envite_dano, envite_dir * envite_empuje)


func _rafaga(hab: Dictionary) -> void:
	var n := maxi(1, int(hab["n"]))
	var abanico := deg_to_rad(float(hab["abanico"]))
	for i in n:
		var t := 0.0 if n == 1 else float(i) / float(n - 1) - 0.5
		var dir := aim.rotated(Vector3.UP, t * abanico).normalized()
		var tiro = ESCENA_TIRO.instantiate()
		tiro.configurar(dir, int(hab["dano"]), float(hab["velocidad"]), float(hab["vida_tiro"]), color)
		get_parent().add_child(tiro)
		tiro.global_position = global_position + Vector3(0, 0.78, 0) + dir * 0.75


func _charco(hab: Dictionary) -> void:
	var charco = ESCENA_CHARCO.instantiate()
	charco.configurar(float(hab["radio"]), int(hab["dano"]), float(hab["dura"]), color)
	get_parent().add_child(charco)
	var pos := global_position + aim * 2.15
	pos.y = 0.04
	charco.global_position = pos


func _invitar() -> bool:
	var vivos := 0
	for nodo in get_tree().get_nodes_in_group("aliados"):
		if is_instance_valid(nodo):
			vivos += 1
	if vivos >= 2:
		return false
	var invitado = ESCENA_INVITADO.instantiate()
	get_parent().add_child(invitado)
	var pos := global_position - aim * 0.95
	pos.y = 0.0
	invitado.global_position = pos
	return true


func _base_aim() -> Basis:
	var z := aim.normalized()
	var x := z.cross(Vector3.UP)
	if x.length_squared() < 0.0001:
		x = Vector3.RIGHT
	x = x.normalized()
	var y := x.cross(z).normalized()
	return Basis(x, y, z)


func _registrar(hab: Dictionary) -> void:
	var id := str(hab["id"])
	duraciones[id] = float(hab["cd"])
	cds[id] = 0.0


func _poner_arma(id: String) -> void:
	var malla: Mesh
	match id:
		"jarra":
			var vaso := CylinderMesh.new()
			vaso.top_radius = 0.14
			vaso.bottom_radius = 0.16
			vaso.height = 0.4
			malla = vaso
		"naipe":
			var carta := BoxMesh.new()
			carta.size = Vector3(0.42, 0.58, 0.045)
			malla = carta
		"espuma":
			var burbuja := SphereMesh.new()
			burbuja.radius = 0.2
			burbuja.height = 0.4
			malla = burbuja
		_:
			var bola := SphereMesh.new()
			bola.radius = 0.14
			bola.height = 0.28
			malla = bola
	$Bob/Arma.mesh = malla


func _balancear() -> void:
	var arma: Node3D = $Bob/Arma
	var tw := create_tween()
	tw.tween_property(arma, "rotation:x", deg_to_rad(-78.0), 0.07)
	tw.tween_property(arma, "rotation:x", 0.0, 0.11)


func _marcar_golpe(fondo: float, ancho: float) -> void:
	if golpe_malla == null:
		golpe_malla = MeshInstance3D.new()
		var caja := BoxMesh.new()
		caja.size = Vector3.ONE
		golpe_malla.mesh = caja
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(1, 0.93, 0.7, 0.38)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		golpe_malla.material_override = mat
		golpe_malla.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(golpe_malla)
	golpe_malla.visible = true
	golpe_malla.position = Vector3(0, 0.7, -fondo * 0.42)
	golpe_malla.scale = Vector3(ancho, 0.22, fondo)
	golpe_queda = 0.09


func _flash(mat: StandardMaterial3D, base: Color) -> void:
	if flash:
		flash.kill()
	mat.albedo_color = Color(1, 0.95, 0.85)
	flash = create_tween()
	flash.tween_property(mat, "albedo_color", base, 0.12)


func _sonar(nombre: String) -> void:
	var nodo := get_tree().get_first_node_in_group("sonido")
	if nodo:
		nodo.tocar(nombre)


func _material(tinta: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = tinta
	mat.roughness = 0.7
	return mat


func _sombra() -> void:
	var disco := MeshInstance3D.new()
	var malla := CylinderMesh.new()
	malla.top_radius = 0.42
	malla.bottom_radius = 0.42
	malla.height = 0.02
	disco.mesh = malla
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0, 0, 0, 0.35)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	disco.material_override = mat
	disco.position = Vector3(0, 0.03, 0)
	disco.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(disco)


func _idle(reproductor: AnimationPlayer, ruta: NodePath) -> void:
	var anim := Animation.new()
	anim.length = 0.72
	anim.loop_mode = Animation.LOOP_LINEAR
	var pista := anim.add_track(Animation.TYPE_VALUE)
	anim.track_set_path(pista, ruta)
	anim.track_insert_key(pista, 0.0, Vector3.ZERO)
	anim.track_insert_key(pista, 0.36, Vector3(0, 0.07, 0))
	anim.track_insert_key(pista, 0.72, Vector3.ZERO)
	anim.value_track_set_update_mode(pista, Animation.UPDATE_CONTINUOUS)
	var lib := AnimationLibrary.new()
	lib.add_animation("idle", anim)
	reproductor.add_animation_library("cuerpo", lib)
	reproductor.play("cuerpo/idle")
