// Single entry point for GSAP inside app/motion. Components never import gsap directly.
import { gsap } from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { Flip } from 'gsap/Flip'
import { ScrollSmoother } from 'gsap/ScrollSmoother'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { cubicBezierToPath, easeCurves, eases, type EaseName } from './tokens'

gsap.registerPlugin(CustomEase, Flip)

for (const name of Object.keys(easeCurves) as EaseName[]) {
  CustomEase.create(eases[name], cubicBezierToPath(easeCurves[name]))
}

// ScrollTrigger, ScrollSmoother and SplitText touch the DOM when registered, so their composables register them on mount.
export { gsap, Flip, ScrollSmoother, ScrollTrigger, SplitText }
