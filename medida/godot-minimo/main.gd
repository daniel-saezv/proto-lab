extends Control

var toques: int = 0

func _ready() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__medidaLista = true")

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		toques += 1
		$Aviso.text = "Toques: %d" % toques
		if OS.has_feature("web"):
			JavaScriptBridge.eval("window.__medidaToques = %d" % toques)
