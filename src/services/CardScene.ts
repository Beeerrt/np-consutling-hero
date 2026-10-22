import * as THREE from 'three'

const REVEAL_MS = 1900
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

export interface DesignBox {
  /** Sichtbarer Weltbereich, für den die Szene komponiert ist */
  w: number
  h: number
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

/**
 * Basis für die Bilder der Leistungskarten: orthografische Kamera (isometrisch oder Draufsicht),
 * Einblend-Animation beim ersten Sichtbarwerden und leichte Pointer-Parallaxe.
 */
export abstract class CardScene {
  visible = false

  protected scene = new THREE.Scene()
  protected camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
  protected root = new THREE.Group()
  protected target = new THREE.Vector3()
  protected billboards: THREE.Object3D[] = []
  protected disposables: { dispose(): void }[] = []

  private renderer: THREE.WebGLRenderer
  private aspect = 1
  private time = 0
  private reveal = 0
  private revealStart = -1
  private px = 0
  private py = 0
  private rendered = false
  private ro: ResizeObserver
  private io: IntersectionObserver

  constructor(
    protected canvas: HTMLCanvasElement,
    private design: DesignBox,
    private iso: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.scene.add(this.root)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.io = new IntersectionObserver(
      ([e]) => {
        this.visible = e.isIntersecting
        if (this.visible && this.revealStart < 0) this.revealStart = performance.now()
      },
      { threshold: 0.25 },
    )
    this.io.observe(canvas)
    this.resize()
  }

  /** `t`: Zeit in s, `e`: eingeblendeter Anteil 0..1 (weich) */
  protected abstract update(t: number, e: number): void

  private resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (!w || !h) return
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(w, h, false)
    this.aspect = w / h
    const H = Math.max(this.design.h, (this.design.w * 0.62) / this.aspect)
    const W = H * this.aspect
    this.camera.left = -W / 2
    this.camera.right = W / 2
    this.camera.top = H / 2
    this.camera.bottom = -H / 2
    this.camera.updateProjectionMatrix()
    this.rendered = false
  }

  tick(dt: number, pointer: { x: number; y: number } | null) {
    if (reduceMotion) {
      if (this.rendered) return
      this.reveal = 1
      dt = 0
    }

    this.time += dt
    if (this.revealStart >= 0 && this.reveal < 1) {
      this.reveal = Math.min(1, (performance.now() - this.revealStart) / REVEAL_MS)
    }

    let nx = 0
    let ny = 0
    if (pointer && !reduceMotion) {
      const r = this.canvas.getBoundingClientRect()
      const x = ((pointer.x - r.left) / r.width) * 2 - 1
      const y = ((pointer.y - r.top) / r.height) * 2 - 1
      if (Math.abs(x) <= 1.2 && Math.abs(y) <= 1.2) {
        nx = THREE.MathUtils.clamp(x, -1, 1)
        ny = THREE.MathUtils.clamp(y, -1, 1)
      }
    }
    const k = Math.min(1, dt * 3)
    this.px += (nx - this.px) * k
    this.py += (ny - this.py) * k

    this.placeCamera()
    for (const b of this.billboards) b.quaternion.copy(this.camera.quaternion)
    this.update(this.time, easeInOut(this.reveal))
    this.renderer.render(this.scene, this.camera)
    this.rendered = true
  }

  private placeCamera() {
    const t = this.target
    if (this.iso) {
      const az = Math.PI / 4 + this.px * 0.07
      const el = Math.atan(1 / Math.SQRT2) - this.py * 0.04
      const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
      this.camera.position.copy(t).addScaledVector(dir, 80)
      this.camera.up.set(0, 1, 0)
      this.camera.lookAt(t)
    } else {
      const x = t.x + this.px * 0.25
      const z = t.z + this.py * 0.25
      this.camera.position.set(x, 80, z)
      this.camera.up.set(0, 0, -1)
      this.camera.lookAt(x, 0, z)
    }
  }

  dispose() {
    this.ro.disconnect()
    this.io.disconnect()
    this.disposables.forEach((d) => d.dispose())
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
    this.renderer.dispose()
  }
}
