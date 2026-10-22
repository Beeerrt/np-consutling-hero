import type { CardScene } from './CardScene'
import { MediaScene, ModelScene, PlanScene, RoutingScene, ScanScene } from './scenes'

const builders: Record<string, new (canvas: HTMLCanvasElement) => CardScene> = {
  scan: ScanScene,
  media: MediaScene,
  model: ModelScene,
  routing: RoutingScene,
  plan: PlanScene,
}

/** Startet die three.js-Bilder der Leistungskarten mit einer gemeinsamen Render-Schleife. */
export function initServices() {
  const scenes: CardScene[] = []
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-scene]').forEach((canvas) => {
    const Build = builders[canvas.dataset.scene ?? '']
    if (Build) scenes.push(new Build(canvas))
  })

  let pointer: { x: number; y: number } | null = null
  const onPointer = (e: PointerEvent) => (pointer = { x: e.clientX, y: e.clientY })
  addEventListener('pointermove', onPointer, { passive: true })

  let raf = 0
  let last = performance.now()
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    for (const s of scenes) if (s.visible) s.tick(dt, pointer)
  }
  const onVisibility = () => {
    cancelAnimationFrame(raf)
    if (!document.hidden) {
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  raf = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(raf)
    removeEventListener('pointermove', onPointer)
    document.removeEventListener('visibilitychange', onVisibility)
    scenes.forEach((s) => s.dispose())
  }
}
