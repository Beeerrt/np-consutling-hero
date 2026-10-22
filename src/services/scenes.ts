import * as THREE from 'three'
import { CardScene } from './CardScene'
import { floorGrid } from './grid'
import { Pipe } from './pipes'

const BLUE = '#4d94ff'
const TEAL = '#16c9b8'
const GOLD = '#e5a42b'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
/** Teilfortschritt: e läuft von `from` bis `from + span` von 0 nach 1 */
const seg = (e: number, from: number, span: number) => clamp01((e - from) / span)

function lineMat(color: string | number, opacity: number) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
}

function circle(r: number, color: string, opacity: number) {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2
    pts.push(v(Math.cos(a) * r, 0, Math.sin(a) * r))
  }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat(color, opacity))
}

function box(cx: number, cy: number, cz: number, size: number, color: string, opacity: number) {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size))
  const m = new THREE.LineSegments(g, lineMat(color, opacity))
  m.position.set(cx, cy, cz)
  m.material.depthTest = false
  return m
}

function squareFrame(half: number, thick: number, color: string) {
  const s = new THREE.Shape()
  s.moveTo(-half, -half)
  s.lineTo(half, -half)
  s.lineTo(half, half)
  s.lineTo(-half, half)
  s.closePath()
  const b = half - thick
  const hole = new THREE.Path()
  hole.moveTo(-b, -b)
  hole.lineTo(-b, b)
  hole.lineTo(b, b)
  hole.lineTo(b, -b)
  hole.closePath()
  s.holes.push(hole)
  const m = new THREE.Mesh(
    new THREE.ShapeGeometry(s),
    new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }),
  )
  m.renderOrder = 10
  return m
}

function filledSquare(size: number, color: string) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }),
  )
  m.renderOrder = 10
  return m
}

// ---------------------------------------------------------------- 3D-Laserscan

export class ScanScene extends CardScene {
  private rings: THREE.LineLoop[] = []
  private ringBase = [0.55, 0.4, 0.3, 0.22, 0.15]
  private pulse = circle(1, BLUE, 0)
  private poles: THREE.Group[] = []
  private dashes: THREE.Line[] = []
  private scanner = new THREE.Group()
  private markers: THREE.Mesh[] = []

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 9.4, h: 8 }, true)
    this.target.set(0, 0.71, 0)
    this.root.add(floorGrid({ half: 16, step: 1, alpha: 0.075 }))

    ;[1.17, 2.34, 3.5, 4.7, 5.9].forEach((r, i) => {
      const c = circle(r, BLUE, 0)
      this.rings.push(c)
      this.root.add(c)
      void i
    })
    this.root.add(this.pulse)

    // Messpunkte: Fuß, Höhe, Farbe, Marker an der Spitze
    const poles: [THREE.Vector3, number, number, boolean][] = [
      [v(-4.5, 0, -2.3), 3.6, 0xdfe3ea, false],
      [v(4.1, 0, -2.2), 3.3, 0x9aa3b5, true],
      [v(-1.9, 0, 4.1), 1.9, 0x9aa3b5, true],
      [v(5.2, 0, 3.05), 1.6, 0x6c7488, false],
    ].map(([p, h, c, m]) => [p as THREE.Vector3, h as number, c as number, m as boolean])
    const scannerPos = v(0, 1.58, 0)

    for (const [base, h, color, marker] of poles) {
      const g = new THREE.Group()
      g.position.copy(base)
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v(0, 0, 0), v(0, h, 0)]), lineMat(color, 0.7)))
      this.root.add(g)
      this.poles.push(g)

      const top = base.clone().setY(h)
      const dash = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([scannerPos, top]),
        new THREE.LineDashedMaterial({ color: BLUE, dashSize: 0.14, gapSize: 0.12, transparent: true, opacity: 0, depthWrite: false }),
      )
      dash.computeLineDistances()
      this.root.add(dash)
      this.dashes.push(dash)

      if (marker) {
        const m = filledSquare(0.14, BLUE)
        m.position.copy(top)
        this.root.add(m)
        this.billboards.push(m)
        this.markers.push(m)
      }
    }

    // Scanner: Rahmen + Kern, immer zur Kamera ausgerichtet
    this.scanner.position.copy(scannerPos)
    this.scanner.add(squareFrame(0.34, 0.06, BLUE), filledSquare(0.2, BLUE))
    this.root.add(this.scanner)
    this.billboards.push(this.scanner)
  }

  protected update(t: number, e: number) {
    this.rings.forEach((r, i) => {
      const k = seg(e, i * 0.08, 0.5)
      ;(r.material as THREE.LineBasicMaterial).opacity = this.ringBase[i] * k
      r.scale.setScalar(0.85 + 0.15 * k)
    })

    const k = (t * 0.16) % 1
    this.pulse.scale.setScalar(0.4 + k * 5.4)
    ;(this.pulse.material as THREE.LineBasicMaterial).opacity = (1 - k) ** 1.6 * 0.5 * e

    this.poles.forEach((p, i) => p.scale.setY(Math.max(0.001, seg(e, 0.15 + i * 0.07, 0.5))))
    this.dashes.forEach((d, i) => {
      ;(d.material as THREE.LineDashedMaterial).opacity = 0.65 * seg(e, 0.45 + i * 0.05, 0.4)
    })
    this.markers.forEach((m, i) => {
      ;(m.material as THREE.MeshBasicMaterial).opacity = seg(e, 0.6, 0.3) * (0.6 + 0.4 * Math.sin(t * 2 + i * 2))
    })
    this.scanner.scale.setScalar(0.4 + 0.6 * seg(e, 0, 0.35))
    this.scanner.position.y = 1.58 + Math.sin(t * 1.2) * 0.04
  }
}

// ---------------------------------------------------- Druckluft, Kühlwasser, Vakuum

export class MediaScene extends CardScene {
  private pipes: Pipe[] = []

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 33.7, h: 14 }, true)
    this.target.set(-1.65, -1.34, 1.65)
    this.root.add(floorGrid({ half: 34, step: 1.6, y: -2.6, alpha: 0.07, falloff: 0.4 }))

    const defs: [string, number, number][] = [
      [BLUE, -3.6, 0.9],
      [TEAL, 0, 0.9],
      [GOLD, 3.6, 0.9],
    ]
    for (const [color, z, r] of defs) {
      const p = new Pipe([v(-10, 0, z), v(10, 0, z)], { color, radius: r, hatch: true, rings: [0.2, 0.5, 0.8], fill: 0.4 })
      this.pipes.push(p)
      this.root.add(p.group)
    }
  }

  protected update(t: number, e: number) {
    this.pipes.forEach((p, i) => {
      p.setReveal(seg(e, i * 0.14, 0.72))
      p.setTime(t)
      p.group.position.y = Math.sin(t * 0.8 + i * 1.3) * 0.08
    })
  }
}

// ------------------------------------------------------------------- 3D-Modell

export class ModelScene extends CardScene {
  private pipes: Pipe[] = []
  private cube = box(3.4, 1.54, -0.6, 2.6, '#8a8f9c', 0)

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 10.3, h: 8.8 }, true)
    this.root.add(floorGrid({ half: 18, step: 1, y: -3.4, alpha: 0.07 }))

    const teal = new Pipe([v(-5.77, -0.34, 0), v(-2.77, -0.34, 0), v(-2.77, 2.26, 0), v(3.33, 2.26, 0)], {
      color: TEAL,
      radius: 0.38,
      hatch: true,
      inner: true,
      fill: 0.4,
      corner: 0.7,
    })
    const blue = new Pipe(
      [v(-9, 0, -5.2), v(-2.24, 0, -5.2), v(-2.24, 0, -0.7), v(-2.24, -2.1, -0.7), v(2.4, -2.1, -0.7)],
      { color: BLUE, radius: 0.5, hatch: true, inner: true, fill: 0.4, corner: 0.8 },
    )
    this.pipes.push(blue, teal)
    this.root.add(blue.group, teal.group, this.cube)
  }

  protected update(t: number, e: number) {
    this.pipes.forEach((p, i) => {
      p.setReveal(seg(e, i * 0.2, 0.75))
      p.setTime(t)
    })
    ;(this.cube.material as THREE.LineBasicMaterial).opacity = 0.55 * seg(e, 0.5, 0.4)
  }
}

// ------------------------------------------------------------ Rohrleitungsplanung

export class RoutingScene extends CardScene {
  private pipes: Pipe[] = []
  private cube = box(1.4, 0, 0.9, 2.2, '#8a8f9c', 0)

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 10.3, h: 8.8 }, true)
    this.root.add(floorGrid({ half: 18, step: 1, y: -3.6, alpha: 0.07 }))

    const teal = new Pipe(
      [v(-8.4, 0, -3.1), v(-5.6, 0, -3.1), v(-5.75, 0, -0.25), v(1.65, 0, -0.22), v(1.65, -3.4, -0.22)],
      { color: TEAL, radius: 0.34, hatch: true, fill: 0.4, corner: 0.6 },
    )
    const gold = new Pipe([v(-5.5, 0, -6.5), v(-1.55, 0, -6.55), v(-1.57, 0, -1.33), v(1.5, 0, -1.3)], {
      color: GOLD,
      radius: 0.32,
      hatch: true,
      fill: 0.4,
      corner: 0.6,
    })
    const blue = new Pipe([v(-8.5, 0, 2.7), v(4.5, 0, 2.7)], {
      color: BLUE,
      radius: 0.4,
      hatch: true,
      fill: 0.4,
    })
    this.pipes.push(blue, teal, gold)
    this.root.add(blue.group, teal.group, gold.group, this.cube)
  }

  protected update(t: number, e: number) {
    this.pipes.forEach((p, i) => {
      p.setReveal(seg(e, i * 0.14, 0.72))
      p.setTime(t)
    })
    ;(this.cube.material as THREE.LineBasicMaterial).opacity = 0.5 * seg(e, 0.4, 0.4)
  }
}

// ------------------------------------------------------------------------ Plan

export class PlanScene extends CardScene {
  private pipes: Pipe[] = []
  private valves: { g: THREE.Group; at: number }[] = []
  private frames: THREE.LineLoop[] = []

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 9.4, h: 8 }, false)
    this.target.set(0, 0, 0)
    this.root.add(floorGrid({ half: 14, step: 1, alpha: 0.09, falloff: 0.35 }))

    const defs: [string, THREE.Vector3[], number, number][] = [
      [BLUE, [v(-8, 0, -0.6), v(-0.94, 0, -0.6), v(-0.94, 0, 2.15), v(8, 0, 2.15)], -3.0, -0.6],
      [TEAL, [v(-8, 0, 0.42), v(1.4, 0, 0.42), v(1.4, 0, 2.7), v(8, 0, 2.7)], -1.8, 0.42],
      [GOLD, [v(-8, 0, 1.42), v(3.0, 0, 1.42), v(3.0, 0, -1.16), v(8, 0, -1.16)], -1.0, 1.42],
    ]
    defs.forEach(([color, pts, vx, vz], i) => {
      const p = new Pipe(pts, { color, radius: 0.15, edge: 0.34, fill: 0.55, corner: 0.35 })
      this.pipes.push(p)
      this.root.add(p.group)

      // Ventilsymbol: Quadrat mit Schmetterlingsform
      const s = 0.14
      const g = new THREE.Group()
      const geo = new THREE.BufferGeometry().setFromPoints([
        v(-s, 0, -s), v(s, 0, -s), v(s, 0, -s), v(s, 0, s), v(s, 0, s), v(-s, 0, s), v(-s, 0, s), v(-s, 0, -s),
        v(-s, 0, -s), v(s, 0, s), v(s, 0, -s), v(-s, 0, s),
      ])
      g.add(new THREE.LineSegments(geo, lineMat(color, 0.95)))
      g.position.set(vx, 0.2, vz)
      this.root.add(g)
      this.valves.push({ g, at: 0.35 + i * 0.1 })
    })

    for (const [x, z] of [[-4, -1.77], [4, -1.77], [-4, 3.05], [4, 3.05]]) {
      const f = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([v(-0.2, 0, -0.2), v(0.2, 0, -0.2), v(0.2, 0, 0.2), v(-0.2, 0, 0.2)]),
        lineMat('#8a8f9c', 0),
      )
      f.position.set(x, 0, z)
      this.root.add(f)
      this.frames.push(f)
    }
  }

  protected update(t: number, e: number) {
    this.pipes.forEach((p, i) => {
      p.setReveal(seg(e, i * 0.12, 0.7))
      p.setTime(t)
    })
    for (const { g, at } of this.valves) g.visible = e > at + 0.3
    for (const f of this.frames) (f.material as THREE.LineBasicMaterial).opacity = 0.5 * seg(e, 0, 0.5)
  }
}
