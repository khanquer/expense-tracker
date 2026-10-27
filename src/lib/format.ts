const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inrPrecise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

/** Whole rupees, for totals. */
export const money = (n: number) => inr.format(n)

/** Up to two decimals, for prices and unit costs. */
export const moneyPrecise = (n: number) => inrPrecise.format(n)

/** Rupees to two decimals, avoiding float noise like 0.30000000000000004. */
export const round2 = (n: number) => Math.round(n * 100) / 100

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return fromIsoDate(iso).toLocaleDateString('en-IN', opts)
}

/** Local date as YYYY-MM-DD (not UTC, so late-night entries land on the right day). */
export function toIsoDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromIsoDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayIso = () => toIsoDate(new Date())

/**
 * Normalized key for matching names: lowercase letters and digits only, so
 * "Toned Milk 500 ml" and "TONED MILK 500ML" match.
 */
export function nameKey(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}
