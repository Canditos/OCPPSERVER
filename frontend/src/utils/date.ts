import { format, formatDistanceToNow } from 'date-fns'

export function safeFormatDistance(dateInput?: string | number | Date | null): string | null {
  if (!dateInput) return null
  try {
    let d: Date
    if (typeof dateInput === 'number') {
      d = new Date(dateInput)
    } else if (typeof dateInput === 'string') {
      const normalized = dateInput.endsWith('Z') || dateInput.includes('+') ? dateInput : `${dateInput}Z`
      d = new Date(normalized)
      if (isNaN(d.getTime())) d = new Date(dateInput)
    } else {
      d = dateInput
    }
    if (isNaN(d.getTime())) return null
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return null
  }
}

export function safeFormatDate(dateInput?: string | number | Date | null, fmtString: string = 'dd/MM/yyyy HH:mm'): string {
  if (!dateInput) return ''
  try {
    let d: Date
    if (typeof dateInput === 'number') {
      d = new Date(dateInput)
    } else if (typeof dateInput === 'string') {
      const normalized = dateInput.endsWith('Z') || dateInput.includes('+') ? dateInput : `${dateInput}Z`
      d = new Date(normalized)
      if (isNaN(d.getTime())) d = new Date(dateInput)
    } else {
      d = dateInput
    }
    if (isNaN(d.getTime())) return ''
    return format(d, fmtString)
  } catch {
    return ''
  }
}

export function safeFormatTime(dateInput?: string | number | Date | null, fmtString: string = 'HH:mm:ss'): string {
  if (!dateInput) return ''
  try {
    let d: Date
    if (typeof dateInput === 'number') {
      d = new Date(dateInput)
    } else if (typeof dateInput === 'string') {
      const normalized = dateInput.endsWith('Z') || dateInput.includes('+') ? dateInput : `${dateInput}Z`
      d = new Date(normalized)
      if (isNaN(d.getTime())) d = new Date(dateInput)
    } else {
      d = dateInput
    }
    if (isNaN(d.getTime())) return ''
    return format(d, fmtString)
  } catch {
    return ''
  }
}

/** Alias for safeFormatDate with default dd/MM/yyyy HH:mm */
export const safeFormatDateTime = safeFormatDate

/** Format a duration in seconds to a human-readable string (e.g. "1h 23m") */
export function safeFormatDuration(seconds?: number | null): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

