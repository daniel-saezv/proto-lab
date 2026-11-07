shader_type spatial;
render_mode blend_add, unshaded, cull_disabled, depth_draw_never;

uniform vec4 tinta : source_color = vec4(0.72, 0.28, 1.0, 1.0);
uniform float velocidad = 0.65;

void fragment() {
	float franja = fract(UV.y * 7.0 - TIME * velocidad);
	float banda = smoothstep(0.25, 0.48, franja) * smoothstep(0.82, 0.55, franja);
	float borde = smoothstep(0.0, 0.08, UV.x) * smoothstep(1.0, 0.92, UV.x);
	borde *= smoothstep(0.0, 0.06, UV.y) * smoothstep(1.0, 0.94, UV.y);
	EMISSION = tinta.rgb * (0.45 + banda * 1.35);
	ALPHA = (0.18 + banda * 0.62) * borde;
}
