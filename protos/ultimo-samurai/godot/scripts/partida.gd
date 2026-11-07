extends Node

signal cambio_vidas
signal anuncio(texto: String)
signal kata_lista
signal jefe_cambio(actual: int, maximo: int)
signal cargada

var vidas: int = Reglas.VIDAS_JUGADOR
var asesinatos := 0
var tiene_kesa := false
var tiene_tatsumaki := false
var jefe_vencido := false
var santuario := false
var sello_roto := false
var pausa := false
var control := Reglas.SPAWN
var punto_santuario := Vector3(-0.8, 9.38, 0)
var lista := false
var _pistas: Dictionary = {}


func _ready() -> void:
	_atajos()
	if OS.has_feature("web"):
		_pedir_guardado()
	else:
		lista = true


func _atajos() -> void:
	_accion("mover_izquierda", KEY_A, KEY_LEFT)
	_accion("mover_derecha", KEY_D, KEY_RIGHT)
	_accion("saltar", KEY_SPACE, KEY_W)
	_accion("atacar", KEY_J, KEY_NONE)
	_accion("kata", KEY_K, KEY_NONE)
	_accion("meditar", KEY_E, KEY_ENTER)
	_boton("saltar", JOY_BUTTON_A)
	_boton("atacar", JOY_BUTTON_X)
	_boton("kata", JOY_BUTTON_Y)
	_boton("meditar", JOY_BUTTON_B)
	_eje("mover_izquierda", "mover_derecha")
	# El espacio es el salto. Si también acepta la interfaz, el menú del
	# santuario salta al cerrarse.
	if InputMap.has_action("ui_accept"):
		InputMap.action_erase_events("ui_accept")
	var enter := InputEventKey.new()
	enter.physical_keycode = KEY_ENTER
	InputMap.action_add_event("ui_accept", enter)
	var aceptar := InputEventJoypadButton.new()
	aceptar.button_index = JOY_BUTTON_A
	InputMap.action_add_event("ui_accept", aceptar)


func _accion(nombre: String, tecla: Key, extra: Key) -> void:
	if not InputMap.has_action(nombre):
		InputMap.add_action(nombre, 0.22)
	_tecla(nombre, tecla)
	if extra != KEY_NONE:
		_tecla(nombre, extra)


func _tecla(nombre: String, tecla: Key) -> void:
	var ev := InputEventKey.new()
	ev.physical_keycode = tecla
	InputMap.action_add_event(nombre, ev)


func _boton(nombre: String, boton: JoyButton) -> void:
	var ev := InputEventJoypadButton.new()
	ev.button_index = boton
	InputMap.action_add_event(nombre, ev)


func _eje(negativo: String, positivo: String) -> void:
	var izq := InputEventJoypadMotion.new()
	izq.axis = JOY_AXIS_LEFT_X
	izq.axis_value = -1.0
	InputMap.action_add_event(negativo, izq)
	var der := InputEventJoypadMotion.new()
	der.axis = JOY_AXIS_LEFT_X
	der.axis_value = 1.0
	InputMap.action_add_event(positivo, der)


func curar(con_sonido: bool = true) -> void:
	vidas = Reglas.VIDAS_JUGADOR
	cambio_vidas.emit()
	if con_sonido:
		Sonido.suena("santuario")


func aprender_tatsumaki() -> bool:
	if tiene_tatsumaki:
		return false
	tiene_tatsumaki = true
	kata_lista.emit()
	guardar()
	return true


func registrar_asesinato() -> void:
	asesinatos += 1
	if not tiene_kesa and Reglas.desbloquea_kesa(asesinatos):
		tiene_kesa = true
		anuncio.emit("El filo recuerda el kesa: el segundo corte sube y duele más.")
		kata_lista.emit()
		guardar()


func pista(clave: String, texto: String) -> void:
	if bool(_pistas.get(clave, false)):
		return
	_pistas[clave] = true
	anuncio.emit(texto)


func herir(cantidad: int) -> bool:
	vidas = maxi(vidas - cantidad, 0)
	cambio_vidas.emit()
	return vidas <= 0


func guardar() -> void:
	if not OS.has_feature("web"):
		return
	var datos: Variant = _datos()
	if datos == null:
		return
	var texto := JSON.stringify({
		"kesa": tiene_kesa,
		"tatsumaki": tiene_tatsumaki,
		"jefe": jefe_vencido,
		"santuario": santuario,
		"sello": sello_roto,
	})
	# Object.set no llama al método JS: el puente expone set() como función.
	datos.call("set", "avance", texto)


func _pedir_guardado() -> void:
	var datos: Variant = _datos()
	if datos == null:
		lista = true
		cargada.emit()
		return
	var promesa: Variant = datos.call("get", "avance")
	if promesa == null or not (promesa is Object):
		lista = true
		cargada.emit()
		return
	promesa.call("then", JavaScriptBridge.create_callback(_al_leer))
	promesa.call("catch", JavaScriptBridge.create_callback(_al_fallar))


func _datos() -> Variant:
	if not OS.has_feature("web"):
		return null
	var ventana: Variant = JavaScriptBridge.get_interface("window")
	if ventana == null or not (ventana is Object):
		return null
	# JavaScriptObject.get() invoca el método JS «get», que window no tiene.
	# El índice lee la propiedad __protoLabData del puente.
	var puente: Variant = (ventana as Object)["__protoLabData"]
	if puente == null or not (puente is Object):
		return null
	return puente


func _al_leer(args: Variant) -> void:
	var texto := ""
	if args is Array and (args as Array).size() > 0 and (args as Array)[0] != null:
		texto = str((args as Array)[0])
	_aplicar(texto)
	lista = true
	cargada.emit()


func _al_fallar(_args: Variant) -> void:
	if lista:
		return
	lista = true
	cargada.emit()


func _aplicar(texto: String) -> void:
	if texto.is_empty() or texto == "null" or texto == "Null":
		return
	var parsed: Variant = JSON.parse_string(texto)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var datos: Dictionary = parsed
	tiene_kesa = bool(datos.get("kesa", false))
	tiene_tatsumaki = bool(datos.get("tatsumaki", false))
	jefe_vencido = bool(datos.get("jefe", false))
	santuario = bool(datos.get("santuario", false))
	sello_roto = bool(datos.get("sello", false))
	if santuario:
		control = punto_santuario
	kata_lista.emit()
	cambio_vidas.emit()
