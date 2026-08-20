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
