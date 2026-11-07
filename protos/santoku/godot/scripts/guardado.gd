extends Node

const CLAVE := "partida"

var memoria := ""
var _al_cargar: Callable = Callable()


func guardar() -> void:
	var texto := JSON.stringify(Estado.exportar())
	memoria = texto
	if not Engine.has_singleton("JavaScriptBridge"):
		return
	var js: Object = Engine.get_singleton("JavaScriptBridge")
	var puente: Object = js.call("get_interface", "__protoLabData")
	if puente == null:
		return
	puente.call("set", CLAVE, texto)


func cargar(al_terminar: Callable) -> void:
	_al_cargar = al_terminar
	if not Engine.has_singleton("JavaScriptBridge"):
		_aplicar_texto(memoria)
		_cerrar()
		return
	var js: Object = Engine.get_singleton("JavaScriptBridge")
	var puente: Object = js.call("get_interface", "__protoLabData")
	if puente == null:
		_aplicar_texto(memoria)
		_cerrar()
		return
	var promesa: Object = puente.call("get", CLAVE)
	if promesa == null:
		_cerrar()
		return
	var bien: Variant = js.call("create_callback", _al_leer)
	var mal: Variant = js.call("create_callback", _al_fallar)
	promesa.call("then", bien, mal)


func _al_leer(args: Array) -> void:
	var valor: Variant = null
	if args.size() > 0:
		valor = args[0]
	_aplicar_texto(valor)
	_cerrar()


func _al_fallar(_args: Array) -> void:
	_cerrar()


func _aplicar_texto(valor: Variant) -> void:
	if typeof(valor) != TYPE_STRING:
		return
	var texto := str(valor)
	if texto.is_empty() or texto == "null":
		return
	memoria = texto
	var parser := JSON.new()
	if parser.parse(texto) != OK or not (parser.data is Dictionary):
		return
	if Estado.tocado:
		return
	Estado.importar(parser.data)


func _cerrar() -> void:
	Estado.listo = true
	if _al_cargar.is_valid():
		var cb := _al_cargar
		_al_cargar = Callable()
		cb.call()
