extends Control

var toques: int = 0

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		toques += 1
		$Aviso.text = "Toques: %d" % toques
		$Fondo.color = Color(0.45, 0.28, 0.16, 1)
