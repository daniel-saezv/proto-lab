extends Node3D

## La encrucijada: un patio, dos pueblos y los cuatro oficios de muestra.

const Oficios := preload("res://oficios.gd")
const Visuales := preload("res://visuales.gd")

var muestras: Array[Node3D] = []
var flotantes: Array[Node3D] = []
var bases: Array[float] = []
var tiempo := 0.0


func construir() -> void:
	_suelo()
	_muros()
	_pueblo("Tvresn", Vector3(-7.7, 0, 0), true)
	_pueblo("Ajgulzil", Vector3(7.7, 0, 0), false)
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
	for ix in range(-3, 4):
		for iz in range(-3, 4):
			Visuales.prop(self, Visuales.SUELO_GRANDE, Vector3(float(ix) * 2.05, 0.0, float(iz) * 2.05), 1.02)
	var paso := 2.05
	for ix in range(-1, 2):
		for iz in range(-1, 2):
			Visuales.prop(self, Visuales.SUELO_PEQUE, Vector3(float(ix) * paso * 0.9, 0.01, float(iz) * paso * 0.9), 1.05)


func _muros() -> void:
	_fila_muro(Vector3(0, 0, 11.0), Vector3(22.6, 2.8, 0.7), 0.0)
	_fila_muro(Vector3(0, 0, -11.0), Vector3(22.6, 2.8, 0.7), PI)
	_fila_muro(Vector3(11.0, 0, 0), Vector3(0.7, 2.8, 22.6), PI * 0.5)
	_fila_muro(Vector3(-11.0, 0, 0), Vector3(0.7, 2.8, 22.6), -PI * 0.5)


func _fila_muro(pos: Vector3, tam: Vector3, giro: float) -> void:
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
	var largo := tam.x if tam.x > tam.z else tam.z
	var piezas := maxi(3, int(round(largo / 1.9)))
	var dir := Vector3.RIGHT if tam.x > tam.z else Vector3.FORWARD
	for i in piezas:
		var lugar := pos + dir * (float(i) - float(piezas - 1) * 0.5) * 1.95
		if i == 0 or i == piezas - 1:
			Visuales.prop(self, Visuales.ESQUINA, lugar, 1.0, giro + PI * 0.25)
		else:
			Visuales.prop(self, Visuales.MURO, lugar, 1.0, giro)


func _pueblo(nombre: String, origen: Vector3, cerveza: bool) -> void:
	var hacia := -origen
	hacia.y = 0.0
	hacia = hacia.normalized()
	var lateral := hacia.cross(Vector3.UP).normalized()
	var rot := atan2(hacia.x, hacia.z)
	Visuales.prop(self, Visuales.PUERTA, origen + Vector3(0, 0.0, 0), 1.08, rot)
	Visuales.prop(self, Visuales.COLUMNA, origen + lateral * 2.3, 0.95, rot)
	Visuales.prop(self, Visuales.COLUMNA, origen - lateral * 2.3, 0.95, rot)
	var estandarte := Visuales.Estandarte_AMBAR if cerveza else Visuales.Estandarte_VIOLETA
	Visuales.prop(self, estandarte, origen + Vector3(0, 2.25, 0), 1.1, rot)
	if cerveza:
		for i in 3:
			var sitio := origen + hacia * 1.1 + lateral * (-0.75 + float(i) * 0.75)
			Visuales.prop(self, Visuales.BARRIL_PEQUE if i != 1 else Visuales.BARRIL_GRANDE, sitio, 0.95, rot + float(i) * 0.2)
		Visuales.prop(self, Visuales.BOTELLA, origen + hacia * 1.45 + lateral * -1.25, 0.9, rot)
	else:
		Visuales.prop(self, Visuales.MESA, origen + hacia * 1.05, 0.92, rot)
		for i in 3:
			var sitio := origen + hacia * 0.95 + lateral * (-0.65 + float(i) * 0.65)
			var moneda := Visuales.prop(self, Visuales.MONEDA, sitio + Vector3(0, 0.55, 0), 0.95, rot + float(i) * 0.35)
			moneda.scale = Vector3(1.55, 0.08, 1.15)
		Visuales.prop(self, Visuales.SILLA, origen + hacia * 1.65 + lateral * 1.25, 0.9, rot)
	var rotulo := Label3D.new()
	rotulo.text = nombre
	rotulo.font_size = 48
	rotulo.pixel_size = 0.011
	rotulo.modulate = Color(0.98, 0.88, 0.72) if cerveza else Color(0.82, 0.72, 1.0)
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
		var modelo := Visuales.montar_muestra(raiz, str(datos["id"]))
		muestras.append(raiz)
		flotantes.append(modelo)
		bases.append(modelo.position.y)
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
		var carta := Visuales.prop(self, Visuales.MONEDA, Vector3(-3.2 + float(i) * 1.6, 1.15, 2.5 if i % 2 == 0 else -2.3), 1.0, deg_to_rad(24.0 + float(i) * 9.0))
		carta.scale = Vector3(1.65, 0.08, 1.15)
		carta.add_to_group("cartas")
		flotantes.append(carta)
		bases.append(carta.position.y)


func _faro(pos: Vector3, color: Color) -> void:
	var luz := OmniLight3D.new()
	luz.position = pos
	luz.light_color = color
	luz.light_energy = 1.35
	luz.omni_range = 8.0
	luz.shadow_enabled = false
	add_child(luz)
