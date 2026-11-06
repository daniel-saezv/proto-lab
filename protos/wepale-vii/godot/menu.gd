extends CanvasLayer

const Oficios := preload("res://oficios.gd")

signal arrancar(id: String)

var elegido := "jarra"
var botones := {}
var detalle: Label


func _ready() -> void:
	layer = 8
	var raiz := Control.new()
	raiz.set_anchors_preset(Control.PRESET_FULL_RECT)
	raiz.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(raiz)

	var velo_arriba := ColorRect.new()
	velo_arriba.color = Color(0.06, 0.03, 0.08, 0.62)
	velo_arriba.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_anclar(velo_arriba, 0.0, 0.2, 0.0, 1.0)
	raiz.add_child(velo_arriba)

	var velo_abajo := ColorRect.new()
	velo_abajo.color = Color(0.06, 0.03, 0.08, 0.78)
	velo_abajo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_anclar(velo_abajo, 0.485, 1.0, 0.0, 1.0)
	raiz.add_child(velo_abajo)

	var titulo := _texto(raiz, "Wepale VII", 36, Color(0.98, 0.93, 0.84))
	_anclar(titulo, 0.02, 0.07)
	var sub := _texto(raiz, "Tvresn contra Ajgulzil", 16, Color(0.95, 0.72, 0.38))
	_anclar(sub, 0.068, 0.1)
	var lore := _texto(raiz, "Tvresn brinda. Ajgulzil reparte. La fiesta era de los dos hasta que alguien pidió la cuenta.", 15, Color(0.9, 0.86, 0.8))
	lore.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_anclar(lore, 0.1, 0.185)

	var fila := 0
	for datos in Oficios.todos():
		var id := str(datos["id"])
		var boton := Button.new()
		boton.text = "%s\n%s" % [str(datos["nombre"]), str(datos["texto"])]
		boton.alignment = HORIZONTAL_ALIGNMENT_CENTER
		boton.add_theme_font_size_override("font_size", 16)
		boton.add_theme_color_override("font_color", Color(0.98, 0.96, 0.92))
		boton.add_theme_color_override("font_hover_color", Color(1, 1, 1))
		boton.focus_mode = Control.FOCUS_ALL
		var arriba := 0.505 + float(fila) * 0.072
		_anclar(boton, arriba, arriba + 0.066)
		boton.pressed.connect(_elegir.bind(id))
		raiz.add_child(boton)
		botones[id] = boton
		fila += 1

	detalle = _texto(raiz, "", 14, Color(0.98, 0.9, 0.62))
	_anclar(detalle, 0.798, 0.848)

	var entrar := Button.new()
	entrar.text = "A la plaza"
	entrar.add_theme_font_size_override("font_size", 22)
	entrar.add_theme_color_override("font_color", Color(0.16, 0.08, 0.05))
	_estilar(entrar, Color(0.95, 0.72, 0.32), Color(0.98, 0.88, 0.55))
	_anclar(entrar, 0.858, 0.94)
	entrar.pressed.connect(func() -> void: arrancar.emit(elegido))
	raiz.add_child(entrar)
	_marcar()


func cerrar() -> void:
	visible = false


func _elegir(id: String) -> void:
	elegido = id
	_marcar()


func _marcar() -> void:
	for id in botones.keys():
		var boton: Button = botones[id]
		var datos := Oficios.nuevo(str(id))
		var tinta: Color = datos["color"]
		var activo := str(id) == elegido
		var fondo := tinta.lerp(Color(0.08, 0.04, 0.08), 0.35 if activo else 0.62)
		var borde := Color(0.98, 0.88, 0.45) if activo else tinta.darkened(0.15)
		_estilar(boton, fondo, borde)
	var oficio := Oficios.nuevo(elegido)
	var nombres: PackedStringArray = PackedStringArray()
	nombres.append(str(oficio["ataque"]["nombre"]))
	for hab in oficio["habilidades"]:
		nombres.append(str(hab["nombre"]))
	detalle.text = " · ".join(nombres)


func _estilar(boton: Button, fondo: Color, borde: Color) -> void:
	for estado in ["normal", "hover", "pressed", "focus"]:
		var caja := StyleBoxFlat.new()
		caja.bg_color = fondo.lightened(0.08) if estado == "hover" or estado == "pressed" else fondo
		caja.border_color = borde
		caja.set_border_width_all(3 if estado == "focus" else 2)
		caja.set_corner_radius_all(14)
		caja.content_margin_left = 10
		caja.content_margin_right = 10
		boton.add_theme_stylebox_override(estado, caja)


func _texto(padre: Node, cadena: String, tam: int, tinta: Color) -> Label:
	var rotulo := Label.new()
	rotulo.text = cadena
	rotulo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rotulo.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	rotulo.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rotulo.add_theme_font_size_override("font_size", tam)
	rotulo.add_theme_color_override("font_color", tinta)
	rotulo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	padre.add_child(rotulo)
	return rotulo


func _anclar(nodo: Control, arriba: float, abajo: float, izquierda := 0.06, derecha := 0.94) -> void:
	nodo.anchor_left = izquierda
	nodo.anchor_top = arriba
	nodo.anchor_right = derecha
	nodo.anchor_bottom = abajo
	nodo.offset_left = 0
	nodo.offset_top = 0
	nodo.offset_right = 0
	nodo.offset_bottom = 0
	nodo.grow_horizontal = Control.GROW_DIRECTION_BOTH
	nodo.grow_vertical = Control.GROW_DIRECTION_BOTH
