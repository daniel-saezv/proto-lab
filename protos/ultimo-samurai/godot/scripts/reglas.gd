class_name Reglas
extends RefCounted

const GRAVEDAD := 28.0
const SALTO := 10.0
const VELOCIDAD := 7.2
const DASH_VELOCIDAD := 9.0
const DASH_TIEMPO := 0.30
const RADIO := 0.22

const VIDAS_JUGADOR := 5
const VIDAS_JEFE := 12
const VIDAS_ASHIGARU := 2
const VIDAS_ARQUERO := 2
const VIDAS_RONIN := 4
const ASESINATOS_KESA := 3

const DANIO_IAI := 1
const DANIO_KESA := 2
const DANIO_TATSUMAKI := 2
const DANIO_CONTRA := 3
const DANIO_EMBESTIDA := 2

const CAPA_MUNDO := 1
const CAPA_JUGADOR := 2
const CAPA_ENEMIGO := 4
const CAPA_GOLPE := 8
const CAPA_SELLO := 32

const SPAWN := Vector3(0, 0.08, 0)


static func altura_salto() -> float:
	return SALTO * SALTO / (2.0 * GRAVEDAD)


static func distancia_dash() -> float:
	return DASH_VELOCIDAD * DASH_TIEMPO


static func desbloquea_kesa(asesinatos: int) -> bool:
	return asesinatos >= ASESINATOS_KESA


static func danio(kata: String, contra_embestida: bool) -> int:
	if kata == "tatsumaki":
		return DANIO_CONTRA if contra_embestida else DANIO_TATSUMAKI
	if kata == "kesa":
		return DANIO_KESA
	if kata == "contra":
		return DANIO_CONTRA
	return DANIO_IAI


static func ronin_bloquea(kata: String, de_frente: bool) -> bool:
	return de_frente and kata == "iai"
