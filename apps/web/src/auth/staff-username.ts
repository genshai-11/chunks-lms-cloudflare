export const STAFF_USERNAME_MIN_LENGTH = 3
export const STAFF_USERNAME_MAX_LENGTH = 32
export const INVALID_STAFF_LOGIN_MESSAGE = 'Invalid email/username or password'
export const STAFF_LOGIN_RATE_LIMIT_MESSAGE = 'Too many login attempts. Try again later.'

const STAFF_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/

export function normalizeStaffUsername(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase()
}

export function validateStaffUsername(raw: string): string | null {
  const username = normalizeStaffUsername(raw)
  if (username.length < STAFF_USERNAME_MIN_LENGTH || username.length > STAFF_USERNAME_MAX_LENGTH) {
    return `Username must be ${STAFF_USERNAME_MIN_LENGTH}–${STAFF_USERNAME_MAX_LENGTH} characters`
  }
  if (!STAFF_USERNAME_PATTERN.test(username)) {
    return 'Username may use lowercase letters, numbers, dot, underscore, and hyphen only'
  }
  return null
}

export function isEmailLoginIdentifier(raw: string): boolean {
  return raw.trim().includes('@')
}
