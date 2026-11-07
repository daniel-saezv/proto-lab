extends RefCounted
class_name Mallas

## Mallas primitivas del motor. El color es el del caldero, no una textura externa.

static var _colores := {}


static func material(color: Color, emision: float = 0.0) -> StandardMaterial3D:
	var clave := "%s|%s" % [color, emision]
	if _colores.has(clave):
		return _colores[clave]
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.94
	if emision > 0.0:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = emision
	_colores[clave] = mat
	return mat


static func solido(padre: Node, mesh: Mesh, tam: Vector3, pos: Vector3, color: Color) -> StaticBody3D:
	var cuerpo := StaticBody3D.new()
	cuerpo.position = pos
	cuerpo.collision_layer = 1
	cuerpo.collision_mask = 0
	var forma := CollisionShape3D.new()
	var caja := BoxShape3D.new()
	caja.size = tam
	forma.shape = caja
	cuerpo.add_child(forma)
	var vis := MeshInstance3D.new()
	vis.mesh = mesh
	vis.material_override = material(color)
	cuerpo.add_child(vis)
	padre.add_child(cuerpo)
	return cuerpo


static func pieza(padre: Node3D, mesh: Mesh, pos: Vector3, color: Color, escala: Vector3 = Vector3.ONE, emision: float = 0.0) -> MeshInstance3D:
	var nodo := MeshInstance3D.new()
	nodo.mesh = mesh
	nodo.position = pos
	nodo.scale = escala
	nodo.material_override = material(color, emision)
	padre.add_child(nodo)
	return nodo


static func caja(tam: Vector3) -> BoxMesh:
	var mesh := BoxMesh.new()
	mesh.size = tam
	return mesh


static func esfera(radio: float) -> SphereMesh:
	var mesh := SphereMesh.new()
	mesh.radius = radio
	mesh.height = radio * 2.0
	mesh.radial_segments = 12
	mesh.rings = 6
	return mesh


static func cilindro(radio: float, alto: float, arriba: float = -1.0) -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.bottom_radius = radio
	mesh.top_radius = radio if arriba < 0.0 else arriba
	mesh.height = alto
	mesh.radial_segments = 10
	return mesh


static func capsula(radio: float, alto: float) -> CapsuleMesh:
	var mesh := CapsuleMesh.new()
	mesh.radius = radio
	mesh.height = alto
	mesh.radial_segments = 10
	mesh.rings = 4
	return mesh


static func goblin(padre: Node3D, pinche: bool) -> Dictionary:
	var piel := Color("3f6e28") if pinche else Color("7fbf45")
	var piel_clara := Color("9ed15f") if pinche else Color("b6e07a")
	var gorro := Color("4d6f99") if pinche else Color("fff6e8")
	var cuerpo := pieza(padre, capsula(0.26, 0.7), Vector3(0, 0.5, 0), piel)
	pieza(padre, esfera(0.22), Vector3(0, 0.96, 0), piel_clara)
	pieza(padre, esfera(0.09), Vector3(-0.2, 0.98, 0.02), piel, Vector3(0.7, 1.15, 0.45))
	pieza(padre, esfera(0.09), Vector3(0.2, 0.98, 0.02), piel, Vector3(0.7, 1.15, 0.45))
	pieza(padre, esfera(0.045), Vector3(-0.08, 0.98, 0.18), Color("fff8ee"))
	pieza(padre, esfera(0.045), Vector3(0.08, 0.98, 0.18), Color("fff8ee"))
	pieza(padre, esfera(0.022), Vector3(-0.08, 0.98, 0.21), Color("1c140f"))
	pieza(padre, esfera(0.022), Vector3(0.08, 0.98, 0.21), Color("1c140f"))
	pieza(padre, cilindro(0.3, 0.07), Vector3(0, 1.14, 0), gorro)
	pieza(padre, cilindro(0.18, 0.28), Vector3(0, 1.3, 0), gorro)
	if not pinche:
		pieza(padre, caja(Vector3(0.36, 0.34, 0.08)), Vector3(0, 0.46, 0.16), Color("f0d2b0"))
	var cuchara := cilindro(0.035, 0.42)
	var mano := pieza(padre, cuchara, Vector3(0.32, 0.52, 0.12), Color("e7d2a8"))
	mano.rotation_degrees = Vector3(70, 0, 18)
	return {"cuerpo": cuerpo}


static func slime(padre: Node3D, color: Color) -> MeshInstance3D:
	var cuerpo := pieza(padre, esfera(0.42), Vector3(0, 0.32, 0), color, Vector3(1.05, 0.72, 1.0))
	pieza(padre, esfera(0.07), Vector3(-0.12, 0.4, 0.28), Color("f4fff0"))
	pieza(padre, esfera(0.07), Vector3(0.12, 0.4, 0.28), Color("f4fff0"))
	pieza(padre, esfera(0.03), Vector3(-0.12, 0.4, 0.34), Color("1c2414"))
	pieza(padre, esfera(0.03), Vector3(0.12, 0.4, 0.34), Color("1c2414"))
	return cuerpo


static func murcielago(padre: Node3D) -> void:
	pieza(padre, esfera(0.22), Vector3(0, 0, 0), Color("6a4d93"))
	var ala_izq := pieza(padre, caja(Vector3(0.55, 0.08, 0.28)), Vector3(-0.42, 0.04, 0), Color("4d3870"))
	ala_izq.rotation_degrees = Vector3(0, 0, 18)
	var ala_der := pieza(padre, caja(Vector3(0.55, 0.08, 0.28)), Vector3(0.42, 0.04, 0), Color("4d3870"))
	ala_der.rotation_degrees = Vector3(0, 0, -18)
	pieza(padre, esfera(0.06), Vector3(-0.08, 0.06, 0.16), Color("f6f1ff"))
	pieza(padre, esfera(0.06), Vector3(0.08, 0.06, 0.16), Color("f6f1ff"))


static func golem(padre: Node3D) -> void:
	pieza(padre, caja(Vector3(0.7, 0.45, 0.5)), Vector3(0, 0.28, 0), Color("8e877c"))
	pieza(padre, caja(Vector3(0.82, 0.5, 0.55)), Vector3(0, 0.72, 0), Color("7b746a"))
	pieza(padre, caja(Vector3(0.4, 0.32, 0.4)), Vector3(0, 1.12, 0), Color("a39c90"))
	pieza(padre, esfera(0.06), Vector3(-0.1, 1.16, 0.18), Color("ffd7a1"), Vector3.ONE, 0.4)
	pieza(padre, esfera(0.06), Vector3(0.1, 1.16, 0.18), Color("ffd7a1"), Vector3.ONE, 0.4)


static func seta(padre: Node3D, color_tapa: Color) -> void:
	pieza(padre, cilindro(0.08, 0.28), Vector3(0, 0.16, 0), Color("f2e2c4"))
	pieza(padre, esfera(0.2), Vector3(0, 0.34, 0), color_tapa, Vector3(1.2, 0.7, 1.2))


static func baya(padre: Node3D) -> void:
	pieza(padre, esfera(0.12), Vector3(-0.1, 0.16, 0), Color("7a3d93"))
	pieza(padre, esfera(0.12), Vector3(0.1, 0.18, 0.06), Color("8d4ca8"))
	pieza(padre, esfera(0.1), Vector3(0.0, 0.28, -0.04), Color("6a327f"))


static func raiz(padre: Node3D) -> void:
	var a := pieza(padre, capsula(0.06, 0.34), Vector3(0, 0.12, 0), Color("a56a3a"))
	a.rotation_degrees = Vector3(0, 0, 28)
	var b := pieza(padre, capsula(0.05, 0.28), Vector3(0.08, 0.1, 0.04), Color("8a552c"))
	b.rotation_degrees = Vector3(20, 40, -24)


static func hueso(padre: Node3D) -> void:
	var a := pieza(padre, capsula(0.05, 0.32), Vector3(0, 0.12, 0), Color("f4efe4"))
	a.rotation_degrees = Vector3(0, 30, 70)


static func ala(padre: Node3D) -> void:
	var mesh := pieza(padre, caja(Vector3(0.42, 0.06, 0.22)), Vector3(0, 0.16, 0), Color("d9d3e4"))
	mesh.rotation_degrees = Vector3(0, 20, 16)


static func especia(padre: Node3D) -> void:
	pieza(padre, esfera(0.1), Vector3(0, 0.12, 0), Color("e07a2f"), Vector3(1.3, 0.6, 1.1))
	pieza(padre, esfera(0.05), Vector3(0.12, 0.1, 0.04), Color("c4582a"))


static func baba(padre: Node3D) -> void:
	pieza(padre, esfera(0.16), Vector3(0, 0.12, 0), Color("8fd24a"), Vector3(1.2, 0.55, 1.1))


static func arbol(padre: Node3D, pos: Vector3) -> void:
	var raiz_nodo := Node3D.new()
	raiz_nodo.position = pos
	padre.add_child(raiz_nodo)
	pieza(raiz_nodo, cilindro(0.16, 0.9), Vector3(0, 0.45, 0), Color("6b4128"))
	pieza(raiz_nodo, esfera(0.55), Vector3(0, 1.15, 0), Color("2f6b38"))
	var cuerpo := StaticBody3D.new()
	cuerpo.position = pos + Vector3(0, 0.45, 0)
	cuerpo.collision_layer = 1
	cuerpo.collision_mask = 0
	var forma := CollisionShape3D.new()
	var caja_col := BoxShape3D.new()
	caja_col.size = Vector3(0.7, 1.3, 0.7)
	forma.shape = caja_col
	cuerpo.add_child(forma)
	padre.add_child(cuerpo)


static func cabaña(padre: Node3D, pos: Vector3) -> void:
	var nodo := Node3D.new()
	nodo.position = pos
	padre.add_child(nodo)
	pieza(nodo, caja(Vector3(2.2, 1.3, 1.8)), Vector3(0, 0.65, 0), Color("8d5430"))
	pieza(nodo, cilindro(1.35, 0.9, 0.04), Vector3(0, 1.55, 0), Color("b64032"))
	pieza(nodo, caja(Vector3(0.45, 0.7, 0.08)), Vector3(0, 0.4, 0.92), Color("4a2e1c"))
	var cuerpo := StaticBody3D.new()
	cuerpo.position = pos + Vector3(0, 0.8, 0)
	cuerpo.collision_layer = 1
	var forma := CollisionShape3D.new()
	var caja_col := BoxShape3D.new()
	caja_col.size = Vector3(2.2, 1.6, 1.8)
	forma.shape = caja_col
	cuerpo.add_child(forma)
	padre.add_child(cuerpo)


static func caldero(padre: Node3D, pos: Vector3) -> Node3D:
	var nodo := Node3D.new()
	nodo.position = pos
	padre.add_child(nodo)
	pieza(nodo, cilindro(0.55, 0.55), Vector3(0, 0.42, 0), Color("2c3036"))
	pieza(nodo, esfera(0.42), Vector3(0, 0.62, 0), Color("ff8a3d"), Vector3(0.85, 0.45, 0.85), 0.85)
	pieza(nodo, cilindro(0.08, 0.7), Vector3(-0.48, 0.35, 0), Color("5c3a28"))
	pieza(nodo, cilindro(0.08, 0.7), Vector3(0.48, 0.35, 0), Color("5c3a28"))
	var vapor := CPUParticles3D.new()
	vapor.amount = 14
	vapor.lifetime = 1.3
	vapor.explosiveness = 0.0
	vapor.position = Vector3(0, 0.85, 0)
	vapor.direction = Vector3.UP
	vapor.spread = 18.0
	vapor.gravity = Vector3(0, 0.35, 0)
	vapor.initial_velocity_min = 0.25
	vapor.initial_velocity_max = 0.7
	var gota := SphereMesh.new()
	gota.radius = 0.05
	gota.height = 0.1
	gota.radial_segments = 6
	gota.rings = 3
	vapor.mesh = gota
	var humo := material(Color("efe8dc"), 0.15).duplicate() as StandardMaterial3D
	humo.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	humo.albedo_color = Color(0.93, 0.9, 0.84, 0.45)
	vapor.material_override = humo
	nodo.add_child(vapor)
	var luz := OmniLight3D.new()
	luz.position = Vector3(0, 0.9, 0)
	luz.light_color = Color("ff8a3d")
	luz.light_energy = 0.55
	luz.omni_range = 3.6
	luz.shadow_enabled = false
	nodo.add_child(luz)
	return nodo


static func pozo(padre: Node3D, pos: Vector3) -> void:
	var nodo := Node3D.new()
	nodo.position = pos
	padre.add_child(nodo)
	pieza(nodo, cilindro(0.55, 0.7), Vector3(0, 0.35, 0), Color("8d8a84"))
	pieza(nodo, cilindro(0.34, 0.4), Vector3(0, 0.45, 0), Color("1d3a44"))
	pieza(nodo, cilindro(0.06, 1.1), Vector3(-0.5, 0.9, 0), Color("6b4128"))
	pieza(nodo, cilindro(0.06, 1.1), Vector3(0.5, 0.9, 0), Color("6b4128"))
	pieza(nodo, cilindro(0.05, 1.15), Vector3(0, 1.35, 0), Color("6b4128")).rotation_degrees = Vector3(0, 0, 90)
	var cuerpo := StaticBody3D.new()
	cuerpo.position = pos + Vector3(0, 0.4, 0)
	cuerpo.collision_layer = 1
	var forma := CollisionShape3D.new()
	var caja_col := BoxShape3D.new()
	caja_col.size = Vector3(1.2, 0.9, 1.2)
	forma.shape = caja_col
	cuerpo.add_child(forma)
	padre.add_child(cuerpo)


static func arco(padre: Node3D, pos: Vector3) -> void:
	var nodo := Node3D.new()
	nodo.position = pos
	padre.add_child(nodo)
	pieza(nodo, cilindro(0.18, 1.8), Vector3(-1.15, 0.9, 0), Color("6b4128"))
	pieza(nodo, cilindro(0.18, 1.8), Vector3(1.15, 0.9, 0), Color("6b4128"))
	pieza(nodo, caja(Vector3(2.7, 0.28, 0.36)), Vector3(0, 1.85, 0), Color("8d5430"))
	var izq := StaticBody3D.new()
	izq.position = pos + Vector3(-1.15, 0.9, 0)
	izq.collision_layer = 1
	var fi := CollisionShape3D.new()
	var ci := BoxShape3D.new()
	ci.size = Vector3(0.4, 1.8, 0.4)
	fi.shape = ci
	izq.add_child(fi)
	padre.add_child(izq)
	var der := StaticBody3D.new()
	der.position = pos + Vector3(1.15, 0.9, 0)
	der.collision_layer = 1
	var fd := CollisionShape3D.new()
	var cd := BoxShape3D.new()
	cd.size = Vector3(0.4, 1.8, 0.4)
	fd.shape = cd
	der.add_child(fd)
	padre.add_child(der)


static func rotulo(padre: Node3D, texto: String, pos: Vector3) -> Label3D:
	var etiqueta := Label3D.new()
	etiqueta.text = texto
	etiqueta.position = pos
	etiqueta.font_size = 56
	etiqueta.pixel_size = 0.008
	etiqueta.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	etiqueta.modulate = Color("fff6e8")
	etiqueta.outline_size = 10
	etiqueta.outline_modulate = Color("1c140f")
	etiqueta.no_depth_test = false
	padre.add_child(etiqueta)
	return etiqueta


static func hada(padre: Node3D, pos: Vector3) -> Node3D:
	var orbita := Node3D.new()
	orbita.position = pos
	padre.add_child(orbita)
	var luz_nodo := Node3D.new()
	luz_nodo.position = Vector3(0.8, 0, 0)
	orbita.add_child(luz_nodo)
	pieza(luz_nodo, esfera(0.12), Vector3.ZERO, Color("ffe08a"), Vector3.ONE, 1.4)
	var luz := OmniLight3D.new()
	luz.light_color = Color("ffe08a")
	luz.light_energy = 0.35
	luz.omni_range = 2.4
	luz.shadow_enabled = false
	luz_nodo.add_child(luz)
	return orbita
