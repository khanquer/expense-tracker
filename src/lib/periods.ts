import { fromIsoDate, toIsoDate } from './format'

export type PeriodKind = 'week' | 'month' | 'year'

export interface Period {
  kind: PeriodKind
  /** Inclusive, YYYY-MM-DD. */
  start: string
  /** Exclusive, YYYY-MM-DD. */
  end: string
  label: string
}

/** The period of `kind` containing `anchor`, shifted by `offset` periods. */
export function periodFor(kind: PeriodKind, anchor: Date, offset = 0): Period {
  let start: Date
  let end: Date
  let label: string
  if (kind === 'week') {
    // Weeks start on Monday.
    const dow = (anchor.getDay() + 6) % 7
    start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dow + offset * 7)
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    label = `${fmt(start)} – ${fmt(last)}`
  } else if (kind === 'month') {
    start = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1)
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    label = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  } else {
    start = new Date(anchor.getFullYear() + offset, 0, 1)
    end = new Date(start.getFullYear() + 1, 0, 1)
    label = String(start.getFullYear())
  }
  return { kind, start: toIsoDate(start), end: toIsoDate(end), label }
}

/** The `count` periods ending with (and including) `period`, oldest first. */
export function trailingPeriods(period: Period, count: number): Period[] {
  const anchor = fromIsoDate(period.start)
  return Array.from({ length: count }, (_, i) => periodFor(period.kind, anchor, i - count + 1))
}

/** Short axis label for a period. */
export function shortLabel(p: Period) {
  const d = fromIsoDate(p.start)
  if (p.kind === 'week') return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  if (p.kind === 'month') return d.toLocaleDateString('en-IN', { month: 'short' })
  return String(d.getFullYear())
}
