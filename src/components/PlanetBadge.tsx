import { useEffect, useMemo, useRef } from 'react'
import { generatePlanet, planetSprite } from '../lib/procgen'

/** Renders a user's procedural planet as a crisp DOM element (for lists / avatars). */
export function PlanetBadge({
  seed,
  size = 44,
  className = '',
  spin = false,
}: {
  seed: number
  size?: number
  className?: string
  spin?: boolean
}) {
  const url = useMemo(() => {
    const desc = generatePlanet(seed)
    const sprite = planetSprite(desc, size)
    try {
      return sprite.toDataURL()
    } catch {
      return ''
    }
  }, [seed, size])

  if (!url) return <div className={className} style={{ width: size, height: size }} />
  return (
    <img
      src={url}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={`${className} ${spin ? 'animate-drift' : ''}`}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

export function useUrlImage(url?: string) {
  const ref = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.src = url
    ref.current = img
  }, [url])
  return ref
}
