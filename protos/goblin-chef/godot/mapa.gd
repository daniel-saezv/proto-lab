extends RefCounted
class_name Mapa

## Claro procedural. El camino de entrada a salida nunca lleva muro.

const PASO := 2.0
const _RUMBOS: Array[Vector2i] = [Vector2i.RIGHT, Vector2i.LEFT, Vector2i.UP, Vector2i.DOWN]
const BASE := {
	"slime": {"vida": 5, "dano": 2, "vel": 1.65},
	"murcielago": {"vida": 3, "dano": 2, "vel": 3.05},
	"golem": {"vida": 9, "dano": 3, "vel": 1.12},
}


static func generar(profundidad: int, semilla: int) -> Dictionary:
	var nivel := maxi(1, profundidad)
	var n := mini(8 + nivel, 12)
	var rng := RandomNumberGenerator.new()
	rng.seed = semilla
	var inicio := Vector2i(1, 1)
	var salida := Vector2i(n - 2, n - 2)
	var camino := _camino(rng, n, inicio, salida)
	var libre := {}
	for celda in camino:
		libre[_clave(celda)] = celda
	var bloqueadas: Array[Vector2i] = []
	for y in n:
		for x in n:
			var celda := Vector2i(x, y)
			var borde := x == 0 or y == 0 or x == n - 1 or y == n - 1
			if borde or (not libre.has(_clave(celda)) and rng.randf() < 0.38):
				bloqueadas.append(celda)
	var huecos: Array[Vector2i] = []
	for celda in libre.values():
		if celda != inicio and celda != salida:
			huecos.append(celda)
	_barajar(rng, huecos)
	var enemigos: Array[Dictionary] = []
	var usados := {}
	var lejos: Array[Vector2i] = []
	for celda in huecos:
		if absi(celda.x - inicio.x) + absi(celda.y - inicio.y) >= 4:
			lejos.append(celda)
	if lejos.is_empty():
		lejos = huecos.duplicate()
	var tipos := tipos_enemigos(nivel)
	for i in tipos.size():
		if i >= lejos.size():
			break
		var celda: Vector2i = lejos[i]
		usados[_clave(celda)] = true
		enemigos.append({"celda": celda, "tipo": tipos[i]})
	var ingredientes: Array[Dictionary] = []
	var fijos: Array[String] = ["seta", "baya", "raiz"]
	var extras := 1 + nivel / 2
	var puestos := 0
	for celda in huecos:
		if usados.has(_clave(celda)):
			continue
		var tipo := ""
		if puestos < fijos.size():
			tipo = fijos[puestos]
		elif puestos < fijos.size() + extras:
			tipo = Recetas.DEL_SUELO[rng.randi() % Recetas.DEL_SUELO.size()]
		else:
			break
		ingredientes.append({"celda": celda, "tipo": tipo})
		puestos += 1
	return {
		"n": n,
		"semilla": semilla,
		"profundidad": nivel,
		"inicio": inicio,
		"salida": salida,
		"bloqueadas": bloqueadas,
		"enemigos": enemigos,
		"ingredientes": ingredientes,
	}


static func tipos_enemigos(profundidad: int) -> Array[String]:
	var nivel := maxi(1, profundidad)
	var lista: Array[String] = ["slime", "slime"]
	if nivel >= 2:
		lista.append("murcielago")
	if nivel >= 3:
		lista.append("golem")
	var objetivo := mini(2 + (nivel - 1), 6)
	var ciclo: Array[String] = ["slime", "murcielago", "golem"]
	var indice := 0
	while lista.size() < objetivo:
		var tipo := ciclo[indice % ciclo.size()]
		if tipo == "murcielago" and nivel < 2:
			tipo = "slime"
		if tipo == "golem" and nivel < 3:
			tipo = "slime"
		lista.append(tipo)
		indice += 1
	return lista


static func stats_enemigo(tipo: String, profundidad: int) -> Dictionary:
	var base: Dictionary = BASE[tipo]
	var extra := maxi(0, profundidad - 1)
	return {
		"vida": int(base["vida"]) + extra * 2,
		"dano": int(base["dano"]) + extra,
		"vel": float(base["vel"]) + float(extra) * 0.12,
	}


static func mundo(celda: Vector2i, n: int) -> Vector3:
	var origen := float(n - 1) * 0.5
	return Vector3((float(celda.x) - origen) * PASO, 0.0, (float(celda.y) - origen) * PASO)


static func conectado(datos: Dictionary) -> bool:
	var n := int(datos["n"])
	var muro := {}
	for celda in datos["bloqueadas"]:
		muro[_clave(celda)] = true
	var inicio: Vector2i = datos["inicio"]
	var salida: Vector2i = datos["salida"]
	var cola: Array[Vector2i] = [inicio]
	var visto := {_clave(inicio): true}
	while not cola.is_empty():
		var actual: Vector2i = cola.pop_front()
		if actual == salida:
			return true
		for paso in _RUMBOS:
			var siguiente: Vector2i = actual + paso
			if siguiente.x < 0 or siguiente.y < 0 or siguiente.x >= n or siguiente.y >= n:
				continue
			var clave := _clave(siguiente)
			if muro.has(clave) or visto.has(clave):
				continue
			visto[clave] = true
			cola.append(siguiente)
	return false


static func _camino(rng: RandomNumberGenerator, n: int, inicio: Vector2i, salida: Vector2i) -> Array[Vector2i]:
	var actual := inicio
	var celdas: Array[Vector2i] = [actual]
	var visto := {_clave(actual): true}
	var guardia := 0
	while actual != salida and guardia < n * n * 8:
		guardia += 1
		var opciones: Array[Vector2i] = []
		for paso in _RUMBOS:
			var siguiente: Vector2i = actual + paso
			if siguiente.x < 1 or siguiente.y < 1 or siguiente.x > n - 2 or siguiente.y > n - 2:
				continue
			opciones.append(siguiente)
		var mejor: Vector2i = opciones[0]
		var mejor_d := mejor.distance_squared_to(salida)
		for candidato in opciones:
			var distancia := candidato.distance_squared_to(salida)
			if distancia < mejor_d:
				mejor = candidato
				mejor_d = distancia
		var elegido := mejor if rng.randf() < 0.68 else opciones[rng.randi() % opciones.size()]
		actual = elegido
		var clave := _clave(actual)
		if not visto.has(clave):
			visto[clave] = true
			celdas.append(actual)
	if actual != salida:
		while actual.x != salida.x:
			actual.x += 1 if salida.x > actual.x else -1
			if not visto.has(_clave(actual)):
				visto[_clave(actual)] = true
				celdas.append(actual)
		while actual.y != salida.y:
			actual.y += 1 if salida.y > actual.y else -1
			if not visto.has(_clave(actual)):
				visto[_clave(actual)] = true
				celdas.append(actual)
	return celdas


static func _barajar(rng: RandomNumberGenerator, items: Array) -> void:
	for i in range(items.size() - 1, 0, -1):
		var j := rng.randi() % (i + 1)
		var tmp = items[i]
		items[i] = items[j]
		items[j] = tmp


static func _clave(celda: Vector2i) -> String:
	return "%d,%d" % [celda.x, celda.y]
