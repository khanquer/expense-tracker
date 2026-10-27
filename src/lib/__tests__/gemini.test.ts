import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../../db'
import { resolveDate, toDraft } from '../gemini'

const categories = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i }))

describe('toDraft', () => {
  it('maps a Swiggy-style extraction onto a draft', () => {
    const d = toDraft(
      {
        source: 'Swiggy',
        merchant: 'Meghana Foods',
        day: 20,
        month: 10,
        year: 2026,
        items: [
          { name: 'Chicken Biryani', brand: null, product: 'Chicken biryani', quantity: 1, size: null, unit: 'pc', price: 380, category: 'food delivery' },
          { name: 'Mystery', brand: null, product: 'Mystery', quantity: 0, size: null, unit: 'bowls', price: -5, category: 'Snacks' },
        ],
        fees: { delivery: 35, packaging: 20, platform: 5, taxes: 21.5, tip: 0, other: 0, discount: 75 },
        total: 381.5,
        note: null,
      },
      categories,
      'Receipt',
    )
    expect(d.source).toBe('Swiggy')
    expect(d.date).toBe('2026-10-20')
    expect(d.items[0]).toMatchObject({ name: 'Chicken Biryani', categoryId: 'food-delivery', unit: 'pc', size: null, price: 380 })
    // Unknown category/unit and bad numbers are sanitised.
    expect(d.items[1]).toMatchObject({ categoryId: 'other', unit: null, quantity: 1, price: 0 })
    expect(d.fees.discount).toBe(75)
    expect(d.total).toBe(381.5)
  })

  it('drops taxes that are already included in GST-inclusive item prices', () => {
    const item = (name: string, price: number) => ({ name, brand: null, product: name, quantity: 1, size: null, unit: 'pc', price, category: 'Dining out' })
    const d = toDraft(
      {
        source: 'Receipt', merchant: 'Kerala Mess', day: 14, month: 9, year: 26, note: null,
        items: [item('Water Bottle', 20), item('Parotta', 90), item('Wheat Parotta', 40), item('Chettinadu Chicken Masala', 230), item('Egg Noodles', 170), item('Fulka', 60)],
        fees: { delivery: 0, packaging: 0, platform: 0, taxes: 29.04, tip: 0, other: 0.01, discount: 0 },
        total: 610,
      },
      categories,
      'Receipt',
    )
    expect(d.fees.taxes).toBe(0)
    expect(d.fees.other).toBe(0)
    expect(d.date).toBe('2026-09-14')
  })

  it('keeps taxes when items plus taxes make up the total', () => {
    const d = toDraft(
      {
        source: 'Receipt', merchant: 'Shri Sangeethas', day: 19, month: 9, year: 26, note: null,
        items: [{ name: 'Parotta (2 Pcs)', brand: null, product: 'Parotta', quantity: 1, size: null, unit: 'pc', price: 95, category: 'Dining out' }],
        fees: { delivery: 0, packaging: 0, platform: 0, taxes: 4.76, tip: 0, other: 0.24, discount: 0 },
        total: 100,
      },
      categories,
      'Receipt',
    )
    expect(d.fees).toMatchObject({ taxes: 4.76, other: 0.24 })
  })

  it('flags what it could not read', () => {
    const d = toDraft(
      {
        source: 'Receipt', merchant: '', day: null, month: null, year: null, note: null, total: 120,
        items: [{ name: 'Masala Dosa', brand: null, product: 'Masala dosa', quantity: 1, size: null, unit: 'pc', price: 120, category: 'Dining out', unclear: true }],
        fees: { delivery: 0, packaging: 0, platform: 0, taxes: 0, tip: 0, other: 0, discount: 0 },
      },
      categories,
      'Receipt',
    )
    expect(d.items[0].unclear).toBe(true)
    expect(d.warnings).toEqual([
      "No date found on the bill, so it's set to today.",
      "Couldn't read the shop or restaurant name.",
    ])
  })

  it('falls back to today for missing or future dates', () => {
    const base = { source: '', merchant: '', items: [], fees: {} as never, total: 10, note: null, day: null, month: null, year: null }
    const today = new Date().toISOString().slice(0, 4)
    expect(toDraft(base, categories, 'Manual').date.slice(0, 4)).toBe(today)
    expect(toDraft({ ...base, day: 1, month: 1, year: 2999 }, categories, 'Manual').date).not.toBe('2999-01-01')
    expect(toDraft(base, categories, 'Manual').items).toHaveLength(1)
  })
})

describe('resolveDate', () => {
  const today = '2026-10-27'
  it('builds dates from printed parts, including 2-digit years', () => {
    expect(resolveDate(19, 9, 26, today)).toBe('2026-09-19')
    expect(resolveDate(14, 3, 2025, today)).toBe('2025-03-14')
  })

  it('uses the most recent past occurrence when the year is not printed', () => {
    expect(resolveDate(4, 9, null, today)).toBe('2026-09-04')
    expect(resolveDate(30, 12, null, today)).toBe('2025-12-30')
  })

  it('rejects future, impossible or missing dates', () => {
    expect(resolveDate(2, 11, 2026, today)).toBeNull()
    expect(resolveDate(31, 2, 2026, today)).toBeNull()
    expect(resolveDate(null, 9, null, today)).toBeNull()
  })
})
