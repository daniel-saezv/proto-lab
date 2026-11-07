extends CharacterBody3D

var juego: Node
var tipo := "slime"
var vida := 5
var dano := 2
var rapidez := 1.6
var nav_listo := false
var _fase := "andar"
var _reloj := 0.6
var _muerto := false

@onready var agente: NavigationAgent3D = $Agente
@onready var bob: Node3D = $Visual/Bob


func configurar(kind: String, profundidad: int, dueno: Node) -> void:
	tipo = kind
	juego = dueno
	var stats := Mapa.stats_enemigo(tipo, profundidad)
	vida = int(stats["vida"])
	dano = int(stats["dano"])
	rapidez = float(stats["vel"])
	add_to_group("enemigo")
	agente.path_desired_distance = 0.4
	agente.target_desired_distance = 0.55
	agente.radius = 0.34
	agente.height = 1.0
	agente.avoidance_enabled = false
	match tipo:
		"murcielago":
			Mallas.murcielago(bob)
			bob.position.y = 0.7
		"golem":
			Mallas.golem(bob)
		_:
			Mallas.slime(bob, Color("8fd24a"))
	if tipo != "murcielago":
		var salto := create_tween().set_loops()
		salto.tween_property(bob, "scale:y", 0.82, 0.35).set_trans(Tween.TRANS_SINE)
		salto.tween_property(bob, "scale:y", 1.0, 0.35).set_trans(Tween.TRANS_SINE)


func activar_nav() -> void:
	nav_listo = true


func recibir(cantidad: int) -> void:
	if _muerto:
		return
	vida -= cantidad
	var aviso := Label3D.new()
	aviso.text = "-%d" % cantidad
	aviso.position = Vector3(0, 1.4, 0)
	aviso.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	aviso.font_size = 48
	aviso.pixel_size = 0.01
	aviso.modulate = Color("ffe08a")
	add_child(aviso)
	var sube := create_tween()
	sube.tween_property(aviso, "position:y", 2.0, 0.4)
	sube.finished.connect(aviso.queue_free)
	if vida <= 0:
		_morir()


func _physics_process(delta: float) -> void:
	if _muerto or juego == null or juego.muerto:
		return
	if not is_on_floor():
		velocity.y -= 24.0 * delta
	else:
		velocity.y = -1.0
	var jugador: Node3D = juego.jugador
	var dir := _hacia(jugador)
	if _fase == "aviso":
		dir = Vector3.ZERO
	if dir.length() > 0.12:
		dir = dir.normalized()
		velocity.x = dir.x * rapidez
		velocity.z = dir.z * rapidez
		rotation.y = atan2(dir.x, dir.z)
	else:
		velocity.x = 0.0
		velocity.z = 0.0
	_separar()
	move_and_slide()
	_combate(delta, jugador)


func _hacia(jugador: Node3D) -> Vector3:
	var directo := jugador.global_position - global_position
	directo.y = 0.0
	if directo.length() > 11.0:
		return Vector3.ZERO
	if not nav_listo:
		return directo
	agente.target_position = jugador.global_position
	if agente.is_navigation_finished():
		return directo
	var paso := agente.get_next_path_position() - global_position
	paso.y = 0.0
	if paso.length() < 0.08:
		return directo
	return paso


func _separar() -> void:
	for otro in get_tree().get_nodes_in_group("enemigo"):
		if otro == self:
			continue
		var delta: Vector3 = global_position - (otro as Node3D).global_position
		delta.y = 0.0
		if delta.length() > 0.02 and delta.length() < 0.85:
			velocity.x += delta.normalized().x * 1.4
			velocity.z += delta.normalized().z * 1.4


func _combate(delta: float, jugador: Node3D) -> void:
	_reloj -= delta
	var dist := global_position.distance_to(jugador.global_position)
	if _fase == "andar" and dist < 1.45 and _reloj <= 0.0:
		_fase = "aviso"
		_reloj = 0.32
		modulate_visual(Color("ffb089"))
	elif _fase == "aviso" and _reloj <= 0.0:
		_fase = "andar"
		_reloj = 0.85
		modulate_visual(Color.WHITE)
		if global_position.distance_to(jugador.global_position) < 1.6:
			juego.recibir_dano(dano)


func modulate_visual(color: Color) -> void:
	for malla in bob.find_children("*", "MeshInstance3D", true, false):
		var mat := malla.material_override as StandardMaterial3D
		if mat == null:
			continue
		if not mat.has_meta("base"):
			mat = mat.duplicate()
			mat.set_meta("base", mat.albedo_color)
			malla.material_override = mat
		mat.albedo_color = mat.get_meta("base") if color == Color.WHITE else color


func _morir() -> void:
	_muerto = true
	juego.soltar_botin(tipo, global_position)
	queue_free()
