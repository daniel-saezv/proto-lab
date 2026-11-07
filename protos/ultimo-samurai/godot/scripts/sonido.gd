extends Node

var _voces: Dictionary = {}
var _gesto := false

const _NOMBRES: PackedStringArray = [
	"corte", "golpe", "dano", "salto", "santuario", "kata", "jefe", "victoria", "despertar",
]


func _ready() -> void:
	for nombre in _NOMBRES:
		var ruta := "res://audio/%s.wav" % nombre
		if not ResourceLoader.exists(ruta):
			continue
		var voz := AudioStreamPlayer.new()
		voz.stream = load(ruta)
		voz.volume_db = -8.0 if nombre == "despertar" else -3.0
		voz.bus = &"Master"
		add_child(voz)
		_voces[nombre] = voz


func marcar_gesto() -> void:
	if _gesto:
		return
	_gesto = true
	var voz: AudioStreamPlayer = _voces.get("despertar")
	if voz:
		voz.play()


func suena(nombre: String) -> void:
	if not _gesto:
		return
	var voz: AudioStreamPlayer = _voces.get(nombre)
	if voz == null:
		return
	if voz.playing:
		voz.stop()
	voz.play()
