import { useCallback, useState } from 'react'

export function useFlash() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ok = useCallback((msg: string) => {
    setError(null)
    setMessage(msg)
  }, [])

  const err = useCallback((msg: string) => {
    setMessage(null)
    setError(msg)
  }, [])

  const clear = useCallback(() => {
    setMessage(null)
    setError(null)
  }, [])

  return { message, error, ok, err, clear }
}
