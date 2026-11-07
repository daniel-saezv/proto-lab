class_name Descanso
extends Node3D

var marca := "umbral"
var titulo := "Descanso"


func configurar(id: String, rotulo: String) -> void:
	marca = id
	titulo = rotulo


func _ready() -> void:
	add_to_group("interaccion")
	var poste := Arte.cilindro(0.12, 1.5, Arte.madera_osc, 6)
	poste.position = Vector3(0, 0.75, 0)
	add_child(poste)
	var luz_malla := Arte.esfera(0.22, Arte.farol)
	luz_malla.position = Vector3(0, 1.55, 0)
	add_child(luz_malla)
	var omni := OmniLight3D.new()
	omni.position = Vector3(0, 1.55, 0)
	omni.light_color = Color("ffb15a")
	omni.light_energy = 1.15
	omni.omni_range = 5.5
	omni.shadow_enabled = false
	add_child(omni)
	var letrero := Label3D.new()
	letrero.text = titulo
	letrero.font_size = 40
	letrero.pixel_size = 0.008
	letrero.position = Vector3(0, 2.15, 0)
	letrero.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	letrero.modulate = Color("ffd7a1")
	letrero.outline_size = 8
	add_child(letrero)


func activar() -> void:
	Estado.checkpoint = marca
	get_tree().call_group("hud", "abrir_santuario", self)


func curar() -> void:
	Estado.checkpoint = marca
	Estado.curar_total()
	Estado.descanso_hecho.emit()
	AudioJuego.tono("campana")
	Estado.decir("Recuperas el aliento. La partida queda guardada.")
	Guardado.guardar()


func refinar() -> bool:
	if not Estado.refinar():
		if Estado.refinado >= 2:
			Estado.decir("El kata ya no admite más filo.")
		else:
			Estado.decir("Hacen falta 3 de espíritu para afinar.")
		return false
	Estado.checkpoint = marca
	Estado.curar(2)
	Estado.descanso_hecho.emit()
	AudioJuego.tono("campana")
	Guardado.guardar()
	return true
