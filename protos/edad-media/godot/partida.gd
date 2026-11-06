extends Node

signal oficio_cambio
signal recursos_cambio
signal vida_cambio
signal aviso_cambio(texto: String)
signal oleada_cambio
signal obra_cambio
signal murio
signal revivio
signal oficios_cerrados
signal lanzado(id: String)
signal hueste(grupos: Array)
signal mito(id: String)
signal cargada

const PLANETAS: Array[String] = ["sol", "luna", "marte", "mercurio", "jupiter", "venus", "saturno"]
const NOMBRES_PLANETA := {
	"sol": "Sol",
	"luna": "Luna",
	"marte": "Marte",
	"mercurio": "Mercurio",
	"jupiter": "Júpiter",
	"venus": "Venus",
	"saturno": "Saturno",
}
const MITOS: Array[String] = ["dama", "melusina", "fatuo", "perro", "verde", "caceria", "dragon"]
const OBRAS: Array[String] = ["muralla", "torre", "granero", "capilla", "observatorio"]

var oficios: Dictionary = {}
var hechizos: Dictionary = {}
var guerras: Array[Guerra] = []
var clase: String = "caballero"
var nivel: int = 1
var xp: int = 0
var vida: int = 1
var vida_max: int = 1
var mana: int = 1
var mana_max: int = 1
var oro: int = 6
var madera: int = 5
var piedra: int = 5
var obras: Dictionary = {}
var guerra: int = 0
var ciclo: int = 0
var oleada: int = 0
var hora: int = 2
var hora_t: float = 16.0
var oficio_abierto: bool = true
var fase: String = "juego"
var buff_vel: float = 0.0
var buff_oro: float = 0.0
var entrada: bool = false
var oleada_soltada: bool = false
var cds: Dictionary = {}
var aviso: String = ""
var rng := RandomNumberGenerator.new()

var _aviso_t: float = 0.0
var _cura_resto: float = 0.0
var _mana_resto: float = 0.0
var _guardar_t: float = 0.0
var _puede_guardar: bool = false
var _cb_leer: Variant
var _cb_fallo: Variant


func _ready() -> void:
	rng.randomize()
	for obra in OBRAS:
		obras[obra] = 0
	for planeta in PLANETAS:
		cds[planeta] = 0.0
	_cargar_recursos()
	_aplicar_clase(true)
	hora = PLANETAS.find(oficio_actual().planeta)
	avisar("El oficio se cierra con el primer golpe.", 4.5)
	_pedir_lectura()


func _process(delta: float) -> void:
	if _aviso_t > 0.0:
		_aviso_t -= delta
		if _aviso_t <= 0.0:
			aviso = ""
			aviso_cambio.emit("")
	if fase == "juego":
		hora_t -= delta
		if hora_t <= 0.0:
			hora = (hora + 1) % PLANETAS.size()
			hora_t = 16.0
			oficio_cambio.emit()
		for planeta in PLANETAS:
			cds[planeta] = max(0.0, float(cds[planeta]) - delta)
		if buff_vel > 0.0:
			buff_vel = max(0.0, buff_vel - delta)
		if buff_oro > 0.0:
			buff_oro = max(0.0, buff_oro - delta)
		_cura_resto += 2.2 * float(obras["granero"]) * delta
		_mana_resto += 3.0 * float(obras["capilla"]) * delta
		if _cura_resto >= 1.0 and vida < vida_max and vida > 0:
			var cura := int(_cura_resto)
			_cura_resto -= float(cura)
			vida = mini(vida_max, vida + cura)
			vida_cambio.emit()
		if _mana_resto >= 1.0 and mana < mana_max:
			var fe := int(_mana_resto)
			_mana_resto -= float(fe)
			mana = mini(mana_max, mana + fe)
			vida_cambio.emit()
	if _guardar_t > 0.0:
		_guardar_t -= delta
		if _guardar_t <= 0.0:
			_escribir()


func oficio_actual() -> Oficio:
	return oficios[clase] as Oficio


func titulo_guerra() -> String:
	var actual := guerra_actual()
	if actual == null:
		return ""
	return "%d · %s" % [actual.anio, actual.nombre]


func texto_bienes() -> String:
	return "%d oro · %d madera · %d piedra" % [oro, madera, piedra]


func texto_oficio() -> String:
	return "%s · nivel %d" % [oficio_actual().nombre, nivel]


func dano_golpe() -> int:
	return oficio_actual().dano + (nivel - 1) * 2


func alcance() -> float:
	return oficio_actual().alcance


func velocidad() -> float:
	var base := oficio_actual().velocidad
	if buff_vel > 0.0:
		return base * 1.62
	return base


func cadencia() -> float:
	return oficio_actual().cadencia


func planetas_abiertos() -> Array[String]:
	var lista: Array[String] = []
	var origen := PLANETAS.find(oficio_actual().planeta)
	if origen < 0:
		origen = 0
	for paso in nivel:
		lista.append(PLANETAS[(origen + paso) % PLANETAS.size()])
	return lista


func cd_de(id: String) -> float:
	return float(cds.get(id, 0.0))


func potencia(id: String) -> float:
	var afin := 1.35 if id == oficio_actual().planeta else 1.0
	var de_hora := 1.28 if id == PLANETAS[hora] else 1.0
	var obs := 1.0 + 0.15 * float(obras["observatorio"])
	return afin * de_hora * obs


func marcar_entrada() -> void:
	entrada = true


func cambiar_clase(id: String) -> bool:
	if not oficio_abierto or not oficios.has(id) or id == clase:
		return false
	clase = id
	_aplicar_clase(true)
	hora = PLANETAS.find(oficio_actual().planeta)
	hora_t = 16.0
	marcar_entrada()
	oficio_cambio.emit()
	vida_cambio.emit()
	avisar("%s. El oficio se cierra con el primer golpe." % oficio_actual().nombre, 3.0)
	marcar_cambio()
	return true


func lanzar(id: String) -> bool:
	if fase != "juego" or not hechizos.has(id):
		return false
	if not planetas_abiertos().has(id):
		avisar("Esa esfera llega con el nivel.")
		return false
	if cd_de(id) > 0.05:
		return false
	var hechizo := hechizos[id] as Hechizo
	if mana < hechizo.coste:
		avisar("Falta aliento.")
		return false
	mana -= hechizo.coste
	var factor := max(0.55, 1.0 - 0.12 * float(obras["observatorio"]))
	cds[id] = 6.0 * factor
	cerrar_oficio()
	marcar_entrada()
	vida_cambio.emit()
	lanzado.emit(id)
	marcar_cambio()
	return true


func cerrar_oficio() -> void:
	if not oficio_abierto:
		return
	oficio_abierto = false
	oficios_cerrados.emit()


func herir(cantidad: int) -> void:
	if fase != "juego":
		return
	cerrar_oficio()
	vida -= dano_recibido(cantidad)
	if vida <= 0:
		vida = 0
		fase = "caido"
		oro = int(floor(float(oro) * 0.8))
		recursos_cambio.emit()
		murio.emit()
		avisar("La hueste derriba al oficio. Parte del oro se pierde.")
		marcar_cambio()
	vida_cambio.emit()


func curar(cantidad: int) -> void:
	if cantidad <= 0 or fase == "caido":
		return
	vida = mini(vida_max, vida + cantidad)
	vida_cambio.emit()


func revivir() -> void:
	if fase != "caido":
		return
	fase = "juego"
	vida = maxi(1, int(round(float(vida_max) * 0.55)))
	vida_cambio.emit()
	revivio.emit()
	avisar(titulo_guerra())
	marcar_cambio()


func sumar_botin(oro_mas: int, madera_mas: int, piedra_mas: int, cura: int) -> void:
	var factor := 2.0 if buff_oro > 0.0 else 1.0
	oro += int(round(float(oro_mas) * factor))
	madera += madera_mas
	piedra += piedra_mas
	if cura > 0:
		curar(cura)
	recursos_cambio.emit()
	marcar_cambio()


func anotar_xp(cantidad: int) -> void:
	xp += cantidad
	var subio := false
	while nivel < 12 and xp >= _xp_para(nivel):
		nivel += 1
		subio = true
		_aplicar_clase(false)
		vida = vida_max
		mana = mana_max
	if subio:
		avisar("Nivel %d. Una esfera nueva responde." % nivel)
		oficio_cambio.emit()
	vida_cambio.emit()
	marcar_cambio()


func construir(obra: String) -> bool:
	if fase != "juego" or not obras.has(obra):
		return false
	if int(obras[obra]) >= 3:
		avisar("Esa obra ya está en lo alto.")
		return false
	var precio := coste(obra)
	if oro < int(precio["oro"]) or madera < int(precio["madera"]) or piedra < int(precio["piedra"]):
		avisar("Faltan bienes.")
		return false
	oro -= int(precio["oro"])
	madera -= int(precio["madera"])
	piedra -= int(precio["piedra"])
	obras[obra] = int(obras[obra]) + 1
	marcar_entrada()
	obra_cambio.emit()
	recursos_cambio.emit()
	avisar("%s alzada." % _nombre_obra(obra))
	marcar_cambio()
	return true


func coste(obra: String) -> Dictionary:
	var n := int(obras.get(obra, 0))
	match obra:
		"muralla":
			return {"oro": 0, "madera": 0, "piedra": 4 + n * 4}
		"torre":
			return {"oro": 0, "madera": 4 + n * 2, "piedra": 4 + n * 2}
		"granero":
			return {"oro": 1 + n, "madera": 6, "piedra": 0}
		"capilla":
			return {"oro": 4 + n * 2, "madera": 2, "piedra": 4}
		"observatorio":
			return {"oro": 5, "madera": 3 + n, "piedra": 3 + n}
	return {"oro": 99, "madera": 99, "piedra": 99}


func texto_coste(obra: String) -> String:
	var precio := coste(obra)
	var partes: PackedStringArray = []
	if int(precio["oro"]) > 0:
		partes.append("%d oro" % int(precio["oro"]))
	if int(precio["madera"]) > 0:
		partes.append("%d madera" % int(precio["madera"]))
	if int(precio["piedra"]) > 0:
		partes.append("%d piedra" % int(precio["piedra"]))
	var nivel_obra := int(obras.get(obra, 0))
	return "%s %d/3 · %s" % [_nombre_obra(obra), nivel_obra, ", ".join(partes)]


func dano_recibido(cantidad: int) -> int:
	var corte := min(0.48, 0.12 * float(obras["muralla"]))
	return maxi(1, int(round(float(cantidad) * (1.0 - corte))))


func grupos_actuales() -> Array:
	var actual := guerra_actual()
	if actual == null:
		return []
	var partes := actual.oleadas_texto.split("|")
	if partes.is_empty():
		return []
	var indice := clampi(oleada, 0, partes.size() - 1)
	var salida: Array = []
	var primero := true
	for pieza in partes[indice].split(","):
		var trozo := pieza.split(":")
		if trozo.size() != 2:
			continue
		var cantidad := int(trozo[1])
		if primero and ciclo > 0:
			cantidad += 1
		primero = false
		salida.append({"tipo": trozo[0], "n": mini(cantidad, 4)})
	return salida


func cerrar_oleada() -> void:
	if fase != "juego":
		return
	var actual := guerra_actual()
	if actual == null:
		return
	var partes := actual.oleadas_texto.split("|")
	if oleada + 1 < partes.size():
		oleada += 1
		avisar(actual.nota, 2.6)
		get_tree().create_timer(1.3).timeout.connect(_pedir_hueste)
	else:
		oro += 8
		madera += 6
		piedra += 6
		guerra += 1
		if guerras.size() > 0 and guerra % guerras.size() == 0:
			ciclo += 1
		oleada = 0
		var siguiente := guerra_actual()
		avisar("%d · %s. %s" % [siguiente.anio, siguiente.nombre, siguiente.nota], 3.2)
		recursos_cambio.emit()
		get_tree().create_timer(1.8).timeout.connect(_pedir_hueste)
	oleada_cambio.emit()
	_visitar_mito()
	marcar_cambio()


func guerra_actual() -> Guerra:
	if guerras.is_empty():
		return null
	return guerras[posmod(guerra, guerras.size())]


func avisar(texto: String, segundos: float = 2.8) -> void:
	aviso = texto
	_aviso_t = segundos
	aviso_cambio.emit(texto)


func marcar_cambio() -> void:
	if _puede_guardar:
		_guardar_t = 2.2


func _pedir_hueste() -> void:
	if fase != "juego":
		return
	oleada_soltada = true
	hueste.emit(grupos_actuales())


func _visitar_mito() -> void:
	if rng.randf() > 0.45:
		return
	var id := MITOS[rng.randi() % MITOS.size()]
	match id:
		"dama":
			curar(18)
			oro += 4
			recursos_cambio.emit()
			avisar("La dama blanca deja oro y alivio.")
		"melusina":
			mana = mini(mana_max, mana + 22)
			vida_cambio.emit()
			avisar("Melusina llena el aliento.")
		"fatuo":
			avisar("Un fuego fatuo sale del foso.")
		"perro":
			oro += 3
			recursos_cambio.emit()
			avisar("El perro negro cruza y muerde.")
			herir(8)
		"verde":
			avisar("El Caballero Verde reta a un duelo.")
		"caceria":
			avisar("La cacería salvaje cruza el campo.")
		"dragon":
			avisar("El dragón de la montaña pide tributo.")
	mito.emit(id)


func _aplicar_clase(rellenar: bool) -> void:
	var of := oficio_actual()
	vida_max = of.vida + (nivel - 1) * 8
	mana_max = of.mana + (nivel - 1) * 4
	if rellenar:
		vida = vida_max
		mana = mana_max
	else:
		vida = mini(vida, vida_max)
		mana = mini(mana, mana_max)


func _xp_para(n: int) -> int:
	return 20 + n * 16


func _nombre_obra(obra: String) -> String:
	match obra:
		"muralla":
			return "Muralla"
		"torre":
			return "Torre"
		"granero":
			return "Granero"
		"capilla":
			return "Capilla"
		"observatorio":
			return "Observatorio"
	return obra


func _cargar_recursos() -> void:
	for ruta in [
		"res://recursos/caballero.tres",
		"res://recursos/ballestero.tres",
		"res://recursos/fraile.tres",
		"res://recursos/astrologo.tres",
	]:
		var oficio := load(ruta) as Oficio
		if oficio:
			oficios[oficio.id] = oficio
	for ruta in [
		"res://recursos/sol.tres",
		"res://recursos/luna.tres",
		"res://recursos/marte.tres",
		"res://recursos/mercurio.tres",
		"res://recursos/jupiter.tres",
		"res://recursos/venus.tres",
		"res://recursos/saturno.tres",
	]:
		var hechizo := load(ruta) as Hechizo
		if hechizo:
			hechizos[hechizo.id] = hechizo
	for ruta in [
		"res://recursos/hastings.tres",
		"res://recursos/navas.tres",
		"res://recursos/crecy.tres",
		"res://recursos/constantinopla.tres",
	]:
		var campana := load(ruta) as Guerra
		if campana:
			guerras.append(campana)


func _pedir_lectura() -> void:
	if not OS.has_feature("web"):
		_puede_guardar = true
		return
	var puente: Variant = JavaScriptBridge.get_interface("__protoLabData")
	if puente == null:
		_puede_guardar = true
		return
	var promesa: Variant = puente.call("get", "partida")
	if promesa == null:
		_puede_guardar = true
		return
	_cb_leer = JavaScriptBridge.create_callback(_al_leer)
	_cb_fallo = JavaScriptBridge.create_callback(_al_fallo_leer)
	promesa.call("then", _cb_leer)
	promesa.call("catch", _cb_fallo)


func _al_leer(args: Array) -> void:
	_puede_guardar = true
	if args.is_empty() or args[0] == null:
		return
	var texto := str(args[0])
	if texto.is_empty() or texto == "<null>":
		return
	var datos: Variant = JSON.parse_string(texto)
	if typeof(datos) != TYPE_DICTIONARY:
		return
	if int(datos.get("v", 0)) != 1 or entrada:
		return
	var nueva := str(datos.get("clase", clase))
	if oficios.has(nueva):
		clase = nueva
	nivel = clampi(int(datos.get("nivel", nivel)), 1, 12)
	xp = maxi(0, int(datos.get("xp", xp)))
	oro = maxi(0, int(datos.get("oro", oro)))
	madera = maxi(0, int(datos.get("madera", madera)))
	piedra = maxi(0, int(datos.get("piedra", piedra)))
	var obras_leidas: Variant = datos.get("obras", {})
	if typeof(obras_leidas) == TYPE_DICTIONARY:
		for obra in OBRAS:
			obras[obra] = clampi(int(obras_leidas.get(obra, obras[obra])), 0, 3)
	if guerras.size() > 0:
		guerra = maxi(0, int(datos.get("guerra", guerra)))
	ciclo = maxi(0, int(datos.get("ciclo", ciclo)))
	oleada = maxi(0, int(datos.get("oleada", oleada)))
	oficio_abierto = false
	_aplicar_clase(true)
	hora = PLANETAS.find(oficio_actual().planeta)
	avisar(titulo_guerra(), 2.4)
	oficio_cambio.emit()
	vida_cambio.emit()
	recursos_cambio.emit()
	obra_cambio.emit()
	oleada_cambio.emit()
	oficios_cerrados.emit()
	cargada.emit()


func _al_fallo_leer(_args: Array) -> void:
	_puede_guardar = true


func _escribir() -> void:
	if not _puede_guardar or not OS.has_feature("web"):
		return
	var puente: Variant = JavaScriptBridge.get_interface("__protoLabData")
	if puente == null:
		return
	var datos := {
		"v": 1,
		"clase": clase,
		"nivel": nivel,
		"xp": xp,
		"oro": oro,
		"madera": madera,
		"piedra": piedra,
		"obras": obras.duplicate(),
		"guerra": guerra,
		"ciclo": ciclo,
		"oleada": oleada,
	}
	puente.call("set", "partida", JSON.stringify(datos))
