import { AlertCircle, CheckCircle2 } from 'lucide-react'

type Props = {
  message?: string | null
  error?: string | null
}

export function Flash({ message, error }: Props) {
  return (
    <>
      {message ? (
        <p className="banner ok" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span>{message}</span>
        </p>
      ) : null}
      {error ? (
        <p className="banner err" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </>
  )
}
