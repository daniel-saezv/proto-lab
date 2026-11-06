extends CharacterBody2D

signal murio(quien: Node)
signal disparo(origen: Vector2, direccion: Vector2, dano: int)

const FICHAS := {
	"infante": {"vida": 34, "dano": 7, "alcance": 36.0, "velocidad": 78.0, "cadencia": 1.05, "oro": 3, "xp": 8, "madera": 0, "piedra": 0, "disparo": false, "color": Color(0.45, 0.32, 0.24)},
	"arquero": {"vida": 24, "dano": 6, "alcance": 230.0, "velocidad": 70.0, "cadencia": 1.35, "oro": 4, "xp": 9, "madera": 1, "piedra": 0, "disparo": true, "color": Color(0.32, 0.4, 0.26)},
	"jinete": {"vida": 64, "dano": 12, "alcance": 42.0, "velocidad": 118.0, "cadencia": 0.95, "oro": 6, "xp": 14, "madera": 0, "piedra": 1, "disparo": false, "color": Color(0.36, 0.28, 0.22)},
	"ariete": {"vida": 150, "dano": 11, "alcance": 48.0, "velocidad": 42.0, "cadencia": 1.45, "oro": 12, "xp": 22, "madera": 2, "piedra": 2, "disparo": false, "color": Color(0.4, 0.28, 0.18)},
	"verde": {"vida": 100, "dano": 13, "alcance": 44.0, "velocidad": 96.0, "cadencia": 0.8, "oro": 16, "xp": 20, "madera": 0, "piedra": 1, "disparo": false, "color": Color(0.18, 0.38, 0.22)},
	"espectro": {"vida": 18, "dano": 5, "alcance": 34.0, "velocidad": 150.0, "cadencia": 0.7, "oro": 2, "xp": 6, "madera": 0, "piedra": 0, "disparo": false, "color": Color(0.62, 0.78, 0.72, 0.85)},
	"dragon": {"vida": 220, "dano": 16, "alcance": 56.0, "velocidad": 64.0, "cadencia": 1.15, "oro": 30, "xp": 40, "madera": 3, "piedra": 3, "disparo": false, "color": Color(0.45, 0.14, 0.12)},
}

var tipo: String = "infante"
var origen: String = "oleada"
var vida: int = 1
var xp: int = 0
var oro: int = 0
var madera: int = 0
var piedra: int = 0
var raiz: float = 0.0
var freno: float = 0.0
var _cd: float = 0.4
var _atasco: float = 0.0
var _ficha: Dictionary = {}


func _ready() -> void:
	add_to_group("enemigo")
	motion_mode = MOTION_MODE_FLOATING
	_preparar_animacion()


func preparar(id: String, procedencia: String) -> void:
	tipo = id if FICHAS.has(id) else "infante"
	origen = procedencia
	_ficha = FICHAS[tipo]
	vida = int(_ficha["vida"])
	xp = int(_ficha["xp"])
	oro = int(_ficha["oro"])
	madera = int(_ficha["madera"])
	piedra = int(_ficha["piedra"])
	$Cuerpo.color = _ficha["color"]
	var ancho := 16.0 if tipo != "dragon" and tipo != "ariete" else 26.0
	if tipo == "jinete":
		ancho = 20.0
	$Cuerpo.polygon = PackedVector2Array([
		Vector2(-ancho, -ancho * 0.7),
		Vector2(ancho, -ancho * 0.7),
		Vector2(ancho * 0.8, ancho),
		Vector2(-ancho * 0.8, ancho),
	])
	var forma := CircleShape2D.new()
	forma.radius = ancho * 0.72
	$Choque.shape = forma


func recibir(cantidad: int) -> void:
	if vida <= 0:
		return
	vida -= cantidad
	modulate = Color(1.3, 0.75, 0.7)
	if vida <= 0:
		vida = 0
		murio.emit(self)
		queue_free()


func disolver() -> void:
	queue_free()


func _physics_process(delta: float) -> void:
	if vida <= 0:
		return
	raiz = max(0.0, raiz - delta)
	freno = max(0.0, freno - delta)
	_cd = max(0.0, _cd - delta)
	if modulate.r > 1.01:
		modulate = Color(1, 1, 1)
	if Partida.fase != "juego" or raiz > 0.0:
		velocity = Vector2.ZERO
		move_and_slide()
		return
	var heroe := get_tree().get_first_node_in_group("heroe") as Node2D
	if heroe == null:
		velocity = Vector2.ZERO
		move_and_slide()
		return
	var hacia := heroe.global_position - global_position
	var distancia := hacia.length()
	var direccion := hacia.normalized() if distancia > 1.0 else Vector2.DOWN
	var rapidez := float(_ficha["velocidad"]) * (0.35 if freno > 0.0 else 1.0)
	if bool(_ficha["disparo"]) and distancia < float(_ficha["alcance"]) and distancia > 64.0:
		velocity = Vector2.ZERO
		if _cd <= 0.0:
			_cd = float(_ficha["cadencia"])
			disparo.emit(global_position, direccion, int(_ficha["dano"]))
	elif not bool(_ficha["disparo"]) and distancia <= float(_ficha["alcance"]):
		velocity = Vector2.ZERO
		if _cd <= 0.0:
			_cd = float(_ficha["cadencia"])
			Partida.herir(int(_ficha["dano"]))
	else:
		velocity = direccion * rapidez
		_separar()
	var antes := global_position
	move_and_slide()
	if global_position.distance_to(antes) < rapidez * delta * 0.2 and velocity.length() > 12.0:
		_atasco += delta
		if _atasco > 0.2:
			velocity = Vector2(-direccion.y, direccion.x) * rapidez
			move_and_slide()
	else:
		_atasco = 0.0
	if abs(direccion.x) > 0.1:
		$Cuerpo.scale.x = -1.0 if direccion.x < 0.0 else 1.0
	if velocity.length() > 8.0 and $Anim.current_animation != "andar":
		$Anim.play("andar")
	elif velocity.length() <= 8.0 and $Anim.current_animation != "quieto":
		$Anim.play("quieto")


func _separar() -> void:
	for otro in get_tree().get_nodes_in_group("enemigo"):
		if otro == self:
			continue
		var sep: Vector2 = global_position - otro.global_position
		var dist := sep.length()
		if dist < 28.0 and dist > 0.1:
			velocity += sep / dist * 36.0


func _preparar_animacion() -> void:
	var biblioteca := AnimationLibrary.new()
	var andar := Animation.new()
	andar.length = 0.4
	andar.loop_mode = Animation.LOOP_LINEAR
	var pista := andar.add_track(Animation.TYPE_VALUE)
	andar.track_set_path(pista, NodePath("Cuerpo:position"))
	andar.track_insert_key(pista, 0.0, Vector2(0, 0))
	andar.track_insert_key(pista, 0.2, Vector2(0, -3))
	andar.track_insert_key(pista, 0.4, Vector2(0, 0))
	biblioteca.add_animation("andar", andar)
	var quieto := Animation.new()
	quieto.length = 0.16
	var quieta := quieto.add_track(Animation.TYPE_VALUE)
	quieto.track_set_path(quieta, NodePath("Cuerpo:position"))
	quieto.track_insert_key(quieta, 0.0, Vector2(0, 0))
	biblioteca.add_animation("quieto", quieto)
	$Anim.add_animation_library("", biblioteca)
	$Anim.play("andar")
