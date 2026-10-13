type Props = {
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function UserAvatar({ name, avatarUrl, size = 'md', className = '' }: Props) {
  const sizeClass =
    size === 'sm'
      ? 'user-avatar-sm'
      : size === 'lg'
        ? 'user-avatar-lg'
        : size === 'xl'
          ? 'user-avatar-xl'
          : 'user-avatar-md'

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`user-avatar ${sizeClass} ${className}`.trim()}
      />
    )
  }

  return (
    <span className={`user-avatar user-avatar-fallback ${sizeClass} ${className}`.trim()} aria-hidden>
      {initials(name) || '?'}
    </span>
  )
}
