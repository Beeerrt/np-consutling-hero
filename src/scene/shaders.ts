export const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uIdle;

  attribute vec3 aTarget;
  attribute vec3 aColor;
  attribute vec3 aMeta; // x: Gruppe, y: Seed, z: Größenfaktor

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float group = aMeta.x;
    float seed = aMeta.y;
    bool isPipe = group > 0.5;

    // Morph Scan -> Rohroberfläche (Rohre nacheinander: Druckluft, Kühlwasser, Vakuum)
    float delay = (group - 1.0) * 0.05;
    float t = isPipe ? smoothstep(0.08 + delay, 0.58 + delay, uProgress) : 0.0;

    vec3 p = mix(position, aTarget, t);

    // Idle: Scanner-Flimmern, verschwindet mit dem Morph
    vec3 wobble = vec3(
      sin(uTime * 1.3 + seed * 40.0),
      cos(uTime * 1.1 + seed * 70.0),
      sin(uTime * 0.9 + seed * 55.0)
    );
    p += wobble * 0.012 * uIdle * (1.0 - t);

    // Organischer Bogen während des Übergangs
    vec3 swirl = vec3(sin(seed * 31.0 + uTime * 0.6), cos(seed * 17.0), sin(seed * 23.0)) * 0.4;
    p += swirl * sin(t * 3.14159265) * (1.0 - t * 0.2);

    // Scan-Sweep: eine helle Scanlinie wandert über die Halle
    float sweepX = sin(uTime * 0.35) * 9.0;
    float sweep = exp(-pow((p.x - sweepX) * 0.55, 2.0)) * uIdle * (1.0 - uProgress);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = aMeta.z * (1.0 + sweep * 0.5);
    gl_PointSize = uSize * size * uPixelRatio / -mv.z;

    float shade = 0.88 + 0.12 * fract(seed * 13.7);
    vColor = aColor * shade + vec3(sweep * 0.35);

    // Halle tritt zurück, Rohrpunkte lösen sich am Ende zugunsten der soliden Rohre auf
    vAlpha = isPipe
      ? 1.0 - smoothstep(0.78, 0.98, uProgress)
      : mix(1.0, 0.32, smoothstep(0.2, 0.7, uProgress));
  }
`

export const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // harte, quadratische Scanpunkte (kein Weichzeichnen)
    float a = vAlpha > 0.5 ? 1.0 : vAlpha * 2.0;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
    #include <colorspace_fragment>
  }
`
