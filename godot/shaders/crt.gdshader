// The terminal's glass: the screen's image glowing through a slightly bulging tube, darker at the corners.
shader_type spatial;
render_mode cull_back;

uniform sampler2D screen : source_color, filter_linear;
uniform float glow = 1.5;

void vertex() {
	// the glass bulges toward the viewer, most in the middle
	vec2 p = UV * 2.0 - 1.0;
	VERTEX.z += 0.014 * (1.0 - 0.5 * (p.x * p.x + p.y * p.y));
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	// a touch of barrel distortion, like the inside of a curved tube
	vec2 q = p * (1.0 + 0.06 * dot(p, p));
	vec2 uv = q * 0.5 + 0.5;
	float inside = step(abs(q.x), 1.0) * step(abs(q.y), 1.0);
	vec3 img = texture(screen, uv).rgb * inside;
	float vignette = clamp(1.15 - 0.55 * dot(p, p), 0.0, 1.0);
	ALBEDO = vec3(0.01, 0.02, 0.015);
	EMISSION = img * glow * vignette;
	ROUGHNESS = 0.12;
	SPECULAR = 0.6;
	METALLIC = 0.0;
}
