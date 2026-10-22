import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec3 vN;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vN = normalize(normalMatrix * normal);
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

// Blueprint-Look: dunkle, leicht transparente Füllung, farbige Kontur am Rand,
// optional Schraffur entlang des Rohrs und eine innere Konturlinie.
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uLen;
  uniform float uR;
  uniform float uSpace;
  uniform float uHatch;
  uniform float uInner;
  uniform float uEdge;
  uniform float uFill;
  uniform float uTime;
  uniform float uCap;
  uniform float uCapAt;
  uniform vec3 uCapC;
  uniform vec3 uCapD;

  varying vec3 vN;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    if (uCap > 0.5) {
      if (dot(vWorld - uCapC, uCapD) < 0.0 || uReveal < uCapAt) discard;
    } else if (vUv.x > uReveal) {
      discard;
    }

    float rim = 1.0 - abs(normalize(vN).z);
    float edge = smoothstep(uEdge, uEdge + 0.05, rim);
    float inner = (1.0 - smoothstep(0.0, 0.03, abs(rim - (uEdge - 0.3)))) * uInner;

    float hat = 0.0;
    if (uHatch > 0.0 && uCap < 0.5) {
      float s = (vUv.x * uLen + vUv.y * uR * 2.4) / uSpace - uTime * 0.12;
      float f = fract(s);
      float d = min(f, 1.0 - f) / max(fwidth(s), 0.0001);
      hat = (1.0 - smoothstep(0.5, 1.5, d)) * uHatch * (1.0 - edge);
    }

    float strength = clamp(max(edge, max(hat * 0.4, inner * 0.4)), 0.0, 1.0);
    vec3 col = mix(uColor * 0.18, uColor, strength);
    gl_FragColor = vec4(col, mix(uFill, 1.0, strength));
    #include <colorspace_fragment>
  }
`

export interface PipeOptions {
  color: string
  radius: number
  /** Schraffur entlang des Rohrs */
  hatch?: boolean
  /** innere Konturlinie */
  inner?: boolean
  /** Ringe als Anteil 0..1 der Rohrlänge */
  rings?: number[]
  /** Kontur-Schwelle (kleiner = dickere Kontur) */
  edge?: number
  fill?: number
  corner?: number
}

function roundedPath(points: THREE.Vector3[], radius: number) {
  const path = new THREE.CurvePath<THREE.Vector3>()
  let prev = points[0].clone()
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]
    const b = points[i]
    const c = points[i + 1]
    const rad = Math.min(radius, a.distanceTo(b) / 2, b.distanceTo(c) / 2)
    const p1 = b.clone().add(a.clone().sub(b).setLength(rad))
    const p2 = b.clone().add(c.clone().sub(b).setLength(rad))
    path.add(new THREE.LineCurve3(prev, p1))
    path.add(new THREE.QuadraticBezierCurve3(p1, b, p2))
    prev = p2
  }
  path.add(new THREE.LineCurve3(prev, points[points.length - 1].clone()))
  return path
}

export class Pipe {
  readonly group = new THREE.Group()
  private materials: THREE.ShaderMaterial[] = []
  private geometries: THREE.BufferGeometry[] = []
  private rings: { line: THREE.LineLoop; u: number }[] = []
  private ringMat: THREE.LineBasicMaterial

  constructor(points: THREE.Vector3[], o: PipeOptions) {
    const r = o.radius
    const path = roundedPath(points, o.corner ?? r * 2.4)
    const len = path.getLength()
    const color = new THREE.Color(o.color)

    const make = (cap: boolean, capAt: number, capC: THREE.Vector3, capD: THREE.Vector3) =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: color },
          uReveal: { value: 0 },
          uLen: { value: len },
          uR: { value: r },
          uSpace: { value: r * 1.15 },
          uHatch: { value: o.hatch ? 1 : 0 },
          uInner: { value: o.inner ? 1 : 0 },
          uEdge: { value: o.edge ?? 0.62 },
          uFill: { value: o.fill ?? 0.5 },
          uTime: { value: 0 },
          uCap: { value: cap ? 1 : 0 },
          uCapAt: { value: capAt },
          uCapC: { value: capC },
          uCapD: { value: capD },
        },
      })

    const zero = new THREE.Vector3()
    const tube = new THREE.TubeGeometry(path, Math.max(12, Math.ceil(len * 12)), r, 28, false)
    const bodyMat = make(false, 0, zero, zero)
    this.group.add(new THREE.Mesh(tube, bodyMat))
    this.geometries.push(tube)
    this.materials.push(bodyMat)

    // runde Enden
    const sphere = new THREE.SphereGeometry(r, 28, 18)
    this.geometries.push(sphere)
    const ends: [number, number][] = [
      [0, 0.002],
      [1, 0.995],
    ]
    for (const [u, at] of ends) {
      const p = path.getPointAt(u)
      const t = path.getTangentAt(u).multiplyScalar(u === 0 ? -1 : 1)
      const mat = make(true, at, p, t)
      const mesh = new THREE.Mesh(sphere, mat)
      mesh.position.copy(p)
      this.group.add(mesh)
      this.materials.push(mat)
    }

    // Ringe um das Rohr
    this.ringMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })
    for (const u of o.rings ?? []) {
      const p = path.getPointAt(u)
      const t = path.getTangentAt(u)
      const helper = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      const a = new THREE.Vector3().crossVectors(t, helper).normalize()
      const b = new THREE.Vector3().crossVectors(t, a).normalize()
      const pts: THREE.Vector3[] = []
      for (let i = 0; i < 72; i++) {
        const ang = (i / 72) * Math.PI * 2
        pts.push(
          p
            .clone()
            .addScaledVector(a, Math.cos(ang) * r * 1.14)
            .addScaledVector(b, Math.sin(ang) * r * 1.14),
        )
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      this.geometries.push(geo)
      const line = new THREE.LineLoop(geo, this.ringMat)
      line.visible = false
      this.group.add(line)
      this.rings.push({ line, u })
    }
  }

  setReveal(v: number) {
    for (const m of this.materials) m.uniforms.uReveal.value = v
    for (const { line, u } of this.rings) line.visible = v > u + 0.01
  }

  setTime(t: number) {
    for (const m of this.materials) m.uniforms.uTime.value = t
  }

  dispose() {
    this.geometries.forEach((g) => g.dispose())
    this.materials.forEach((m) => m.dispose())
    this.ringMat.dispose()
  }
}
