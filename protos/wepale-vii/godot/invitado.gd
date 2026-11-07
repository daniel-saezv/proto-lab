extends CharacterBody3D

const Visuales := preload("res://visuales.gd")

var vida := 36
var queda := 8.0
var mordisco := 0.0
var muerto := false
var modelo: Node3D


func _ready() -> void:
	add_to_group("aliados")
	collision_layer = 8
	collision_mask = 1
	floor_snap_length = 0.2
	var forma := CollisionShape3D.new()
	var capsula := CapsuleShape3D.new()
	capsula.radius = 0.26
	capsula.height = 0.8
	forma.shape = capsula
	forma.position = Vector3(0, 0.42, 0)
	add_child(forma)
	modelo = Visuales.montar_jugador(_raiz(), "comparsa")
	if modelo:
		modelo.scale = Vector3.ONE * Visuales.ESCALA_ALIADO


func _raiz() -> Node3D:
	var bob := Node3D.new()
	bob.name = "Bob"
	add_child(bob)
	return bob


func sufrir(cantidad: int) -> void:
	if muerto or cantidad <= 0:
		return
	vida -= cantidad
	if modelo:
		Visuales.destellar(self, modelo)
	if vida <= 0:
		_morir()


func _physics_process(delta: float) -> void:
	if muerto:
		return
	queda -= delta
	mordisco = maxf(0.0, mordisco - delta)
	if queda <= 0.0:
		_morir()
		return
	var dir := Vector3.ZERO
	var rival := _rival()
	if rival:
		dir = rival.global_position - global_position
		dir.y = 0.0
		if dir.length() < 1.05 and mordisco <= 0.0:
			rival.sufrir(8, dir.normalized() * 1.4 if dir.length() > 0.05 else Vector3.FORWARD)
			mordisco = 0.55
			dir = Vector3.ZERO
		elif dir.length() > 0.1:
			dir = dir.normalized()
	else:
		var jugador := get_tree().get_first_node_in_group("player")
		if jugador:
			dir = jugador.global_position - global_position
			dir.y = 0.0
			if dir.length() < 1.35:
				dir = Vector3.ZERO
			elif dir.length() > 0.1:
				dir = dir.normalized()
	if not is_on_floor():
		velocity.y -= 22.0 * delta
	else:
		velocity.y = 0.0
	velocity.x = dir.x * 4.3
	velocity.z = dir.z * 4.3
	if dir.length() > 0.2:
		look_at(global_position + dir, Vector3.UP)
	move_and_slide()


func _rival() -> Node:
	var mejor: Node = null
	var mejor_d := 1.0e9
	for nodo in get_tree().get_nodes_in_group("foes"):
		if not is_instance_valid(nodo):
			continue
		var dist := global_position.distance_to(nodo.global_position)
		if dist < mejor_d:
			mejor_d = dist
			mejor = nodo
	return mejor


func _morir() -> void:
	if muerto:
		return
	muerto = true
	remove_from_group("aliados")
	collision_layer = 0
	set_physics_process(false)
	var tw := create_tween()
	tw.tween_property(self, "scale", Vector3(0.05, 0.05, 0.05), 0.2)
	tw.tween_callback(queue_free)
