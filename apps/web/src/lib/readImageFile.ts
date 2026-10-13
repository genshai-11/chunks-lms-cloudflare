const MAX_AVATAR_DATA_URL_LENGTH = 90_000
const AVATAR_MAX_PX = 160

function readRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read image'))
    }
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not process image'))
    img.src = dataUrl
  })
}

async function compressDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, AVATAR_MAX_PX / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image')
  ctx.drawImage(img, 0, 0, width, height)

  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    const next = canvas.toDataURL('image/jpeg', quality)
    if (next.length <= MAX_AVATAR_DATA_URL_LENGTH) return next
  }
  return canvas.toDataURL('image/jpeg', 0.45)
}

/** Read an image file as a compact data URL suitable for Supabase avatar_url storage. */
export async function readImageAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be under 5 MB')
  }

  const raw = await readRawDataUrl(file)
  if (raw.length <= MAX_AVATAR_DATA_URL_LENGTH) return raw

  const compressed = await compressDataUrl(raw)
  if (compressed.length <= MAX_AVATAR_DATA_URL_LENGTH) return compressed
  throw new Error('Image is too large to save as an avatar. Choose a smaller image.')
}
