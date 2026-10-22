import * as THREE from 'three'

/**
 * Weltkoordinaten: x = Hallenbreite (-7..7), y = Höhe (Boden = 0), z = Tiefe.
 * Die Szene wird in PointCloudScene so positioniert, dass der Boden im unteren Bereich des Viewports liegt.
 */

export interface PipeDef {
  /** Gruppen-ID im Shader (1..3) */
  id: 1 | 2 | 3
  name: string
  color: string
  radius: number
  z: number
  /** Polylinien in der x/y-Ebene */
  paths: [number, number][][]
}

export const PIPES: PipeDef[] = [
  {
    id: 1,
    name: 'Druckluft',
    color: '#4d94ff',
    radius: 0.14,
    z: 0.45,
    paths: [
      [[-7, 2.97], [6.4, 2.97]],
      [[-4.2, 2.97], [-4.2, 0.15], [-2.1, 0.15]],
      [[6.2, 2.97], [6.2, 0.15]],
    ],
  },
  {
    id: 2,
    name: 'Kühlwasser',
    color: '#16c9b8',
    radius: 0.11,
    z: -0.1,
    paths: [
      [[-6.5, 2.45], [6.9, 2.45]],
      [[-1.4, 2.45], [-1.4, 0.1]],
      [[1.6, 2.45], [1.6, 0.2], [3.1, 0.2]],
    ],
  },
  {
    id: 3,
    name: 'Vakuum',
    color: '#e5a42b',
    radius: 0.1,
    z: -0.65,
    paths: [
      [[-6.4, 2.06], [3.2, 2.06]],
      [[-4.9, 2.06], [-4.9, 0.3]],
      [[0.4, 2.06], [0.4, 0.3], [1.7, 0.3]],
    ],
  },
]

const GRAY = new THREE.Color('#cfd0d4')

// ---------- Hilfsfunktionen ----------

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20240611)

function gauss(): number {
  const u = 1 - rand()
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function between(a: number, b: number) {
  return a + (b - a) * rand()
}

interface PipeSegment {
  def: PipeDef
  a: THREE.Vector3
  b: THREE.Vector3
}

function pipeSegments(): PipeSegment[] {
  const out: PipeSegment[] = []
  for (const def of PIPES) {
    for (const path of def.paths) {
      for (let i = 0; i < path.length - 1; i++) {
        out.push({
          def,
          a: new THREE.Vector3(path[i][0], path[i][1], def.z),
          b: new THREE.Vector3(path[i + 1][0], path[i + 1][1], def.z),
        })
      }
    }
  }
  return out
}

// ---------- Halle (Stahlstruktur) ----------

interface HallElement {
  weight: number
  sample: () => THREE.Vector3
}

function boxSurface(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): HallElement {
  const areas = [sy * sz, sx * sz, sx * sy]
  const total = areas[0] + areas[1] + areas[2]
  return {
    weight: total,
    sample() {
      let r = rand() * total
      let axis = 0
      while (axis < 2 && r > areas[axis]) r -= areas[axis++]
      const p = [(rand() - 0.5) * sx, (rand() - 0.5) * sy, (rand() - 0.5) * sz]
      p[axis] = (rand() < 0.5 ? -0.5 : 0.5) * [sx, sy, sz][axis]
      return new THREE.Vector3(cx + p[0], cy + p[1], cz + p[2])
    },
  }
}

function brace(a: THREE.Vector3, b: THREE.Vector3, thick: number): HallElement {
  const len = a.distanceTo(b)
  return {
    weight: len * thick * 4,
    sample() {
      const t = rand()
      return new THREE.Vector3().lerpVectors(a, b, t).add(
        new THREE.Vector3((rand() - 0.5) * thick, (rand() - 0.5) * thick, (rand() - 0.5) * thick),
      )
    },
  }
}

function hallElements(): HallElement[] {
  const H = 4.2
  const els: HallElement[] = []
  // Stützen
  for (const x of [-6.9, -5.1, -0.2, 0.55, 6.3, 6.9]) {
    els.push(boxSurface(x, H / 2, -1.3, 0.2, H, 0.2))
    if (x < -5 || x > 6) els.push(boxSurface(x, H / 2, 1.3, 0.2, H, 0.2))
  }
  // Deckenträger (Längsrichtung)
  els.push(boxSurface(0, H, -1.3, 14, 0.22, 0.3))
  els.push(boxSurface(0, H, 1.3, 14, 0.22, 0.3))
  els.push(boxSurface(0, H - 0.35, -1.3, 14, 0.1, 0.1))
  // Querträger
  for (const x of [-6.9, -5.1, -0.2, 0.55, 3.2, 6.3, 6.9]) {
    els.push(boxSurface(x, H, 0, 0.2, 0.2, 2.7))
  }
  // Eck-Streben
  els.push(brace(new THREE.Vector3(-7, 3.95, 0), new THREE.Vector3(-4.7, 4.25, -1.3), 0.14))
  els.push(brace(new THREE.Vector3(6.1, 4.0, 0), new THREE.Vector3(7.2, 4.5, -0.6), 0.2))
  return els
}

// ---------- Punktwolke ----------

export interface CloudBuffers {
  geometry: THREE.BufferGeometry
  count: number
}

export function buildCloud(total: number): CloudBuffers {
  const position = new Float32Array(total * 3)
  const target = new Float32Array(total * 3)
  const color = new Float32Array(total * 3)
  const meta = new Float32Array(total * 3) // x: Gruppe, y: Seed, z: Größenfaktor

  let n = 0
  const push = (
    scan: THREE.Vector3,
    tgt: THREE.Vector3,
    col: THREE.Color,
    group: number,
    size: number,
  ) => {
    const o = n * 3
    position.set([scan.x, scan.y, scan.z], o)
    target.set([tgt.x, tgt.y, tgt.z], o)
    color.set([col.r, col.g, col.b], o)
    meta.set([group, rand(), size], o)
    n++
  }

  const nFloor = Math.floor(total * 0.34)
  const nHall = Math.floor(total * 0.27)
  const nPipes = total - nFloor - nHall

  // Boden: flache, staubartige Streuung mit Häufungen links/rechts
  for (let i = 0; i < nFloor; i++) {
    const clump = rand() < 0.4
    let x: number
    let y: number
    if (clump) {
      x = (rand() < 0.5 ? -3.6 : 5.6) + gauss() * 1.3
      y = Math.abs(gauss()) * 0.28
    } else {
      x = between(-9, 9)
      y = Math.abs(gauss()) * 0.1
    }
    const z = between(-2.6, 2.4)
    const edge = 1 - Math.min(1, Math.max(0, (Math.abs(x) - 7.5) / 2))
    if (rand() > edge) {
      i--
      continue
    }
    const p = new THREE.Vector3(x, y, z)
    push(p, p, GRAY, 0, 0.8 + rand() * 0.4)
  }

  // Halle
  const els = hallElements()
  const wSum = els.reduce((s, e) => s + e.weight, 0)
  for (let i = 0; i < nHall; i++) {
    let r = rand() * wSum
    let el = els[0]
    for (const e of els) {
      if (r <= e.weight) {
        el = e
        break
      }
      r -= e.weight
    }
    const s = el.sample()
    const scan = s.clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(0.025))
    push(scan, scan, GRAY, 0, 0.9 + rand() * 0.5)
  }

  // Rohre: Scan-Position = Mantel + Rauschen, Ziel = exakter Mantel
  const segs = pipeSegments()
  const weights = segs.map((s) => s.a.distanceTo(s.b) * s.def.radius)
  const wTotal = weights.reduce((a, b) => a + b, 0)
  const dir = new THREE.Vector3()
  const u = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let si = 0; si < segs.length; si++) {
    const { def, a, b } = segs[si]
    const count = Math.round((weights[si] / wTotal) * nPipes)
    const col = new THREE.Color(def.color)
    dir.subVectors(b, a)
    const len = dir.length()
    dir.normalize()
    const helper = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    u.crossVectors(dir, helper).normalize()
    v.crossVectors(dir, u).normalize()
    for (let i = 0; i < count && n < total; i++) {
      const t = rand() * len
      const ang = rand() * Math.PI * 2
      const surf = new THREE.Vector3()
        .copy(a)
        .addScaledVector(dir, t)
        .addScaledVector(u, Math.cos(ang) * def.radius)
        .addScaledVector(v, Math.sin(ang) * def.radius)
      const scan = surf.clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(0.045))
      push(scan, surf, col, def.id, 1.0 + rand() * 0.4)
    }
  }

  // Rundungsrest auffüllen (Punkte mit Größe 0 sind unsichtbar)
  while (n < total) {
    push(new THREE.Vector3(), new THREE.Vector3(), GRAY, 0, 0)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aTarget', new THREE.BufferAttribute(target, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
  geometry.setAttribute('aMeta', new THREE.BufferAttribute(meta, 3))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 14)
  return { geometry, count: total }
}

// ---------- Solide Rohre (Ergebnis des Morphs) ----------

export interface PipeMeshes {
  group: THREE.Group
  materials: THREE.MeshStandardMaterial[]
  dispose: () => void
}

export function buildPipeMeshes(): PipeMeshes {
  const group = new THREE.Group()
  const materials: THREE.MeshStandardMaterial[] = []
  const geometries: THREE.BufferGeometry[] = []
  const yAxis = new THREE.Vector3(0, 1, 0)

  for (const def of PIPES) {
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      metalness: 0.55,
      roughness: 0.32,
      envMapIntensity: 0.9,
    })
    materials.push(mat)
    const r = def.radius
    const sphere = new THREE.SphereGeometry(r, 24, 16)
    geometries.push(sphere)

    for (const path of def.paths) {
      for (let i = 0; i < path.length; i++) {
        const joint = new THREE.Mesh(sphere, mat)
        joint.position.set(path[i][0], path[i][1], def.z)
        group.add(joint)
      }
      for (let i = 0; i < path.length - 1; i++) {
        const a = new THREE.Vector3(path[i][0], path[i][1], def.z)
        const b = new THREE.Vector3(path[i + 1][0], path[i + 1][1], def.z)
        const len = a.distanceTo(b)
        const dir = b.clone().sub(a).normalize()
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dir)

        const cyl = new THREE.CylinderGeometry(r, r, len, 28, 1, true)
        geometries.push(cyl)
        const mesh = new THREE.Mesh(cyl, mat)
        mesh.position.copy(a).lerp(b, 0.5)
        mesh.quaternion.copy(quat)
        group.add(mesh)

        // Flansche im Abstand von ca. 3 Einheiten
        const flanges = Math.floor(len / 3)
        for (let f = 1; f <= flanges; f++) {
          const fl = new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.09, 28)
          geometries.push(fl)
          const m = new THREE.Mesh(fl, mat)
          m.position.copy(a).lerp(b, f / (flanges + 1))
          m.quaternion.copy(quat)
          group.add(m)
        }
      }
    }
  }

  return {
    group,
    materials,
    dispose() {
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
    },
  }
}
