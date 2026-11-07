extends RefCounted

## Instancia modelos CC0 (KayKit) con escala coherente para la plaza.

const ESCALA_JUGADOR := 0.54
const ESCALA_RIVAL := 0.5
const ESCALA_MUESTRA := 0.42
const ESCALA_ALIADO := 0.44

const JUGADOR := {
	"jarra": preload("res://artes/aventureros/Barbarian.glb"),
	"naipe": preload("res://artes/aventureros/Rogue_Hooded.glb"),
	"espuma": preload("res://artes/aventureros/Mage.glb"),
	"comparsa": preload("res://artes/aventureros/Rogue.glb"),
}

const RIVAL_TVRESN: PackedScene = preload("res://artes/esqueletos/Skeleton_Minion.glb")
const RIVAL_AJGULZIL: PackedScene = preload("res://artes/esqueletos/Skeleton_Mage.glb")

const MONEDA := preload("res://artes/util/Coin_A.glb")
const CHARCO := preload("res://artes/util/Can_B.glb")

const SUELO_GRANDE := preload("res://artes/mazmorra/floor_tile_large.glb")
const SUELO_PEQUE := preload("res://artes/mazmorra/floor_tile_small.glb")
const MURO := preload("res://artes/mazmorra/wall.glb")
const PUERTA := preload("res://artes/mazmorra/wall_arched.glb")
const ESQUINA := preload("res://artes/mazmorra/wall_corner.glb")
const COLUMNA := preload("res://artes/mazmorra/pillar.glb")
const BARRIL_PEQUE := preload("res://artes/mazmorra/barrel_small.glb")
const BARRIL_GRANDE := preload("res://artes/mazmorra/barrel_large_decorated.glb")
const MESA := preload("res://artes/mazmorra/table_medium.glb")
const SILLA := preload("res://artes/mazmorra/stool.glb")
const Estandarte_AMBAR := preload("res://artes/mazmorra/banner_thin_brown.glb")
const Estandarte_VIOLETA := preload("res://artes/mazmorra/banner_thin_yellow.glb")
const BOTELLA := preload("res://artes/mazmorra/bottle_A_labeled_brown.glb")


static func montar_jugador(contenedor: Node3D, id: String) -> Node3D:
	_limpiar_visuales(contenedor)
	ocultar_primitivas(contenedor)
	var escena: PackedScene = JUGADOR.get(id, JUGADOR["jarra"])
	var modelo := _colgar(escena, contenedor, ESCALA_JUGADOR, -0.02)
	modelo.name = "Modelo"
	return modelo


static func montar_rival(contenedor: Node3D, bando: String) -> Node3D:
	_limpiar_visuales(contenedor)
	ocultar_primitivas(contenedor)
	var escena: PackedScene = RIVAL_TVRESN if bando == "tvresn" else RIVAL_AJGULZIL
	var modelo := _colgar(escena, contenedor, ESCALA_RIVAL, -0.02)
	modelo.name = "Modelo"
	return modelo


static func montar_muestra(contenedor: Node3D, id: String) -> Node3D:
	_limpiar_visuales(contenedor)
	for hijo in contenedor.get_children():
		if hijo is MeshInstance3D:
			hijo.visible = false
	var escena: PackedScene = JUGADOR.get(id, JUGADOR["jarra"])
	var modelo := _colgar(escena, contenedor, ESCALA_MUESTRA, 0.0)
	modelo.name = "Modelo"
	return modelo


static func prop(padre: Node3D, escena: PackedScene, pos: Vector3, escala: float, rot_y: float = 0.0) -> Node3D:
	var nodo := _colgar(escena, padre, escala, 0.0)
	nodo.position = pos
	nodo.rotation.y = rot_y
	return nodo


static func proyectil(padre: Node3D, tinta: Color) -> Node3D:
	var nodo := _colgar(MONEDA, padre, 0.55, 0.0)
	_brillar(nodo, tinta)
	return nodo


static func charco_visual(padre: Node3D, tinta: Color) -> Node3D:
	var nodo := _colgar(CHARCO, padre, 0.7, 0.0)
	nodo.scale = Vector3(1.15, 0.22, 1.15)
	_brillar(nodo, tinta, 0.35)
	return nodo


static func destellar(anfitrion: Node, raiz: Node) -> void:
	if anfitrion == null or raiz == null:
		return
	var marcados: Array[MeshInstance3D] = []
	_reunir_mallas(raiz, marcados)
	for malla in marcados:
		var anterior = malla.material_overlay
		var flash := StandardMaterial3D.new()
		flash.albedo_color = Color(1.0, 0.96, 0.9)
		flash.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		malla.material_overlay = flash
		var tw := anfitrion.create_tween()
		tw.tween_interval(0.11)
		tw.tween_callback(func(): malla.material_overlay = anterior)


static func _colgar(escena: PackedScene, padre: Node3D, escala: float, bajar: float) -> Node3D:
	var nodo: Node3D = escena.instantiate()
	padre.add_child(nodo)
	_apagar_rig(nodo)
	nodo.scale = Vector3.ONE * escala
	nodo.position.y = bajar
	_sin_sombras(nodo)
	return nodo


static func _limpiar_visuales(contenedor: Node3D) -> void:
	for hijo in contenedor.get_children():
		if hijo.name == "Modelo":
			hijo.queue_free()


static func ocultar_primitivas(contenedor: Node3D) -> void:
	for hijo in contenedor.get_children():
		if hijo is MeshInstance3D:
			hijo.visible = false


static func _apagar_rig(nodo: Node) -> void:
	if nodo is AnimationPlayer:
		var reproductor := nodo as AnimationPlayer
		reproductor.stop()
		reproductor.active = false
	for hijo in nodo.get_children():
		_apagar_rig(hijo)


static func _sin_sombras(nodo: Node) -> void:
	if nodo is GeometryInstance3D:
		(nodo as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for hijo in nodo.get_children():
		_sin_sombras(hijo)


static func _brillar(raiz: Node, tinta: Color, emision := 0.55) -> void:
	var marcados: Array[MeshInstance3D] = []
	_reunir_mallas(raiz, marcados)
	for malla in marcados:
		var mat := StandardMaterial3D.new()
		mat.albedo_color = tinta
		mat.emission_enabled = true
		mat.emission = tinta
		mat.emission_energy_multiplier = emision
		malla.material_overlay = mat


static func _reunir_mallas(nodo: Node, lista: Array[MeshInstance3D]) -> void:
	if nodo is MeshInstance3D:
		lista.append(nodo)
	for hijo in nodo.get_children():
		_reunir_mallas(hijo, lista)
