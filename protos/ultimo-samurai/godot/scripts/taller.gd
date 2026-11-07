extends Node

var laca: StandardMaterial3D
var tela: StandardMaterial3D
var piel: StandardMaterial3D
var metal: StandardMaterial3D
var oro: StandardMaterial3D
var hoja: StandardMaterial3D
var ojo: StandardMaterial3D
var cuerno: StandardMaterial3D
var madera: StandardMaterial3D
var piedra: StandardMaterial3D
var losa: StandardMaterial3D
var bermellon: StandardMaterial3D
var sombra: StandardMaterial3D
var corte: StandardMaterial3D
var hueso: StandardMaterial3D
var oliva: StandardMaterial3D
var noche: StandardMaterial3D
var arco: StandardMaterial3D
var sello: ShaderMaterial
var monte: StandardMaterial3D


func _ready() -> void:
	laca = _personaje(Color("9c1c2e"), 0.28)
	tela = _personaje(Color("efe4d2"), 0.0)
	piel = _personaje(Color("c48a6a"), 0.0)
	metal = _personaje(Color("2c313c"), 0.55)
	oro = _personaje(Color("e0b15a"), 0.7)
	hoja = _personaje(Color("d5dee8"), 0.82)
	hoja.emission_enabled = true
	hoja.emission = Color(0.65, 0.82, 1.0)
	hoja.emission_energy_multiplier = 0.35
	ojo = _personaje(Color("ff3b2e"), 0.0)
	ojo.emission_enabled = true
	ojo.emission = Color("ff2a1a")
	ojo.emission_energy_multiplier = 2.4
	cuerno = _personaje(Color("1a120e"), 0.1)
	hueso = _personaje(Color("e4dccf"), 0.18)
	oliva = _personaje(Color("3e4c38"), 0.22)
	noche = _personaje(Color("242833"), 0.4)
	arco = _personaje(Color("6a4a32"), 0.05)
	madera = _mundo(Color("6b3a28"), 0.78)
	piedra = _mundo(Color("5a6172"), 0.9)
	losa = _mundo(Color("c7b49a"), 0.62)
	bermellon = _mundo(Color("c4372f"), 0.48)
	bermellon.emission_enabled = true
	bermellon.emission = Color("a02820")
	bermellon.emission_energy_multiplier = 0.18
	monte = _mundo(Color("2a1c38"), 0.95)
	monte.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sombra = StandardMaterial3D.new()
	sombra.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sombra.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sombra.albedo_color = Color(0, 0, 0, 0.38)
	sombra.cull_mode = BaseMaterial3D.CULL_DISABLED
	corte = StandardMaterial3D.new()
	corte.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	corte.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	corte.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	corte.albedo_color = Color(1.0, 0.78, 0.42, 0.85)
	corte.emission_enabled = true
	corte.emission = Color(1.0, 0.64, 0.28)
	corte.emission_energy_multiplier = 1.6
	corte.cull_mode = BaseMaterial3D.CULL_DISABLED
	var shader := load("res://shaders/sello.gdshader") as Shader
	sello = ShaderMaterial.new()
	sello.shader = shader
	sello.set_shader_parameter("tinta", Color(0.75, 0.32, 1.0, 1.0))


func _personaje(color: Color, metal: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.metallic = metal
	m.roughness = 0.42
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	m.specular_mode = BaseMaterial3D.SPECULAR_TOON
	m.rim_enabled = true
	m.rim = 0.32
	m.rim_tint = 0.5
	return m


func _mundo(color: Color, rugoso: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rugoso
	m.metallic = 0.02
	m.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX
	return m
