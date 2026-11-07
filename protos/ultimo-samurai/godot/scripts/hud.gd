extends CanvasLayer

var eje_x := 0.0
var _salto := false
var _ataque := false
var _kata := false
var _meditar := false
var _palanca: Control
var _boton_kata: Button
var _boton_meditar: Button
var _corazones: RichTextLabel
var _nombre: Label
var _aviso: RichTextLabel
var _barra: ProgressBar
var _menu: Control
var _aprender: Button
var _titulo: Control


func _ready() -> void:
	add_to_group("hud")
	layer = 10
	_montar()
	Partida.cambio_vidas.connect(_pintar_vidas)
	Partida.anuncio.connect(mostrar)
	Partida.kata_lista.connect(_refrescar_kata)
	Partida.jefe_cambio.connect(_vida_jefe)
	_pintar_vidas()
	_refrescar_kata()
	_entrada()


func _process(_delta: float) -> void:
	if _palanca and "eje" in _palanca:
		eje_x = float(_palanca.get("eje"))


func consumir_salto() -> bool:
	var valor := _salto
	_salto = false
	return valor


func consumir_ataque() -> bool:
	var valor := _ataque
	_ataque = false
	return valor


func consumir_kata() -> bool:
	var valor := _kata
	_kata = false
	return valor


func consumir_meditar() -> bool:
	var valor := _meditar
	_meditar = false
	return valor


func mostrar_meditar(visible: bool) -> void:
	if _boton_meditar:
		_boton_meditar.visible = visible and not Partida.pausa


func mostrar(texto: String) -> void:
	if _aviso == null:
		return
	_aviso.text = texto
	_aviso.modulate.a = 1.0
	_aviso.visible = true
	var anim := create_tween()
	anim.tween_interval(2.4)
	anim.tween_property(_aviso, "modulate:a", 0.0, 0.4)


func ver_jefe(encendido: bool) -> void:
	if _barra:
		_barra.visible = encendido


func abrir_santuario() -> void:
	if _menu == null or _menu.visible:
		return
	Partida.santuario = true
	Partida.control = Partida.punto_santuario
	Partida.guardar()
	Partida.pausa = true
	_menu.visible = true
	_menu.mouse_filter = Control.MOUSE_FILTER_STOP
	mostrar_meditar(false)
	if _aprender:
		_aprender.disabled = Partida.tiene_tatsumaki
		_aprender.text = "Tatsumaki grabado" if Partida.tiene_tatsumaki else "Grabar el Tatsumaki"
	var curar := _menu.find_child("Curar", true, false) as Button
	if curar and _aprender:
		curar.focus_neighbor_bottom = curar.get_path_to(_aprender)
		_aprender.focus_neighbor_top = _aprender.get_path_to(curar)
		var seguir := _menu.find_child("Seguir", true, false) as Button
		if seguir:
			_aprender.focus_neighbor_bottom = _aprender.get_path_to(seguir)
			seguir.focus_neighbor_top = seguir.get_path_to(_aprender)
		curar.grab_focus()


func _cerrar_santuario() -> void:
	if _menu:
		_menu.visible = false
		_menu.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Partida.pausa = false
	mostrar_meditar(true)


func _on_curar() -> void:
	Partida.curar(true)
	mostrar("Recuperas el aliento. El santuario sigue aquí si vuelves.")
	_cerrar_santuario()


func _on_aprender() -> void:
	if Partida.aprender_tatsumaki():
		Sonido.suena("kata")
		mostrar("Tatsumaki: un giro que rompe el sello y atraviesa la embestida.")
	_refrescar_kata()
	_cerrar_santuario()


func _pintar_vidas() -> void:
	if _corazones == null:
		return
	var texto := ""
	for i in Reglas.VIDAS_JUGADOR:
		if i < Partida.vidas:
			texto += "[color=#e23b45]♥[/color] "
		else:
			texto += "[color=#5c4652]♥[/color] "
	_corazones.text = texto


func _vida_jefe(actual: int, maximo: int) -> void:
	if _barra == null:
		return
	_barra.max_value = maximo
	_barra.value = actual
	_barra.visible = actual > 0 or _barra.visible


func _refrescar_kata() -> void:
	var tiene: bool = Partida.tiene_tatsumaki
	if _boton_kata:
		_boton_kata.disabled = not tiene
		_boton_kata.text = "Viento" if tiene else "Sello"
	if _nombre:
		_nombre.text = _texto_kata()


func _texto_kata() -> String:
	if Partida.tiene_tatsumaki and Partida.tiene_kesa:
		return "Iai · Kesa · Tatsumaki"
	if Partida.tiene_kesa:
		return "Iai · Kesa"
	return "Iai"


func _entrada() -> void:
	if _titulo == null:
		return
	var anim := create_tween()
	anim.tween_interval(1.7)
	anim.tween_property(_titulo, "modulate:a", 0.0, 0.45)
	anim.tween_callback(_titulo.hide)
	mostrar("Asciende el santuario. El kata se afila con cada corte.")


func _montar() -> void:
	var margen := MarginContainer.new()
	margen.set_anchors_preset(Control.PRESET_FULL_RECT)
	margen.add_theme_constant_override("margin_left", 14)
	margen.add_theme_constant_override("margin_top", 16)
	margen.add_theme_constant_override("margin_right", 14)
	margen.add_theme_constant_override("margin_bottom", 18)
	margen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margen)
	var columna := VBoxContainer.new()
	columna.mouse_filter = Control.MOUSE_FILTER_IGNORE
	columna.add_theme_constant_override("separation", 8)
	margen.add_child(columna)
	var cima := HBoxContainer.new()
	cima.mouse_filter = Control.MOUSE_FILTER_IGNORE
	columna.add_child(cima)
	_corazones = RichTextLabel.new()
	_corazones.bbcode_enabled = true
	_corazones.fit_content = true
	_corazones.scroll_active = false
	_corazones.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_corazones.custom_minimum_size = Vector2(150, 28)
	cima.add_child(_corazones)
	_nombre = Label.new()
	_nombre.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_nombre.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_nombre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cima.add_child(_nombre)
	_barra = ProgressBar.new()
	_barra.max_value = Reglas.VIDAS_JEFE
	_barra.value = Reglas.VIDAS_JEFE
	_barra.show_percentage = false
	_barra.custom_minimum_size = Vector2(0, 16)
	_barra.visible = false
	_barra.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fondo := StyleBoxFlat.new()
	fondo.bg_color = Color(0.08, 0.05, 0.08, 0.82)
	fondo.set_corner_radius_all(6)
	var relleno := StyleBoxFlat.new()
	relleno.bg_color = Color(0.86, 0.16, 0.22, 1)
	relleno.set_corner_radius_all(6)
	_barra.add_theme_stylebox_override("background", fondo)
	_barra.add_theme_stylebox_override("fill", relleno)
	columna.add_child(_barra)
	_aviso = RichTextLabel.new()
	_aviso.bbcode_enabled = true
	_aviso.fit_content = true
	_aviso.scroll_active = false
	_aviso.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_aviso.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_aviso.custom_minimum_size = Vector2(0, 72)
	columna.add_child(_aviso)
	var espacio := Control.new()
	espacio.size_flags_vertical = Control.SIZE_EXPAND_FILL
	espacio.mouse_filter = Control.MOUSE_FILTER_IGNORE
	columna.add_child(espacio)
	var suelo := HBoxContainer.new()
	suelo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	suelo.add_theme_constant_override("separation", 10)
	columna.add_child(suelo)
	_palanca = Palanca.new()
	suelo.add_child(_palanca)
	var hueco := Control.new()
	hueco.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hueco.mouse_filter = Control.MOUSE_FILTER_IGNORE
	suelo.add_child(hueco)
	var acciones := VBoxContainer.new()
	acciones.alignment = BoxContainer.ALIGNMENT_END
	acciones.add_theme_constant_override("separation", 10)
	acciones.mouse_filter = Control.MOUSE_FILTER_IGNORE
	suelo.add_child(acciones)
	_boton_meditar = _boton("Meditar")
	_boton_meditar.visible = false
	_boton_meditar.button_down.connect(func() -> void:
		Sonido.marcar_gesto()
		_meditar = true
	)
	acciones.add_child(_boton_meditar)
	_boton_kata = _boton("Sello")
	_boton_kata.button_down.connect(func() -> void:
		Sonido.marcar_gesto()
		_kata = true
	)
	acciones.add_child(_boton_kata)
	var corte := _boton("Corte")
	corte.button_down.connect(func() -> void:
		Sonido.marcar_gesto()
		_ataque = true
	)
	acciones.add_child(corte)
	var salto := _boton("Salto")
	salto.button_down.connect(func() -> void:
		Sonido.marcar_gesto()
		_salto = true
	)
	acciones.add_child(salto)
	_menu = _crear_menu()
	add_child(_menu)
	_titulo = _crear_titulo()
	add_child(_titulo)


func _boton(texto: String) -> Button:
	var boton := Button.new()
	boton.text = texto
	boton.theme_type_variation = &"BotonJuego"
	boton.custom_minimum_size = Vector2(96, 72)
	boton.focus_mode = Control.FOCUS_NONE
	boton.mouse_filter = Control.MOUSE_FILTER_STOP
	return boton


func _crear_menu() -> Control:
	var centro := CenterContainer.new()
	centro.set_anchors_preset(Control.PRESET_FULL_RECT)
	centro.visible = false
	centro.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(280, 0)
	centro.add_child(panel)
	var caja := VBoxContainer.new()
	caja.add_theme_constant_override("separation", 12)
	panel.add_child(caja)
	var texto := RichTextLabel.new()
	texto.bbcode_enabled = true
	texto.fit_content = true
	texto.scroll_active = false
	texto.bbcode_enabled = true
	texto.text = "[center][color=#f0d59a]Santuario[/color]\nRecupera el aliento o graba el kata que abre el sello.[/center]"
	texto.custom_minimum_size = Vector2(260, 78)
	caja.add_child(texto)
	var curar := Button.new()
	curar.name = "Curar"
	curar.text = "Recuperar el aliento"
	curar.custom_minimum_size = Vector2(0, 64)
	curar.pressed.connect(_on_curar)
	caja.add_child(curar)
	_aprender = Button.new()
	_aprender.text = "Grabar el Tatsumaki"
	_aprender.custom_minimum_size = Vector2(0, 64)
	_aprender.pressed.connect(_on_aprender)
	caja.add_child(_aprender)
	var volver := Button.new()
	volver.name = "Seguir"
	volver.text = "Seguir"
	volver.custom_minimum_size = Vector2(0, 56)
	volver.pressed.connect(_cerrar_santuario)
	caja.add_child(volver)
	return centro


func _crear_titulo() -> Control:
	var centro := MarginContainer.new()
	centro.set_anchors_preset(Control.PRESET_TOP_WIDE)
	centro.offset_top = 86
	centro.offset_bottom = 188
	centro.mouse_filter = Control.MOUSE_FILTER_IGNORE
	centro.add_theme_constant_override("margin_left", 28)
	centro.add_theme_constant_override("margin_right", 28)
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	centro.add_child(panel)
	var texto := RichTextLabel.new()
	texto.bbcode_enabled = true
	texto.fit_content = true
	texto.scroll_active = false
	texto.mouse_filter = Control.MOUSE_FILTER_IGNORE
	texto.custom_minimum_size = Vector2(250, 78)
	texto.text = "[center][font_size=26][color=#f0d59a]The Last Samurai[/color][/font_size]\n[font_size=16]Jefes y Kata[/font_size][/center]"
	panel.add_child(texto)
	return centro


class Palanca extends Control:
	var eje := 0.0
	var _id := -1
	var _origen := Vector2.ZERO
	var _activo := false

	func _ready() -> void:
		custom_minimum_size = Vector2(136, 136)
		mouse_filter = Control.MOUSE_FILTER_STOP

	func _gui_input(evento: InputEvent) -> void:
		if evento is InputEventScreenTouch:
			var toque := evento as InputEventScreenTouch
			if toque.pressed:
				_id = toque.index
				_origen = toque.position
				_activo = true
				Sonido.marcar_gesto()
			elif toque.index == _id:
				_activo = false
				eje = 0.0
			accept_event()
			queue_redraw()
		elif evento is InputEventScreenDrag and _activo and (evento as InputEventScreenDrag).index == _id:
			var arrastre := evento as InputEventScreenDrag
			var radio := size.x * 0.34
			eje = clampf((arrastre.position.x - _origen.x) / maxf(radio, 1.0), -1.0, 1.0)
			if absf(eje) < 0.16:
				eje = 0.0
			accept_event()
			queue_redraw()

	func _draw() -> void:
		var centro := size * 0.5
		var radio := size.x * 0.42
		draw_circle(centro, radio, Color(0.06, 0.03, 0.09, 0.5))
		draw_arc(centro, radio, 0, TAU, 36, Color(0.93, 0.76, 0.42, 0.95), 3.0, true)
		var pomo := centro + Vector2(eje * radio * 0.72, 0)
		draw_circle(pomo, 24, Color(0.62, 0.13, 0.18, 0.96))
		draw_arc(pomo, 24, 0, TAU, 24, Color(0.98, 0.86, 0.55, 0.9), 2.0, true)
