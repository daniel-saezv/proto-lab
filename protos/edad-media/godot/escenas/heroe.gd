extends CharacterBody2D

signal disparo(origen: Vector2, direccion: Vector2, dano: int)

var blanco: Node2D
var tiene_destino: bool = false
var destino: Vector2 = Vector2.ZERO
var _cd: float = 0.0

@onready var _cuerpo: Node2D = $Cuerpo
@onready var _anim: AnimationPlayer = $Anim
@onready var _golpe: Area2D = $Golpe


func _ready() -> void:
	add_to_group("heroe")
	motion_mode = MOTION_MODE_FLOATING
	_preparar_animacion()
	vestir()
	Partida.oficio_cambio.connect(vestir)


func _physics_process(delta: float) -> void:
	_cd = max(0.0, _cd - delta)
	if Partida.fase != "juego":
		velocity = Vector2.ZERO
		move_and_slide()
		return
	var teclado := _teclado()
	if teclado != Vector2.ZERO:
		Partida.marcar_entrada()
		blanco = null
		tiene_destino = false
		velocity = teclado * Partida.velocidad()
		_mirar(teclado)
		_andar()
		move_and_slide()
		return
	if blanco != null and is_instance_valid(blanco):
		var hacia := blanco.global_position - global_position
		var distancia := hacia.length()
		_mirar(hacia)
		if distancia <= Partida.alcance():
			velocity = Vector2.ZERO
			_atacar(hacia)
		else:
			velocity = hacia.normalized() * Partida.velocidad()
			_andar()
	elif tiene_destino:
		var hacia_destino := destino - global_position
		if hacia_destino.length() < 8.0:
			tiene_destino = false
			velocity = Vector2.ZERO
			_quieto()
		else:
			velocity = hacia_destino.normalized() * Partida.velocidad()
			_mirar(hacia_destino)
			_andar()
	else:
		velocity = Vector2.ZERO
		_quieto()
	move_and_slide()


func fijar_destino(punto: Vector2) -> void:
	blanco = null
	destino = punto
	tiene_destino = true


func fijar_blanco(nodo: Node2D) -> void:
	blanco = nodo
	tiene_destino = false


func soltar_orden() -> void:
	blanco = null
	tiene_destino = false
	velocity = Vector2.ZERO


func vestir() -> void:
	var id := Partida.clase
	var tela := Color(0.62, 0.18, 0.16)
	var escudo := Color(0.76, 0.78, 0.8)
	match id:
		"ballestero":
			tela = Color(0.28, 0.36, 0.28)
			escudo = Color(0.55, 0.42, 0.24)
		"fraile":
			tela = Color(0.42, 0.4, 0.36)
			escudo = Color(0.78, 0.74, 0.62)
		"astrologo":
			tela = Color(0.28, 0.24, 0.48)
			escudo = Color(0.78, 0.66, 0.28)
	$Cuerpo/Torso.color = tela
	$Cuerpo/Escudo.color = escudo


func pulso() -> void:
	if _anim.has_animation("golpe"):
		_anim.play("golpe")


func _atacar(hacia: Vector2) -> void:
	if _cd > 0.0:
		_quieto()
		return
	_cd = Partida.cadencia()
	Partida.cerrar_oficio()
	pulso()
	if Partida.alcance() > 90.0:
		var direccion := hacia.normalized() if hacia.length() > 1.0 else Vector2.UP
		disparo.emit(global_position + direccion * 18.0, direccion, Partida.dano_golpe())
		return
	_golpe.monitoring = true
	var ya := false
	for cuerpo in _golpe.get_overlapping_bodies():
		if cuerpo.is_in_group("enemigo") and cuerpo.has_method("recibir"):
			cuerpo.recibir(Partida.dano_golpe())
			ya = true
	if not ya and blanco != null and is_instance_valid(blanco) and blanco.has_method("recibir"):
		blanco.recibir(Partida.dano_golpe())


func _andar() -> void:
	if _anim.current_animation != "andar":
		_anim.play("andar")


func _quieto() -> void:
	if _anim.current_animation != "quieto":
		_anim.play("quieto")


func _mirar(hacia: Vector2) -> void:
	if abs(hacia.x) < 1.0:
		return
	_cuerpo.scale.x = -1.0 if hacia.x < 0.0 else 1.0


func _teclado() -> Vector2:
	var vector := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
		vector.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
		vector.x += 1.0
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
		vector.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
		vector.y += 1.0
	return vector.normalized()


func _preparar_animacion() -> void:
	var biblioteca := AnimationLibrary.new()
	var andar := Animation.new()
	andar.length = 0.48
	andar.loop_mode = Animation.LOOP_LINEAR
	var pista := andar.add_track(Animation.TYPE_VALUE)
	andar.track_set_path(pista, NodePath("Cuerpo:position"))
	andar.track_insert_key(pista, 0.0, Vector2(0, 0))
	andar.track_insert_key(pista, 0.24, Vector2(0, -5))
	andar.track_insert_key(pista, 0.48, Vector2(0, 0))
	biblioteca.add_animation("andar", andar)
	var quieto := Animation.new()
	quieto.length = 0.2
	var quieta := quieto.add_track(Animation.TYPE_VALUE)
	quieto.track_set_path(quieta, NodePath("Cuerpo:position"))
	quieto.track_insert_key(quieta, 0.0, Vector2(0, 0))
	biblioteca.add_animation("quieto", quieto)
	var golpe := Animation.new()
	golpe.length = 0.18
	var lunge := golpe.add_track(Animation.TYPE_VALUE)
	golpe.track_set_path(lunge, NodePath("Cuerpo:position"))
	golpe.track_insert_key(lunge, 0.0, Vector2(0, 0))
	golpe.track_insert_key(lunge, 0.08, Vector2(0, -12))
	golpe.track_insert_key(lunge, 0.18, Vector2(0, 0))
	biblioteca.add_animation("golpe", golpe)
	_anim.root_node = NodePath("..")
	_anim.add_animation_library("", biblioteca)
	_anim.play("quieto")
