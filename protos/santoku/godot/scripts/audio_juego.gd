extends Node

var _flujos := {}
var _voces: Array[AudioStreamPlayer] = []
var _musica: AudioStreamPlayer
var _despierto := false


func _ready() -> void:
	_flujos["corte"] = _onda(680.0, 0.07, 0.35, true, 2.0)
	_flujos["impacto"] = _onda(180.0, 0.09, 0.4, true, 0.5)
	_flujos["salto"] = _onda(420.0, 0.06, 0.22, true, 1.5)
	_flujos["dash"] = _onda(240.0, 0.12, 0.3, true, 0.7)
	_flujos["herida"] = _onda(140.0, 0.16, 0.4, true, 0.4)
	_flujos["caida"] = _onda(90.0, 0.28, 0.35, true, 0.3)
	_flujos["campana"] = _onda(740.0, 0.45, 0.28, true, 1.0)
	_flujos["bloqueo"] = _onda(320.0, 0.08, 0.3, true, 3.2)
	_flujos["click"] = _onda(880.0, 0.04, 0.18, true, 2.0)
	for _i in 4:
		var voz := AudioStreamPlayer.new()
		voz.volume_db = -6.0
		add_child(voz)
		_voces.append(voz)
	_musica = AudioStreamPlayer.new()
	_musica.stream = _loop()
	_musica.volume_db = -18.0
	add_child(_musica)


func despertar() -> void:
	if _despierto:
		return
	_despierto = true
	tono("click")
	if DisplayServer.get_name() != "headless":
		_musica.play()


func tono(nombre: String) -> void:
	if not _despierto and nombre != "click":
		return
	var flujo: AudioStream = _flujos.get(nombre)
	if flujo == null:
		return
	for voz in _voces:
		if not voz.playing:
			voz.stream = flujo
			voz.play()
			return
	_voces[0].stream = flujo
	_voces[0].play()


func _onda(freq: float, dur: float, vol: float, decay: bool, arm: float) -> AudioStreamWAV:
	var tasa := 22050
	var n := int(tasa * dur)
	var datos := PackedByteArray()
	datos.resize(n * 2)
	for i in n:
		var t := float(i) / float(tasa)
		var env := 1.0
		if decay:
			env = exp(-t * (4.0 / maxf(dur, 0.01)))
		var s := sin(TAU * freq * t) * vol * env
		s += sin(TAU * freq * arm * t) * vol * 0.25 * env
		var v := int(clampf(s, -1.0, 1.0) * 32767.0)
		datos[i * 2] = v & 255
		datos[i * 2 + 1] = (v >> 8) & 255
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = tasa
	stream.stereo = false
	stream.data = datos
	return stream


func _loop() -> AudioStreamWAV:
	var tasa := 22050
	var dur := 1.6
	var n := int(float(tasa) * dur)
	var notas: Array[float] = [392.0, 440.0, 494.0, 392.0, 330.0, 349.0, 392.0, 294.0]
	var datos := PackedByteArray()
	datos.resize(n * 2)
	for i in n:
		var t := float(i) / float(tasa)
		var idx := int(t / 0.2) % notas.size()
		var local := fmod(t, 0.2)
		var env := exp(-local * 9.0)
		var f: float = notas[idx]
		var s := sin(TAU * f * t) * 0.2 * env
		s += sin(TAU * f * 2.0 * t) * 0.05 * env
		var v := int(clampf(s, -1.0, 1.0) * 32767.0)
		datos[i * 2] = v & 255
		datos[i * 2 + 1] = (v >> 8) & 255
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = tasa
	stream.stereo = false
	stream.data = datos
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = n
	return stream
