extends Node3D

## La encrucijada: un patio, dos pueblos y los cuatro oficios de muestra.

const Oficios := preload("res://oficios.gd")

var muestras: Array[Node3D] = []
var flotantes: Array[Node3D] = []
var bases: Array[float] = []
var tiempo := 0.0


func construir() -> void:
	_suelo()
	_muros()
	_pueblo("Tvresn", Vector3(-7.7, 0, 0), Color(0.95, 0.62, 0.22), true)
	_pueblo("Ajgulzil", Vector3(7.7, 0, 0), Color(0.62, 0.42, 0.95), false)
	_faro(Vector3(-6.4, 2.8, 0), Color(1.0, 0.72, 0.35))
	_faro(Vector3(6.4, 2.8, 0), Color(0.65, 0.45, 1.0))
	_muestras()
	_cartas()


func ocultar_muestras() -> void:
	for nodo in muestras:
		nodo.visible = false


func rotulos(visibles: bool) -> void:
	for nodo in get_children():
		if nodo is Label3D:
			nodo.visible = visibles


func _process(delta: float) -> void:
	tiempo += delta
	for i in flotantes.size():
		var nodo := flotantes[i]
		nodo.position.y = bases[i] + sin(tiempo * 1.7 + float(i) * 0.8) * 0.14
		if nodo.is_in_group("cartas"):
			nodo.rotate_y(delta * 0.7)


func _suelo() -> void:
	var cuerpo := StaticBody3D.new()
	cuerpo.collision_layer = 1
	cuerpo.collision_mask = 0
	var forma := CollisionShape3D.new()
	var caja := BoxShape3D.new()
	caja.size = Vector3(30, 1, 30)
	forma.shape = caja
	forma.position = Vector3(0, -0.5, 0)
	cuerpo.add_child(forma)
	add_child(cuerpo)
	_caja(Vector3(30, 0.16, 30), Vector3(0, -0.08, 0), Color(0.11, 0.08, 0.1))
	_caja(Vector3(10.4, 0.05, 12.6), Vector3(-5.4, 0.02, 0), Color(0.32, 0.16, 0.08))
	_caja(Vector3(10.4, 0.05, 12.6), Vector3(5.4, 0.02, 0), Color(0.16, 0.1, 0.3))
	_cilindro(4.2, 0.06, Vector3(0, 0.04, 0), Color(0.2, 0.14, 0.16))


func _muros() -> void:
	_muro(Vector3(0, 1.4, 11.0), Vector3(22.6, 2.8, 0.7))
	_muro(Vector3(0, 1.4, -11.0), Vector3(22.6, 2.8, 0.7))
	_muro(Vector3(11.0, 1.4, 0), Vector3(0.7, 2.8, 22.6))
	_muro(Vector3(-11.0, 1.4, 0), Vector3(0.7, 2.8, 22.6))


func _muro(pos: Vector3, tam: Vector3) -> void:
	var cuerpo := StaticBody3D.new()
	cuerpo.collision_layer = 1
	cuerpo.collision_mask = 0
	cuerpo.position = pos
	var forma := CollisionShape3D.new()
	var caja := BoxShape3D.new()
	caja.size = tam
	forma.shape = caja
	cuerpo.add_child(forma)
	add_child(cuerpo)
	_caja(tam, pos, Color(0.17, 0.11, 0.15))


func _pueblo(nombre: String, origen: Vector3, color: Color, cerveza: bool) -> void:
	var hacia := -origen
	hacia.y = 0.0
	hacia = hacia.normalized()
	var lateral := hacia.cross(Vector3.UP).normalized()
	var a_lo_ancho := absf(hacia.x) > absf(hacia.z)
	_caja(Vector3(0.45, 2.4, 0.45), origen + lateral * 1.7 + Vector3(0, 1.2, 0), color.darkened(0.25))
	_caja(Vector3(0.45, 2.4, 0.45), origen - lateral * 1.7 + Vector3(0, 1.2, 0), color.darkened(0.25))
	var viga := Vector3(0.45, 0.38, 4.0) if a_lo_ancho else Vector3(4.0, 0.38, 0.45)
	_caja(viga, origen + Vector3(0, 2.45, 0), color)
	if cerveza:
		for i in 3:
			var sitio := origen + hacia * 0.85 + lateral * (-0.7 + float(i) * 0.7)
			_cilindro(0.28, 0.55, sitio + Vector3(0, 0.32, 0), Color(0.62, 0.32, 0.12))
		_cilindro(0.16, 0.32, origen + hacia * 1.15 + lateral * -1.1 + Vector3(0, 0.7, 0), Color(0.95, 0.72, 0.28))
	else:
		for i in 4:
			var carta := _caja(Vector3(0.05, 0.7, 0.42), origen + hacia * 0.7 + lateral * (-1.0 + float(i) * 0.62) + Vector3(0, 0.45, 0), Color(0.95, 0.93, 0.86))
			carta.rotation.z = deg_to_rad(-12.0 + float(i) * 8.0)
	var rotulo := Label3D.new()
	rotulo.text = nombre
	rotulo.font_size = 48
	rotulo.pixel_size = 0.011
	rotulo.modulate = color.lightened(0.2)
	rotulo.outline_size = 12
	rotulo.outline_modulate = Color(0.05, 0.02, 0.06)
	rotulo.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	rotulo.position = origen + Vector3(0, 3.2, 0)
	add_child(rotulo)


func _muestras() -> void:
	var lista := Oficios.todos()
	for i in lista.size():
		var datos: Dictionary = lista[i]
		var raiz := Node3D.new()
		raiz.position = Vector3(-2.25 + float(i) * 1.5, 0.0, 0.15)
		add_child(raiz)
		var cuerpo := _capsula(0.28, 0.95, Vector3(0, 0.5, 0), datos["color"], raiz)
		_esfera(0.18, Vector3(0, 1.12, 0), datos["color"].lightened(0.25), raiz)
		_arma_de(str(datos["id"]), datos["color"].lightened(0.1), raiz)
		muestras.append(raiz)
		flotantes.append(cuerpo)
		bases.append(cuerpo.position.y)
		var nombre := Label3D.new()
		nombre.text = str(datos["nombre"])
		nombre.font_size = 42
		nombre.pixel_size = 0.008
		nombre.modulate = Color(0.98, 0.95, 0.9)
		nombre.outline_size = 10
		nombre.outline_modulate = Color(0.04, 0.02, 0.05)
		nombre.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		nombre.position = Vector3(0, 1.55, 0)
		raiz.add_child(nombre)


func _cartas() -> void:
	for i in 5:
		var carta := _caja(Vector3(0.34, 0.5, 0.04), Vector3(-3.2 + float(i) * 1.6, 1.35, 2.5 if i % 2 == 0 else -2.3), Color(0.96, 0.94, 0.88))
		carta.add_to_group("cartas")
		flotantes.append(carta)
		bases.append(carta.position.y)


func _arma_de(id: String, color: Color, padre: Node3D) -> void:
	match id:
		"jarra":
			_cilindro(0.12, 0.34, Vector3(0.32, 0.78, -0.12), color, padre)
		"naipe":
			var carta := _caja(Vector3(0.28, 0.4, 0.04), Vector3(0.28, 0.85, -0.05), color, padre)
			carta.rotation.z = deg_to_rad(-18)
		"espuma":
			_esfera(0.16, Vector3(0.28, 0.9, 0), color, padre)
		_:
			_esfera(0.12, Vector3(-0.22, 0.7, 0.1), color, padre)
			_esfera(0.12, Vector3(0.22, 0.78, -0.08), color.lightened(0.15), padre)


func _faro(pos: Vector3, color: Color) -> void:
	var luz := OmniLight3D.new()
	luz.position = pos
	luz.light_color = color
	luz.light_energy = 1.35
	luz.omni_range = 8.0
	luz.shadow_enabled = false
	add_child(luz)


func _mat(color: Color, emision := 0.0) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.78
	if emision > 0.0:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = emision
	return mat


func _caja(tam: Vector3, pos: Vector3, color: Color, padre: Node3D = null) -> MeshInstance3D:
	var nodo := MeshInstance3D.new()
	var malla := BoxMesh.new()
	malla.size = tam
	nodo.mesh = malla
	nodo.material_override = _mat(color)
	nodo.position = pos
	(padre if padre else self).add_child(nodo)
	return nodo


func _cilindro(radio: float, alto: float, pos: Vector3, color: Color, padre: Node3D = null) -> MeshInstance3D:
	var nodo := MeshInstance3D.new()
	var malla := CylinderMesh.new()
	malla.top_radius = radio
	malla.bottom_radius = radio
	malla.height = alto
	nodo.mesh = malla
	nodo.material_override = _mat(color)
	nodo.position = pos
	(padre if padre else self).add_child(nodo)
	return nodo


func _esfera(radio: float, pos: Vector3, color: Color, padre: Node3D = null) -> MeshInstance3D:
	var nodo := MeshInstance3D.new()
	var malla := SphereMesh.new()
	malla.radius = radio
	malla.height = radio * 2.0
	nodo.mesh = malla
	nodo.material_override = _mat(color, 0.25)
	nodo.position = pos
	(padre if padre else self).add_child(nodo)
	return nodo


func _capsula(radio: float, alto: float, pos: Vector3, color: Color, padre: Node3D) -> MeshInstance3D:
	var nodo := MeshInstance3D.new()
	var malla := CapsuleMesh.new()
	malla.radius = radio
	malla.height = alto
	nodo.mesh = malla
	nodo.material_override = _mat(color)
	nodo.position = pos
	padre.add_child(nodo)
	return nodo
