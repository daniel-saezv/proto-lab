extends Node

signal cambio
signal mensaje(texto: String)
signal descanso_hecho
signal reintento

var salud := 5
var salud_max := 5
var salud_guardada := 5
var espiritu := 0
var refinado := 0
var katas := {"kihon": true}
var jefes := {}
var rotos: Array[String] = []
var cobrados: Array[String] = []
var checkpoint := "umbral"
var puntos := {}
var victoria := false
var mapa_nombre := "Patio del Bambú"
var en_santuario := false
var inmune := false
var pausa_ia := false
var eje_virtual := 0.0
var abajo_virtual := false
var salto_mantenido := false
var pulso_salto := false
var pulso_corte := false
var pulso_kata := false
var pulso_meditar := false
var tocado := false
var listo := false

var _dicho := {}


func _ready() -> void:
	puntos["umbral"] = Vector3(2.2, 0.05, 0)


func tiene(nombre: String) -> bool:
	return bool(katas.get(nombre, false))


func aprender(nombre: String) -> bool:
	if tiene(nombre):
		return false
	katas[nombre] = true
	decir(Datos.texto_kata(nombre))
	cambio.emit()
	return true


func herir(cantidad: int) -> void:
	salud = maxi(0, salud - cantidad)
	cambio.emit()


func curar_total() -> void:
	salud = salud_max
	salud_guardada = salud
	cambio.emit()


func curar(cantidad: int) -> void:
	salud = mini(salud_max, salud + cantidad)
	salud_guardada = salud
	cambio.emit()


func ganar_espiritu(cantidad: int) -> void:
	espiritu += cantidad
	cambio.emit()
	decir("+%d espíritu" % cantidad)


func refinar() -> bool:
	if espiritu < 3 or refinado >= 2:
		return false
	espiritu -= 3
	refinado += 1
	if refinado == 1:
		decir("El filo se afina: cortas más rápido y más hondo.")
	else:
		decir("Paso de viento: corres y el iai llega más lejos.")
	cambio.emit()
	return true


func jefe_muerto(id: String) -> bool:
	return bool(jefes.get(id, false))


func vencer(id: String) -> void:
	jefes[id] = true
	cambio.emit()


func esta_roto(marca: String) -> bool:
	return rotos.has(marca)


func marcar_roto(marca: String) -> void:
	if marca != "" and not rotos.has(marca):
		rotos.append(marca)


func ya_cobrado(marca: String) -> bool:
	return cobrados.has(marca)


func marcar_cobrado(marca: String) -> void:
	if marca != "" and not cobrados.has(marca):
		cobrados.append(marca)


func punto() -> Vector3:
	return puntos.get(checkpoint, Vector3(2.2, 0.05, 0))


func decir(texto: String) -> void:
	var ahora := Time.get_ticks_msec()
	if _dicho.has(texto) and ahora - int(_dicho[texto]) < 1100:
		return
	_dicho[texto] = ahora
	mensaje.emit(texto)


func pista() -> String:
	if not tiene("kesa"):
		return "Salta al altar y medita. Abajo en el aire será Kesa."
	if not tiene("iai"):
		return "Kesa rompe la grieta del suelo. Dentro espera el Iai."
	if not jefe_muerto("takeoni"):
		return "Iai: dirección + kata. Así cruzas y cortas el bambú."
	if not tiene("fujin"):
		return "El oni cae. Vuelve a la cornisa: Fūjin es el segundo salto."
	if not tiene("kasumi"):
		return "Sube a la cornisa. En el hierro, quieto + kata es Kasumi."
	if not jefe_muerto("tetsu"):
		return "Kasumi quiebra el sello. El shogun niega el filo de frente."
	return "Los dos mapas quedan abiertos. Puedes volver sobre tus pasos."


func exportar() -> Dictionary:
	var katas_lista: Array[String] = []
	for clave in katas.keys():
		if katas[clave]:
			katas_lista.append(str(clave))
	var jefes_lista: Array[String] = []
	for clave in jefes.keys():
		if jefes[clave]:
			jefes_lista.append(str(clave))
	return {
		"v": 1,
		"salud": salud_guardada,
		"espiritu": espiritu,
		"refinado": refinado,
		"katas": katas_lista,
		"jefes": jefes_lista,
		"rotos": rotos.duplicate(),
		"cobrados": cobrados.duplicate(),
		"checkpoint": checkpoint,
		"victoria": victoria,
	}


func importar(datos: Dictionary) -> void:
	salud_guardada = clampi(int(datos.get("salud", 5)), 1, salud_max)
	salud = salud_guardada
	espiritu = maxi(0, int(datos.get("espiritu", 0)))
	refinado = clampi(int(datos.get("refinado", 0)), 0, 2)
	katas = {"kihon": true}
	var lista = datos.get("katas", [])
	if lista is Array:
		for item in lista:
			katas[str(item)] = true
	jefes = {}
	var lista_j = datos.get("jefes", [])
	if lista_j is Array:
		for item in lista_j:
			jefes[str(item)] = true
	rotos.clear()
	var lista_r = datos.get("rotos", [])
	if lista_r is Array:
		for item in lista_r:
			rotos.append(str(item))
	cobrados.clear()
	var lista_c = datos.get("cobrados", [])
	if lista_c is Array:
		for item in lista_c:
			cobrados.append(str(item))
	checkpoint = str(datos.get("checkpoint", "umbral"))
	victoria = bool(datos.get("victoria", false))
	cambio.emit()


func reiniciar_partida() -> void:
	salud = salud_max
	salud_guardada = salud_max
	espiritu = 0
	refinado = 0
	katas = {"kihon": true}
	jefes = {}
	rotos.clear()
	cobrados.clear()
	checkpoint = "umbral"
	victoria = false
	mapa_nombre = "Patio del Bambú"
	en_santuario = false
	cambio.emit()
