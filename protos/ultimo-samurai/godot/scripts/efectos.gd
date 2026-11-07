extends Node

var _chispas: GPUParticles3D
var _lista := false


func _ready() -> void:
	_chispas = GPUParticles3D.new()
	_chispas.amount = 14
	_chispas.lifetime = 0.32
	_chispas.one_shot = true
	_chispas.explosiveness = 0.92
	_chispas.emitting = false
	_chispas.visibility_aabb = AABB(Vector3(-2, -2, -2), Vector3(4, 4, 4))
	var proceso := ParticleProcessMaterial.new()
	proceso.direction = Vector3(0, 1, 0)
	proceso.spread = 75.0
	proceso.initial_velocity_min = 1.4
	proceso.initial_velocity_max = 3.2
	proceso.gravity = Vector3(0, -5.5, 0)
	proceso.scale_min = 0.04
	proceso.scale_max = 0.09
	proceso.color = Color(1.0, 0.78, 0.42, 1.0)
	_chispas.process_material = proceso
	var quad := QuadMesh.new()
	quad.size = Vector2(0.18, 0.18)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.albedo_color = Color(1.0, 0.82, 0.48, 0.9)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.6, 0.25)
	mat.emission_energy_multiplier = 1.4
	quad.material = mat
	_chispas.draw_pass_1 = quad
	add_child(_chispas)
	_lista = true
	# El primer disparo compila el material de partículas durante la entrada.
	chispa(Vector3(0, -20, 0))


func chispa(pos: Vector3) -> void:
	if not _lista:
		return
	_chispas.global_position = pos
	_chispas.restart()
	_chispas.emitting = true


func cantidad() -> int:
	if _chispas == null:
		return 0
	return _chispas.amount


func reducir() -> void:
	if _chispas == null:
		return
	_chispas.amount = maxi(4, int(_chispas.amount * 0.45))
