import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, emptyFees, imageBlob, setSetting } from '../../db'
import { allocate, applyLearning, emptyDraft, emptyItem, saveDraft, totalMismatch, loadDraft, deleteExpense } from '../draft'

describe('allocate', () => {
  it('spreads fees proportionally and sums exactly to the total', () => {
    const parts = allocate([100, 200, 33.33], 400)
    expect(parts.reduce((s, x) => s + x, 0)).toBeCloseTo(400, 10)
    expect(parts[1]).toBeCloseTo(parts[0] * 2, 1)
  })

  it('handles a discount (total below subtotal)', () => {
    expect(allocate([300, 100], 300)).toEqual([225, 75])
  })

  it('splits evenly when all prices are zero', () => {
    expect(allocate([0, 0], 50)).toEqual([25, 25])
  })
})

describe('totalMismatch', () => {
  it('is zero when items + fees − discount equal the total', () => {
    const fees = { ...emptyFees(), delivery: 30, taxes: 18.5, discount: 50 }
    expect(totalMismatch({ items: [{ ...emptyItem(), price: 250 }], fees, total: 248.5 })).toBe(0)
  })

  it('flags a missed item', () => {
    expect(totalMismatch({ items: [{ ...emptyItem(), price: 100 }], fees: emptyFees(), total: 160 })).toBe(60)
  })
})

describe('saveDraft / applyLearning', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('saves items with fee-inclusive effective amounts and learns products', async () => {
    const draft = {
      ...emptyDraft('Instamart'),
      merchant: 'Instamart',
      total: 140,
      fees: { ...emptyFees(), delivery: 20 },
      items: [
        { ...emptyItem('groceries'), name: 'Amul Taaza Toned Milk 500 ml', product: 'Toned milk', brand: 'Amul', quantity: 2, size: 500, unit: 'ml', price: 60 },
        { ...emptyItem('groceries'), name: 'Harvest Gold Bread', product: 'White bread', price: 60 },
      ],
    }
    const { id } = await saveDraft(draft)
    const items = await db.items.where('expenseId').equals(id).toArray()
    expect(items.map((i) => i.effective).sort()).toEqual([70, 70])
    expect(await db.products.count()).toBe(2)

    // User later recategorises milk; the next bill with the same printed name picks that up.
    const milk = (await db.products.toArray()).find((p) => p.name === 'Toned milk')!
    await db.products.update(milk.id, { categoryId: 'household' })
    const next = await applyLearning({
      ...emptyDraft(),
      items: [{ ...emptyItem('other'), name: 'AMUL TAAZA TONED MILK 500ML', product: 'Milk' }],
    })
    expect(next.items[0].product).toBe('Toned milk')
    expect(next.items[0].categoryId).toBe('household')
  })

  it('reuses an existing product by name instead of duplicating it', async () => {
    const base = { ...emptyDraft(), total: 50 }
    await saveDraft({ ...base, items: [{ ...emptyItem('groceries'), name: 'Onion 1kg', product: 'Onion', price: 50 }] })
    await saveDraft({ ...base, items: [{ ...emptyItem('groceries'), name: 'Pyaz', product: 'onion', price: 50 }] })
    expect(await db.products.count()).toBe(1)
  })

  it('does not keep receipt photos unless asked to', async () => {
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    const draft = { ...emptyDraft(), total: 95, newImages: [photo], items: [{ ...emptyItem('dining-out'), name: 'Parotta', price: 95 }] }

    const first = await saveDraft(draft)
    expect(first.warning).toBeUndefined()
    expect((await db.expenses.get(first.id))!.imageIds).toEqual([])
    expect(await db.images.count()).toBe(0)

    await setSetting('keepImages', '1')
    const second = await saveDraft({ ...draft, items: [{ ...emptyItem('dining-out'), name: 'Parotta', price: 95 }] })
    const [imageId] = (await db.expenses.get(second.id))!.imageIds
    const stored = await imageBlob((await db.images.get(imageId))!).arrayBuffer()
    expect([...new Uint8Array(stored)]).toEqual([1, 2, 3])
  })

  it('round-trips an edit and deletes cleanly', async () => {
    const { id } = await saveDraft({ ...emptyDraft(), merchant: 'Cafe', total: 200, items: [{ ...emptyItem('dining-out'), name: 'Coffee', price: 200 }] })
    const loaded = (await loadDraft(id))!
    await saveDraft({ ...loaded, total: 250, items: [...loaded.items, { ...emptyItem('dining-out'), name: 'Cake', price: 50 }] })
    expect(await db.items.where('expenseId').equals(id).count()).toBe(2)
    expect((await db.expenses.get(id))!.total).toBe(250)
    await deleteExpense(id)
    expect(await db.items.count()).toBe(0)
    expect(await db.expenses.count()).toBe(0)
  })
})
