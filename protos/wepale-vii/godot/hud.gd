extends CanvasLayer

signal otra
signal cambiar

var jugando := false
var oficio: Dictionary = {}
var mando := Vector2.ZERO
var dedo_palo := -1
var origen_palo := Vector2.ZERO
var palo: Control
var teclas := {}
var vida_relleno: ColorRect
var linea: Label
var subtitulo: Label
var cartel: Label
var fin: Control
var fin_titulo: Label
var fin_cuerpo: Label
var anuncio: Tween


func _ready() -> void:
	layer = 6
	var raiz := Control.new()
	raiz.set_anchors_preset(Control.PRESET_FULL_RECT)
	raiz.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(raiz)
	_barra(raiz)
	_palo(raiz)
	_teclas(raiz)
	_cartel(raiz)
	_fin(raiz)


func cerrar() -> void:
	visible = false
	jugando = false
	mando = Vector2.ZERO


func abrir(datos: Dictionary) -> void:
	oficio = datos
	visible = true
	jugando = true
	fin.visible = false
	_pintar_nombres()
	var ataque: Dictionary = datos["ataque"]
	teclas["ataque"].pintar(str(ataque["nombre"]), 0.0)
	var lista: Array = datos["habilidades"]
	for i in lista.size():
		teclas[str(i)].pintar(str(lista[i]["nombre"]), 0.0)


func seguir(jugador, ronda: int, quedan: int) -> void:
	if not jugando:
		return
	var puntos := int(jugador.vida)
	var maximo := maxi(1, int(jugador.vida_max))
	vida_relleno.anchor_right = clampf(float(puntos) / float(maximo), 0.0, 1.0)
	linea.text = "Ronda %d/3 · quedan %d" % [ronda, quedan]
	subtitulo.text = "%s · Tvresn contra Ajgulzil" % str(oficio.get("nombre", ""))
	var ataque: Dictionary = oficio["ataque"]
	teclas["ataque"].pintar(str(ataque["nombre"]), jugador.fraccion(str(ataque["id"])))
	if jugador.segundos(str(ataque["id"])) > 0.05:
		teclas["ataque"].rotulo.text = "%.1f" % jugador.segundos(str(ataque["id"]))
	var lista: Array = oficio["habilidades"]
	for i in lista.size():
		var hab: Dictionary = lista[i]
		var tecla = teclas[str(i)]
		tecla.pintar(str(hab["nombre"]), jugador.fraccion(str(hab["id"])))
		if jugador.segundos(str(hab["id"])) > 0.05:
			tecla.rotulo.text = "%.1f" % jugador.segundos(str(hab["id"]))


func direccion(camara: Camera3D) -> Vector3:
	if not jugando or mando.length() < 0.12 or camara == null:
		return Vector3.ZERO
	var adelante := -camara.global_transform.basis.z
	adelante.y = 0.0
	var derecha := camara.global_transform.basis.x
	derecha.y = 0.0
	if adelante.length() < 0.001 or derecha.length() < 0.001:
		return Vector3.ZERO
	adelante = adelante.normalized()
	derecha = derecha.normalized()
	var fuerza := clampf(mando.length(), 0.0, 1.0)
	var mundo := derecha * mando.x + adelante * -mando.y
	if mundo.length() < 0.001:
		return Vector3.ZERO
	return mundo.normalized() * fuerza


func aviso(texto: String) -> void:
	cartel.text = texto
	cartel.modulate.a = 1.0
	if anuncio:
		anuncio.kill()
	anuncio = create_tween()
	anuncio.tween_interval(0.55)
	anuncio.tween_property(cartel, "modulate:a", 0.0, 0.35)


func mostrar_fin(gano: bool, nombre: String) -> void:
	jugando = false
	mando = Vector2.ZERO
	dedo_palo = -1
	if palo:
		palo.knob = Vector2.ZERO
		palo.queue_redraw()
	fin.visible = true
	if gano:
		fin_titulo.text = "La plaza aguanta"
		fin_cuerpo.text = "%s cierra la noche. Tvresn sigue brindando y Ajgulzil sigue repartiendo. La cuenta, otro día." % nombre
	else:
		fin_titulo.text = "Sin fiesta"
		fin_cuerpo.text = "%s cae en la encrucijada. Alguien tendrá que pagar la cuenta." % nombre


func _input(evento: InputEvent) -> void:
	if not jugando or fin.visible:
		return
	if evento is InputEventScreenTouch:
		if evento.pressed:
			_pulsar(evento.index, evento.position)
		else:
			_soltar(evento.index)
	elif evento is InputEventScreenDrag:
		_arrastrar(evento.index, evento.position)


func _pulsar(indice: int, pos: Vector2) -> void:
	for slot in teclas.keys():
		var rect: Rect2 = teclas[slot].get_global_rect().grow(10)
		if rect.has_point(pos):
			var jugador := get_tree().get_first_node_in_group("player")
			if jugador:
				jugador.intentar(str(slot))
			return
	if pos.x < get_viewport().get_visible_rect().size.x * 0.5:
		dedo_palo = indice
		origen_palo = pos
		_mando_desde(pos)


func _arrastrar(indice: int, pos: Vector2) -> void:
	if indice == dedo_palo:
		_mando_desde(pos)


func _soltar(indice: int) -> void:
	if indice != dedo_palo:
		return
	dedo_palo = -1
	mando = Vector2.ZERO
	palo.knob = Vector2.ZERO
	palo.queue_redraw()


func _mando_desde(pos: Vector2) -> void:
	var delta := pos - origen_palo
	var tope := 70.0
	if delta.length() > tope:
		delta = delta.normalized() * tope
	palo.knob = delta
	mando = delta / tope
	palo.queue_redraw()


func _pintar_nombres() -> void:
	linea.text = "Ronda 1/3"
	subtitulo.text = "%s · Tvresn contra Ajgulzil" % str(oficio.get("nombre", ""))


func _barra(raiz: Control) -> void:
	var caja := Control.new()
	caja.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_anclar(caja, 0.02, 0.13, 0.05, 0.95)
	raiz.add_child(caja)
	linea = _rotulo(caja, 20, Color(0.98, 0.94, 0.86))
	_anclar(linea, 0.0, 0.42, 0.0, 1.0)
	subtitulo = _rotulo(caja, 14, Color(0.95, 0.78, 0.48))
	_anclar(subtitulo, 0.4, 0.68, 0.0, 1.0)
	var fondo := ColorRect.new()
	fondo.color = Color(0.12, 0.06, 0.08, 0.9)
	fondo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_anclar(fondo, 0.72, 0.98, 0.08, 0.92)
	caja.add_child(fondo)
	vida_relleno = ColorRect.new()
	vida_relleno.color = Color(0.86, 0.28, 0.32)
	vida_relleno.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vida_relleno.anchor_left = 0.0
	vida_relleno.anchor_top = 0.0
	vida_relleno.anchor_right = 1.0
	vida_relleno.anchor_bottom = 1.0
	fondo.add_child(vida_relleno)


func _palo(raiz: Control) -> void:
	palo = Palo.new()
	palo.anchor_left = 0.0
	palo.anchor_right = 0.0
	palo.anchor_top = 1.0
	palo.anchor_bottom = 1.0
	palo.offset_left = 18
	palo.offset_right = 168
	palo.offset_top = -280
	palo.offset_bottom = -96
	palo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	raiz.add_child(palo)


func _teclas(raiz: Control) -> void:
	var caja := Control.new()
	caja.mouse_filter = Control.MOUSE_FILTER_IGNORE
	caja.anchor_left = 1.0
	caja.anchor_right = 1.0
	caja.anchor_top = 1.0
	caja.anchor_bottom = 1.0
	caja.offset_left = -214
	caja.offset_right = -14
	caja.offset_top = -312
	caja.offset_bottom = -36
	raiz.add_child(caja)
	teclas["0"] = _tecla(caja, Vector2(8, 8), Vector2(86, 64), Color(0.28, 0.16, 0.34))
	teclas["1"] = _tecla(caja, Vector2(8, 82), Vector2(86, 64), Color(0.22, 0.18, 0.4))
	teclas["2"] = _tecla(caja, Vector2(8, 156), Vector2(86, 64), Color(0.36, 0.18, 0.22))
	teclas["ataque"] = _tecla(caja, Vector2(104, 108), Vector2(92, 92), Color(0.62, 0.32, 0.14))


func _tecla(padre: Control, pos: Vector2, tam: Vector2, fondo: Color) -> Tecla:
	var tecla := Tecla.new()
	tecla.fondo = fondo
	tecla.anchor_left = 0.0
	tecla.anchor_top = 0.0
	tecla.anchor_right = 0.0
	tecla.anchor_bottom = 0.0
	tecla.offset_left = pos.x
	tecla.offset_top = pos.y
	tecla.offset_right = pos.x + tam.x
	tecla.offset_bottom = pos.y + tam.y
	tecla.mouse_filter = Control.MOUSE_FILTER_IGNORE
	padre.add_child(tecla)
	return tecla


func _cartel(raiz: Control) -> void:
	cartel = _rotulo(raiz, 32, Color(0.98, 0.92, 0.78))
	cartel.modulate.a = 0.0
	_anclar(cartel, 0.34, 0.42)


func _fin(raiz: Control) -> void:
	fin = Control.new()
	fin.visible = false
	fin.set_anchors_preset(Control.PRESET_FULL_RECT)
	raiz.add_child(fin)
	var velo := ColorRect.new()
	velo.color = Color(0.05, 0.03, 0.07, 0.78)
	velo.set_anchors_preset(Control.PRESET_FULL_RECT)
	fin.add_child(velo)
	fin_titulo = _rotulo(fin, 32, Color(0.98, 0.93, 0.84))
	_anclar(fin_titulo, 0.28, 0.36)
	fin_cuerpo = _rotulo(fin, 16, Color(0.92, 0.88, 0.82))
	fin_cuerpo.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_anclar(fin_cuerpo, 0.37, 0.5)
	var repetir := Button.new()
	repetir.text = "Otra ronda"
	repetir.add_theme_font_size_override("font_size", 20)
	_anclar(repetir, 0.56, 0.64)
	repetir.pressed.connect(func() -> void: otra.emit())
	fin.add_child(repetir)
	var cambiar_oficio := Button.new()
	cambiar_oficio.text = "Cambiar oficio"
	cambiar_oficio.add_theme_font_size_override("font_size", 20)
	_anclar(cambiar_oficio, 0.67, 0.75)
	cambiar_oficio.pressed.connect(func() -> void: cambiar.emit())
	fin.add_child(cambiar_oficio)


func _rotulo(padre: Node, tam: int, tinta: Color) -> Label:
	var rotulo := Label.new()
	rotulo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rotulo.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	rotulo.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rotulo.add_theme_font_size_override("font_size", tam)
	rotulo.add_theme_color_override("font_color", tinta)
	rotulo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	padre.add_child(rotulo)
	return rotulo


func _anclar(nodo: Control, arriba: float, abajo: float, izquierda := 0.08, derecha := 0.92) -> void:
	nodo.anchor_left = izquierda
	nodo.anchor_top = arriba
	nodo.anchor_right = derecha
	nodo.anchor_bottom = abajo
	nodo.offset_left = 0
	nodo.offset_top = 0
	nodo.offset_right = 0
	nodo.offset_bottom = 0


class Palo extends Control:
	var knob := Vector2.ZERO

	func _draw() -> void:
		var centro := size * 0.5
		draw_arc(centro, 62.0, 0.0, TAU, 40, Color(1, 1, 1, 0.28), 4.0, true)
		draw_circle(centro + knob, 28.0, Color(0.98, 0.84, 0.42, 0.9))


class Tecla extends Control:
	var rotulo: Label
	var fondo := Color(0.25, 0.14, 0.2, 0.94)
	var velo := 0.0

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		rotulo = Label.new()
		rotulo.set_anchors_preset(Control.PRESET_FULL_RECT)
		rotulo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		rotulo.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		rotulo.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		rotulo.add_theme_font_size_override("font_size", 15)
		rotulo.add_theme_color_override("font_color", Color(0.98, 0.96, 0.92))
		rotulo.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(rotulo)

	func pintar(nombre: String, fraccion: float) -> void:
		velo = clampf(fraccion, 0.0, 1.0)
		if rotulo:
			rotulo.text = nombre
		queue_redraw()

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), fondo, true)
		draw_rect(Rect2(Vector2.ZERO, size), Color(1, 0.9, 0.6, 0.8), false, 2.0)
		if velo > 0.0:
			var alto := size.y * velo
			draw_rect(Rect2(0, size.y - alto, size.x, alto), Color(0, 0, 0, 0.5), true)
