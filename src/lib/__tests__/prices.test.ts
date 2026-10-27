import { describe, expect, it } from 'vitest'
import type { Item } from '../../db'
import { productStats } from '../prices'

const item = (over: Partial<Item>): Item => ({
  id: crypto.randomUUID(),
  expenseId: 'e',
  position: 0,
  date: '2026-10-01',
  merchant: 'A',
  name: 'Milk',
  brand: '',
  productId: 'p',
  quantity: 1,
  size: 1,
  unit: 'l',
  price: 68,
  effective: 68,
  categoryId: 'groceries',
  ...over,
})

describe('productStats', () => {
  it('finds the cheapest per-litre purchase across pack sizes', () => {
    const s = productStats([
      item({ date: '2026-10-01', merchant: 'DMart', size: 1, unit: 'l', price: 64 }),
      item({ date: '2026-10-10', merchant: 'Instamart', quantity: 2, size: 500, unit: 'ml', price: 70, effective: 85 }),
    ])!
    expect(s.best?.item.merchant).toBe('DMart')
    expect(s.last?.value).toBe(70)
    expect(s.label).toBe('/L')
  })

  it('can include fees', () => {
    const s = productStats([item({ price: 70, effective: 85 })], true)!
    expect(s.last?.value).toBe(85)
  })

  it('compares only the dominant unit', () => {
    const s = productStats([item({}), item({}), item({ unit: null, size: null, price: 5 })])!
    expect(s.base).toBe('ml')
    expect(s.points).toHaveLength(2)
  })
})
