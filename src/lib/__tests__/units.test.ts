import { describe, expect, it } from 'vitest'
import { baseAmount, describeQuantity, unitPrice } from '../units'

describe('unitPrice', () => {
  it('prices packs per kg', () => {
    // 2 × 500 g for ₹120 → ₹120/kg
    expect(unitPrice({ quantity: 2, size: 500, unit: 'g' }, 120)).toEqual({ value: 120, label: '/kg', base: 'g' })
  })

  it('prices loose produce sold by weight', () => {
    expect(unitPrice({ quantity: 1, size: 1.5, unit: 'kg' }, 60)?.value).toBeCloseTo(40)
  })

  it('prices litres and millilitres the same way', () => {
    expect(unitPrice({ quantity: 1, size: 1, unit: 'L' }, 68)?.value).toBe(68)
    expect(unitPrice({ quantity: 2, size: 500, unit: 'ml' }, 68)?.value).toBe(68)
  })

  it('treats dozens as 12 pieces', () => {
    expect(unitPrice({ quantity: 1, size: 1, unit: 'dozen' }, 84)).toEqual({ value: 7, label: '/pc', base: 'pc' })
  })

  it('falls back to per piece without a unit', () => {
    expect(unitPrice({ quantity: 3, size: null, unit: null }, 450)).toEqual({ value: 150, label: '/pc', base: 'pc' })
  })

  it('ignores a missing pack size instead of dividing by zero', () => {
    expect(baseAmount({ quantity: 2, size: null, unit: 'kg' })).toEqual({ amount: 2000, base: 'g' })
  })
})

describe('describeQuantity', () => {
  it('formats packs and single items', () => {
    expect(describeQuantity({ quantity: 2, size: 500, unit: 'ml' })).toBe('2 × 500 ml')
    expect(describeQuantity({ quantity: 1, size: 1.25, unit: 'kg' })).toBe('1.25 kg')
    expect(describeQuantity({ quantity: 3, size: null, unit: null })).toBe('3 pc')
  })
})
