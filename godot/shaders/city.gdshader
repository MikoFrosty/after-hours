// The city's buildings at night: dark walls and a grid of windows, some lit. Fewer are lit as the night goes on.
shader_type spatial;

uniform float lit = 0.4;
uniform float energy = 1.0;
uniform vec3 warm : source_color = vec3(1.0, 0.78, 0.5);

varying vec3 wpos;
varying vec3 wnorm;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnorm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
	ALBEDO = vec3(0.025, 0.028, 0.035);
	ROUGHNESS = 0.92;
	EMISSION = vec3(0.0);
	if (abs(wnorm.y) < 0.5) {
		bool facesX = abs(wnorm.x) > abs(wnorm.z);
		vec2 uv = facesX ? wpos.zy : wpos.xy;
		float face = facesX ? floor(wpos.x) * 13.1 : floor(wpos.z) * 7.7;
		vec2 size = vec2(2.4, 3.3);
		vec2 cell = floor(uv / size);
		vec2 f = fract(uv / size);
		float win = step(0.3, f.x) * step(f.x, 0.7) * step(0.3, f.y) * step(f.y, 0.78);
		float h = hash(cell + vec2(face, face * 0.37));
		float on = step(h, lit);
		float tone = h < lit * 0.3 ? 1.0 : 0.4;
		EMISSION = warm * win * on * tone * energy;
	}
}
