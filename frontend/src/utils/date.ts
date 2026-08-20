import { format, formatDistanceToNow } from 'date-fns'

export function safeFormatDistance(dateStr?: string | null): string | null {
  if (!dateStr) return null
  try {
    const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return null
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return null
  }
}

export function safeFormatDate(dateStr?: string | null, fmtString: string = 'dd/MM/yyyy HH:mm'): string | undefined {
  if (!dateStr) return undefined
  try {
    const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return undefined
    return format(d, fmtString)
  } catch {
    return undefined
  }
}
