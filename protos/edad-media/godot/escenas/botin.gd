extends Area2D

var oro: int = 0
var madera: int = 0
var piedra: int = 0
var cura: int = 0
var _cogido: bool = false


func _ready() -> void:
	add_to_group("botin")
	body_entered.connect(_al_cuerpo)


func preparar(oro_mas: int, madera_mas: int, piedra_mas: int, cura_mas: int) -> void:
	oro = oro_mas
	madera = madera_mas
	piedra = piedra_mas
	cura = cura_mas
	if cura > 0:
		$Moneda.color = Color(0.45, 0.72, 0.42)
	elif piedra > 0:
		$Moneda.color = Color(0.62, 0.62, 0.66)
	elif madera > 0:
		$Moneda.color = Color(0.55, 0.38, 0.2)
	else:
		$Moneda.color = Color(0.84, 0.7, 0.28)


func _physics_process(_delta: float) -> void:
	var heroe := get_tree().get_first_node_in_group("heroe") as Node2D
	if heroe and global_position.distance_to(heroe.global_position) < 26.0:
		_recoger()


func _al_cuerpo(cuerpo: Node2D) -> void:
	if cuerpo.is_in_group("heroe"):
		_recoger()


func _recoger() -> void:
	if _cogido:
		return
	_cogido = true
	Partida.sumar_botin(oro, madera, piedra, cura)
	queue_free()
