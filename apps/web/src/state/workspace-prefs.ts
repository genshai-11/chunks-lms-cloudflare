const CLASS_KEY = 'chunks-lms:active-class-id'

function load(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function save(key: string, id: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (id) window.localStorage.setItem(key, id)
    else window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function loadActiveClassId(): string | null {
  return load(CLASS_KEY)
}

export function saveActiveClassId(id: string | null): void {
  save(CLASS_KEY, id)
}
