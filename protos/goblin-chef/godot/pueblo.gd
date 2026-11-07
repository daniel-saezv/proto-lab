extends Node3D

var juego: Node
var _hada: Node3D
var _paseante: CharacterBody3D
var _nav: NavigationRegion3D


func montar(dueno: Node) -> void:
	juego = dueno
	_suelo()
	_decorado()
	_estaciones()
	_cerca()
	_diferir_horno()


func _process(delta: float) -> void:
	if _hada:
		_hada.rotate_y(delta * 0.8)


func _suelo() -> void:
	Mallas.solido(self, Mallas.caja(Vector3(20, 0.5, 20)), Vector3(20, 0.5, 20), Vector3(0, -0.25, 0), Color("3e7a3a"))
	var plaza := MeshInstance3D.new()
	var disco := CylinderMesh.new()
	disco.top_radius = 3.2
	disco.bottom_radius = 3.2
	disco.height = 0.06
	disco.radial_segments = 20
	plaza.mesh = disco
	plaza.position = Vector3(0, 0.03, 0.4)
	plaza.material_override = Mallas.material(Color("c6a36a"))
	add_child(plaza)


func _decorado() -> void:
	Mallas.cabaña(self, Vector3(-5.5, 0, -2.5))
	Mallas.caldero(self, Vector3(-3.15, 0, -0.35))
	Mallas.pozo(self, Vector3(6.1, 0, -2.2))
	Mallas.arbol(self, Vector3(-6.5, 0, 3.4))
	Mallas.arbol(self, Vector3(2.4, 0, 6.2))
	Mallas.arco(self, Vector3(0, 0, -4.15))
	var pinche := Node3D.new()
	pinche.position = Vector3(3.35, 0, 0.15)
	add_child(pinche)
	Mallas.goblin(pinche, true)
	var bob := create_tween().set_loops()
	bob.tween_property(pinche, "position:y", 0.08, 0.55).set_trans(Tween.TRANS_SINE)
	bob.tween_property(pinche, "position:y", 0.0, 0.55).set_trans(Tween.TRANS_SINE)
	var hongo := Node3D.new()
	hongo.position = Vector3(-4.8, 0, 2.7)
	add_child(hongo)
	Mallas.seta(hongo, Color("d24a3a"))
	pieza_cara(hongo)
	_hada = Mallas.hada(self, Vector3(1.6, 1.7, 4.4))
	var paseo := preload("res://paseante.tscn").instantiate() as CharacterBody3D
	paseo.position = Vector3(4.6, 0.55, 3.3)
	var ruta: Array[Vector3] = [
		Vector3(4.6, 0, 3.3),
		Vector3(1.4, 0, 4.3),
		Vector3(-1.2, 0, 3.5),
		Vector3(2.2, 0, 2.4),
	]
	paseo.puntos = ruta
	add_child(paseo)
	_paseante = paseo


func pieza_cara(hongo: Node3D) -> void:
	Mallas.pieza(hongo, Mallas.esfera(0.04), Vector3(-0.07, 0.36, 0.16), Color("1c140f"))
	Mallas.pieza(hongo, Mallas.esfera(0.04), Vector3(0.07, 0.36, 0.16), Color("1c140f"))


func _estaciones() -> void:
	_estacion(Vector3(-3.15, 0, -0.35), "cocina", "Cocina")
	_estacion(Vector3(3.35, 0, 0.15), "pinche", "Níspero")
	_estacion(Vector3(0, 0, -4.15), "caza", "Caza")


func _estacion(pos: Vector3, tipo: String, texto: String) -> void:
	var marca := Node3D.new()
	marca.position = pos
	marca.set_meta("tipo", tipo)
	marca.add_to_group("estacion")
	add_child(marca)
	Mallas.rotulo(self, texto, pos + Vector3(0, 2.05, 0))


func _cerca() -> void:
	var largo := 20.0
	var grueso := 0.4
	var alto := 0.8
	var sitios := [
		[Vector3(0, 0.4, -10), Vector3(largo, alto, grueso)],
		[Vector3(0, 0.4, 10), Vector3(largo, alto, grueso)],
		[Vector3(-10, 0.4, 0), Vector3(grueso, alto, largo)],
		[Vector3(10, 0.4, 0), Vector3(grueso, alto, largo)],
	]
	for sitio in sitios:
		var pos: Vector3 = sitio[0]
		var tam: Vector3 = sitio[1]
		Mallas.solido(self, Mallas.caja(tam), tam, pos, Color("6b4128"))


func _diferir_horno() -> void:
	await get_tree().physics_frame
	if not is_inside_tree():
		return
	_nav = NavigationRegion3D.new()
	add_child(_nav)
	var mover: Array[Node] = []
	for hijo in get_children():
		if hijo != _nav:
			mover.append(hijo)
	for hijo in mover:
		hijo.reparent(_nav)
	await get_tree().physics_frame
	if not is_inside_tree():
		return
	NavHorno.hornear(_nav, _al_hornear)


func _al_hornear() -> void:
	if _paseante and is_instance_valid(_paseante):
		_paseante.activar_nav()
