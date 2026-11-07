extends Node
class_name AudioCocina

## Tonos cortos. El primero suena dentro del gesto, cuando el navegador ya deja audio.

var _listo := false
var _voces: Array[AudioStreamPlayer] = []
var _cursor := 0


func _ready() -> void:
	for _i in 4:
		var voz := AudioStreamPlayer.new()
		voz.volume_db = -8.0
		add_child(voz)
		_voces.append(voz)


func saludo() -> void:
	if _listo:
		return
	_listo = true
	_tocar(_melodia([523.0, 659.0, 784.0], 0.09))


func golpe() -> void:
	_tocar(_tono(180.0, 0.07, 0.35))


func dano() -> void:
	_tocar(_tono(110.0, 0.12, 0.3))


func recoger() -> void:
	_tocar(_melodia([660.0, 880.0], 0.06))


func cocinar() -> void:
	_tocar(_melodia([392.0, 523.0, 784.0], 0.1))


func contratar() -> void:
	_tocar(_melodia([494.0, 659.0], 0.11))


func _tocar(stream: AudioStreamWAV) -> void:
	if _voces.is_empty():
		return
	var voz := _voces[_cursor % _voces.size()]
	_cursor += 1
	voz.stream = stream
	voz.play()


func _melodia(notas: Array, largo: float) -> AudioStreamWAV:
	var trozos: Array[AudioStreamWAV] = []
	for nota in notas:
		trozos.append(_tono(float(nota), largo, 0.28))
	return _unir(trozos)


func _unir(trozos: Array[AudioStreamWAV]) -> AudioStreamWAV:
	var datos := PackedByteArray()
	for trozo in trozos:
		datos.append_array(trozo.data)
	return _stream(datos)


func _tono(frecuencia: float, duracion: float, volumen: float) -> AudioStreamWAV:
	var tasa := 22050
	var muestras := int(tasa * duracion)
	var datos := PackedByteArray()
	datos.resize(muestras * 2)
	for i in muestras:
		var t := float(i) / float(tasa)
		var env := 1.0 - (t / duracion)
		var valor := sin(TAU * frecuencia * t) * env * volumen
		datos.encode_s16(i * 2, int(clampf(valor, -1.0, 1.0) * 32767.0))
	return _stream(datos)


func _stream(datos: PackedByteArray) -> AudioStreamWAV:
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 22050
	stream.stereo = false
	stream.data = datos
	return stream
