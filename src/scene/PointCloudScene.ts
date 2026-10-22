import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildCloud, buildPipeMeshes, type PipeMeshes } from './geometry'
import { fragmentShader, vertexShader } from './shaders'
import { finePointer, mobileLayout, reducedMotion, staticHero } from '../ui/preferences'

const FOV = 35
const HALL_HALF_WIDTH = 8.6

export class PointCloudScene {
  /** Ziel-Scrollfortschritt 0..1 (wird intern geglättet) */
  progress = 0

  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200)
  private material: THREE.ShaderMaterial
  private points: THREE.Points
  private pipes: PipeMeshes
  private clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)
  private clock = new THREE.Clock()
  private smooth = 0
  private mouse = new THREE.Vector2()
  private mouseSmooth = new THREE.Vector2()
  private raf = 0
  private visible = true
  private mobile = mobileLayout.matches
  private rendered = false
  private observed = new Map<Element, boolean>()
  private resizeObserver: ResizeObserver
  private intersection: IntersectionObserver
  private pmrem: THREE.PMREMGenerator
  private envTexture: THREE.Texture

  constructor(private canvas: HTMLCanvasElement, visibilityTargets: HTMLElement[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.localClippingEnabled = true

    const { geometry } = buildCloud(this.mobile ? 60000 : 180000)

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: 2.6 },
        uIdle: { value: staticHero() ? 0 : 1 },
      },
    })
    this.points = new THREE.Points(geometry, this.material)
    this.points.frustumCulled = false
    this.scene.add(this.points)

    // solide Rohre, per Clipping-Plane von links nach rechts eingeblendet
    this.pipes = buildPipeMeshes()
    this.pipes.materials.forEach((m) => (m.clippingPlanes = [this.clip]))
    this.scene.add(this.pipes.group)

    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    const environment = new RoomEnvironment()
    this.envTexture = this.pmrem.fromScene(environment, 0.04).texture
    environment.dispose()
    this.scene.environment = this.envTexture
    this.scene.environmentIntensity = 0.7

    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(-4, 8, 10)
    const rim = new THREE.DirectionalLight(0x8fb8ff, 1.0)
    rim.position.set(6, 3, -8)
    this.scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25))

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.intersection = new IntersectionObserver((entries) => {
      entries.forEach((entry) => this.observed.set(entry.target, entry.isIntersecting))
      this.visible = [...this.observed.values()].some(Boolean)
      this.syncLoop()
    })
    visibilityTargets.forEach((target) => this.intersection.observe(target))

    finePointer.addEventListener('change', this.onPreferences)
    reducedMotion.addEventListener('change', this.onPreferences)
    mobileLayout.addEventListener('change', this.onPreferences)
    addEventListener('herolayoutchange', this.onPreferences)
    document.addEventListener('visibilitychange', this.syncLoop)

    this.resize()
    this.onPreferences()
  }

  private onPointer = (e: PointerEvent) => {
    this.mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1)
  }

  private onPreferences = () => {
    removeEventListener('pointermove', this.onPointer)
    if (finePointer.matches && !staticHero()) addEventListener('pointermove', this.onPointer, { passive: true })
    else {
      this.mouse.set(0, 0)
      this.mouseSmooth.set(0, 0)
    }
    if (this.mobile !== mobileLayout.matches) {
      this.mobile = mobileLayout.matches
      this.points.geometry.dispose()
      this.points.geometry = buildCloud(this.mobile ? 60000 : 180000).geometry
    }
    this.material.uniforms.uIdle.value = staticHero() ? 0 : 1
    this.resize()
  }

  private syncLoop = () => {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    if (document.hidden || !this.visible || (staticHero() && this.rendered)) return
    this.clock.getDelta()
    this.raf = requestAnimationFrame(this.loop)
  }

  private resize() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (!w || !h) return
    const dpr = Math.min(devicePixelRatio, this.mobile ? 1.5 : 2)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.material.uniforms.uPixelRatio.value = dpr * (h / 900)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.rendered = false
    this.syncLoop()
  }

  private loop = () => {
    this.raf = 0
    if (document.hidden || !this.visible) return
    this.renderFrame(Math.min(this.clock.getDelta(), 0.1))
    this.rendered = true
    if (!staticHero()) this.raf = requestAnimationFrame(this.loop)
  }

  private renderFrame(dt: number) {
    const u = this.material.uniforms
    const t = staticHero() ? 0 : this.clock.elapsedTime
    this.smooth += (this.progress - this.smooth) * Math.min(1, dt * 6 + 0.001)
    const p = staticHero() ? 1 : this.smooth
    u.uTime.value = t
    u.uProgress.value = p

    // Reveal der soliden Rohre von links nach rechts (ab p ~ 0.55)
    const reveal = THREE.MathUtils.smoothstep(p, 0.55, 0.95)
    this.clip.constant = THREE.MathUtils.lerp(-9, 10, reveal)

    this.mouseSmooth.lerp(this.mouse, Math.min(1, dt * 3))

    // Kamera: Bild passt sich an Seitenverhältnis an, beim Scrollen Dolly + leichter Orbit
    const aspect = this.camera.aspect
    const fitDist = Math.max(15, Math.min(HALL_HALF_WIDTH / (Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect), 46))
    const dist = fitDist * (1 - 0.3 * p)
    const lookY = THREE.MathUtils.lerp(3.9, 2.0, p)
    const orbit = (p * 0.28 - 0.05) + this.mouseSmooth.x * 0.05
    this.camera.position.set(
      Math.sin(orbit) * dist,
      lookY + 0.3 - this.mouseSmooth.y * 0.3 + p * 0.6,
      Math.cos(orbit) * dist,
    )
    this.camera.lookAt(0, lookY, 0)

    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    removeEventListener('pointermove', this.onPointer)
    document.removeEventListener('visibilitychange', this.syncLoop)
    finePointer.removeEventListener('change', this.onPreferences)
    reducedMotion.removeEventListener('change', this.onPreferences)
    mobileLayout.removeEventListener('change', this.onPreferences)
    removeEventListener('herolayoutchange', this.onPreferences)
    this.resizeObserver.disconnect()
    this.intersection.disconnect()
    this.points.geometry.dispose()
    this.material.dispose()
    this.pipes.dispose()
    this.envTexture.dispose()
    this.pmrem.dispose()
    this.renderer.dispose()
  }
}
