import {
  db,
  emptyFees,
  newId,
  FALLBACK_CATEGORY_ID,
  type Expense,
  type Fees,
  type Item,
  type Product,
} from '../db'
import { nameKey, round2, todayIso } from './format'

export interface DraftItem {
  /** Stable key for React lists; the saved item id when editing. */
  key: string
  name: string
  brand: string
  /** Canonical product name, e.g. "Toned milk". */
  product: string
  quantity: number
  size: number | null
  unit: string | null
  price: number
  categoryId: string
  /** Gemini couldn't read this line clearly. Not saved. */
  unclear?: boolean
}

export interface Draft {
  /** Set when editing an existing expense. */
  id?: string
  date: string
  merchant: string
  source: string
  total: number
  fees: Fees
  note: string
  /** Images already saved (when editing). */
  imageIds: string[]
  /** Newly attached images, saved on submit. */
  newImages: Blob[]
  items: DraftItem[]
  /** Things to double-check before saving, e.g. "No date on the bill". Not saved. */
  warnings?: string[]
}

export const FEE_LABELS: Record<keyof Fees, string> = {
  delivery: 'Delivery',
  packaging: 'Packaging',
  platform: 'Platform fee',
  taxes: 'Taxes',
  tip: 'Tip',
  other: 'Other charges',
  discount: 'Discount',
}

export function emptyItem(categoryId = FALLBACK_CATEGORY_ID): DraftItem {
  return {
    key: newId(),
    name: '',
    brand: '',
    product: '',
    quantity: 1,
    size: null,
    unit: null,
    price: 0,
    categoryId,
  }
}

export function emptyDraft(source = 'Manual'): Draft {
  return {
    date: todayIso(),
    merchant: '',
    source,
    total: 0,
    fees: emptyFees(),
    note: '',
    imageIds: [],
    newImages: [],
    items: [emptyItem()],
  }
}

export const itemsSubtotal = (items: Pick<DraftItem, 'price'>[]) => round2(items.reduce((s, i) => s + (i.price || 0), 0))

/** Charges minus discount. */
export function netFees(f: Fees) {
  return round2(f.delivery + f.packaging + f.platform + f.taxes + f.tip + f.other - f.discount)
}

/** What the total should be if items and fees were read correctly. */
export const expectedTotal = (d: Pick<Draft, 'items' | 'fees'>) => round2(itemsSubtotal(d.items) + netFees(d.fees))

/** Difference between the stated total and items + fees. Non-zero means something was misread. */
export const totalMismatch = (d: Pick<Draft, 'items' | 'fees' | 'total'>) => round2(d.total - expectedTotal(d))

/**
 * Spreads `total` across items in proportion to their price, so fees and discounts
 * land on the items that caused them and per-category sums equal what was paid.
 */
export function allocate(prices: number[], total: number): number[] {
  if (prices.length === 0) return []
  const sum = prices.reduce((s, p) => s + p, 0)
  const raw = sum > 0 ? prices.map((p) => (p / sum) * total) : prices.map(() => total / prices.length)
  const rounded = raw.map(round2)
  // Put the rounding remainder on the largest share so the parts add up exactly.
  const drift = round2(total - rounded.reduce((s, x) => s + x, 0))
  if (drift !== 0) {
    const largest = rounded.indexOf(Math.max(...rounded))
    rounded[largest] = round2(rounded[largest] + drift)
  }
  return rounded
}

/** Problems that block saving. */
export function validate(d: Draft): string[] {
  const errors: string[] = []
  const items = d.items.filter((i) => i.name.trim() || i.price)
  if (items.length === 0) errors.push('Add at least one item.')
  if (items.some((i) => !i.name.trim())) errors.push('Every item needs a name.')
  if (!(d.total > 0)) errors.push('Total must be more than zero.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) errors.push('Pick a date.')
  return errors
}

/**
 * Applies what was learned from earlier bills: a bill name seen before maps to the same
 * product and that product's (possibly user-corrected) category.
 */
export async function applyLearning(d: Draft): Promise<Draft> {
  const items = await Promise.all(
    d.items.map(async (item) => {
      const alias = await db.aliases.get(nameKey(item.name))
      let product: Product | undefined = alias ? await db.products.get(alias.productId) : undefined
      if (!product && item.product) product = await findProductByName(item.product)
      if (!product) return item
      return { ...item, product: product.name, categoryId: product.categoryId || item.categoryId }
    }),
  )
  return { ...d, items }
}

async function findProductByName(name: string) {
  const key = nameKey(name)
  if (!key) return undefined
  return db.products.filter((p) => nameKey(p.name) === key).first()
}

/** Writes the draft (new or edited) and updates learned products. Returns the expense id. */
export async function saveDraft(d: Draft): Promise<string> {
  const items = d.items.filter((i) => i.name.trim() || i.price)
  const now = Date.now()
  const expenseId = d.id ?? newId()

  return db.transaction('rw', [db.expenses, db.items, db.products, db.aliases, db.images], async () => {
    const newImageIds: string[] = []
    for (const blob of d.newImages) {
      const id = newId()
      await db.images.add({ id, blob, createdAt: now })
      newImageIds.push(id)
    }

    const existing = d.id ? await db.expenses.get(d.id) : undefined
    const expense: Expense = {
      id: expenseId,
      date: d.date,
      merchant: d.merchant.trim(),
      source: d.source.trim() || 'Manual',
      total: round2(d.total),
      fees: d.fees,
      note: d.note.trim(),
      imageIds: [...d.imageIds, ...newImageIds],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.expenses.put(expense)

    const effective = allocate(
      items.map((i) => i.price || 0),
      expense.total,
    )
    await db.items.where('expenseId').equals(expenseId).delete()
    for (const [idx, item] of items.entries()) {
      const productId = await resolveProduct(item, now)
      const row: Item = {
        id: item.key,
        expenseId,
        position: idx,
        date: expense.date,
        merchant: expense.merchant,
        name: item.name.trim(),
        brand: item.brand.trim(),
        productId,
        quantity: item.quantity > 0 ? item.quantity : 1,
        size: item.size && item.size > 0 ? item.size : null,
        unit: item.unit || null,
        price: round2(item.price || 0),
        effective: effective[idx],
        categoryId: item.categoryId || FALLBACK_CATEGORY_ID,
      }
      await db.items.put(row)
    }

    // Drop images the user removed while editing.
    if (existing) {
      const removed = existing.imageIds.filter((id) => !expense.imageIds.includes(id))
      await db.images.bulkDelete(removed)
    }
    return expenseId
  })
}

/** Finds or creates the product for an item and remembers the bill name → product mapping. */
async function resolveProduct(item: DraftItem, now: number): Promise<string> {
  const productName = (item.product || item.name).trim()
  let product = await findProductByName(productName)
  if (!product) {
    const alias = await db.aliases.get(nameKey(item.name))
    // Only reuse an alias when the user didn't type a different product name.
    if (alias && !item.product) product = await db.products.get(alias.productId)
  }
  if (!product) {
    product = { id: newId(), name: productName, categoryId: item.categoryId, createdAt: now }
    await db.products.add(product)
  } else if (product.categoryId !== item.categoryId) {
    // The latest choice wins, so corrections stick for next time.
    await db.products.update(product.id, { categoryId: item.categoryId })
  }
  const raw = nameKey(item.name)
  if (raw) await db.aliases.put({ raw, productId: product.id })
  return product.id
}

export async function loadDraft(expenseId: string): Promise<Draft | undefined> {
  const e = await db.expenses.get(expenseId)
  if (!e) return undefined
  const items = (await db.items.where('expenseId').equals(expenseId).toArray()).sort((a, b) => a.position - b.position)
  const products = await db.products.bulkGet(items.map((i) => i.productId))
  return {
    id: e.id,
    date: e.date,
    merchant: e.merchant,
    source: e.source,
    total: e.total,
    fees: { ...emptyFees(), ...e.fees },
    note: e.note,
    imageIds: e.imageIds,
    newImages: [],
    items: items.map((i, idx) => ({
      key: i.id,
      name: i.name,
      brand: i.brand,
      product: products[idx]?.name ?? '',
      quantity: i.quantity,
      size: i.size,
      unit: i.unit,
      price: i.price,
      categoryId: i.categoryId,
    })),
  }
}

export async function deleteExpense(expenseId: string) {
  await db.transaction('rw', [db.expenses, db.items, db.images], async () => {
    const e = await db.expenses.get(expenseId)
    if (!e) return
    await db.images.bulkDelete(e.imageIds)
    await db.items.where('expenseId').equals(expenseId).delete()
    await db.expenses.delete(expenseId)
  })
}
