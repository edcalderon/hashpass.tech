const DARK_HOLOGRAPHIC_SHADING = `
  vec3 greenShades = vec3(
    0.0,
    sin(hue) * 0.3 + 0.7,
    sin(hue + 1.0) * 0.2 + 0.3
  );

  return greenShades * fresnel * 1.2;
`;

const LIGHT_HOLOGRAPHIC_SHADING = `
  vec3 redShades = vec3(
    sin(hue) * 0.18 + 0.78,
    sin(hue + 0.85) * 0.06 + 0.08,
    sin(hue + 1.7) * 0.04 + 0.03
  );

  return redShades * fresnel * 1.28;
`;

export const createFragmentShader = (amount: number, isDark: boolean) => `
uniform float u_time;
uniform float u_aspect;
uniform vec3 u_positions[${amount}];
uniform vec3 u_rotations[${amount}];
varying vec2 v_uv;

const int MaxCount = ${amount};
const float PI = 3.14159265358979;

float sdBox( vec3 p, vec3 b ) {
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}

float opUnion( float d1, float d2 ) { return min(d1,d2); }

float opSubtraction( float d1, float d2 ) { return max(-d1,d2); }

float opIntersection( float d1, float d2 ) { return max(d1,d2); }

float opSmoothUnion( float d1, float d2, float k ) {
  float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
  return mix( d2, d1, h ) - k*h*(1.0-h);
}

float opSmoothSubtraction( float d1, float d2, float k ) {
  float h = clamp( 0.5 - 0.5*(d2+d1)/k, 0.0, 1.0 );
  return mix( d2, -d1, h ) + k*h*(1.0-h);
}

float opSmoothIntersection( float d1, float d2, float k ) {
  float h = clamp( 0.5 - 0.5*(d2-d1)/k, 0.0, 1.0 );
  return mix( d2, d1, h ) + k*h*(1.0-h);
}

mat4 rotationMatrix(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  
  return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
              oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
              oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
              0.0,                                0.0,                                0.0,                                1.0);
}

vec3 rotate(vec3 v, vec3 axis, float angle) {
  mat4 m = rotationMatrix(axis, angle);
  return (m * vec4(v, 1.0)).xyz;
}

float fresnel(vec3 eye, vec3 normal) {
  return pow(1.0 + dot(eye, normal), 3.0);
}

float sdf(vec3 p) {
  vec3 correct = 0.1 * vec3(u_aspect, 1.0, 1.0);

  vec3 tp = p + -u_positions[0] * correct;
  vec3 rp = tp;
  rp = rotate(rp, vec3(1.0, 1.0, 0.0), u_rotations[0].x + u_rotations[0].y);
  float final = sdBox(rp, vec3(0.15)) - 0.03;
  
  for(int i = 1; i < MaxCount; i++) {
    tp = p + -u_positions[i] * correct;
    rp = tp;
    rp = rotate(rp, vec3(1.0, 1.0, 0.0), u_rotations[i].x + u_rotations[i].y);
    float box = sdBox(rp, vec3(0.15)) - 0.03;
    final = opSmoothUnion(final, box, 0.4);
  }

  return final;
}

vec3 calcNormal(in vec3 p) {
  const float h = 0.001;
  return normalize(vec3(
    sdf(p + vec3(h, 0, 0)) - sdf(p - vec3(h, 0, 0)),
    sdf(p + vec3(0, h, 0)) - sdf(p - vec3(0, h, 0)),
    sdf(p + vec3(0, 0, h)) - sdf(p - vec3(0, 0, h))
  ));
}

vec3 getHolographicMaterial(vec3 normal, vec3 viewDir, float time) {
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
  
  float hue = dot(normal, viewDir) * 3.14159 + time * 0.5;

${isDark ? DARK_HOLOGRAPHIC_SHADING : LIGHT_HOLOGRAPHIC_SHADING}
}

vec3 getIridescence(vec3 normal, vec3 viewDir, float time) {
  return getHolographicMaterial(normal, viewDir, time);
}

vec3 getBackground(vec2 uv) {
  return vec3(0.0);
}

void main() {
  vec2 centeredUV = (v_uv - 0.5) * vec2(u_aspect, 1.0);
  vec3 ray = normalize(vec3(centeredUV, -1.0));
  
  vec3 camPos = vec3(0.0, 0.0, 2.3);

  vec3 rayPos = camPos;
  float totalDist = 0.0;
  float tMax = 5.0;

  for(int i = 0; i < 128; i++) {
    float dist = sdf(rayPos);
    if (dist < 0.0005 || tMax < totalDist) break;
    totalDist += dist;
    rayPos = camPos + totalDist * ray;
  }

  vec3 color = vec3(0.0);
  float alpha = 0.0;

  if(totalDist < tMax) {
    vec3 normal = calcNormal(rayPos);
    vec3 viewDir = normalize(camPos - rayPos);
    vec3 lightDir = normalize(vec3(-0.5, 0.8, 0.6));
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
    vec3 iridescent = getIridescence(normal, viewDir, u_time);
    float rimLight = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    vec3 rimColor = ${isDark ? 'vec3(0.4, 0.8, 1.0)' : 'vec3(1.0, 0.26, 0.18)'} * rimLight * ${isDark ? '0.5' : '0.42'};
    float ao = 1.0 - smoothstep(0.0, 0.3, totalDist / tMax);
    vec3 baseColor = ${isDark ? 'vec3(0.1, 0.12, 0.15)' : 'vec3(0.16, 0.02, 0.01)'};
    color = baseColor * (0.1 + diff * ${isDark ? '0.4' : '0.45'}) * ao;
    color += iridescent * (${isDark ? '0.8 + diff * 0.2' : '0.92 + diff * 0.18'});
    color += vec3(1.0, ${isDark ? '0.9' : '0.72'}, ${isDark ? '0.8' : '0.6'}) * spec * ${isDark ? '0.6' : '0.5'};
    color += rimColor;
    float fog = 1.0 - exp(-totalDist * 0.2);
    vec3 fogColor = getBackground(centeredUV) * 0.3;
    color = mix(color, fogColor, fog);
    alpha = 1.0;
  }

  gl_FragColor = vec4(color, alpha);
}`;
