extends CanvasLayer

var _santuario: Descanso
var _panel: Control
var _texto: Label
var _banner: Label
var _vida: Control
var _estado: Label
var _mapa: Label
var _pista: Label
var _jefe_caja: Control
var _jefe_nombre: Label
var _jefe_barra: ProgressBar
var _meditar: Button
var _base_joy := Vector2.ZERO
var _dedo := -1
var _origen := Vector2.ZERO


func _ready() -> void:
	add_to_group("hud")
	layer = 10
	var tema := _tema()
	var raiz := Control.new()
	raiz.set_anchors_preset(Control.PRESET_FULL_RECT)
	raiz.mouse_filter = Control.MOUSE_FILTER_IGNORE
	raiz.theme = tema
	add_child(raiz)
	_vida = VidaLienzo.new()
	_vida.position = Vector2(16, 18)
	_vida.custom_minimum_size = Vector2(180, 36)
	_vida.size = Vector2(180, 36)
	_vida.mouse_filter = Control.MOUSE_FILTER_IGNORE
	raiz.add_child(_vida)
	_estado = Label.new()
	_estado.position = Vector2(16, 52)
	_estado.add_theme_font_size_override("font_size", 16)
	raiz.add_child(_estado)
	_mapa = Label.new()
	_mapa.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_mapa.offset_top = 16
	_mapa.offset_bottom = 48
	_mapa.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_mapa.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_mapa.mouse_filter = Control.MOUSE_FILTER_IGNORE
	raiz.add_child(_mapa)
	_banner = Label.new()
	_banner.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_banner.offset_top = 78
	_banner.offset_bottom = 150
	_banner.offset_left = -150
	_banner.offset_right = 150
	_banner.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	raiz.add_child(_banner)
	_pista = Label.new()
	_pista.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_pista.offset_top = -210
	_pista.offset_bottom = -168
	_pista.offset_left = -160
	_pista.offset_right = 160
	_pista.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_pista.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_pista.add_theme_font_size_override("font_size", 14)
	_pista.mouse_filter = Control.MOUSE_FILTER_IGNORE
	raiz.add_child(_pista)
	_jefe_caja = VBoxContainer.new()
	_jefe_caja.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_jefe_caja.offset_top = 150
	_jefe_caja.offset_left = -120
	_jefe_caja.offset_right = 120
	_jefe_caja.visible = false
	_jefe_nombre = Label.new()
	_jefe_nombre.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_jefe_barra = ProgressBar.new()
	_jefe_barra.max_value = 100
	_jefe_barra.show_percentage = false
	_jefe_barra.custom_minimum_size = Vector2(200, 16)
	_jefe_caja.add_child(_jefe_nombre)
	_jefe_caja.add_child(_jefe_barra)
	raiz.add_child(_jefe_caja)
	var salto := _boton("Salto")
	var corte := _boton("Corte")
	var kata := _boton("Kata")
	_meditar = _boton("Meditar")
	_meditar.visible = false
	var columna := VBoxContainer.new()
	columna.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	columna.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	columna.grow_vertical = Control.GROW_DIRECTION_BEGIN
	columna.offset_left = -118
	columna.offset_top = -430
	columna.offset_right = -16
	columna.offset_bottom = -24
	columna.add_theme_constant_override("separation", 14)
	columna.add_child(salto)
	columna.add_child(corte)
	columna.add_child(kata)
	columna.add_child(_meditar)
	raiz.add_child(columna)
	salto.focus_neighbor_bottom = salto.get_path_to(corte)
	corte.focus_neighbor_top = corte.get_path_to(salto)
	corte.focus_neighbor_bottom = corte.get_path_to(kata)
	kata.focus_neighbor_top = kata.get_path_to(corte)
	kata.focus_neighbor_bottom = kata.get_path_to(_meditar)
	_meditar.focus_neighbor_top = _meditar.get_path_to(kata)
	salto.button_down.connect(func() -> void:
		Estado.salto_mantenido = true
		Estado.pulso_salto = true
	)
	salto.button_up.connect(func() -> void: Estado.salto_mantenido = false)
	corte.pressed.connect(func() -> void: Estado.pulso_corte = true)
	kata.pressed.connect(func() -> void: Estado.pulso_kata = true)
	_meditar.pressed.connect(func() -> void: Estado.pulso_meditar = true)
	_panel = _construir_panel(tema)
	raiz.add_child(_panel)
	Estado.cambio.connect(_refrescar)
	Estado.mensaje.connect(_mostrar)
	_refrescar()
	_mostrar("Santoku. El filo vuelve al bosque.")


func abrir_santuario(nodo: Descanso) -> void:
	_santuario = nodo
	_panel.visible = true
	Estado.en_santuario = true
	_texto.text = "La linterna está quieta.\nRecupera el aliento o gasta 3 de espíritu en afinar el kata.\nAhora: %d espíritu, filo %d/2." % [Estado.espiritu, Estado.refinado]


func pulsar_curar() -> void:
	if _santuario:
		_santuario.curar()
	_cerrar_panel()


func pulsar_refinar() -> void:
	if _santuario and _santuario.refinar():
		_cerrar_panel()


func pulsar_volver() -> void:
	_cerrar_panel()


func mostrar_jefe(titulo: String, ratio: float) -> void:
	if ratio < 0.0 or titulo == "":
		_jefe_caja.visible = false
		return
	_jefe_caja.visible = true
	_jefe_nombre.text = titulo
	_jefe_barra.value = ratio * 100.0


func _cerrar_panel() -> void:
	_panel.visible = false
	Estado.en_santuario = false
	_santuario = null


func _process(_delta: float) -> void:
	var jugador := get_tree().get_first_node_in_group("jugador") as Node3D
	var cerca := false
	if jugador:
		for nodo in get_tree().get_nodes_in_group("interaccion"):
			if jugador.global_position.distance_to((nodo as Node3D).global_position) < 1.85:
				cerca = true
				break
	_meditar.visible = cerca and not _panel.visible
	_dibujar_joy()


func _input(evento: InputEvent) -> void:
	var ancho := get_viewport().get_visible_rect().size.x
	if evento is InputEventScreenTouch:
		var toque := evento as InputEventScreenTouch
		if toque.position.x > ancho * 0.46:
			return
		if toque.pressed and _dedo < 0:
			_dedo = toque.index
			_origen = toque.position
			_base_joy = toque.position
		elif not toque.pressed and toque.index == _dedo:
			_dedo = -1
			Estado.eje_virtual = 0.0
			Estado.abajo_virtual = false
	elif evento is InputEventScreenDrag and (evento as InputEventScreenDrag).index == _dedo:
		var arrastre := evento as InputEventScreenDrag
		var eje := (arrastre.position - _origen) / 76.0
		if eje.length() > 1.0:
			eje = eje.normalized()
		Estado.eje_virtual = eje.x
		Estado.abajo_virtual = eje.y > 0.5


func _refrescar() -> void:
	var katas: PackedStringArray = []
	for nombre in ["kihon", "kesa", "iai", "kasumi", "fujin"]:
		if Estado.tiene(nombre):
			katas.append(nombre)
	_estado.text = "Espíritu %d\n%s" % [Estado.espiritu, " · ".join(katas)]
	_mapa.text = Estado.mapa_nombre
	_pista.text = Estado.pista()
	if _vida:
		_vida.queue_redraw()


func _mostrar(texto: String) -> void:
	_banner.text = texto
	_banner.modulate.a = 1.0
	var tw := create_tween()
	tw.tween_interval(1.6)
	tw.tween_property(_banner, "modulate:a", 0.0, 0.45)


func _boton(texto: String) -> Button:
	var boton := Button.new()
	boton.text = texto
	boton.custom_minimum_size = Vector2(96, 84)
	boton.focus_mode = Control.FOCUS_ALL
	return boton


func _construir_panel(tema: Theme) -> Control:
	var fondo := ColorRect.new()
	fondo.set_anchors_preset(Control.PRESET_FULL_RECT)
	fondo.color = Color(0.05, 0.03, 0.06, 0.72)
	fondo.visible = false
	fondo.mouse_filter = Control.MOUSE_FILTER_STOP
	var caja := VBoxContainer.new()
	caja.set_anchors_preset(Control.PRESET_CENTER)
	caja.offset_left = -150
	caja.offset_top = -160
	caja.offset_right = 150
	caja.offset_bottom = 160
	caja.add_theme_constant_override("separation", 12)
	caja.theme = tema
	var titulo := Label.new()
	titulo.text = "Descanso"
	titulo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_texto = Label.new()
	_texto.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_texto.custom_minimum_size = Vector2(280, 80)
	var curar := _boton("Recuperar")
	var refinar := _boton("Refinar")
	var volver := _boton("Volver")
	curar.pressed.connect(pulsar_curar)
	refinar.pressed.connect(pulsar_refinar)
	volver.pressed.connect(pulsar_volver)
	caja.add_child(titulo)
	caja.add_child(_texto)
	caja.add_child(curar)
	caja.add_child(refinar)
	caja.add_child(volver)
	fondo.add_child(caja)
	return fondo


func _dibujar_joy() -> void:
	pass


func _tema() -> Theme:
	var tema := Theme.new()
	var normal := _caja(Color("241820"), Color("e2b15a"))
	var pulsado := _caja(Color("8c2f2a"), Color("f3e6cf"))
	tema.set_stylebox("normal", "Button", normal)
	tema.set_stylebox("hover", "Button", normal)
	tema.set_stylebox("pressed", "Button", pulsado)
	tema.set_stylebox("focus", "Button", pulsado)
	tema.set_color("font_color", "Button", Color("f6edd8"))
	tema.set_font_size("font_size", "Button", 16)
	tema.set_color("font_color", "Label", Color("f6edd8"))
	tema.set_font_size("font_size", "Label", 18)
	tema.set_color("font_outline_color", "Label", Color("140c10"))
	tema.set_constant("outline_size", "Label", 6)
	var barra := _caja(Color("3a2428"), Color("e2b15a"))
	var relleno := _caja(Color("d64532"), Color("f3e6cf"))
	tema.set_stylebox("background", "ProgressBar", barra)
	tema.set_stylebox("fill", "ProgressBar", relleno)
	return tema


func _caja(fondo: Color, borde: Color) -> StyleBoxFlat:
	var caja := StyleBoxFlat.new()
	caja.bg_color = fondo
	caja.border_color = borde
	caja.set_border_width_all(2)
	caja.set_corner_radius_all(16)
	caja.content_margin_left = 8
	caja.content_margin_right = 8
	caja.content_margin_top = 6
	caja.content_margin_bottom = 6
	return caja


class VidaLienzo extends Control:
	func _draw() -> void:
		for i in Estado.salud_max:
			var color := Color("e24b3b") if i < Estado.salud else Color("3a242c")
			draw_circle(Vector2(16 + i * 30, 16), 11, color)
			draw_arc(Vector2(16 + i * 30, 16), 13, 0, TAU, 16, Color("f3e6cf"), 1.5)
