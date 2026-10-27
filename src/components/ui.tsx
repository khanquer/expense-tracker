import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Icon, type IconName } from './Icon'

/** Top bar. `large` is for tab screens (big title); otherwise a compact bar with a back arrow. */
export function AppBar({
  title,
  subtitle,
  large,
  back,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  large?: boolean
  back?: boolean | (() => void)
  actions?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className={`appbar ${large ? 'appbar-large' : ''}`}>
      {back && (
        <IconButton icon="back" label="Back" onClick={typeof back === 'function' ? back : () => navigate(-1)} />
      )}
      <div className="appbar-title">
        <h1>{title}</h1>
        {subtitle && <div className="appbar-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="appbar-actions">{actions}</div>}
    </header>
  )
}

export function IconButton({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  disabled?: boolean
  tone?: 'danger'
}) {
  return (
    <button className={`icon-btn ${tone === 'danger' ? 'icon-btn-danger' : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} />
    </button>
  )
}

/** Category emoji in a tinted circle, like an app's list avatar. */
export function Badge({ children, tone }: { children: ReactNode; tone?: 'accent' | 'warn' }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {action}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="row-item switch-row">
      <span className="grow">{label}</span>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  )
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={30} />
      </span>
      <strong>{title}</strong>
      {children && <span className="muted">{children}</span>}
    </div>
  )
}

/** Modal bottom sheet with a scrim. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <div className="scrim" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

/** Confirmation as a bottom sheet, for destructive actions. */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="sheet-text">{message}</p>
      <div className="sheet-actions">
        <button className="btn btn-tonal" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}

// Snackbar: one message at a time, at the bottom, with an optional action.

interface ToastState {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

let current: ToastState | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(message: string, action?: ToastState['action']) {
  current = { id: Date.now(), message, action }
  clearTimeout(timer)
  timer = setTimeout(dismissToast, action ? 5000 : 3000)
  emit()
}

function dismissToast() {
  current = null
  emit()
}

export function Toaster() {
  const t = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
  if (!t) return null
  return (
    <div className="toast" key={t.id} role="status">
      <span className="grow">{t.message}</span>
      {t.action && (
        <button
          className="toast-action"
          onClick={() => {
            t.action!.run()
            dismissToast()
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  )
}

/** Object URL for a blob, created and revoked with the component (safe under StrictMode's double effects). */
export function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** Short vibration for confirmations, where supported (Android). */
export const haptic = () => navigator.vibrate?.(12)
