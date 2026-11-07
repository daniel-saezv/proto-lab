extends CharacterBody3D

const Visuales := preload("res://visuales.gd")

var direccion := Vector3.FORWARD
var dano := 1
var rapidez := 16.0
var queda := 0.6
var color := Color.WHITE
var listo := false


func configurar(dir: Vector3, cantidad: int, vel: float, vida_tiro: float, tinta: Color) -> void:
	direccion = dir.normalized() if dir.length_squared() > 0.0001 else Vector3.FORWARD
	dano = cantidad
	rapidez = vel
	queda = vida_tiro
	color = tinta
	listo = true


func _ready() -> void:
	add_to_group("tiros")
	collision_layer = 0
	collision_mask = 1 | 4
	motion_mode = MOTION_MODE_FLOATING
	var forma := CollisionShape3D.new()
	var esfera := SphereShape3D.new()
	esfera.radius = 0.2
	forma.shape = esfera
	add_child(forma)
	Visuales.proyectil(self, color)


func _physics_process(delta: float) -> void:
	if not listo:
		return
	queda -= delta
	if queda <= 0.0:
		queue_free()
		return
	var choque := move_and_collide(direccion * rapidez * delta)
	if choque == null:
		return
	var cuerpo = choque.get_collider()
	if cuerpo and cuerpo.has_method("sufrir") and cuerpo.is_in_group("foes"):
		cuerpo.sufrir(dano, direccion * 2.4)
	queue_free()
