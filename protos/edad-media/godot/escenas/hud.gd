extends CanvasLayer

const OBRAS: Array[String] = ["muralla", "torre", "granero", "capilla", "observatorio"]
const CLASES: Array[String] = ["caballero", "ballestero", "fraile", "astrologo"]

var _oficio: Label
var _guerra: Label
var _bienes: Label
var _aviso: Label
var _estado: Label
var _vida_barra: ProgressBar
var _aliento_barra: ProgressBar
var _oficios: HBoxContainer
var _planetas: GridContainer
var _obras: GridContainer
var _castillo: Button
var _alzarse: Button
var _botones_clase: Dictionary = {}
var _botones_planeta: Dictionary = {}
var _botones_obra: Dictionary = {}
var _obras_abiertas: bool = false


func _ready() -> void:
	layer = 20
	_armar()
	Partida.oficio_cambio.connect(_refrescar)
	Partida.vida_cambio.connect(_refrescar)
	Partida.recursos_cambio.connect(_refrescar)
	Partida.aviso_cambio.connect(_refrescar)
	Partida.oleada_cambio.connect(_refrescar)
	Partida.obra_cambio.connect(_refrescar)
	Partida.oficios_cerrados.connect(_refrescar)
	Partida.murio.connect(_refrescar)
	Partida.revivio.connect(_refrescar)
	Partida.cargada.connect(_refrescar)
	_refrescar()


func _process(_delta: float) -> void:
	for id in Partida.PLANETAS:
		var boton: Button = _botones_planeta[id]
		var cd := Partida.cd_de(id)
		var nombre: String = Partida.NOMBRES_PLANETA[id]
		boton.text = "%s %d" % [nombre, int(ceil(cd))] if cd > 0.4 else nombre
		var abierto: bool = Partida.planetas_abiertos().has(id)
		boton.disabled = not abierto or Partida.fase != "juego"
		boton.modulate = Color(1, 0.92, 0.62) if id == Partida.oficio_actual().planeta and abierto else Color(1, 1, 1)


func _armar() -> void:
	var arriba := _panel(8, 8, 374, 128)
	var caja_arriba := VBoxContainer.new()
	caja_arriba.set_anchors_preset(Control.PRESET_FULL_RECT)
	caja_arriba.offset_left = 8
	caja_arriba.offset_top = 6
	caja_arriba.offset_right = -8
	caja_arriba.offset_bottom = -6
	caja_arriba.add_theme_constant_override("separation", 1)
	arriba.add_child(caja_arriba)
	var titulo := _etiqueta("Medieval Age", 18)
	caja_arriba.add_child(titulo)
	_oficio = _etiqueta("", 14)
	_guerra = _etiqueta("", 14)
	_bienes = _etiqueta("", 14)
	_aviso = _etiqueta("", 13)
	_aviso.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	caja_arriba.add_child(_oficio)
	caja_arriba.add_child(_guerra)
	caja_arriba.add_child(_bienes)
	caja_arriba.add_child(_aviso)

	var abajo := _panel(8, 568, 374, 268)
	var caja := VBoxContainer.new()
	caja.set_anchors_preset(Control.PRESET_FULL_RECT)
	caja.offset_left = 8
	caja.offset_top = 8
	caja.offset_right = -8
	caja.offset_bottom = -8
	caja.add_theme_constant_override("separation", 3)
	abajo.add_child(caja)

	_oficios = HBoxContainer.new()
	_oficios.add_theme_constant_override("separation", 6)
	caja.add_child(_oficios)
	for id in CLASES:
		var boton := _boton(Partida.oficios[id].nombre if Partida.oficios.has(id) else id)
		boton.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		boton.pressed.connect(_elegir_clase.bind(id))
		_oficios.add_child(boton)
		_botones_clase[id] = boton

	_estado = _etiqueta("Vida", 14)
	_vida_barra = _barra(Color(0.72, 0.22, 0.18))
	_aliento_barra = _barra(Color(0.24, 0.46, 0.75))
	caja.add_child(_estado)
	caja.add_child(_vida_barra)
	caja.add_child(_aliento_barra)

	_planetas = GridContainer.new()
	_planetas.columns = 4
	_planetas.add_theme_constant_override("h_separation", 6)
	_planetas.add_theme_constant_override("v_separation", 6)
	caja.add_child(_planetas)
	for id in Partida.PLANETAS:
		var boton := _boton(Partida.NOMBRES_PLANETA[id])
		boton.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		boton.pressed.connect(_lanzar.bind(id))
		_planetas.add_child(boton)
		_botones_planeta[id] = boton

	_obras = GridContainer.new()
	_obras.columns = 3
	_obras.visible = false
	_obras.add_theme_constant_override("h_separation", 6)
	_obras.add_theme_constant_override("v_separation", 6)
	caja.add_child(_obras)
	for obra in OBRAS:
		var boton := _boton(obra)
		boton.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		boton.pressed.connect(_construir.bind(obra))
		_obras.add_child(boton)
		_botones_obra[obra] = boton

	_castillo = _boton("Castillo")
	_castillo.pressed.connect(_alternar_obras)
	caja.add_child(_castillo)

	_alzarse = _boton("Alzarse")
	_alzarse.visible = false
	_alzarse.pressed.connect(_alzar)
	caja.add_child(_alzarse)


func _refrescar(_arg: Variant = null) -> void:
	_oficio.text = Partida.texto_oficio()
	_guerra.text = Partida.titulo_guerra()
	_bienes.text = Partida.texto_bienes()
	_aviso.text = Partida.aviso
	_estado.text = "Vida %d · Aliento %d" % [maxi(Partida.vida, 0), maxi(Partida.mana, 0)]
	_vida_barra.max_value = maxi(Partida.vida_max, 1)
	_vida_barra.value = maxi(Partida.vida, 0)
	_aliento_barra.max_value = maxi(Partida.mana_max, 1)
	_aliento_barra.value = maxi(Partida.mana, 0)
	var en_juego := Partida.fase == "juego"
	_oficios.visible = Partida.oficio_abierto and en_juego
	_planetas.visible = not _obras_abiertas and en_juego
	_obras.visible = _obras_abiertas and en_juego
	for id in _botones_clase:
		var boton: Button = _botones_clase[id]
		boton.disabled = not Partida.oficio_abierto
		boton.modulate = Color(1, 0.92, 0.62) if id == Partida.clase else Color(1, 1, 1)
	for obra in _botones_obra:
		var boton: Button = _botones_obra[obra]
		boton.text = Partida.texto_coste(obra)
		boton.disabled = int(Partida.obras[obra]) >= 3 or Partida.fase != "juego"
	_alzarse.visible = Partida.fase == "caido"
	_castillo.disabled = Partida.fase != "juego"


func _elegir_clase(id: String) -> void:
	Partida.cambiar_clase(id)


func _lanzar(id: String) -> void:
	Partida.lanzar(id)


func _construir(obra: String) -> void:
	Partida.construir(obra)


func _alternar_obras() -> void:
	_obras_abiertas = not _obras_abiertas
	_obras.visible = _obras_abiertas
	_planetas.visible = not _obras_abiertas
	_castillo.text = "Oficio" if _obras_abiertas else "Castillo"


func _alzar() -> void:
	Partida.revivir()


func _panel(x: float, y: float, ancho: float, alto: float) -> Panel:
	var panel := Panel.new()
	panel.position = Vector2(x, y)
	panel.size = Vector2(ancho, alto)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var estilo := StyleBoxFlat.new()
	estilo.bg_color = Color(0.08, 0.06, 0.05, 0.88)
	estilo.set_corner_radius_all(12)
	estilo.content_margin_left = 8
	estilo.content_margin_right = 8
	panel.add_theme_stylebox_override("panel", estilo)
	add_child(panel)
	return panel


func _etiqueta(texto: String, tamano: int) -> Label:
	var etiqueta := Label.new()
	etiqueta.text = texto
	etiqueta.add_theme_font_size_override("font_size", tamano)
	etiqueta.add_theme_color_override("font_color", Color(0.96, 0.93, 0.86))
	return etiqueta


func _boton(texto: String) -> Button:
	var boton := Button.new()
	boton.text = texto
	boton.focus_mode = Control.FOCUS_NONE
	boton.custom_minimum_size = Vector2(44, 44)
	boton.clip_text = true
	boton.add_theme_font_size_override("font_size", 15)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.16, 0.12, 0.09)
	normal.border_color = Color(0.62, 0.5, 0.28)
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(10)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.24, 0.18, 0.12)
	boton.add_theme_stylebox_override("normal", normal)
	boton.add_theme_stylebox_override("hover", hover)
	boton.add_theme_stylebox_override("pressed", hover)
	boton.add_theme_stylebox_override("disabled", normal)
	boton.add_theme_color_override("font_color", Color(0.96, 0.93, 0.86))
	boton.add_theme_color_override("font_disabled_color", Color(0.55, 0.5, 0.44))
	return boton


func _barra(color: Color) -> ProgressBar:
	var barra := ProgressBar.new()
	barra.show_percentage = false
	barra.custom_minimum_size = Vector2(0, 12)
	var fondo := StyleBoxFlat.new()
	fondo.bg_color = Color(0.05, 0.04, 0.04)
	fondo.set_corner_radius_all(6)
	var lleno := StyleBoxFlat.new()
	lleno.bg_color = color
	lleno.set_corner_radius_all(6)
	barra.add_theme_stylebox_override("background", fondo)
	barra.add_theme_stylebox_override("fill", lleno)
	return barra
