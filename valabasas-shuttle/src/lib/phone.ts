/**
 * Normalise to E.164. Returns '' when the input can't be trusted — callers
 * disable call/text rather than dialling something wrong.
 */
export const toE164 = (raw: string): string => {
  const input = String(raw ?? '').trim()
  if (!input) return ''

  const hasPlus = input.startsWith('+')
  const digits = input.replace(/\D/g, '')
  if (!digits) return ''

  if (hasPlus) {
    // Already international: keep it if it's a plausible length.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : ''
  }
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return ''
}

/** +17025550118 -> (702) 555-0118 */
export const formatPhone = (e164: string): string => {
  if (!e164) return ''
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164
}

export const hasUsablePhone = (phone: string | undefined | null): boolean => Boolean(phone)
