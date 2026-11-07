extends CharacterBody3D

## Slime del pueblo. Pasea por la malla horneada y, si aún no está, rebota en el sitio.

var puntos: Array[Vector3] = []
var nav_listo := false
var _indice := 0

@onready var agente: NavigationAgent3D = $Agente
@onready var bob: Node3D = $Visual/Bob


func _ready() -> void:
	Mallas.slime(bob, Color("7dce4a"))
	agente.path_desired_distance = 0.45
	agente.target_desired_distance = 0.4
	agente.avoidance_enabled = false
	var salto := create_tween().set_loops()
	salto.tween_property(bob, "position:y", 0.18, 0.32).set_trans(Tween.TRANS_SINE)
	salto.tween_property(bob, "position:y", 0.0, 0.28).set_trans(Tween.TRANS_SINE)


func activar_nav() -> void:
	nav_listo = true
	if not puntos.is_empty():
		agente.target_position = puntos[0]


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= 24.0 * delta
	else:
		velocity.y = -1.0
	var dir := Vector3.ZERO
	if nav_listo and not puntos.is_empty():
		if agente.is_navigation_finished():
			_indice = (_indice + 1) % puntos.size()
			agente.target_position = puntos[_indice]
		var paso := agente.get_next_path_position() - global_position
		paso.y = 0.0
		dir = paso
	if dir.length() > 0.15:
		dir = dir.normalized()
		velocity.x = dir.x * 1.3
		velocity.z = dir.z * 1.3
		rotation.y = atan2(dir.x, dir.z)
	else:
		velocity.x = 0.0
		velocity.z = 0.0
	move_and_slide()
