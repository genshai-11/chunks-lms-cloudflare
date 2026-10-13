import { useState } from 'react'
import { Camera, Trash2, X, Upload } from 'lucide-react'
import { UserAvatar } from './UserAvatar'
import { readImageAsDataUrl } from '../lib/readImageFile'

type Props = {
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  onSave: (url: string | null) => void | Promise<void>
  className?: string
}

export function EditableAvatar({ name, avatarUrl, size = 'md', onSave, className = '' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setError(null)
    try {
      const dataUrl = await readImageAsDataUrl(file)
      await onSave(dataUrl)
      setIsOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read image')
    }
  }

  const handleRemove = async () => {
    setError(null)
    try {
      await onSave(null)
      setIsOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove image')
    }
  }

  return (
    <>
      <button
        type="button"
        className={`editable-avatar-trigger ${className}`.trim()}
        onClick={() => setIsOpen(true)}
        aria-label="Edit avatar"
        title="Edit avatar"
      >
        <UserAvatar name={name} avatarUrl={avatarUrl} size={size} />
        <span className="editable-avatar-overlay">
          <Camera className="h-4 w-4" />
        </span>
      </button>

      {isOpen && (
        <div className="observe-modal-container">
          <div className="observe-modal-backdrop" onClick={() => setIsOpen(false)} />
          <div className="observe-modal-card avatar-edit-modal">
            <button
              type="button"
              className="avatar-edit-modal-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="observe-modal-title">Edit Avatar</h3>
            <p className="observe-modal-desc">
              Upload a picture of yourself. Max size 1.5MB.
            </p>

            <div className="avatar-edit-preview">
              <UserAvatar name={name} avatarUrl={avatarUrl} size="xl" />
            </div>

            {error && <p className="avatar-edit-error">{error}</p>}

            <div className="avatar-edit-actions">
              <label className="btn primary avatar-upload-btn">
                <Upload className="h-4 w-4" aria-hidden />
                <span>Upload photo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </label>

              {avatarUrl && (
                <button
                  type="button"
                  className="btn ghost danger w-full flex items-center justify-center gap-2"
                  onClick={handleRemove}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span>Remove photo</span>
                </button>
              )}

              <button
                type="button"
                className="btn secondary w-full"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
