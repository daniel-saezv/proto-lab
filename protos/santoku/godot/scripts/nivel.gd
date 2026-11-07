class_name Nivel
extends RefCounted

static func construir(mundo: Node3D) -> void:
	Estado.puntos = {
		"umbral": Vector3(2.2, 0.08, 0),
		"claro": Vector3(12.4, 0.08, 0),
		"cueva": Vector3(30.4, -5.92, 0),
		"antes_oni": Vector3(49.2, 0.08, 0),
		"cornisa": Vector3(12.4, Datos.CORNISA_Y + 0.08, 0),
		"hierro": Vector3(78.2, 0.08, 0),
		"antes_tetsu": Vector3(101.5, 0.08, 0),
	}
	_suelo(mundo, -1.2, 6.6, 0.0, Arte.madera)
	_suelo(mundo, 6.85, 9.55, Datos.APPROACH_Y, Arte.musgo)
	_suelo(mundo, 9.65, 27.4, 0.0, Arte.madera)
	_suelo(mundo, 17.2, 20.0, 0.5, Arte.musgo)
	_suelo(mundo, 21.7, 24.3, 1.0, Arte.piedra)
	_suelo(mundo, 27.4, 29.5, 0.0, Arte.madera_osc)
	_obstaculo(mundo, "grieta", "grieta-pozo", 29.5, 32.0, 0.0, 0.45)
	_tabique(mundo, 32.2)
	_suelo(mundo, 28.2, 36.4, -6.0, Arte.piedra)
	var px := 34.4
	var py := -5.0
	for _i in 6:
		_suelo(mundo, px, px + 1.5, py, Arte.piedra)
		px += 1.72
		py += 1.0
	_suelo(mundo, 44.2, 53.2, 0.0, Arte.madera)
	_obstaculo(mundo, "puerta", "puerta-bambu", 46.35, 47.15, 3.35, 3.35)
	var borde := 53.2
	var lejos := borde + Datos.HUECO
	_suelo(mundo, lejos, 66.8, 0.0, Arte.madera_osc)
	_suelo(mundo, Datos.MAPA2_X, 118.0, 0.0, Arte.hierro_osc)
	_suelo(mundo, 10.05, 21.2, Datos.CORNISA_Y, Arte.musgo)
	_suelo(mundo, 25.4, 28.7, Datos.CORNISA_Y, Arte.musgo)
	_suelo(mundo, 32.9, 41.5, Datos.CORNISA_Y, Arte.musgo)
	var puente := 41.5
	_suelo(mundo, puente + Datos.HUECO, 70.0, Datos.CORNISA_Y, Arte.musgo)
	_suelo(mundo, 70.25, 71.85, 3.25, Arte.piedra)
	_suelo(mundo, 72.15, 73.85, 1.8, Arte.piedra)
	_suelo(mundo, 89.6, 93.8, 1.2, Arte.hierro)
	_suelo(mundo, 95.0, 99.6, 4.35, Arte.hierro)
	_obstaculo(mundo, "sello", "sello-hierro", 104.55, 105.45, 4.9, 4.9)
	_muro(mundo, 58.45)
	_enemigo(mundo, "ashigaru", "ashigaru-1", 5.1, 3.2, 6.3)
	_enemigo(mundo, "ashigaru", "ashigaru-2", 15.2, 11.2, 19.5)
	_enemigo(mundo, "karasu", "karasu-1", 23.2, 21.0, 26.0, 2.7)
	_enemigo(mundo, "ashigaru", "ashigaru-3", 50.4, 47.6, 52.6)
	_enemigo(mundo, "yari", "yari-1", 81.0, 76.5, 86.0)
	_enemigo(mundo, "oni", "oni-1", 88.5, 84.5, 93.0)
	_enemigo(mundo, "yari", "yari-2", 101.2, 97.5, 103.6)
	_descanso(mundo, "umbral", "Linterna del umbral", Vector3(3.1, 0.0, 0))
	_descanso(mundo, "claro", "Pozo de bambú", Vector3(12.6, 0.0, 0))
	_descanso(mundo, "hierro", "Brasero de hierro", Vector3(78.4, 0.0, 0))
	_altar(mundo, "kesa", "Kesa", "", Vector3(23.6, 1.0, 0))
	_altar(mundo, "iai", "Iai", "cueva", Vector3(30.6, -6.0, 0))
	_altar(mundo, "kasumi", "Kasumi", "antes_tetsu", Vector3(97.2, 4.35, 0))
	var takeoni := _jefe(mundo, "takeoni", "Takeoni", 58.3, 66.3, Vector3(62.4, 0.0, 0))
	takeoni.x_min = 58.3
	_jefe(mundo, "tetsu", "Tetsu", 106.6, 116.5, Vector3(111.0, 0.0, 0))
	_letrero(mundo, "Patio del Bambú", Vector3(2.2, 2.4, -1.2))
	_letrero(mundo, "Cornisa del viento", Vector3(13.5, Datos.CORNISA_Y + 1.3, 0))
	_letrero(mundo, "Santuario de Hierro", Vector3(78.0, 2.5, -1.2))
	_torii(mundo, 1.2, -2.4)
	_torii(mundo, 80.5, -2.5)
	_bambu(mundo)
	_luna(mundo)
	_abismo(mundo)
	_faro(mundo, Vector3(62.0, 2.4, -1.4))
	_faro(mundo, Vector3(110.0, 2.6, -1.4))


static func _suelo(padre: Node3D, x0: float, x1: float, techo: float, mat: Material) -> void:
	var ancho := x1 - x0
	var alto := 0.45
	var cuerpo := StaticBody3D.new()
	cuerpo.collision_layer = Datos.CAPA_MUNDO
	cuerpo.collision_mask = 0
	cuerpo.position = Vector3((x0 + x1) * 0.5, techo - alto * 0.5, 0)
	var forma := CollisionShape3D.new()
	var caja := BoxShape3D.new()
	caja.size = Vector3(ancho, alto, 3.2)
	forma.shape = caja
	cuerpo.add_child(forma)
	cuerpo.add_child(Arte.caja(caja.size, mat))
	padre.add_child(cuerpo)


static func _obstaculo(padre: Node3D, clase: String, marca: String, x0: float, x1: float, techo: float, alto: float) -> void:
	if Estado.esta_roto(marca):
		return
	var nodo := Obstaculo.new()
	nodo.configurar(clase, marca, x1 - x0, alto)
	nodo.position = Vector3((x0 + x1) * 0.5, techo - alto * 0.5, 0)
	padre.add_child(nodo)


static func _tabique(padre: Node3D, x: float) -> void:
	var muro := StaticBody3D.new()
	muro.collision_layer = Datos.CAPA_MUNDO
	muro.collision_mask = 0
	muro.position = Vector3(x, 1.8, 0)
	var forma := CollisionShape3D.new()
	var caja := BoxShape3D.new()
	caja.size = Vector3(0.5, 3.6, 3.2)
	forma.shape = caja
	muro.add_child(forma)
	muro.add_child(Arte.caja(caja.size, Arte.madera_osc))
	padre.add_child(muro)


static func _muro(padre: Node3D, x: float) -> StaticBody3D:
	var muro := StaticBody3D.new()
	muro.collision_layer = 0
	muro.collision_mask = 0
	muro.position = Vector3(x, 1.55, 0)
	muro.visible = false
	var forma := CollisionShape3D.new()
	var caja := BoxShape3D.new()
	caja.size = Vector3(0.45, 3.1, 3.2)
	forma.shape = caja
	muro.add_child(forma)
	var malla := Arte.caja(caja.size, Arte.musgo)
	muro.add_child(malla)
	padre.add_child(muro)
	return muro


static func _enemigo(padre: Node3D, tipo: String, marca: String, x: float, izq: float, der: float, y: float = 0.0) -> void:
	var nodo := Enemigo.new()
	nodo.configurar(tipo, marca, izq, der)
	nodo.position = Vector3(x, y, 0)
	padre.add_child(nodo)


static func _descanso(padre: Node3D, marca: String, titulo: String, pos: Vector3) -> void:
	var nodo := Descanso.new()
	nodo.configurar(marca, titulo)
	nodo.position = pos
	padre.add_child(nodo)


static func _altar(padre: Node3D, kata: String, titulo: String, punto: String, pos: Vector3) -> void:
	var nodo := Altar.new()
	nodo.configurar(kata, titulo, punto)
	nodo.position = pos
	padre.add_child(nodo)


static func _jefe(padre: Node3D, id: String, titulo: String, minimo: float, maximo: float, pos: Vector3) -> Jefe:
	var nodo := Jefe.new()
	nodo.configurar(id, titulo, minimo, maximo)
	nodo.position = pos
	padre.add_child(nodo)
	if id == "takeoni":
		for hijo in padre.get_children():
			if hijo is StaticBody3D and hijo.collision_layer == 0 and hijo.position.x > 50.0 and hijo.position.x < 60.0:
				nodo.muro = hijo
				break
	return nodo


static func _letrero(padre: Node3D, texto: String, pos: Vector3) -> void:
	var letrero := Label3D.new()
	letrero.text = texto
	letrero.font_size = 48
	letrero.pixel_size = 0.01
	letrero.position = pos
	letrero.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	letrero.modulate = Color("f6edd8")
	letrero.outline_size = 10
	padre.add_child(letrero)


static func _torii(padre: Node3D, x: float, z: float) -> void:
	var izq := Arte.cilindro(0.12, 3.2, Arte.cinabrio, 6)
	izq.position = Vector3(x - 0.85, 1.6, z)
	izq.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	padre.add_child(izq)
	var der := Arte.cilindro(0.12, 3.2, Arte.cinabrio, 6)
	der.position = Vector3(x + 0.85, 1.6, z)
	der.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	padre.add_child(der)
	var viga := Arte.caja(Vector3(2.3, 0.18, 0.28), Arte.cinabrio, false)
	viga.position = Vector3(x, 3.2, z)
	padre.add_child(viga)
	var viga2 := Arte.caja(Vector3(1.7, 0.1, 0.2), Arte.cinabrio, false)
	viga2.position = Vector3(x, 2.75, z)
	padre.add_child(viga2)


static func _bambu(padre: Node3D) -> void:
	var multi := MultiMesh.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.07
	mesh.bottom_radius = 0.1
	mesh.height = 1.0
	mesh.radial_segments = 6
	multi.mesh = mesh
	multi.transform_format = MultiMesh.TRANSFORM_3D
	var total := 70
	multi.instance_count = total
	var x := -1.0
	for i in total:
		var alto := randf_range(2.4, 5.2)
		var z := -4.4 if i % 2 == 0 else -6.3
		var base := Basis(Vector3.UP, randf() * TAU).scaled(Vector3(randf_range(0.8, 1.3), alto, randf_range(0.8, 1.3)))
		multi.set_instance_transform(i, Transform3D(base, Vector3(x, alto * 0.5 - 0.4, z)))
		x += 1.75
		if x > 122.0:
			x = randf_range(-1.0, 2.0)
	var inst := MultiMeshInstance3D.new()
	inst.multimesh = multi
	inst.material_override = Arte.musgo
	inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	padre.add_child(inst)


static func _luna(padre: Node3D) -> void:
	var luna := Arte.esfera(1.4, Arte.papel)
	luna.position = Vector3(18, 14.5, -12)
	luna.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	padre.add_child(luna)


static func _abismo(padre: Node3D) -> void:
	var fondo := Arte.caja(Vector3(140, 0.2, 8), Arte.noche, false)
	fondo.position = Vector3(50, -8.2, -1)
	padre.add_child(fondo)


static func _faro(padre: Node3D, pos: Vector3) -> void:
	var luz := OmniLight3D.new()
	luz.position = pos
	luz.light_color = Color("ffb56a")
	luz.light_energy = 0.9
	luz.omni_range = 6.5
	luz.shadow_enabled = false
	padre.add_child(luz)
	var globo := Arte.esfera(0.16, Arte.farol)
	globo.position = pos
	globo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	padre.add_child(globo)
