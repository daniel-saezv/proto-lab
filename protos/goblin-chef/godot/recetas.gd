extends RefCounted
class_name Recetas

## Platos de dos ingredientes y combinaciones que aparecen al tener ambos.

const OBJETOS := {
	"seta": "Seta",
	"baya": "Baya",
	"raiz": "Raíz",
	"baba": "Baba",
	"ala": "Ala",
	"hueso": "Hueso",
	"especia": "Especia",
}

const ORDEN: Array[String] = ["seta", "baya", "raiz", "baba", "ala", "hueso", "especia"]
const DEL_SUELO: Array[String] = ["seta", "baya", "raiz"]

const PLATOS: Array[Dictionary] = [
	{"a": "baya", "b": "seta", "id": "brocheta", "nombre": "Brocheta dulce", "stat": "dano", "valor": 1},
	{"a": "raiz", "b": "seta", "id": "caldo", "nombre": "Caldo de raíz", "stat": "vida", "valor": 4},
	{"a": "baya", "b": "raiz", "id": "tarta", "nombre": "Tarta del bosque", "stat": "armadura", "valor": 1},
	{"a": "baba", "b": "seta", "id": "salteado", "nombre": "Salteado viscoso", "stat": "velocidad", "valor": 0.35},
	{"a": "hueso", "b": "raiz", "id": "fondo", "nombre": "Fondo de hueso", "stat": "vida", "valor": 6},
	{"a": "ala", "b": "especia", "id": "polvo", "nombre": "Polvo de ala", "stat": "velocidad", "valor": 0.5},
	{"a": "baya", "b": "especia", "id": "glaseado", "nombre": "Glaseado rápido", "stat": "cadencia", "valor": -0.08},
	{"a": "baba", "b": "hueso", "id": "pegamento", "nombre": "Pegamento de chef", "stat": "armadura", "valor": 1},
	{"a": "especia", "b": "seta", "id": "guiso", "nombre": "Guiso picante", "stat": "dano", "valor": 2},
]

const SINERGIAS: Array[Dictionary] = [
	{"id": "festin", "nombre": "Festín del caldero", "necesita": ["brocheta", "caldo"], "stat": "vida", "valor": 3},
	{"id": "paso", "nombre": "Paso firme", "necesita": ["salteado", "tarta"], "stat": "armadura", "valor": 1},
	{"id": "relampago", "nombre": "Salteado relámpago", "necesita": ["glaseado", "polvo"], "stat": "cadencia", "valor": -0.05},
	{"id": "hierro", "nombre": "Cocina de hierro", "necesita": ["guiso", "pegamento"], "stat": "vida", "valor": 2},
]

const BOTIN := {
	"slime": ["hueso", "baba"],
	"murcielago": ["ala", "especia"],
	"golem": ["hueso", "especia"],
}


static func vacio() -> Dictionary:
	var bolsa := {}
	for id in ORDEN:
		bolsa[id] = 0
	return bolsa


static func nombre(id: String) -> String:
	return str(OBJETOS.get(id, id))


static func buscar(a: String, b: String) -> Dictionary:
	var par := _par(a, b)
	for plato in PLATOS:
		if plato["a"] == par[0] and plato["b"] == par[1]:
			return plato
	return {}


static func botin(tipo: String) -> Array:
	return BOTIN.get(tipo, [])


static func intentar(inventario: Dictionary, mejoras: Dictionary, a: String, b: String, nispero: bool) -> Dictionary:
	var plato := buscar(a, b)
	if plato.is_empty():
		return {"ok": false, "motivo": "receta"}
	var queda_a := int(inventario.get(a, 0))
	var queda_b := int(inventario.get(b, 0))
	if a == b:
		if queda_a < 2:
			return {"ok": false, "motivo": "falta"}
	elif queda_a < 1 or queda_b < 1:
		return {"ok": false, "motivo": "falta"}
	inventario[a] = queda_a - 1
	inventario[b] = int(inventario.get(b, 0)) - 1
	var id := str(plato["id"])
	mejoras[id] = int(mejoras.get(id, 0)) + 1
	var nuevas := sinergias_nuevas(mejoras)
	for extra in nuevas:
		var sid := str(extra["id"])
		mejoras[sid] = int(mejoras.get(sid, 0)) + 1
	return {
		"ok": true,
		"plato": plato,
		"veces": 2 if nispero else 1,
		"sinergias": nuevas,
	}


static func sinergias_nuevas(mejoras: Dictionary) -> Array[Dictionary]:
	var nuevas: Array[Dictionary] = []
	for combo in SINERGIAS:
		if int(mejoras.get(combo["id"], 0)) >= 1:
			continue
		var lista: Array = combo["necesita"]
		var cumple := true
		for requisito in lista:
			if int(mejoras.get(requisito, 0)) < 1:
				cumple = false
				break
		if cumple:
			nuevas.append(combo)
	return nuevas


static func _par(a: String, b: String) -> PackedStringArray:
	if a <= b:
		return PackedStringArray([a, b])
	return PackedStringArray([b, a])
