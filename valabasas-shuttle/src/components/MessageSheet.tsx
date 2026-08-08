import { useEffect, useMemo, useState } from 'react'
import type { Appointment, Settings } from '../types'
import { openUrl, renderTemplate, smsUrl, templateVarsFor } from '../lib/links'
import { formatPhone } from '../lib/phone'
import { Sheet } from './ui'

const ETA_CHOICES = [5, 10, 15, 20, 30]

type TemplateKey = keyof Settings['templates']

const TEMPLATE_ORDER: { key: TemplateKey; label: string }[] = [
  { key: 'etaConventionCenter', label: 'ETA to convention center' },
  { key: 'onTheWay', label: 'Heading your way' },
  { key: 'outsideNow', label: "I'm outside now" },
  { key: 'returnReady', label: 'Ready to take you back' },
]

/**
 * iOS cannot compose one SMS to several people from a URL, so multi-account
 * messaging is a queue the driver taps through one recipient at a time.
 */
export const MessageSheet = ({
  open,
  onClose,
  appointments,
  settings,
  title,
}: {
  open: boolean
  onClose: () => void
  appointments: Appointment[]
  settings: Settings
  title: string
}) => {
  const [templateKey, setTemplateKey] = useState<TemplateKey | null>(null)
  const [minutes, setMinutes] = useState<number | null>(null)
  const [customMinutes, setCustomMinutes] = useState('')
  const [sent, setSent] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      setTemplateKey(null)
      setMinutes(null)
      setCustomMinutes('')
      setSent([])
    }
  }, [open])

  const template = templateKey ? settings.templates[templateKey] : ''
  const needsMinutes = template.includes('{minutes}')
  const ready = Boolean(templateKey) && (!needsMinutes || minutes !== null)

  const messages = useMemo(
    () =>
      appointments.map((appointment) => ({
        appointment,
        body: renderTemplate(
          template,
          { ...templateVarsFor(appointment), minutes: minutes ?? '' },
          settings,
        ),
      })),
    [appointments, template, minutes, settings],
  )

  const send = (appointment: Appointment, body: string) => {
    const url = smsUrl(appointment.phone, body)
    if (!url) return
    setSent((prev) => (prev.includes(appointment.id) ? prev : [...prev, appointment.id]))
    openUrl(url)
  }

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {!templateKey ? (
        <div className="space-y-3">
          <p className="text-slate-400">Pick a message.</p>
          {TEMPLATE_ORDER.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              data-testid={`template-${key}`}
              className="w-full rounded-2xl border border-ink-500 bg-ink-700 p-4 text-left"
              onClick={() => setTemplateKey(key)}
            >
              <span className="block text-lg font-bold">{label}</span>
              <span className="mt-1 block text-sm text-slate-400">{settings.templates[key]}</span>
            </button>
          ))}
        </div>
      ) : needsMinutes && minutes === null ? (
        <div className="space-y-3">
          <p className="text-slate-400">How far out are you?</p>
          <div className="grid grid-cols-3 gap-3">
            {ETA_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                data-testid={`eta-${choice}`}
                className="tap-secondary"
                onClick={() => setMinutes(choice)}
              >
                {choice} min
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <input
              className="field flex-1"
              inputMode="numeric"
              placeholder="Custom"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value.replace(/\D/g, ''))}
            />
            <button
              type="button"
              className="tap-secondary px-6"
              disabled={!customMinutes}
              onClick={() => setMinutes(Number(customMinutes))}
            >
              Use
            </button>
          </div>
          <button type="button" className="tap-ghost w-full" onClick={() => setTemplateKey(null)}>
            Back
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-slate-400">
            {messages.length > 1
              ? 'Messages open one at a time — tap each account, then come back.'
              : 'Tap to open Messages with this pre-filled.'}
          </p>
          {messages.map(({ appointment, body }) => {
            const disabled = !appointment.phone
            return (
              <div key={appointment.id} className="rounded-2xl border border-ink-500 bg-ink-700 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block truncate text-lg font-bold">{appointment.accountName}</span>
                    <span className="block truncate text-sm text-slate-400">
                      {appointment.contactName}
                      {appointment.phone ? ` · ${formatPhone(appointment.phone)}` : ' · no phone'}
                    </span>
                  </div>
                  <button
                    type="button"
                    data-testid={`send-sms-${appointment.id}`}
                    data-sms-url={smsUrl(appointment.phone, body) ?? ''}
                    className={sent.includes(appointment.id) ? 'tap-ghost px-5' : 'tap-primary w-auto px-5'}
                    disabled={disabled}
                    onClick={() => send(appointment, body)}
                  >
                    {sent.includes(appointment.id) ? 'Sent ✓' : disabled ? 'No phone' : 'Send'}
                  </button>
                </div>
                <p className="mt-2 text-sm text-slate-400">{body}</p>
              </div>
            )
          })}
          {!ready ? null : (
            <button type="button" className="tap-ghost w-full" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}
