class_name Figuras
extends RefCounted


static func personaje(opciones: Dictionary) -> Node3D:
	var raiz := Node3D.new()
	raiz.name = "Visual"
	var laca: Material = opciones.get("laca", Taller.laca)
	var tela: Material = opciones.get("tela", Taller.tela)
	var piel: Material = opciones.get("piel", Taller.piel)
	var metal: Material = opciones.get("metal", Taller.metal)
	var hoja_mat: Material = opciones.get("hoja", Taller.hoja)
	var escala: float = float(opciones.get("escala", 1.0))
	raiz.scale = Vector3.ONE * escala
	_caja(raiz, Vector3(0.42, 0.52, 0.3), Vector3(0, 0.82, 0), laca)
	_caja(raiz, Vector3(0.58, 0.16, 0.36), Vector3(0, 0.62, 0), opciones.get("faja", Taller.oro))
	_caja(raiz, Vector3(0.66, 0.46, 0.4), Vector3(0, 0.34, 0), tela)
	_caja(raiz, Vector3(0.26, 0.24, 0.24), Vector3(0, 1.22, 0), piel)
	_caja(raiz, Vector3(0.34, 0.14, 0.3), Vector3(0, 1.38, 0), metal)
	if bool(opciones.get("cresta", true)):
		_caja(raiz, Vector3(0.05, 0.3, 0.14), Vector3(0, 1.58, 0), opciones.get("cresta_mat", Taller.oro))
	_caja(raiz, Vector3(0.14, 0.4, 0.14), Vector3(-0.28, 0.78, 0), laca)
	var pivote := Node3D.new()
	pivote.name = "Arma"
	pivote.position = Vector3(0.32, 0.9, 0)
	raiz.add_child(pivote)
	if bool(opciones.get("lanza", false)):
		_caja(pivote, Vector3(1.05, 0.05, 0.05), Vector3(0.5, 0, 0), metal)
		_caja(pivote, Vector3(0.2, 0.12, 0.02), Vector3(1.05, 0.05, 0), hoja_mat)
	elif bool(opciones.get("arco", false)):
		_caja(pivote, Vector3(0.06, 0.72, 0.06), Vector3(0.16, 0.05, 0), Taller.arco)
		_caja(pivote, Vector3(0.28, 0.04, 0.04), Vector3(0.28, 0.36, 0), Taller.oro)
	else:
		_caja(pivote, Vector3(0.86, 0.055, 0.02), Vector3(0.46, 0, 0), hoja_mat)
		_caja(pivote, Vector3(0.2, 0.07, 0.05), Vector3(0.02, 0, 0), Taller.oro)
	if bool(opciones.get("cuernos", false)):
		_caja(raiz, Vector3(0.07, 0.34, 0.07), Vector3(-0.14, 1.62, 0), Taller.cuerno, Vector3(0, 0, 0.45))
		_caja(raiz, Vector3(0.07, 0.34, 0.07), Vector3(0.14, 1.62, 0), Taller.cuerno, Vector3(0, 0, -0.45))
	if bool(opciones.get("ojos", false)):
		_caja(raiz, Vector3(0.07, 0.045, 0.04), Vector3(-0.07, 1.24, 0.12), Taller.ojo)
		_caja(raiz, Vector3(0.07, 0.045, 0.04), Vector3(0.07, 1.24, 0.12), Taller.ojo)
	var luz := OmniLight3D.new()
	luz.name = "Brillo"
	luz.light_color = Color(1, 0.72, 0.42)
	luz.light_energy = 0.0
	luz.omni_range = 2.4
	luz.shadow_enabled = false
	luz.position = Vector3(0, 1.0, 0.2)
	raiz.add_child(luz)
	var sombra := MeshInstance3D.new()
	var disco := CylinderMesh.new()
	disco.top_radius = 0.36
	disco.bottom_radius = 0.36
	disco.height = 0.02
	disco.radial_segments = 12
	sombra.mesh = disco
	sombra.material_override = Taller.sombra
	sombra.position = Vector3(0, 0.02, 0)
	sombra.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	raiz.add_child(sombra)
	var arco_corte := MeshInstance3D.new()
	arco_corte.name = "Corte"
	var hoja_malla := BoxMesh.new()
	hoja_malla.size = Vector3(1.15, 0.08, 0.02)
	arco_corte.mesh = hoja_malla
	arco_corte.material_override = Taller.corte
	arco_corte.position = Vector3(0.7, 0.9, 0)
	arco_corte.visible = false
	arco_corte.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	raiz.add_child(arco_corte)
	return raiz


static func _caja(padre: Node3D, tam: Vector3, pos: Vector3, mat: Material, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var malla := MeshInstance3D.new()
	var caja := BoxMesh.new()
	caja.size = tam
	malla.mesh = caja
	malla.material_override = mat
	malla.position = pos
	malla.rotation = rot
	malla.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	padre.add_child(malla)
	return malla
