extends CanvasLayer

signal golpe
signal usar
signal cocinar(a: String, b: String)
signal contratar
signal volver
signal cerrar_panel

var direccion := Vector2.ZERO

var _joy: Control
var _mando: Control
var _accion: Button
var _panel: Control
var _rejilla: GridContainer
var _botones := {}
var _titulo: Label
var _texto: Label
var _slots: Label
var _principal: Button
var _cerrar: Button
var _linea1: Label
var _linea2: Label
var _linea3: Label
var _pista: Label
var _modo := ""
var _slot_a := ""
var _slot_b := ""
var _joy_id := -1
var _juego: Node


func _ready() -> void:
	_barra()
	_controles()
	_modal()
	cartel("Stick o WASD. El botón grande golpea o usa lo de al lado.")


func direccion_zero() -> void:
	direccion = Vector2.ZERO


func panel_abierto() -> bool:
	return _panel.visible


func ocupa(pos: Vector2) -> bool:
	if _panel.visible:
		return true
	for control in [_joy, _accion]:
		if control.visible and control.get_global_rect().has_point(pos):
			return true
	return false


func refrescar(juego: Node) -> void:
	_linea1.text = "Goblin Chef"
	var pinche := " · Níspero" if juego.nispero else ""
	_linea2.text = "Vida %d/%d · Daño %d · Armadura %d%s" % [juego.vida, juego.vida_max, juego.dano, juego.armadura, pinche]
	var bolsa: Dictionary = juego.cesto if juego.en_caza else juego.inventario
	var trozos: PackedStringArray = []
	for id in ["seta", "baya", "raiz", "hueso"]:
		trozos.append("%s %d" % [Recetas.nombre(id), int(bolsa.get(id, 0))])
	var donde := "Cesto" if juego.en_caza else "Despensa"
	_linea3.text = "%s · Salida %d · %s" % [donde, juego.salida_num, "  ".join(trozos)]
	var en_pueblo: bool = not bool(juego.en_caza)
	var cerca := str(juego.estacion_cercana()) if en_pueblo else ""
	_accion.visible = not _panel.visible and (juego.en_caza or cerca != "")
	if juego.en_caza:
		_accion.text = "Golpe"
		_accion.disabled = not juego.jugador.puede_golpear()
	else:
		_accion.text = "Usar"
		_accion.disabled = false


func cartel(texto: String) -> void:
	_pista.text = texto
	_pista.visible = true
	var reloj := get_tree().create_timer(6.5)
	reloj.timeout.connect(func () -> void:
		if _pista.text == texto:
			_pista.visible = false
	)


func nota(texto: String) -> void:
	_texto.text = texto


func abrir_cocina(juego: Node) -> void:
	_juego = juego
	_modo = "cocina"
	_slot_a = ""
	_slot_b = ""
	_titulo.text = "Caldero"
	_texto.text = "Junta dos ingredientes. Si ya cocinaste el plato afín, sale una combinación."
	if juego.nispero:
		_texto.text += " Níspero duplica el plato, no la combinación."
	_rejilla.visible = true
	_slots.visible = true
	_principal.text = "Cocinar"
	_principal.visible = true
	_principal.disabled = false
	_cerrar.visible = true
	_pintar_cocina()
	_abrir(true)


func abrir_pinche(juego: Node) -> void:
	_juego = juego
	_modo = "pinche"
	_titulo.text = "Níspero"
	_rejilla.visible = false
	_slots.visible = false
	if juego.nispero:
		_texto.text = "Ya remueve el caldero. El cucharón doble sigue activo."
		_principal.visible = false
	else:
		_texto.text = "Pinche de cuchara. Cuesta 2 huesos. Su habilidad duplica el efecto de cada plato."
		_principal.text = "Contratar"
		_principal.visible = true
		_principal.disabled = int(juego.inventario.get("hueso", 0)) < 2
	_cerrar.visible = true
	_abrir(true)


func abrir_fin(victoria: bool, texto: String) -> void:
	_modo = "fin"
	_titulo.text = "De vuelta" if victoria else "Caíste"
	_texto.text = texto
	_rejilla.visible = false
	_slots.visible = false
	_principal.text = "Al pueblo"
	_principal.visible = true
	_principal.disabled = false
	_cerrar.visible = false
	_abrir(true)


func cerrar() -> void:
	_modo = ""
	_abrir(false)


func _barra() -> void:
	var caja := VBoxContainer.new()
	caja.set_anchors_preset(Control.PRESET_TOP_WIDE)
	caja.offset_left = 16
	caja.offset_top = 14
	caja.offset_right = -16
	caja.offset_bottom = 168
	caja.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(caja)
	_linea1 = _etiqueta(26)
	_linea2 = _etiqueta(18)
	_linea3 = _etiqueta(16)
	_pista = _etiqueta(16)
	_pista.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	for linea in [_linea1, _linea2, _linea3, _pista]:
		caja.add_child(linea)


func _controles() -> void:
	_joy = Control.new()
	_joy.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_joy.offset_left = 16
	_joy.offset_top = -248
	_joy.offset_right = 156
	_joy.offset_bottom = -108
	_joy.gui_input.connect(_joy_input)
	add_child(_joy)
	var aro := Panel.new()
	aro.set_anchors_preset(Control.PRESET_FULL_RECT)
	aro.mouse_filter = Control.MOUSE_FILTER_IGNORE
	aro.add_theme_stylebox_override("panel", _caja(Color(1, 1, 1, 0.16), 70))
	_joy.add_child(aro)
	_mando = Panel.new()
	_mando.custom_minimum_size = Vector2(58, 58)
	_mando.size = Vector2(58, 58)
	_mando.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mando.add_theme_stylebox_override("panel", _caja(Color(1, 0.95, 0.86, 0.85), 29))
	_joy.add_child(_mando)
	_accion = Button.new()
	_accion.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_accion.offset_left = -168
	_accion.offset_top = -236
	_accion.offset_right = -72
	_accion.offset_bottom = -140
	_accion.focus_mode = Control.FOCUS_NONE
	_estilar(_accion, Color("c4513a"))
	_accion.pressed.connect(_al_accion)
	add_child(_accion)


func _modal() -> void:
	_panel = Control.new()
	_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_panel.visible = false
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_panel)
	var velo := ColorRect.new()
	velo.set_anchors_preset(Control.PRESET_FULL_RECT)
	velo.color = Color(0.08, 0.05, 0.03, 0.55)
	velo.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.add_child(velo)
	var tarjeta := Panel.new()
	tarjeta.set_anchors_preset(Control.PRESET_CENTER)
	tarjeta.offset_left = -170
	tarjeta.offset_top = -300
	tarjeta.offset_right = 170
	tarjeta.offset_bottom = 300
	tarjeta.add_theme_stylebox_override("panel", _caja(Color("2a2118"), 18))
	_panel.add_child(tarjeta)
	var columna := VBoxContainer.new()
	columna.set_anchors_preset(Control.PRESET_FULL_RECT)
	columna.offset_left = 14
	columna.offset_top = 14
	columna.offset_right = -14
	columna.offset_bottom = -14
	columna.add_theme_constant_override("separation", 8)
	tarjeta.add_child(columna)
	_titulo = _etiqueta(26)
	_texto = _etiqueta(16)
	_texto.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_slots = _etiqueta(18)
	columna.add_child(_titulo)
	columna.add_child(_texto)
	columna.add_child(_slots)
	_rejilla = GridContainer.new()
	_rejilla.columns = 2
	_rejilla.add_theme_constant_override("h_separation", 8)
	_rejilla.add_theme_constant_override("v_separation", 8)
	for id in Recetas.ORDEN:
		var boton := Button.new()
		boton.custom_minimum_size = Vector2(148, 48)
		boton.focus_mode = Control.FOCUS_NONE
		_estilar(boton, Color("f0d2b0"))
		boton.add_theme_color_override("font_color", Color("2a2118"))
		boton.pressed.connect(_elegir.bind(id))
		_rejilla.add_child(boton)
		_botones[id] = boton
	columna.add_child(_rejilla)
	_principal = Button.new()
	_principal.custom_minimum_size = Vector2(0, 52)
	_principal.focus_mode = Control.FOCUS_NONE
	_estilar(_principal, Color("c4513a"))
	_principal.pressed.connect(_al_principal)
	columna.add_child(_principal)
	_cerrar = Button.new()
	_cerrar.text = "Cerrar"
	_cerrar.custom_minimum_size = Vector2(0, 48)
	_cerrar.focus_mode = Control.FOCUS_NONE
	_estilar(_cerrar, Color("6b4128"))
	_cerrar.pressed.connect(_al_cerrar)
	columna.add_child(_cerrar)


func _joy_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and _joy_id < 0:
			_joy_id = event.index
			_mover_joy(event.position)
		elif not event.pressed and event.index == _joy_id:
			_soltar_joy()
		_joy.accept_event()
	elif event is InputEventScreenDrag and event.index == _joy_id:
		_mover_joy(event.position)
		_joy.accept_event()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_joy_id = -100
			_mover_joy(event.position)
		elif _joy_id == -100:
			_soltar_joy()
		_joy.accept_event()
	elif event is InputEventMouseMotion and _joy_id == -100:
		_mover_joy(event.position)
		_joy.accept_event()


func _mover_joy(pos: Vector2) -> void:
	var centro := _joy.size * 0.5
	var delta := pos - centro
	var tope := _joy.size.x * 0.36
	if tope < 1.0:
		return
	if delta.length() > tope:
		delta = delta.normalized() * tope
	_mando.position = centro + delta - _mando.size * 0.5
	direccion = Vector2(delta.x / tope, delta.y / tope)


func _soltar_joy() -> void:
	_joy_id = -1
	direccion = Vector2.ZERO
	_mando.position = _joy.size * 0.5 - _mando.size * 0.5


func _al_accion() -> void:
	if _accion.text == "Golpe":
		golpe.emit()
	else:
		usar.emit()


func _al_principal() -> void:
	match _modo:
		"cocina":
			cocinar.emit(_slot_a, _slot_b)
		"pinche":
			contratar.emit()
		"fin":
			volver.emit()


func _al_cerrar() -> void:
	cerrar()
	cerrar_panel.emit()


func _elegir(id: String) -> void:
	if _slot_a == id:
		_slot_a = ""
	elif _slot_b == id:
		_slot_b = ""
	elif _slot_a == "":
		_slot_a = id
	else:
		_slot_b = id
	_pintar_cocina()


func _pintar_cocina() -> void:
	if _juego == null:
		return
	for id in Recetas.ORDEN:
		var boton: Button = _botones[id]
		var marca := ""
		if id == _slot_a or id == _slot_b:
			marca = " ·"
		boton.text = "%s %d%s" % [Recetas.nombre(id), int(_juego.inventario.get(id, 0)), marca]
	if _slot_a == "" or _slot_b == "":
		_slots.text = "Elige dos."
		return
	var plato := Recetas.buscar(_slot_a, _slot_b)
	if plato.is_empty():
		_slots.text = "%s + %s · sin plato" % [Recetas.nombre(_slot_a), Recetas.nombre(_slot_b)]
	else:
		_slots.text = "%s + %s → %s" % [Recetas.nombre(_slot_a), Recetas.nombre(_slot_b), plato["nombre"]]


func _abrir(activo: bool) -> void:
	_panel.visible = activo
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP if activo else Control.MOUSE_FILTER_IGNORE
	if activo:
		_accion.visible = false


func _etiqueta(tam: int) -> Label:
	var etiqueta := Label.new()
	etiqueta.add_theme_font_size_override("font_size", tam)
	etiqueta.add_theme_color_override("font_color", Color("fff6e8"))
	etiqueta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	etiqueta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return etiqueta


func _estilar(boton: Button, color: Color) -> void:
	boton.add_theme_stylebox_override("normal", _caja(color, 14))
	boton.add_theme_stylebox_override("hover", _caja(color.lightened(0.08), 14))
	boton.add_theme_stylebox_override("pressed", _caja(color.darkened(0.08), 14))
	boton.add_theme_stylebox_override("disabled", _caja(color.darkened(0.25), 14))
	boton.add_theme_color_override("font_color", Color("fff6e8"))
	boton.add_theme_font_size_override("font_size", 18)


func _caja(color: Color, radio: int) -> StyleBoxFlat:
	var estilo := StyleBoxFlat.new()
	estilo.bg_color = color
	estilo.corner_radius_top_left = radio
	estilo.corner_radius_top_right = radio
	estilo.corner_radius_bottom_left = radio
	estilo.corner_radius_bottom_right = radio
	estilo.content_margin_left = 8
	estilo.content_margin_right = 8
	estilo.content_margin_top = 6
	estilo.content_margin_bottom = 6
	return estilo
