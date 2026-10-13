type CacheEntry<T> = {
  value: T
  expiresAt: number
}

type QueryOptions = {
  ttlMs?: number
  persist?: boolean
}

const memoryCache = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()
const STORAGE_PREFIX = 'chunks-lms:request-cache:'

function now() {
  return Date.now()
}

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`
}

function readPersisted<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (!parsed || typeof parsed.expiresAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writePersisted<T>(key: string, entry: CacheEntry<T>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(entry))
  } catch {
    /* best effort */
  }
}

export function clearRequestCache(prefix?: string) {
  for (const key of Array.from(memoryCache.keys())) {
    if (!prefix || key.startsWith(prefix)) memoryCache.delete(key)
  }
  for (const key of Array.from(inFlight.keys())) {
    if (!prefix || key.startsWith(prefix)) inFlight.delete(key)
  }
  if (typeof window === 'undefined') return
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i)
      if (!key?.startsWith(STORAGE_PREFIX)) continue
      const rawKey = key.slice(STORAGE_PREFIX.length)
      if (!prefix || rawKey.startsWith(prefix)) window.localStorage.removeItem(key)
    }
  } catch {
    /* best effort */
  }
}

export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: QueryOptions = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? 0
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined
  if (cached && cached.expiresAt > now()) return cached.value

  if (options.persist) {
    const persisted = readPersisted<T>(key)
    if (persisted && persisted.expiresAt > now()) {
      memoryCache.set(key, persisted)
      return persisted.value
    }
  }

  const existing = inFlight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const promise = fetcher()
    .then((value) => {
      if (ttlMs > 0) {
        const entry: CacheEntry<T> = { value, expiresAt: now() + ttlMs }
        memoryCache.set(key, entry)
        if (options.persist) writePersisted(key, entry)
      }
      return value
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, promise)
  return promise
}

export function cacheKey(parts: Array<string | number | boolean | null | undefined>) {
  return parts.map((part) => encodeURIComponent(String(part ?? ''))).join(':')
}
