extends Node2D

const TILE := 32
const MAPA_X := 22
const MAPA_Y := 30
const PUESTOS: Array[Vector2] = [
	Vector2(300, 210),
	Vector2(352, 188),
	Vector2(404, 210),
	Vector2(260, 236),
	Vector2(444, 236),
	Vector2(320, 168),
	Vector2(384, 168),
	Vector2(352, 228),
]

const ENEMIGO := preload("res://escenas/enemigo.tscn")
const BOTIN := preload("res://escenas/botin.tscn")
const FLECHA := preload("res://escenas/flecha.tscn")

var _sonido: AudioStreamPlayer
var _audio_usado: bool = false


func _ready() -> void:
	_mapa()
	_muros()
	_castillo()
	_bandera()
	_arboles()
	var camara := $Cuerpos/Heroe/Camara as Camera2D
	camara.limit_left = 0
	camara.limit_top = 0
	camara.limit_right = TILE * MAPA_X
	camara.limit_bottom = TILE * MAPA_Y
	_sonido = $Sonido
	Partida.hueste.connect(_al_hueste)
	Partida.mito.connect(_al_mito)
	Partida.cargada.connect(_al_cargar)
	Partida.revivio.connect(_al_revivir)
	Partida.murio.connect(_al_morir_heroe)
	Partida.lanzado.connect(_al_lanzar)
	Partida.obra_cambio.connect(_refrescar_obra)
	$Cuerpos/Heroe.disparo.connect(_al_flecha_heroe)
	$Torre.timeout.connect(_disparo_torre)
	$Torre.start()
	_refrescar_obra()
	_poner(Partida.grupos_actuales(), "oleada")
	Partida.oleada_soltada = true


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventScreenTouch) or not event.pressed:
		return
	if Partida.fase != "juego":
		return
	Partida.marcar_entrada()
	var toque := event as InputEventScreenTouch
	var punto: Vector2 = get_viewport().get_canvas_transform().affine_inverse() * toque.position
	var enemigo := _enemigo_en(punto)
	var heroe := $Cuerpos/Heroe
	if enemigo:
		heroe.fijar_blanco(enemigo)
	else:
		heroe.fijar_destino(punto)


func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		_sonar_nota(392.0, true)


func _mapa() -> void:
	var imagen := Image.create_empty(160, 32, false, Image.FORMAT_RGBA8)
	_loseta(imagen, 0, Color(0.22, 0.4, 0.2))
	_loseta(imagen, 32, Color(0.27, 0.46, 0.24))
	_loseta(imagen, 64, Color(0.58, 0.44, 0.26))
	_loseta(imagen, 96, Color(0.48, 0.46, 0.42))
	_loseta(imagen, 128, Color(0.18, 0.3, 0.4))
	var textura := ImageTexture.create_from_image(imagen)
	var atlas := TileSetAtlasSource.new()
	atlas.texture = textura
	atlas.texture_region_size = Vector2i(TILE, TILE)
	for indice in 5:
		atlas.create_tile(Vector2i(indice, 0))
	var conjunto := TileSet.new()
	conjunto.tile_size = Vector2i(TILE, TILE)
	conjunto.add_physics_layer()
	conjunto.set_physics_layer_collision_layer(0, 1)
	conjunto.set_physics_layer_collision_mask(0, 0)
	var fuente := conjunto.add_source(atlas)
	# El foso es la única tesela con polígono físico: cierra el mapa y deja el patio libre.
	var agua := atlas.get_tile_data(Vector2i(4, 0), 0)
	if agua == null:
		push_error("La tesela de agua no entró en el atlas.")
		return
	agua.set_collision_polygons_count(0, 1)
	agua.set_collision_polygon_points(0, 0, PackedVector2Array([
		Vector2(0, 0), Vector2(TILE, 0), Vector2(TILE, TILE), Vector2(0, TILE),
	]))
	var suelo := $Suelo as TileMapLayer
	suelo.tile_set = conjunto
	suelo.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	for y in MAPA_Y:
		for x in MAPA_X:
			var atlas_xy := Vector2i(0, 0) if (x + y) % 2 == 0 else Vector2i(1, 0)
			var borde := x == 0 or y == 0 or x == MAPA_X - 1 or y == MAPA_Y - 1
			if borde:
				atlas_xy = Vector2i(4, 0)
			elif _dentro_patio(x, y):
				atlas_xy = Vector2i(3, 0)
			elif _en_senda(x, y):
				atlas_xy = Vector2i(2, 0)
			suelo.set_cell(Vector2i(x, y), fuente, atlas_xy)


func _dentro_patio(x: int, y: int) -> bool:
	return x >= 8 and x <= 13 and y >= 10 and y <= 13


func _en_senda(x: int, y: int) -> bool:
	return x >= 10 and x <= 11 and y >= 14 and y <= 20


func _loseta(imagen: Image, origen: int, color: Color) -> void:
	imagen.fill_rect(Rect2i(origen, 0, TILE, TILE), color)
	var sombra := color.darkened(0.18)
	for i in TILE:
		imagen.set_pixel(origen + i, 0, sombra)
		imagen.set_pixel(origen, i, sombra)


func _muros() -> void:
	var cuerpo := $Cuerpos/Muros as StaticBody2D
	cuerpo.collision_layer = 1
	cuerpo.collision_mask = 0
	for rect in [
		Rect2(232, 300, 240, 26),
		Rect2(232, 300, 26, 170),
		Rect2(446, 300, 26, 170),
		Rect2(232, 444, 78, 26),
		Rect2(392, 444, 80, 26),
	]:
		var forma := CollisionShape2D.new()
		var caja := RectangleShape2D.new()
		caja.size = rect.size
		forma.shape = caja
		forma.position = rect.position + rect.size * 0.5
		cuerpo.add_child(forma)


func _castillo() -> void:
	var castillo := $Decor/Castillo as Node2D
	_caja(castillo, "MuroN", Rect2(232, 300, 240, 26), Color(0.55, 0.54, 0.58))
	_caja(castillo, "MuroO", Rect2(232, 300, 26, 170), Color(0.5, 0.49, 0.54))
	_caja(castillo, "MuroE", Rect2(446, 300, 26, 170), Color(0.5, 0.49, 0.54))
	_caja(castillo, "MuroS1", Rect2(232, 444, 78, 26), Color(0.55, 0.54, 0.58))
	_caja(castillo, "MuroS2", Rect2(392, 444, 80, 26), Color(0.55, 0.54, 0.58))
	_caja(castillo, "Donjon", Rect2(328, 336, 48, 70), Color(0.42, 0.32, 0.28))
	var tejado := Polygon2D.new()
	tejado.name = "Tejado"
	tejado.color = Color(0.55, 0.2, 0.16)
	tejado.polygon = PackedVector2Array([
		Vector2(316, 336), Vector2(388, 336), Vector2(376, 312), Vector2(328, 312),
	])
	castillo.add_child(tejado)
	_caja(castillo, "TorreNO", Rect2(220, 286, 36, 36), Color(0.48, 0.36, 0.3))
	_caja(castillo, "TorreNE", Rect2(448, 286, 36, 36), Color(0.48, 0.36, 0.3))
	_caja(castillo, "TejadoTorre", Rect2(224, 276, 28, 12), Color(0.55, 0.2, 0.16))
	_caja(castillo, "Granero", Rect2(268, 360, 40, 28), Color(0.62, 0.5, 0.28))
	_caja(castillo, "Capilla", Rect2(400, 352, 28, 36), Color(0.75, 0.72, 0.64))
	_caja(castillo, "Observatorio", Rect2(344, 300, 22, 22), Color(0.28, 0.32, 0.48))
	var bandera := Polygon2D.new()
	bandera.name = "Bandera"
	bandera.position = Vector2(352, 304)
	bandera.color = Color(0.62, 0.16, 0.14)
	bandera.polygon = PackedVector2Array([Vector2(0, -18), Vector2(26, -10), Vector2(0, -2)])
	castillo.add_child(bandera)


func _bandera() -> void:
	var animacion := Animation.new()
	animacion.length = 0.9
	animacion.loop_mode = Animation.LOOP_LINEAR
	var pista := animacion.add_track(Animation.TYPE_VALUE)
	animacion.track_set_path(pista, NodePath("Bandera:rotation"))
	animacion.track_insert_key(pista, 0.0, -0.45)
	animacion.track_insert_key(pista, 0.45, 0.55)
	animacion.track_insert_key(pista, 0.9, -0.45)
	var biblioteca := AnimationLibrary.new()
	biblioteca.add_animation("ondear", animacion)
	var reproductor := $Decor/Castillo/Anim as AnimationPlayer
	reproductor.add_animation_library("", biblioteca)
	reproductor.play("ondear")


func _arboles() -> void:
	for punto in [Vector2(96, 260), Vector2(140, 520), Vector2(560, 250), Vector2(600, 540), Vector2(120, 700), Vector2(580, 680)]:
		var copa := Polygon2D.new()
		copa.position = punto
		copa.color = Color(0.18, 0.36, 0.16)
		copa.polygon = PackedVector2Array([Vector2(0, -26), Vector2(16, 4), Vector2(-16, 4)])
		var tronco := Polygon2D.new()
		tronco.position = punto
		tronco.color = Color(0.34, 0.22, 0.12)
		tronco.polygon = PackedVector2Array([Vector2(-3, 0), Vector2(3, 0), Vector2(3, 16), Vector2(-3, 16)])
		$Decor.add_child(tronco)
		$Decor.add_child(copa)


func _caja(padre: Node2D, nombre: String, rect: Rect2, color: Color) -> void:
	var pieza := Polygon2D.new()
	pieza.name = nombre
	pieza.color = color
	pieza.polygon = PackedVector2Array([
		rect.position,
		rect.position + Vector2(rect.size.x, 0),
		rect.position + rect.size,
		rect.position + Vector2(0, rect.size.y),
	])
	padre.add_child(pieza)


func _refrescar_obra() -> void:
	var castillo := $Decor/Castillo
	var nivel := int(Partida.obras["muralla"])
	var tono := Color(0.5, 0.49, 0.54).lerp(Color(0.74, 0.72, 0.68), float(nivel) / 3.0)
	for nombre in ["MuroN", "MuroO", "MuroE", "MuroS1", "MuroS2"]:
		(castillo.get_node(nombre) as Polygon2D).color = tono
	castillo.get_node("TejadoTorre").visible = int(Partida.obras["torre"]) > 0
	castillo.get_node("Granero").visible = int(Partida.obras["granero"]) > 0
	castillo.get_node("Capilla").visible = int(Partida.obras["capilla"]) > 0
	castillo.get_node("Observatorio").visible = int(Partida.obras["observatorio"]) > 0


func _poner(grupos: Array, origen: String) -> void:
	var indice := 0
	for grupo in grupos:
		for _vez in int(grupo["n"]):
			if _cuenta() >= 8:
				return
			var puesto := PUESTOS[indice % PUESTOS.size()]
			_uno(str(grupo["tipo"]), puesto, origen)
			indice += 1


func _uno(tipo: String, punto: Vector2, origen: String) -> void:
	var pieza := ENEMIGO.instantiate()
	pieza.position = punto
	pieza.preparar(tipo, origen)
	pieza.murio.connect(_al_morir)
	pieza.disparo.connect(_al_flecha_enemiga)
	$Cuerpos.add_child(pieza)


func _al_hueste(grupos: Array) -> void:
	_poner(grupos, "oleada")


func _al_mito(id: String) -> void:
	match id:
		"fatuo":
			_uno("espectro", Vector2(300, 220), "mito")
		"verde":
			_uno("verde", Vector2(352, 200), "mito")
		"caceria":
			_uno("espectro", Vector2(270, 210), "mito")
			_uno("espectro", Vector2(352, 176), "mito")
			_uno("espectro", Vector2(434, 210), "mito")
		"dragon":
			_uno("dragon", Vector2(352, 186), "mito")


func _al_morir(quien: Node) -> void:
	var pieza := quien as Node2D
	if pieza == null or not is_instance_valid(pieza):
		return
	var punto := pieza.global_position
	var de_oleada := str(pieza.get("origen")) == "oleada"
	if de_oleada:
		Partida.anotar_xp(int(pieza.get("xp")))
	_poner_botin(punto, int(pieza.get("oro")), int(pieza.get("madera")), int(pieza.get("piedra")))
	if de_oleada and _quedan(pieza) == 0:
		Partida.cerrar_oleada()


func _quedan(excepto: Node) -> int:
	var quedan := 0
	for pieza in get_tree().get_nodes_in_group("enemigo"):
		if pieza == excepto or not is_instance_valid(pieza):
			continue
		if str(pieza.origen) == "oleada" and int(pieza.vida) > 0:
			quedan += 1
	return quedan


func _poner_botin(punto: Vector2, oro: int, madera: int, piedra: int) -> void:
	if oro + madera + piedra <= 0:
		return
	var pieza := BOTIN.instantiate()
	pieza.position = punto
	pieza.preparar(oro, madera, piedra, 0)
	$Cuerpos.add_child(pieza)


func _al_flecha_heroe(origen: Vector2, direccion: Vector2, dano: int) -> void:
	_crear_flecha(origen, direccion, dano, false)


func _al_flecha_enemiga(origen: Vector2, direccion: Vector2, dano: int) -> void:
	_crear_flecha(origen, direccion, dano, true)


func _crear_flecha(origen: Vector2, direccion: Vector2, dano: int, contra_heroe: bool) -> void:
	var pieza := FLECHA.instantiate()
	pieza.position = origen
	pieza.preparar(direccion, dano, contra_heroe)
	$Cuerpos.add_child(pieza)


func _al_lanzar(id: String) -> void:
	var hechizo := Partida.hechizos[id] as Hechizo
	if hechizo == null:
		return
	var poder := Partida.potencia(id)
	var heroe := $Cuerpos/Heroe as Node2D
	heroe.pulso()
	_sonar_nota(520.0 if id == "luna" else 330.0, false)
	match hechizo.efecto:
		"cura":
			Partida.curar(int(round(float(hechizo.cura) * poder)))
		"vel":
			Partida.buff_vel = hechizo.duracion
			Partida.avisar("Mercurio aligera el paso.", 1.6)
		"oro":
			Partida.buff_oro = hechizo.duracion
			Partida.avisar("Júpiter dobla el oro un rato.", 1.6)
		_:
			for pieza in get_tree().get_nodes_in_group("enemigo"):
				if heroe.global_position.distance_to(pieza.global_position) > hechizo.radio:
					continue
				if hechizo.dano > 0 and pieza.has_method("recibir"):
					pieza.recibir(int(round(float(hechizo.dano) * poder)))
				if hechizo.efecto == "raiz":
					pieza.raiz = hechizo.duracion
				if hechizo.efecto == "freno":
					pieza.freno = hechizo.duracion
			if hechizo.cura > 0:
				Partida.curar(int(round(float(hechizo.cura) * poder)))
			if hechizo.radio > 0.0:
				_anillo(heroe.global_position, hechizo.radio, Color(0.86, 0.74, 0.42, 0.45))


func _anillo(punto: Vector2, radio: float, color: Color) -> void:
	var anillo := Polygon2D.new()
	var puntos := PackedVector2Array()
	for paso in 10:
		var angulo := TAU * float(paso) / 10.0
		puntos.append(Vector2(cos(angulo), sin(angulo)) * radio)
	anillo.polygon = puntos
	anillo.color = color
	anillo.position = punto
	anillo.z_index = 3
	$Cuerpos.add_child(anillo)
	var tween := create_tween()
	tween.tween_property(anillo, "modulate:a", 0.0, 0.32)
	tween.finished.connect(anillo.queue_free)


func _disparo_torre() -> void:
	var nivel := int(Partida.obras["torre"])
	if nivel <= 0 or Partida.fase != "juego":
		return
	var origen := Vector2(352, 360)
	var mejor: Node2D = null
	var mejor_distancia := 170.0 + float(nivel) * 30.0
	for pieza in get_tree().get_nodes_in_group("enemigo"):
		var cuerpo := pieza as Node2D
		if cuerpo == null:
			continue
		var distancia := origen.distance_to(cuerpo.global_position)
		if distancia < mejor_distancia:
			mejor_distancia = distancia
			mejor = cuerpo
	if mejor != null and mejor.has_method("recibir"):
		mejor.recibir(8 * nivel)
		_anillo(mejor.global_position, 18.0, Color(0.9, 0.45, 0.3, 0.7))


func _enemigo_en(punto: Vector2) -> Node2D:
	var consulta := PhysicsPointQueryParameters2D.new()
	consulta.position = punto
	consulta.collision_mask = 2
	consulta.collide_with_bodies = true
	consulta.collide_with_areas = false
	var golpes := get_world_2d().direct_space_state.intersect_point(consulta, 4)
	for golpe in golpes:
		var cuerpo: Object = golpe.get("collider")
		if cuerpo is Node2D and cuerpo.is_in_group("enemigo"):
			return cuerpo
	var cercano: Node2D = null
	var mejor := 36.0
	for pieza in get_tree().get_nodes_in_group("enemigo"):
		var distancia := punto.distance_to(pieza.global_position)
		if distancia < mejor:
			mejor = distancia
			cercano = pieza
	return cercano


func _al_cargar() -> void:
	if Partida.entrada:
		return
	_disolver()
	_poner(Partida.grupos_actuales(), "oleada")
	$Cuerpos/Heroe.vestir()
	_refrescar_obra()


func _al_morir_heroe() -> void:
	_disolver()


func _al_revivir() -> void:
	var heroe := $Cuerpos/Heroe
	heroe.position = Vector2(352, 560)
	heroe.soltar_orden()
	_poner(Partida.grupos_actuales(), "oleada")


func _disolver() -> void:
	for pieza in get_tree().get_nodes_in_group("enemigo"):
		if pieza.has_method("disolver"):
			pieza.disolver()
	for pieza in get_tree().get_nodes_in_group("flecha"):
		pieza.queue_free()


func _cuenta() -> int:
	return get_tree().get_nodes_in_group("enemigo").size()


func _sonar_nota(hz: float, solo_primera: bool) -> void:
	if solo_primera and _audio_usado:
		return
	if not solo_primera and _sonido.playing:
		return
	_audio_usado = true
	_sonido.stream = _tono(hz, 0.08)
	_sonido.play()


func _tono(hz: float, segundos: float) -> AudioStreamWAV:
	var flujo := AudioStreamWAV.new()
	flujo.format = AudioStreamWAV.FORMAT_8_BITS
	flujo.mix_rate = 8000
	var muestras := int(segundos * 8000.0)
	var datos := PackedByteArray()
	datos.resize(muestras)
	for indice in muestras:
		var envolvente := 1.0 - float(indice) / float(muestras)
		var onda := sin(TAU * hz * float(indice) / 8000.0) * envolvente
		datos[indice] = clampi(int(128.0 + onda * 96.0), 0, 255)
	flujo.data = datos
	return flujo
