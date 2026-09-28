import { useEffect, useState } from 'react'

/** Reactive `matchMedia`, SSR-safe and listener-cleanup-safe. */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Phone-sized viewport (Tailwind's `sm` breakpoint by default). */
export const useIsMobile = (breakpoint = 640) => useMedia(`(max-width: ${breakpoint - 1}px)`)

/** True on devices whose primary input is touch, regardless of screen size. */
export const useIsTouch = () => useMedia('(pointer: coarse)')

/** Respect the OS "reduce motion" setting. */
export const usePrefersReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)')
