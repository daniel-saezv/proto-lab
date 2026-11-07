class_name Simulacion
extends Node

var fallos: PackedStringArray = []
var jugador: Jugador


func _ready() -> void:
	_correr()


func _correr() -> void:
	await get_tree().physics_frame
	jugador = get_tree().get_first_node_in_group("jugador") as Jugador
	Estado.inmune = true
	Estado.pausa_ia = true
	if jugador == null or not (get_viewport().get_camera_3d() is Camera3D):
		_fallo("arranque 3d")
		_cerrar()
		return
	_ok("camara 3d y samurai")
	var subida := await _medir_salto(false)
	var doble := await _medir_salto(true)
	print("SANTOKU_MEDIDA salto=%.2f doble=%.2f" % [subida, doble])
	_exigir(subida > 1.7 and subida < Datos.CORNISA_Y - Datos.APPROACH_Y - 0.25, "salto simple no alcanza la cornisa (%.2f)" % subida)
	Estado.aprender("fujin")
	var desde_aprox := await _medir_salto_en(Vector3(8.2, Datos.APPROACH_Y + 0.05, 0), true)
	print("SANTOKU_MEDIDA desde_aprox=%.2f" % desde_aprox)
	_exigir(desde_aprox > Datos.CORNISA_Y - Datos.APPROACH_Y + 0.08, "doble salto desde el acceso (%.2f)" % desde_aprox)
	Estado.katas.erase("fujin")
	var salto_x := await _medir_avance(false)
	var dash_x := await _medir_avance(true)
	print("SANTOKU_MEDIDA avance_salto=%.2f avance_dash=%.2f hueco=%.2f" % [salto_x, dash_x, Datos.HUECO])
	_exigir(salto_x < Datos.HUECO - 0.15, "el salto no cruza el hueco (%.2f)" % salto_x)
	_exigir(dash_x > Datos.HUECO + 0.05, "el iai cruza el hueco (%.2f)" % dash_x)
	_exigir(await _camina(), "se desplaza por el suelo")
	_exigir(await _vence_enemigo(), "derrota a un enemigo")
	_exigir(await _aprende("kesa", Vector3(23.6, 1.05, 0)), "altar kesa")
	_exigir(not _roto("grieta-pozo"), "la grieta sigue cerrada")
	jugador.colocar(Vector3(30.6, 0.2, 0))
	await _frames(6)
	Estado.pulso_corte = true
	await _frames(20)
	_exigir(not _roto("grieta-pozo"), "un corte normal no abre la grieta")
	jugador.colocar(Vector3(30.6, 1.6, 0))
	jugador.velocity = Vector3(0, -2, 0)
	await _frames(2)
	Estado.abajo_virtual = true
	Estado.pulso_kata = true
	await _frames(40)
	Estado.abajo_virtual = false
	_exigir(_roto("grieta-pozo"), "kesa abre la grieta")
	_exigir(await _aprende("iai", Vector3(30.6, -5.9, 0)), "altar iai")
	_exigir(await _rompe_puerta(), "iai corta la puerta de bambú")
	var jefe1 := _jefe("takeoni")
	var jefe2 := _jefe("tetsu")
	_exigir(jefe1 != null and jefe2 != null and jefe1.guion != jefe2.guion, "dos jefes con patrones distintos")
	_exigir(await _patrones(jefe1, ["barrido", "clavo", "pinchos"]), "patrones de Takeoni")
	_exigir(await _mata(jefe1), "Takeoni cae y deja Fūjin")
	_exigir(Estado.tiene("fujin") and Estado.jefe_muerto("takeoni"), "fujin guardado")
	_exigir(not Estado.jefe_muerto("tetsu"), "Tetsu sigue en pie")
	_exigir(await _sube_cornisa(), "la cornisa se alcanza al volver con Fūjin")
	_exigir(await _entra_mapa2(), "el camino alto entra al segundo mapa")
	_exigir(await _vence_enemigo_marca("yari-1"), "derrota a un enemigo del hierro")
	Estado.salud = 1
	var descanso := _descanso("hierro")
	_exigir(descanso != null, "hay un descanso")
	if descanso:
		var hud := get_tree().get_first_node_in_group("hud")
		hud.call("abrir_santuario", descanso)
		_exigir(Estado.en_santuario, "el descanso abre el descanso")
		hud.call("pulsar_curar")
		_exigir(Estado.salud == Estado.salud_max and not Estado.en_santuario, "el descanso cura y guarda")
	Estado.espiritu = 3
	Estado.refinado = 0
	if descanso:
		var hud2 := get_tree().get_first_node_in_group("hud")
		hud2.call("abrir_santuario", descanso)
		hud2.call("pulsar_refinar")
		_exigir(Estado.refinado == 1 and Estado.espiritu == 0, "el descanso afina el kata")
	var antes := Datos.bonus()
	_exigir(antes == 1, "el filo afinado pega más")
	_exigir(await _aprende("kasumi", Vector3(97.2, 4.4, 0)), "altar kasumi")
	_exigir(await _rompe_sello(), "kasumi quiebra el sello")
	_exigir(await _patrones(jefe2, ["abanicos", "escudo", "onda"]), "patrones de Tetsu")
	_exigir(await _escudo(jefe2), "el escudo niega el corte y Kesa lo atraviesa")
	_exigir(await _mata(jefe2), "Tetsu cae")
	_exigir(Estado.victoria and Estado.jefe_muerto("tetsu"), "victoria")
	var copia := Estado.exportar()
	Estado.reiniciar_partida()
	Estado.importar(copia)
	_exigir(Estado.tiene("kasumi") and Estado.jefe_muerto("takeoni") and Estado.refinado == 1, "la partida se restaura")
	jugador.colocar(Estado.puntos["umbral"])
	await _frames(5)
	_exigir(jugador.global_position.x < Datos.MAPA2_X, "se puede volver al primer mapa")
	_cerrar()


func _medir_salto(doble: bool) -> float:
	return await _medir_salto_en(Vector3(2.4, 0.2, 0), doble)


func _medir_salto_en(pos: Vector3, doble: bool) -> float:
	if doble:
		Estado.aprender("fujin")
	else:
		Estado.katas.erase("fujin")
	jugador.colocar(pos)
	await _frames(8)
	var y0 := jugador.global_position.y
	Estado.salto_mantenido = true
	Estado.pulso_salto = true
	var max_y := y0
	var segundo := false
	for _i in 90:
		await get_tree().physics_frame
		max_y = maxf(max_y, jugador.global_position.y)
		if doble and not segundo and not jugador.is_on_floor() and jugador.global_position.y > y0 + 1.35 and jugador.velocity.y < 4.0:
			Estado.pulso_salto = true
			segundo = true
		if jugador.is_on_floor() and _i > 18 and jugador.velocity.y <= 0.1:
			break
	Estado.salto_mantenido = false
	return max_y - y0


func _medir_avance(con_dash: bool) -> float:
	var borde := 53.2
	jugador.colocar(Vector3(borde - 0.35, 0.2, 0))
	jugador.mirando = 1
	await _frames(8)
	if con_dash:
		Estado.aprender("iai")
		Estado.eje_virtual = 1.0
		Estado.pulso_kata = true
	else:
		Estado.katas.erase("iai")
		Estado.eje_virtual = 1.0
		Estado.salto_mantenido = true
		Estado.pulso_salto = true
	var mejor := 0.0
	var base := borde
	for _i in 70:
		await get_tree().physics_frame
		if jugador.global_position.y > -1.0:
			mejor = maxf(mejor, jugador.global_position.x - base)
		else:
			break
	Estado.eje_virtual = 0.0
	Estado.salto_mantenido = false
	return mejor


func _camina() -> bool:
	jugador.colocar(Vector3(2.2, 0.2, 0))
	await _frames(6)
	var x0 := jugador.global_position.x
	Estado.eje_virtual = 1.0
	await _frames(25)
	Estado.eje_virtual = 0.0
	return jugador.global_position.x > x0 + 1.2


func _vence_enemigo() -> bool:
	return await _vence_enemigo_marca("ashigaru-1")


func _vence_enemigo_marca(marca: String) -> bool:
	var enemigo := _enemigo(marca)
	if enemigo == null:
		return false
	Estado.pausa_ia = false
	jugador.colocar(enemigo.global_position + Vector3(-1.15, 0.1, 0))
	jugador.mirando = 1
	await _frames(4)
	var vida0 := enemigo.vida
	for _intento in 12:
		if enemigo.muerto:
			break
		jugador.colocar(enemigo.global_position + Vector3(-1.15, 0.15, 0))
		jugador.mirando = 1 if enemigo.global_position.x > jugador.global_position.x else jugador.mirando
		Estado.pulso_corte = true
		await _frames(16)
	Estado.pausa_ia = true
	print("SANTOKU_MEDIDA enemigo %s vida %d -> %d" % [marca, vida0, enemigo.vida])
	return enemigo.muerto and enemigo.vida < vida0


func _aprende(kata: String, pos: Vector3) -> bool:
	Estado.katas.erase(kata)
	jugador.colocar(pos)
	await _frames(4)
	Estado.pulso_meditar = true
	await _frames(3)
	return Estado.tiene(kata)


func _rompe_puerta() -> bool:
	Estado.aprender("iai")
	jugador.colocar(Vector3(45.4, 0.2, 0))
	jugador.mirando = 1
	await _frames(6)
	Estado.eje_virtual = 1.0
	Estado.pulso_kata = true
	await _frames(20)
	Estado.eje_virtual = 0.0
	return _roto("puerta-bambu")


func _rompe_sello() -> bool:
	Estado.aprender("kasumi")
	jugador.colocar(Vector3(103.5, 0.2, 0))
	jugador.mirando = 1
	await _frames(8)
	for _i in 4:
		Estado.eje_virtual = 0.0
		Estado.pulso_kata = true
		await _frames(40)
	return _roto("sello-hierro")


func _patrones(jefe: Jefe, esperados: Array) -> bool:
	if jefe == null or jefe.muerto:
		return false
	Estado.pausa_ia = false
	Estado.inmune = true
	jefe.activo = true
	jefe.muerto = false
	var vistos := {}
	jugador.colocar(jefe.global_position + Vector3(-3.2, 0.2, 0))
	for _i in 420:
		await get_tree().physics_frame
		vistos[jefe.patron] = true
	Estado.pausa_ia = true
	var texto := ""
	for clave in vistos.keys():
		texto += str(clave) + ","
	print("SANTOKU_MEDIDA patrones %s = %s" % [jefe.id, texto])
	for nombre in esperados:
		if not vistos.has(nombre):
			return false
	return true


func _mata(jefe: Jefe) -> bool:
	if jefe == null:
		return false
	jefe.activo = true
	jefe.muerto = false
	if jefe.vida <= 0:
		jefe.vida = jefe.vida_max
	jugador.colocar(jefe.global_position + Vector3(-1.25, 0.2, 0))
	jugador.mirando = 1
	await _frames(6)
	var vida0 := jefe.vida
	Estado.pulso_corte = true
	await _frames(20)
	var hubo := jefe.vida < vida0
	jefe.vida = 1
	Estado.pulso_corte = true
	await _frames(20)
	print("SANTOKU_MEDIDA jefe %s golpe=%s muerto=%s" % [jefe.id, hubo, jefe.muerto])
	return hubo and jefe.muerto


func _escudo(jefe: Jefe) -> bool:
	jefe.activo = true
	jefe.muerto = false
	jefe.fase2 = false
	jefe.patron = "escudo"
	jefe.mirando = -1
	jefe.vida = 10
	var delante := jefe.global_position.x - 1.3
	jefe.recibir(4, "corte", delante)
	var bloqueado := jefe.vida == 10
	jefe.recibir(4, "kesa", delante)
	var atravesado := jefe.vida < 10
	print("SANTOKU_MEDIDA escudo bloquea=%s kesa=%s" % [bloqueado, atravesado])
	return bloqueado and atravesado


func _sube_cornisa() -> bool:
	Estado.aprender("fujin")
	jugador.colocar(Vector3(8.4, Datos.APPROACH_Y + 0.1, 0))
	jugador.mirando = 1
	await _frames(8)
	Estado.salto_mantenido = true
	Estado.eje_virtual = 1.0
	Estado.pulso_salto = true
	var y0 := jugador.global_position.y
	var segundo := false
	var arriba := false
	for _i in 100:
		await get_tree().physics_frame
		if not segundo and not jugador.is_on_floor() and jugador.global_position.y > y0 + 1.35 and jugador.velocity.y < 4.0:
			Estado.pulso_salto = true
			segundo = true
		if jugador.global_position.y >= Datos.CORNISA_Y - 0.2 and jugador.global_position.x > 10.15:
			arriba = true
			break
	Estado.salto_mantenido = false
	Estado.eje_virtual = 0.0
	return arriba


func _entra_mapa2() -> bool:
	Estado.aprender("iai")
	Estado.aprender("fujin")
	jugador.colocar(Vector3(72.8, 1.95, 0))
	Estado.eje_virtual = 1.0
	await _frames(36)
	Estado.eje_virtual = 0.0
	await _frames(12)
	return jugador.global_position.x >= Datos.MAPA2_X - 0.2 or Estado.mapa_nombre == "Santuario de Hierro"


func _enemigo(marca: String) -> Enemigo:
	for nodo in get_tree().get_nodes_in_group("enemigo"):
		if nodo is Enemigo and (nodo as Enemigo).marca == marca:
			return nodo
	return null


func _jefe(id: String) -> Jefe:
	for nodo in get_tree().get_nodes_in_group("jefe"):
		if nodo is Jefe and (nodo as Jefe).id == id:
			return nodo
	return null


func _descanso(marca: String) -> Descanso:
	for nodo in get_tree().get_nodes_in_group("interaccion"):
		if nodo is Descanso and (nodo as Descanso).marca == marca:
			return nodo
	return null


func _roto(marca: String) -> bool:
	if Estado.esta_roto(marca):
		return true
	for nodo in get_tree().get_nodes_in_group("obstaculo"):
		if nodo is Obstaculo and (nodo as Obstaculo).marca == marca:
			return false
	return true


func _frames(n: int) -> void:
	for _i in n:
		await get_tree().physics_frame


func _exigir(condicion: bool, mensaje: String) -> void:
	if condicion:
		print("SANTOKU_OK ", mensaje)
	else:
		fallos.append(mensaje)
		print("SANTOKU_FALLO ", mensaje)


func _ok(mensaje: String) -> void:
	print("SANTOKU_OK ", mensaje)


func _fallo(mensaje: String) -> void:
	fallos.append(mensaje)
	print("SANTOKU_FALLO ", mensaje)


func _cerrar() -> void:
	if fallos.is_empty():
		print("SANTOKU_SIM_OK")
		get_tree().quit(0)
	else:
		print("SANTOKU_SIM_FAIL ", " | ".join(fallos))
		get_tree().quit(1)
