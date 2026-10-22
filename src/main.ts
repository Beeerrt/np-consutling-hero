import './style.css'
import { PointCloudScene } from './scene/PointCloudScene'
import { trackScrollProgress } from './scroll/scrollProgress'
import { trackHandoff } from './scroll/handoff'
import { initServices } from './services'
import { initNavigation } from './ui/navigation'
import { initLayout } from './ui/layout'

const hero = document.querySelector<HTMLElement>('#hero')!
const sticky = hero.querySelector<HTMLElement>('.hero-sticky')!
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!

const stopNavigation = initNavigation()
const stopLayout = initLayout()
const services = document.querySelector<HTMLElement>('#leistungen')!

let scene: PointCloudScene | null = null
const fallback = () => {
  scene?.dispose()
  scene = null
  canvas.style.display = 'none'
  document.documentElement.classList.add('scene-unavailable')
  window.dispatchEvent(new Event('herolayoutchange'))
}
canvas.addEventListener('webglcontextlost', fallback)
try {
  scene = new PointCloudScene(canvas, [hero, services.querySelector<HTMLElement>('.services-head')!])
} catch {
  fallback()
}

const stopProgress = trackScrollProgress(hero, (p) => {
  document.documentElement.style.setProperty('--p', p.toFixed(4))
  sticky.classList.toggle('is-scrolled', p > 0.15)
  // Faded links must also leave the keyboard focus order.
  sticky.querySelector<HTMLElement>('.hero-content')!.inert = p > 0.15
  sticky.querySelector<HTMLElement>('.scan-pill')!.inert = p > 0.15
  if (scene) scene.progress = p
})

const stopHandoff = trackHandoff(canvas, services)
const stopServices = scene ? initServices() : () => {}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    scene?.dispose()
    canvas.removeEventListener('webglcontextlost', fallback)
    stopNavigation()
    stopLayout()
    stopProgress()
    stopHandoff()
    stopServices()
  })
}
