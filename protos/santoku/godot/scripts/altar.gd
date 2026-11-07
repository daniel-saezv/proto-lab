class_name Altar
extends Node3D

var kata := "kesa"
var titulo := "Altar"
var punto := ""


func configurar(nombre: String, rotulo: String, marca_punto: String = "") -> void:
	kata = nombre
	titulo = rotulo
	punto = marca_punto


func _ready() -> void:
	add_to_group("interaccion")
	var base := Arte.cilindro(0.42, 0.9, Arte.piedra, 8)
	base.position = Vector3(0, 0.45, 0)
	add_child(base)
	var copa := Arte.caja(Vector3(0.7, 0.16, 0.7), Arte.oro)
	copa.position = Vector3(0, 0.98, 0)
	add_child(copa)
	var letrero := Label3D.new()
	letrero.text = titulo
	letrero.font_size = 42
	letrero.pixel_size = 0.008
	letrero.position = Vector3(0, 1.7, 0)
	letrero.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	letrero.modulate = Color("f3e6cf")
	letrero.outline_size = 8
	add_child(letrero)


func activar() -> void:
	if punto != "":
		Estado.checkpoint = punto
	if Estado.aprender(kata):
		AudioJuego.tono("campana")
		Guardado.guardar()
	else:
		Estado.decir("Este altar ya entregó su kata.")
