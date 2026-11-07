extends Area3D

var tipo := "seta"
var juego: Node
var _tomado := false


func configurar(kind: String, dueno: Node) -> void:
	tipo = kind
	juego = dueno
	match tipo:
		"baya":
			Mallas.baya($Bob)
		"raiz":
			Mallas.raiz($Bob)
		"hueso":
			Mallas.hueso($Bob)
		"ala":
			Mallas.ala($Bob)
		"especia":
			Mallas.especia($Bob)
		"baba":
			Mallas.baba($Bob)
		_:
			Mallas.seta($Bob, Color("d24a3a"))
	var flote := create_tween().set_loops()
	flote.tween_property($Bob, "position:y", 0.18, 0.7).set_trans(Tween.TRANS_SINE)
	flote.tween_property($Bob, "position:y", 0.0, 0.7).set_trans(Tween.TRANS_SINE)


func _ready() -> void:
	body_entered.connect(_al_entrar)


func _al_entrar(cuerpo: Node) -> void:
	if _tomado or not cuerpo.is_in_group("jugador"):
		return
	if juego != null and juego.muerto:
		return
	_tomado = true
	juego.recoger(tipo)
	queue_free()
