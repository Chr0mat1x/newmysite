/**
 * Read a picked image file into a data URL, downscaled so it stays small enough
 * to live inline in a message or the localStorage galaxy. Returns the original
 * data URL unchanged if the browser cannot decode it (e.g. an SVG).
 */
export async function fileToImageDataUrl(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('could not read that image'))
    reader.readAsDataURL(file)
  })
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return raw

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => resolve(null)
    el.src = raw
  })
  if (!img || !img.width || !img.height) return raw

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  if (scale === 1 && file.size < 400_000) return raw

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return raw
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}
