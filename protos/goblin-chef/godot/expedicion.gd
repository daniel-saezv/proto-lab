extends Node3D

const ENEMIGO := preload("res://enemigo.tscn")
const RECOGIBLE := preload("res://recogible.tscn")

var juego: Node
var _salida_abierta := true
var _enemigos: Array[Node] = []


func montar(dueno: Node, datos: Dictionary) -> void:
	juego = dueno
	var n := int(datos["n"])
	var lado := float(n) * Mapa.PASO
	Mallas.solido(self, Mallas.caja(Vector3(lado, 0.5, lado)), Vector3(lado, 0.5, lado), Vector3(0, -0.25, 0), _color_suelo(int(datos["profundidad"])))
	for cruda in datos["bloqueadas"]:
		var celda := cruda as Vector2i
		var pos := Mapa.mundo(celda, n)
		var borde: bool = celda.x == 0 or celda.y == 0 or celda.x == n - 1 or celda.y == n - 1
		var alto := 1.7 if borde else 1.15
		var ancho := 1.85 if borde else 1.45
		var color := Color("6e6256") if borde else Color("7d8a62")
		Mallas.solido(
			self,
			Mallas.caja(Vector3(ancho, alto, ancho)),
			Vector3(ancho, alto, ancho),
			pos + Vector3(0, alto * 0.5, 0),
			color,
		)
	for item in datos["ingredientes"]:
		_soltar(str(item["tipo"]), Mapa.mundo(item["celda"], n) + Vector3(0, 0.15, 0))
	for bicho in datos["enemigos"]:
		var enemigo := ENEMIGO.instantiate() as CharacterBody3D
		var pos := Mapa.mundo(bicho["celda"], n)
		enemigo.position = pos + Vector3(0, 0.55, 0)
		add_child(enemigo)
		enemigo.configurar(str(bicho["tipo"]), int(datos["profundidad"]), juego)
		_enemigos.append(enemigo)
	var meta := Mapa.mundo(datos["salida"], n)
	_portal(meta)
	_diferir_horno()


func _color_suelo(profundidad: int) -> Color:
	if profundidad >= 4:
		return Color("6a5344")
	if profundidad >= 3:
		return Color("5d6458")
	if profundidad >= 2:
		return Color("3f6a52")
	return Color("3e7a3a")


func _portal(pos: Vector3) -> void:
	var nodo := Node3D.new()
	nodo.position = pos
	add_child(nodo)
	Mallas.pieza(nodo, Mallas.cilindro(0.35, 1.6), Vector3(0, 0.8, 0), Color("7ee0c8"), Vector3.ONE, 0.9)
	Mallas.rotulo(nodo, "Salida", Vector3(0, 2.1, 0))
	var luz := OmniLight3D.new()
	luz.position = Vector3(0, 1.2, 0)
	luz.light_color = Color("7ee0c8")
	luz.light_energy = 0.7
	luz.omni_range = 4.5
	luz.shadow_enabled = false
	nodo.add_child(luz)
	var pulso := create_tween().set_loops()
	pulso.tween_property(nodo, "scale", Vector3(1.06, 1, 1.06), 0.6)
	pulso.tween_property(nodo, "scale", Vector3.ONE, 0.6)
	var zona := Area3D.new()
	zona.position = pos
	zona.collision_layer = 0
	zona.collision_mask = 2
	zona.monitoring = true
	var forma := CollisionShape3D.new()
	var esfera := SphereShape3D.new()
	esfera.radius = 0.8
	forma.shape = esfera
	forma.position = Vector3(0, 0.6, 0)
	zona.add_child(forma)
	add_child(zona)
	zona.body_entered.connect(_al_salir)


func _soltar(tipo: String, pos: Vector3) -> void:
	var item := RECOGIBLE.instantiate() as Area3D
	item.position = pos
	add_child(item)
	item.configurar(tipo, juego)


func _al_salir(cuerpo: Node) -> void:
	if not _salida_abierta or not cuerpo.is_in_group("jugador"):
		return
	if juego.muerto:
		return
	_salida_abierta = false
	juego.llegar_a_casa()


func _diferir_horno() -> void:
	await get_tree().physics_frame
	if not is_inside_tree():
		return
	var nav := NavigationRegion3D.new()
	add_child(nav)
	var mover: Array[Node] = []
	for hijo in get_children():
		if hijo == nav:
			continue
		mover.append(hijo)
	for hijo in mover:
		hijo.reparent(nav)
	NavHorno.hornear(nav, _al_hornear)


func _al_hornear() -> void:
	for enemigo in _enemigos:
		if is_instance_valid(enemigo):
			enemigo.activar_nav()
