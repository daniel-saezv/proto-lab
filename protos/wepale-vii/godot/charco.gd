extends Area3D

var radio := 2.2
var dano := 6
var dura := 3.0
var color := Color(0.95, 0.78, 0.28)
var queda := 3.0
var pulso := 0.15
var listo := false


func configurar(alcance: float, cantidad: int, segundos: float, tinta: Color) -> void:
	radio = alcance
	dano = cantidad
	dura = segundos
	queda = segundos
	color = tinta
	listo = true


func _ready() -> void:
	monitoring = true
	monitorable = false
	collision_layer = 0
	collision_mask = 4
	var forma := CollisionShape3D.new()
	var esfera := SphereShape3D.new()
	esfera.radius = radio
	forma.shape = esfera
	forma.position = Vector3(0, 0.4, 0)
	add_child(forma)
	var malla := MeshInstance3D.new()
	var cilindro := CylinderMesh.new()
	cilindro.top_radius = radio
	cilindro.bottom_radius = radio * 0.92
	cilindro.height = 0.06
	malla.mesh = cilindro
	var mat := StandardMaterial3D.new()
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(color.r, color.g, color.b, 0.42)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	malla.material_override = mat
	malla.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(malla)


func _physics_process(delta: float) -> void:
	if not listo:
		return
	queda -= delta
	if queda <= 0.0:
		queue_free()
		return
	pulso -= delta
	if pulso > 0.0:
		return
	pulso = 0.4
	for cuerpo in get_overlapping_bodies():
		if cuerpo and cuerpo.is_in_group("foes") and cuerpo.has_method("sufrir"):
			cuerpo.sufrir(dano, Vector3.ZERO, false)
			if cuerpo.has_method("frenar"):
				cuerpo.frenar(0.45, 0.42)
