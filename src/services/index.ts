import type { CardScene } from './CardScene'
import { MediaScene, ModelScene, PlanScene, RoutingScene, ScanScene } from './scenes'
import { finePointer, reducedMotion } from '../ui/preferences'

const builders: Record<string, new (canvas: HTMLCanvasElement) => CardScene> = {
  scan: ScanScene,
  media: MediaScene,
  model: ModelScene,
  routing: RoutingScene,
  plan: PlanScene,
}

/** Warm up nearby cards; render only visible ones, without an idle animation loop. */
export function initServices() {
  const scenes = new Map<HTMLCanvasElement, CardScene>()
  const visible = new Map<HTMLCanvasElement, boolean>()
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-scene]')]
  let pointer: { x: number; y: number } | null = null
  let raf = 0
  let last = performance.now()
  let disposed = false

  const hasWork = () => [...scenes.values()].some((scene) => scene.needsRender)
  const loop = (now: number) => {
    raf = 0
    if (disposed || document.hidden) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    for (const scene of scenes.values()) if (scene.needsRender) scene.tick(dt, pointer)
    if (hasWork()) raf = requestAnimationFrame(loop)
  }
  const schedule = () => {
    if (disposed || document.hidden || !hasWork()) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (!raf) {
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
  }
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') pointer = { x: event.clientX, y: event.clientY }
  }
  const onPreferences = () => {
    removeEventListener('pointermove', onPointer)
    pointer = null
    if (finePointer.matches && !reducedMotion.matches) addEventListener('pointermove', onPointer, { passive: true })
    schedule()
  }
  const onContextLost = (event: Event) => {
    const canvas = event.target as HTMLCanvasElement
    scenes.get(canvas)?.dispose()
    scenes.delete(canvas)
    delete canvas.dataset.rendered
    schedule()
  }

  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const canvas = entry.target as HTMLCanvasElement
      visible.set(canvas, entry.isIntersecting)
      const scene = scenes.get(canvas)
      if (scene) scene.visible = entry.isIntersecting
    }
    schedule()
  })
  const warmup = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const canvas = entry.target as HTMLCanvasElement
      warmup.unobserve(canvas)
      const Build = builders[canvas.dataset.scene ?? '']
      if (!Build) continue
      try {
        const scene = new Build(canvas)
        scene.visible = visible.get(canvas) ?? false
        scenes.set(canvas, scene)
      } catch {
        // CSS background and text remain available if a renderer fails.
        delete canvas.dataset.rendered
      }
    }
    schedule()
  }, { rootMargin: '240px 0px' })

  canvases.forEach((canvas) => {
    canvas.addEventListener('sceneinvalidate', schedule)
    canvas.addEventListener('webglcontextlost', onContextLost)
    visibility.observe(canvas)
    warmup.observe(canvas)
  })
  finePointer.addEventListener('change', onPreferences)
  reducedMotion.addEventListener('change', onPreferences)
  document.addEventListener('visibilitychange', schedule)
  onPreferences()

  return () => {
    disposed = true
    cancelAnimationFrame(raf)
    warmup.disconnect()
    visibility.disconnect()
    removeEventListener('pointermove', onPointer)
    finePointer.removeEventListener('change', onPreferences)
    reducedMotion.removeEventListener('change', onPreferences)
    document.removeEventListener('visibilitychange', schedule)
    canvases.forEach((canvas) => {
      canvas.removeEventListener('sceneinvalidate', schedule)
      canvas.removeEventListener('webglcontextlost', onContextLost)
    })
    scenes.forEach((scene) => scene.dispose())
  }
}
