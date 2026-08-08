import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

export const Sheet = ({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        className="flex-1"
        onClick={onClose}
      />
      <div className="safe-bottom max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-ink-500 bg-ink-800 px-4 pt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black">{title}</h2>
          <button type="button" className="tap-secondary px-5" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3 pb-4">{children}</div>
      </div>
    </div>
  )
}

export const Field = ({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {hint ? <span className="mt-1 block text-sm text-slate-500">{hint}</span> : null}
  </label>
)

export const Toggle = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex min-h-tap w-full items-center justify-between gap-4 rounded-2xl border border-ink-500 bg-ink-700 px-4 py-3 text-left"
  >
    <span>
      <span className="block text-lg font-semibold">{label}</span>
      {hint ? <span className="block text-sm text-slate-400">{hint}</span> : null}
    </span>
    <span
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-brand-500' : 'bg-ink-500'
      }`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
          checked ? 'left-7' : 'left-1'
        }`}
      />
    </span>
  </button>
)

export const EmptyState = ({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) => (
  <div className="card text-center">
    <h2 className="text-2xl font-black">{title}</h2>
    <p className="mx-auto mt-2 max-w-xs text-slate-400">{body}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
)

export const Toasts = ({
  notices,
  onDismiss,
}: {
  notices: string[]
  onDismiss: (index: number) => void
}) => {
  // Clear themselves so they never sit on top of the run the driver is reading.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    if (notices.length === 0) return
    const id = window.setTimeout(() => dismissRef.current(0), 7000)
    return () => window.clearTimeout(id)
  }, [notices.length])

  if (notices.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2 px-4">
      {notices.map((notice, index) => (
        <button
          key={`${notice}-${index}`}
          type="button"
          onClick={() => onDismiss(index)}
          className="pointer-events-auto w-full max-w-md rounded-2xl border border-ink-500 bg-ink-600/95 px-4 py-3 text-left text-base font-semibold shadow-xl backdrop-blur"
        >
          {notice}
          <span className="ml-2 text-slate-400">(tap to dismiss)</span>
        </button>
      ))}
    </div>
  )
}
