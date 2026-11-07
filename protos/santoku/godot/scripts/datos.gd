class_name Datos
extends RefCounted

const GRAVEDAD := 44.0
const SALTO_V := 13.5
const SALTO2_V := 13.2
const CORRER := 12.6
const AIRE_MAX := 5.05
const FRENADO_AIRE := 52.0
const DASH := 23.5
const DASH_T := 0.2
const HUECO := 4.2

const CORNISA_Y := 4.7
const APPROACH_Y := 1.15

const CAPA_MUNDO := 1
const CAPA_JUGADOR := 2
const CAPA_ENEMIGO := 4
const CAPA_FILO := 8
const CAPA_GOLPE := 16
const CAPA_GRIETA := 64
const CAPA_PUERTA := 128
const CAPA_SELLO := 256
const MASCARA_FILO := CAPA_ENEMIGO | CAPA_GRIETA | CAPA_PUERTA | CAPA_SELLO

const MAPA2_X := 74.3

static func bonus() -> int:
	return 1 if Estado.refinado >= 1 else 0


static func vel_correr() -> float:
	return CORRER * (1.16 if Estado.refinado >= 2 else 1.0)


static func tiempo_dash() -> float:
	return DASH_T + (0.045 if Estado.refinado >= 2 else 0.0)


static func factor_ataque() -> float:
	return 0.8 if Estado.refinado >= 1 else 1.0


static func aire_max() -> float:
	return AIRE_MAX + (0.35 if Estado.refinado >= 2 else 0.0)


static func texto_kata(nombre: String) -> String:
	match nombre:
		"kesa":
			return "Kesa-giri: en el aire, abajo y kata. Abre la grieta."
		"iai":
			return "Iai: con dirección y kata cruzas el vacío y cortas el bambú."
		"kasumi":
			return "Kasumi: quieto, pulsa kata. La ráfaga quiebra el sello."
		"fujin":
			return "Fūjin: segundo salto. La cornisa del viento ya es tuya."
		_:
			return nombre
