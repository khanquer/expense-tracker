import type { Item } from '../db'
import { unitPrice, type BaseUnit } from './units'

export interface PricePoint {
  item: Item
  /** Price per kg / L / pc. */
  value: number
  label: string
  base: BaseUnit
}

export interface ProductStats {
  count: number
  lastDate: string
  /** Most common base unit; points in other units can't be compared and are left out of best/last. */
  base: BaseUnit
  label: string
  best: PricePoint | null
  last: PricePoint | null
  points: PricePoint[]
}

/** Unit prices for a product's purchases, oldest first. `withFees` uses the share of fees/discounts too. */
export function pricePoints(items: Item[], withFees = false): PricePoint[] {
  return items
    .map((item) => {
      const up = unitPrice(item, withFees ? item.effective : item.price)
      return up && up.value > 0 ? { item, ...up } : null
    })
    .filter((p): p is PricePoint => p !== null)
    .sort((a, b) => a.item.date.localeCompare(b.item.date))
}

export function productStats(items: Item[], withFees = false): ProductStats | null {
  if (items.length === 0) return null
  const points = pricePoints(items, withFees)
  const counts = new Map<BaseUnit, number>()
  for (const p of points) counts.set(p.base, (counts.get(p.base) ?? 0) + 1)
  const base = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'pc'
  const comparable = points.filter((p) => p.base === base)
  const best = comparable.reduce<PricePoint | null>((m, p) => (!m || p.value < m.value ? p : m), null)
  return {
    count: items.length,
    lastDate: items.reduce((d, i) => (i.date > d ? i.date : d), ''),
    base,
    label: comparable[0]?.label ?? '/pc',
    best,
    last: comparable[comparable.length - 1] ?? null,
    points: comparable,
  }
}
