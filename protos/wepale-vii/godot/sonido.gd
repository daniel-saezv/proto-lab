extends Node

## El primer sonido sale en el toque, dentro de _input. Sin hilos: muestras cortas.

var abierto := false
var _golpe: AudioStreamWAV
var _habilidad: AudioStreamWAV
var _herida: AudioStreamWAV
var _cura: AudioStreamWAV
var _victoria: AudioStreamWAV
var _derrota: AudioStreamWAV
var _abrir: AudioStreamWAV
var _voces: Array[AudioStreamPlayer] = []
var _turno := 0


func _ready() -> void:
	add_to_group("sonido")
	_abrir = _onda(660.0, 0.12, 0.32, 8.0)
	_golpe = _onda(196.0, 0.07, 0.28, 22.0)
	_habilidad = _onda(440.0, 0.11, 0.3, 12.0)
	_herida = _onda(110.0, 0.14, 0.32, 10.0)
	_cura = _onda(784.0, 0.16, 0.26, 7.0)
	_victoria = _melodia([523.0, 659.0, 784.0], 0.12)
	_derrota = _melodia([311.0, 233.0], 0.16)
	for _i in 3:
		var voz := AudioStreamPlayer.new()
		voz.volume_db = -6.0
		add_child(voz)
		_voces.append(voz)


func _input(evento: InputEvent) -> void:
	if evento is InputEventScreenTouch and evento.pressed:
		abrir()


func abrir() -> void:
	if abierto:
		return
	abierto = true
	_emitir(_abrir)


func tocar(nombre: String) -> void:
	if not abierto:
		return
	match nombre:
		"golpe":
			_emitir(_golpe)
		"habilidad":
			_emitir(_habilidad)
		"herida":
			_emitir(_herida)
		"cura":
			_emitir(_cura)
		"victoria":
			_emitir(_victoria)
		"derrota":
			_emitir(_derrota)


func _emitir(flujo: AudioStreamWAV) -> void:
	var voz := _voces[_turno % _voces.size()]
	_turno += 1
	voz.stream = flujo
	voz.play()


func _onda(frecuencia: float, segundos: float, volumen: float, caida: float) -> AudioStreamWAV:
	return _desde(_muestras(frecuencia, segundos, volumen, caida))


func _melodia(notas: Array, segundos: float) -> AudioStreamWAV:
	var datos := PackedByteArray()
	for nota in notas:
		datos.append_array(_muestras(float(nota), segundos, 0.28, 6.0))
	return _desde(datos)


func _muestras(frecuencia: float, segundos: float, volumen: float, caida: float) -> PackedByteArray:
	var tasa := 22050
	var total := int(float(tasa) * segundos)
	var datos := PackedByteArray()
	datos.resize(total * 2)
	for i in total:
		var t := float(i) / float(tasa)
		var envolvente := exp(-t * caida)
		var muestra := sin(TAU * frecuencia * t) * envolvente * volumen
		datos.encode_s16(i * 2, int(clampf(muestra, -1.0, 1.0) * 32767.0))
	return datos


func _desde(datos: PackedByteArray) -> AudioStreamWAV:
	var flujo := AudioStreamWAV.new()
	flujo.format = AudioStreamWAV.FORMAT_16_BITS
	flujo.mix_rate = 22050
	flujo.stereo = false
	flujo.data = datos
	return flujo
