export type BaseUnit = 'g' | 'ml' | 'pc'

const UNIT_TABLE: Record<string, { base: BaseUnit; factor: number }> = {
  g: { base: 'g', factor: 1 },
  gm: { base: 'g', factor: 1 },
  gms: { base: 'g', factor: 1 },
  gram: { base: 'g', factor: 1 },
  grams: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  kgs: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  ltr: { base: 'ml', factor: 1000 },
  litre: { base: 'ml', factor: 1000 },
  liter: { base: 'ml', factor: 1000 },
  pc: { base: 'pc', factor: 1 },
  pcs: { base: 'pc', factor: 1 },
  piece: { base: 'pc', factor: 1 },
  pieces: { base: 'pc', factor: 1 },
  nos: { base: 'pc', factor: 1 },
  unit: { base: 'pc', factor: 1 },
  units: { base: 'pc', factor: 1 },
  dozen: { base: 'pc', factor: 12 },
  dz: { base: 'pc', factor: 12 },
}

/** Units offered in the item editor. */
export const UNIT_CHOICES = ['g', 'kg', 'ml', 'l', 'pc', 'dozen'] as const

export function parseUnit(unit: string | null | undefined) {
  if (!unit) return null
  return UNIT_TABLE[unit.trim().toLowerCase()] ?? null
}

interface Measured {
  quantity: number
  size: number | null
  unit: string | null
}

/**
 * Total amount bought in base units (g, ml or pc).
 * Items without a recognised unit are counted as pieces.
 */
export function baseAmount(item: Measured): { amount: number; base: BaseUnit } {
  const parsed = parseUnit(item.unit)
  const qty = item.quantity > 0 ? item.quantity : 1
  if (!parsed) return { amount: qty, base: 'pc' }
  const size = item.size && item.size > 0 ? item.size : 1
  return { amount: qty * size * parsed.factor, base: parsed.base }
}

/** Price per kg, per litre or per piece. */
export function unitPrice(item: Measured, price: number): { value: number; label: string; base: BaseUnit } | null {
  const { amount, base } = baseAmount(item)
  if (amount <= 0) return null
  if (base === 'g') return { value: (price / amount) * 1000, label: '/kg', base }
  if (base === 'ml') return { value: (price / amount) * 1000, label: '/L', base }
  return { value: price / amount, label: '/pc', base }
}

/** Human readable pack description, e.g. "2 × 500 g" or "3 pc". */
export function describeQuantity(item: Measured): string {
  const unit = item.unit?.trim()
  if (item.size && unit) {
    const pack = `${trimNumber(item.size)} ${unit}`
    return item.quantity === 1 ? pack : `${trimNumber(item.quantity)} × ${pack}`
  }
  return `${trimNumber(item.quantity)} ${unit || 'pc'}`
}

function trimNumber(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
