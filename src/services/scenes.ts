import * as THREE from 'three'
import { CardScene } from './CardScene'
import { floorGrid } from './grid'
import { Pipe } from './pipes'

const INK = '#111113'
const TEAL = '#3f7f7c'
const ORANGE = '#e0623f'
const RED = '#e03a2e'
const GREY = '#2a2a2e'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
/** Teilfortschritt: e läuft von `from` bis `from + span` von 0 nach 1 */
const seg = (e: number, from: number, span: number) => clamp01((e - from) / span)

function lineMat(color: string | number, opacity: number) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
}

function box(cx: number, cy: number, cz: number, size: number, color: string, opacity: number) {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size))
  const m = new THREE.LineSegments(g, lineMat(color, opacity))
  m.position.set(cx, cy, cz)
  m.material.depthTest = false
  return m
}

// ---------------------------------------------------------------- 3D-Laserscan

export class ScanScene extends CardScene {
  private wall = new THREE.Group()
  private pipes: Pipe[] = []
  private fan: THREE.Mesh
  private fanEdges: THREE.LineSegments
  private beam: THREE.Line
  private cloud: THREE.Points
  private dashes: THREE.Line[] = []
  private scanner = new THREE.Group()
  private dot: THREE.Mesh

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 14, h: 9 }, true)
    this.target.set(0.5, 2.6, 0)
    this.mobileTarget = new THREE.Vector3(0.5, 4.8, 0)
    this.root.add(floorGrid({ half: 20, step: 1, alpha: 0.12 }))

    // Wand mit Raster in der Ebene z = WZ
    const WZ = -3
    const WH = 7
    const WW = 11
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(WW, WH),
      new THREE.MeshBasicMaterial({ color: GREY, transparent: true, opacity: 0.1, depthWrite: false }),
    )
    plane.position.set(0, WH / 2, 0)
    const pts: THREE.Vector3[] = []
    for (let x = -WW / 2; x <= WW / 2 + 1e-6; x += 1) pts.push(v(x, 0, 0.01), v(x, WH, 0.01))
    for (let y = 0; y <= WH + 1e-6; y += 1) pts.push(v(-WW / 2, y, 0.01), v(WW / 2, y, 0.01))
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(INK, 0.16))
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(WW, WH)),
      lineMat(INK, 0.9),
    )
    outline.position.set(0, WH / 2, 0.01)
    this.wall.add(plane, grid, outline)
    this.wall.position.set(0, 0, WZ)
    this.root.add(this.wall)

    // gestrichelte Hilfslinien auf der Wand
    for (const x of [-3.6, 3.6]) {
      const d = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([v(x, 0, WZ + 0.02), v(x, WH, WZ + 0.02)]),
        new THREE.LineDashedMaterial({ color: RED, dashSize: 0.2, gapSize: 0.16, transparent: true, opacity: 0, depthWrite: false }),
      )
      d.computeLineDistances()
      this.dashes.push(d)
      this.root.add(d)
    }

    // Rohre vor der Wand
    for (const [color, y] of [
      [INK, 5.2],
      [TEAL, 3.1],
    ] as const) {
      const p = new Pipe([v(-WW / 2 - 0.4, y, WZ + 0.5), v(WW / 2 + 0.4, y, WZ + 0.5)], {
        color,
        radius: 0.34,
        hatch: true,
        rings: [],
        fill: 0.4,
      })
      this.pipes.push(p)
      this.root.add(p.group)
    }

    // Scanner auf Stativ (Blick Richtung Wand, -z)
    const SX = 0
    const SZ = 3.2
    const TOP = 1.5
    const feet = [v(-0.7, 0, 0.5), v(0.7, 0, 0.5), v(0, 0, -0.7)]
    const legs = feet.map((f) => [v(0, TOP - 0.3, 0), f]).flat()
    this.scanner.position.set(SX, 0, SZ)
    this.scanner.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(legs), lineMat(INK, 1)))
    const fillMat = new THREE.MeshBasicMaterial({ color: '#ebeae5', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    const part = (y: number, w: number, h: number) => {
      const geo = new THREE.BoxGeometry(w, h, w)
      const g = new THREE.Group()
      g.add(new THREE.Mesh(geo, fillMat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(INK, 1)))
      g.position.y = y
      return g
    }
    this.scanner.add(part(TOP - 0.55, 0.9, 0.5), part(TOP + 0.1, 0.62, 0.62))
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshBasicMaterial({ color: RED, transparent: true }))
    this.dot.position.set(0, TOP + 0.1, -0.32)
    this.scanner.add(this.dot)
    this.root.add(this.scanner)

    // Laserfächer von der Scanner-Linse zur senkrechten Messlinie auf der Wand
    const origin = v(SX, TOP + 0.1, SZ - 0.32)
    const y0 = 0.1
    const y1 = 6.6
    const a0 = v(0, y0, WZ + 0.03)
    const a1 = v(0, y1, WZ + 0.03)
    const fanGeo = new THREE.BufferGeometry().setFromPoints([origin, a0, a1])
    this.fan = new THREE.Mesh(
      fanGeo,
      new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    )
    this.fanEdges = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([origin, a0, origin, a1]),
      lineMat(RED, 0),
    )
    this.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a0, a1]), lineMat(RED, 0))
    this.root.add(this.fan, this.fanEdges, this.beam)

    // Punktwolke entlang der Messlinie
    const n = 90
    const arr: number[] = []
    for (let i = 0; i < n; i++) {
      const y = y0 + Math.random() * (y1 - y0)
      const dx = (Math.random() - 0.5) * 0.28 * (Math.random() < 0.3 ? 2.2 : 0.7)
      arr.push(dx, y, WZ + 0.05)
    }
    const cg = new THREE.BufferGeometry()
    cg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    this.cloud = new THREE.Points(
      cg,
      new THREE.PointsMaterial({ color: RED, size: 4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }),
    )
    this.root.add(this.cloud)
  }

  protected update(t: number, e: number) {
    this.pipes.forEach((p, i) => {
      p.setReveal(seg(e, i * 0.12, 0.6))
      p.setTime(t)
    })
    this.dashes.forEach((d, i) => {
      ;(d.material as THREE.LineDashedMaterial).opacity = 0.7 * seg(e, 0.3 + i * 0.05, 0.4)
    })
    const f = seg(e, 0.35, 0.4)
    ;(this.fan.material as THREE.MeshBasicMaterial).opacity = 0.2 * f
    ;(this.fanEdges.material as THREE.LineBasicMaterial).opacity = 0.7 * f
    ;(this.beam.material as THREE.LineBasicMaterial).opacity = f
    ;(this.cloud.material as THREE.PointsMaterial).opacity = seg(e, 0.55, 0.4) * (0.8 + 0.2 * Math.sin(t * 3))
    this.scanner.scale.setScalar(0.6 + 0.4 * seg(e, 0, 0.35))
    ;(this.dot.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 3)
  }
}

// ---------------------------------------------------- Druckluft, Kühlwasser, Vakuum

export class MediaScene extends CardScene {
  private pipes: Pipe[] = []

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 33.7, h: 14 }, true)
    this.target.set(-1.65, -1.34, 1.65)
    this.root.add(floorGrid({ half: 34, step: 1.6, y: -2.6, alpha: 0.12, falloff: 0.4 }))

    const defs: [string, number, number][] = [
      [INK, -3.6, 0.9],
      [TEAL, 0, 0.9],
      [ORANGE, 3.6, 0.9],
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
  private cube = box(3.4, 1.54, -0.6, 2.6, GREY, 0)

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 10.3, h: 8.8 }, true)
    this.root.add(floorGrid({ half: 18, step: 1, y: -3.4, alpha: 0.12 }))

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
      { color: INK, radius: 0.5, hatch: true, inner: true, fill: 0.4, corner: 0.8 },
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
  private cube = box(1.4, 0, 0.9, 2.2, GREY, 0)

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 10.3, h: 8.8 }, true)
    this.root.add(floorGrid({ half: 18, step: 1, y: -3.6, alpha: 0.12 }))

    const teal = new Pipe(
      [v(-8.4, 0, -3.1), v(-5.6, 0, -3.1), v(-5.75, 0, -0.25), v(1.65, 0, -0.22), v(1.65, -3.4, -0.22)],
      { color: TEAL, radius: 0.34, hatch: true, fill: 0.4, corner: 0.6 },
    )
    const gold = new Pipe([v(-5.5, 0, -6.5), v(-1.55, 0, -6.55), v(-1.57, 0, -1.33), v(1.5, 0, -1.3)], {
      color: ORANGE,
      radius: 0.32,
      hatch: true,
      fill: 0.4,
      corner: 0.6,
    })
    const blue = new Pipe([v(-8.5, 0, 2.7), v(4.5, 0, 2.7)], {
      color: INK,
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
  private frames: THREE.Mesh[] = []

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { w: 9.4, h: 8 }, false)
    this.target.set(0, 0, 0)
    this.root.add(floorGrid({ half: 14, step: 1, alpha: 0.14, falloff: 0.35 }))

    const defs: [string, THREE.Vector3[], number, number][] = [
      [INK, [v(-8, 0, -0.6), v(-0.94, 0, -0.6), v(-0.94, 0, 2.15), v(8, 0, 2.15)], -3.0, -0.6],
      [TEAL, [v(-8, 0, 0.42), v(1.4, 0, 0.42), v(1.4, 0, 2.7), v(8, 0, 2.7)], -1.8, 0.42],
      [ORANGE, [v(-8, 0, 1.42), v(3.0, 0, 1.42), v(3.0, 0, -1.16), v(8, 0, -1.16)], -1.0, 1.42],
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
      const f = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.4).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false }),
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
    for (const f of this.frames) (f.material as THREE.MeshBasicMaterial).opacity = seg(e, 0, 0.5)
  }
}
