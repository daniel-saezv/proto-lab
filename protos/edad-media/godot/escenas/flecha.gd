extends Area2D

var _direccion: Vector2 = Vector2.RIGHT
var _dano: int = 1
var _contra_heroe: bool = true
var _vida: float = 1.5


func _ready() -> void:
	add_to_group("flecha")
	body_entered.connect(_al_cuerpo)


func preparar(direccion: Vector2, dano: int, contra_heroe: bool) -> void:
	_direccion = direccion.normalized() if direccion.length() > 0.1 else Vector2.DOWN
	_dano = dano
	_contra_heroe = contra_heroe
	rotation = _direccion.angle()
	collision_mask = 4 if contra_heroe else 2


func _physics_process(delta: float) -> void:
	position += _direccion * 280.0 * delta
	_vida -= delta
	if _vida <= 0.0:
		queue_free()


func _al_cuerpo(cuerpo: Node2D) -> void:
	if _contra_heroe:
		if cuerpo.is_in_group("heroe"):
			Partida.herir(_dano)
			queue_free()
		return
	if cuerpo.is_in_group("enemigo") and cuerpo.has_method("recibir"):
		cuerpo.recibir(_dano)
		queue_free()
