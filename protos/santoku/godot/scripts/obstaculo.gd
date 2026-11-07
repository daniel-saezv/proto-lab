class_name Obstaculo
extends StaticBody3D

var clase := "grieta"
var marca := ""
var ancho := 2.0
var alto := 0.45
var golpes := 0
var roto := false
var _aviso := false


func configurar(tipo: String, id: String, w: float, h: float) -> void:
	clase = tipo
	marca = id
	ancho = w
	alto = h


func _ready() -> void:
	add_to_group("obstaculo")
	collision_mask = 0
	var extra := Datos.CAPA_GRIETA
	var mat := Arte.musgo
	match clase:
		"puerta":
			extra = Datos.CAPA_PUERTA
			mat = Arte.musgo
		"sello":
			extra = Datos.CAPA_SELLO
			mat = Arte.hierro
		_:
			extra = Datos.CAPA_GRIETA
			mat = Arte.piedra
	collision_layer = Datos.CAPA_MUNDO | extra
	var forma := CollisionShape3D.new()
	var caja := BoxShape3D.new()
	caja.size = Vector3(ancho, alto, 3.1)
	forma.shape = caja
	add_child(forma)
	var malla := Arte.caja(caja.size, mat)
	add_child(malla)
	if clase == "puerta":
		var lazo := Arte.caja(Vector3(ancho * 0.7, 0.12, 3.2), Arte.cinabrio, false)
		lazo.position = Vector3(0, alto * 0.2, 0)
		add_child(lazo)
	elif clase == "sello":
		var runa := Arte.caja(Vector3(0.18, alto * 0.45, 0.08), Arte.oro, false)
		runa.position = Vector3(0, 0, 1.56)
		add_child(runa)
	elif clase == "grieta":
		var raja := Arte.caja(Vector3(ancho * 0.7, 0.06, 0.2), Arte.noche, false)
		raja.position = Vector3(0, alto * 0.5, 0.4)
		add_child(raja)


func recibir(_dano: int, tipo: String, _desde: float) -> void:
	if roto:
		return
	if clase == "grieta" and tipo == "kesa":
		_romper()
	elif clase == "puerta" and tipo == "iai":
		_romper()
	elif clase == "sello" and tipo == "kasumi":
		golpes += 1
		Estado.decir("Sello %d/5" % golpes)
		if golpes >= 5:
			_romper()
	elif not _aviso:
		_aviso = true
		if clase == "grieta":
			Estado.decir("Kesa, desde el aire, abre la grieta.")
		elif clase == "puerta":
			Estado.decir("El bambú cede al Iai.")
		else:
			Estado.decir("Hace falta la ráfaga Kasumi.")


func _romper() -> void:
	roto = true
	collision_layer = 0
	Estado.marcar_roto(marca)
	AudioJuego.tono("impacto")
	Guardado.guardar()
	var tw := create_tween()
	tw.tween_property(self, "position:y", position.y - 1.6, 0.35)
	tw.parallel().tween_property(self, "rotation:z", 0.5, 0.35)
	tw.tween_callback(queue_free)
