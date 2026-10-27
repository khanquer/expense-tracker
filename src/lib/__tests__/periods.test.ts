import { describe, expect, it } from 'vitest'
import { periodFor, trailingPeriods } from '../periods'

describe('periods', () => {
  it('weeks start on Monday', () => {
    const p = periodFor('week', new Date(2026, 9, 25)) // Sunday 25 Oct 2026
    expect(p.start).toBe('2026-10-19')
    expect(p.end).toBe('2026-10-26')
  })

  it('months shift across year boundaries', () => {
    const p = periodFor('month', new Date(2026, 0, 15), -1)
    expect([p.start, p.end]).toEqual(['2025-12-01', '2026-01-01'])
  })

  it('trailing periods end with the given one', () => {
    const p = periodFor('month', new Date(2026, 9, 27))
    const t = trailingPeriods(p, 3)
    expect(t.map((x) => x.start)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
  })
})
