extends RefCounted

## Datos de los cuatro oficios. No son las clases de Diablo: son oficios de la fiesta.

static func ids() -> PackedStringArray:
	return PackedStringArray(["jarra", "naipe", "espuma", "comparsa"])


static func nuevo(id: String) -> Dictionary:
	for item in todos():
		if str(item["id"]) == id:
			return item
	return {}


static func todos() -> Array:
	return [
		{
			"id": "jarra",
			"nombre": "Jarra",
			"oficio": "Cuerpo a cuerpo",
			"texto": "Pega cerca y abre sitio a empujones.",
			"color": Color(0.93, 0.5, 0.16),
			"vida": 128,
			"velocidad": 5.3,
			"ataque": {
				"id": "golpe", "nombre": "Golpe", "cd": 0.32,
				"tipo": "arco", "fondo": 1.85, "ancho": 1.55, "dano": 15, "empuje": 2.6,
			},
			"habilidades": [
				{"id": "banqueta", "nombre": "Banqueta", "cd": 2.1, "tipo": "arco", "fondo": 2.55, "ancho": 3.2, "dano": 22, "empuje": 5.2},
				{"id": "trago", "nombre": "Trago", "cd": 6.5, "tipo": "cura", "cantidad": 34, "prisa": 1.35, "prisa_s": 2.0},
				{"id": "empujon", "nombre": "Empujón", "cd": 3.2, "tipo": "envite", "distancia": 4.6, "dano": 16, "empuje": 6.0},
			],
		},
		{
			"id": "naipe",
			"nombre": "Naipe",
			"oficio": "A distancia",
			"texto": "Corta desde lejos con las cartas.",
			"color": Color(0.58, 0.38, 0.95),
			"vida": 92,
			"velocidad": 6.15,
			"ataque": {
				"id": "tiro", "nombre": "Tiro", "cd": 0.28,
				"tipo": "rafaga", "n": 1, "abanico": 0.0, "dano": 11, "velocidad": 18.0, "vida_tiro": 0.72,
			},
			"habilidades": [
				{"id": "abanico", "nombre": "Abanico", "cd": 2.4, "tipo": "rafaga", "n": 5, "abanico": 50.0, "dano": 8, "velocidad": 16.0, "vida_tiro": 0.62},
				{"id": "as", "nombre": "As", "cd": 3.0, "tipo": "rafaga", "n": 1, "abanico": 0.0, "dano": 28, "velocidad": 22.0, "vida_tiro": 0.85},
				{"id": "paso", "nombre": "Paso", "cd": 2.6, "tipo": "envite", "distancia": 4.3, "dano": 0, "empuje": 0.0},
			],
		},
		{
			"id": "espuma",
			"nombre": "Espuma",
			"oficio": "Cerveza",
			"texto": "Charcos, burbujas y un eructo.",
			"color": Color(0.95, 0.78, 0.28),
			"vida": 104,
			"velocidad": 5.5,
			"ataque": {
				"id": "chorro", "nombre": "Chorro", "cd": 0.42,
				"tipo": "rafaga", "n": 3, "abanico": 20.0, "dano": 7, "velocidad": 14.0, "vida_tiro": 0.4,
			},
			"habilidades": [
				{"id": "charco", "nombre": "Charco", "cd": 3.6, "tipo": "charco", "radio": 2.35, "dano": 7, "dura": 3.2},
				{"id": "burbuja", "nombre": "Burbuja", "cd": 3.0, "tipo": "nova", "radio": 3.15, "dano": 18, "empuje": 4.6},
				{"id": "eructo", "nombre": "Eructo", "cd": 4.0, "tipo": "arco", "fondo": 3.5, "ancho": 2.7, "dano": 12, "empuje": 9.0},
			],
		},
		{
			"id": "comparsa",
			"nombre": "Comparsa",
			"oficio": "La fiesta",
			"texto": "Invita, brinda y arrastra la conga.",
			"color": Color(0.95, 0.34, 0.52),
			"vida": 112,
			"velocidad": 5.6,
			"ataque": {
				"id": "palmada", "nombre": "Palmada", "cd": 0.38,
				"tipo": "arco", "fondo": 1.75, "ancho": 1.9, "dano": 13, "empuje": 2.2,
			},
			"habilidades": [
				{"id": "invitar", "nombre": "Invitar", "cd": 5.0, "tipo": "invitar"},
				{"id": "brindis", "nombre": "Brindis", "cd": 6.0, "tipo": "cura", "cantidad": 26, "prisa": 1.15, "prisa_s": 1.6, "nova": 2.3, "dano": 10, "empuje": 2.6},
				{"id": "conga", "nombre": "Conga", "cd": 3.3, "tipo": "envite", "distancia": 5.2, "dano": 14, "empuje": 4.2},
			],
		},
	]
