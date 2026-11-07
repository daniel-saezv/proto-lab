extends SceneTree

## Arranque del pueblo y de una salida. No es la escena principal.


func _init() -> void:
	call_deferred("_jugar")


func _jugar() -> void:
	var juego: Node = load("res://main.tscn").instantiate()
	root.add_child(juego)
	for _i in 8:
		await process_frame
		await physics_frame
	var estaciones := juego.get_tree().get_nodes_in_group("estacion")
	if estaciones.size() < 3:
		printerr("faltan estaciones: %d" % estaciones.size())
		quit(1)
		return
	juego.inventario["seta"] = 1
	juego.inventario["baya"] = 1
	juego.inventario["raiz"] = 1
	juego.inventario["hueso"] = 2
	juego._al_cocinar("seta", "baya")
	juego.inventario["seta"] = 1
	juego._al_cocinar("raiz", "seta")
	if int(juego.dano) != 3 or int(juego.vida_max) != 21 or int(juego.mejoras.get("festin", 0)) < 1:
		printerr("la cocina de la escena no combina")
		quit(1)
		return
	juego._al_contratar()
	if not juego.nispero or int(juego.inventario["hueso"]) != 0:
		printerr("Níspero no entra en la cocina")
		quit(1)
		return
	juego.inventario["seta"] = 1
	juego.inventario["baya"] = 1
	juego._al_cocinar("seta", "baya")
	if int(juego.dano) != 5:
		printerr("el cucharón doble no aplica en la escena")
		quit(1)
		return
	juego.cerrar_panel()
	juego.entrar_caza()
	for _i in 8:
		await process_frame
		await physics_frame
	var enemigos := juego.get_tree().get_nodes_in_group("enemigo")
	if enemigos.size() < 2:
		printerr("faltan criaturas: %d" % enemigos.size())
		quit(1)
		return
	print("ESCENA_OK %d" % enemigos.size())
	quit(0)
