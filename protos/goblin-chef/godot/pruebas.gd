extends SceneTree

## Reglas del bucle, sin ventana: godot --headless -s res://pruebas.gd


func _init() -> void:
	var fallos: Array[String] = []
	_recetas(fallos)
	_mapas(fallos)
	_dificultad(fallos)
	if fallos.is_empty():
		print("PRUEBAS_OK")
		quit(0)
	else:
		for fallo in fallos:
			printerr(fallo)
		quit(1)


func _recetas(fallos: Array[String]) -> void:
	var vistos := {}
	for plato in Recetas.PLATOS:
		var par := "%s+%s" % [plato["a"], plato["b"]]
		if vistos.has(par):
			fallos.append("plato repetido %s" % par)
		vistos[par] = true
		if str(plato["a"]) > str(plato["b"]):
			fallos.append("par desordenado %s" % par)
	var dulce := Recetas.buscar("seta", "baya")
	if dulce.is_empty() or dulce["id"] != "brocheta":
		fallos.append("seta+baya no es la brocheta")
	if Recetas.buscar("baya", "seta")["id"] != "brocheta":
		fallos.append("el orden del par cambia el plato")
	if not Recetas.buscar("ala", "seta").is_empty():
		fallos.append("ala+seta no debería tener plato")
	var bolsa := Recetas.vacio()
	bolsa["seta"] = 1
	bolsa["baya"] = 1
	bolsa["raiz"] = 1
	var mejoras := {}
	var primero := Recetas.intentar(bolsa, mejoras, "baya", "seta", false)
	if not primero["ok"] or int(primero["veces"]) != 1 or int(bolsa["seta"]) != 0:
		fallos.append("la brocheta no consume")
	if Recetas.intentar(bolsa, mejoras, "seta", "raiz", false)["ok"]:
		fallos.append("cocina sin seta")
	bolsa["seta"] = 1
	var segundo := Recetas.intentar(bolsa, mejoras, "raiz", "seta", true)
	if not segundo["ok"] or int(segundo["veces"]) != 2:
		fallos.append("Níspero no duplica")
	var nombres: Array[String] = []
	for extra in segundo["sinergias"]:
		nombres.append(str(extra["id"]))
	if not nombres.has("festin"):
		fallos.append("brocheta y caldo no encienden el festín")
	var otra := Recetas.intentar(Recetas.vacio(), mejoras, "baya", "raiz", false)
	if otra["ok"]:
		fallos.append("cocina con la despensa vacía")
	mejoras["tarta"] = 1
	mejoras["salteado"] = 1
	var paso := Recetas.sinergias_nuevas(mejoras)
	var tiene_paso := false
	for extra in paso:
		if extra["id"] == "paso":
			tiene_paso = true
	if not tiene_paso:
		fallos.append("falta el paso firme")
	if Recetas.botin("slime") != ["hueso", "baba"]:
		fallos.append("el slime no suelta hueso y baba")


func _mapas(fallos: Array[String]) -> void:
	for profundidad in [1, 2, 3, 4]:
		for semilla in range(1, 25):
			var datos := Mapa.generar(profundidad, semilla)
			if not Mapa.conectado(datos):
				fallos.append("sin camino p=%d s=%d" % [profundidad, semilla])
				return
			var muro := {}
			for celda in datos["bloqueadas"]:
				muro["%d,%d" % [celda.x, celda.y]] = true
			var inicio: Vector2i = datos["inicio"]
			var salida: Vector2i = datos["salida"]
			if muro.has("%d,%d" % [inicio.x, inicio.y]) or muro.has("%d,%d" % [salida.x, salida.y]):
				fallos.append("muro en la entrada o la salida")
				return
			var usados := {}
			for bicho in datos["enemigos"]:
				var celda: Vector2i = bicho["celda"]
				if celda == inicio or muro.has("%d,%d" % [celda.x, celda.y]):
					fallos.append("enemigo mal colocado")
					return
				usados["%d,%d" % [celda.x, celda.y]] = true
			var suelo := {}
			for item in datos["ingredientes"]:
				var celda: Vector2i = item["celda"]
				var clave := "%d,%d" % [celda.x, celda.y]
				if usados.has(clave) or muro.has(clave):
					fallos.append("ingrediente tapado")
					return
				suelo[str(item["tipo"])] = true
			if profundidad == 1:
				for tipo in ["seta", "baya", "raiz"]:
					if not suelo.has(tipo):
						fallos.append("la primera salida no garantiza %s (s=%d)" % [tipo, semilla])
						return
				if datos["enemigos"].size() != 2:
					fallos.append("la primera salida no tiene 2 criaturas")
					return


func _dificultad(fallos: Array[String]) -> void:
	var facil := Mapa.stats_enemigo("slime", 1)
	var dura := Mapa.stats_enemigo("slime", 4)
	if int(dura["vida"]) <= int(facil["vida"]) or int(dura["dano"]) <= int(facil["dano"]):
		fallos.append("el slime no escala")
	if Mapa.tipos_enemigos(1).size() != 2:
		fallos.append("conteo de la salida 1")
	if Mapa.tipos_enemigos(3).size() <= Mapa.tipos_enemigos(1).size():
		fallos.append("las salidas no añaden criaturas")
	if not Mapa.tipos_enemigos(3).has("golem") or not Mapa.tipos_enemigos(2).has("murcielago"):
		fallos.append("faltan el murciélago o el golem")
