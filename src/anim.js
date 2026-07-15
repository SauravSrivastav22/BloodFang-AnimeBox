// anime.js (v4) powered 3D effects — the cinematic "BloodFang" feel.
// All helpers no-op when the user prefers reduced motion.
import { useEffect, useRef } from 'react'
import { animate, stagger, set } from 'animejs'
import { getSettings } from './settings'

// Skip animations when the OS asks for reduced motion OR the user turned the
// 3D effects off in Settings.
const reduced = () =>
  (typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ||
  getSettings().animations === false

// Signature 3D staggered reveal: elements rise + rotate out of depth into place,
// like the anime.js landing page. `els` = array/collection of DOM nodes.
export function reveal3D(els) {
  const list = Array.from(els || [])
  if (!list.length) return
  if (reduced()) {
    set(list, { opacity: 1 })
    return
  }
  // Hide synchronously first so there's no flash before the animation runs.
  set(list, { opacity: 0 })
  animate(list, {
    opacity: [0, 1],
    translateY: [46, 0],
    translateZ: [-160, 0],
    rotateX: [-48, 0],
    duration: 720,
    delay: stagger(35),
    ease: 'outExpo',
  })
}

// 3D cursor tilt for a card. Returns a ref to attach to the card element.
// Mouse only (skipped on touch / reduced-motion). Uses the parent's CSS
// perspective, so the card just needs rotateX/rotateY/translateZ.
export function useTilt(max = 12) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced() || window.matchMedia?.('(hover: none)').matches) return

    let raf = 0
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.transition = 'none'
        el.style.transform =
          `rotateY(${px * max}deg) rotateX(${-py * max}deg) translateZ(26px)`
      })
    }
    const onLeave = () => {
      cancelAnimationFrame(raf)
      el.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)'
      el.style.transform = 'rotateY(0deg) rotateX(0deg) translateZ(0px)'
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [max])
  return ref
}

// One-shot 3D entrance for a single element (e.g. the detail hero).
export function enter3D(el, { delay = 0 } = {}) {
  if (!el || reduced()) return
  animate(el, {
    opacity: [0, 1],
    translateY: [40, 0],
    rotateX: [-24, 0],
    duration: 760,
    delay,
    ease: 'outExpo',
  })
}
