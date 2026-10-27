import Dexie, { type EntityTable } from 'dexie'

export interface Category {
  id: string
  name: string
  emoji: string
  order: number
  archived?: boolean
}

export interface Fees {
  delivery: number
  packaging: number
  platform: number
  taxes: number
  tip: number
  other: number
  discount: number
}

export interface Expense {
  id: string
  /** Local date, YYYY-MM-DD. */
  date: string
  merchant: string
  /** Where it came from, e.g. "Swiggy", "Zomato", "Receipt", "Manual". */
  source: string
  /** What was actually paid. */
  total: number
  fees: Fees
  note: string
  imageIds: string[]
  createdAt: number
  updatedAt: number
}

export interface Item {
  id: string
  expenseId: string
  /** Line order within the bill. */
  position: number
  // Denormalized from the expense so item-level queries don't need a join.
  date: string
  merchant: string
  /** Name as printed on the bill. */
  name: string
  brand: string
  productId: string
  /** Number of packs/pieces bought. */
  quantity: number
  /** Size of one pack in `unit`, e.g. 500 with unit "g". Null when not applicable. */
  size: number | null
  unit: string | null
  /** Line total as billed (before fees/discounts). */
  price: number
  /** This item's share of the expense total, with fees and discounts spread proportionally. */
  effective: number
  categoryId: string
}

export interface Product {
  id: string
  name: string
  categoryId: string
  createdAt: number
}

/** Maps a normalized bill name to a product so future bills resolve consistently. */
export interface Alias {
  raw: string
  productId: string
}

export interface StoredImage {
  id: string
  blob: Blob
  createdAt: number
}

export interface Setting {
  key: string
  value: string
}

export const db = new Dexie('expense-tracker') as Dexie & {
  categories: EntityTable<Category, 'id'>
  expenses: EntityTable<Expense, 'id'>
  items: EntityTable<Item, 'id'>
  products: EntityTable<Product, 'id'>
  aliases: EntityTable<Alias, 'raw'>
  images: EntityTable<StoredImage, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  categories: 'id, order',
  expenses: 'id, date, merchant',
  items: 'id, expenseId, date, productId, categoryId',
  products: 'id, name',
  aliases: 'raw, productId',
  images: 'id',
  settings: 'key',
})

export const DEFAULT_CATEGORIES: Omit<Category, 'order'>[] = [
  { id: 'food-delivery', name: 'Food delivery', emoji: '🛵' },
  { id: 'dining-out', name: 'Dining out', emoji: '🍽️' },
  { id: 'groceries', name: 'Groceries', emoji: '🛒' },
  { id: 'household', name: 'Household', emoji: '🧹' },
  { id: 'personal-care', name: 'Personal care', emoji: '🧴' },
  { id: 'health', name: 'Health', emoji: '💊' },
  { id: 'transport', name: 'Transport', emoji: '🚕' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️' },
  { id: 'bills', name: 'Bills & utilities', emoji: '💡' },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎬' },
  { id: 'travel', name: 'Travel', emoji: '✈️' },
  { id: 'other', name: 'Other', emoji: '📦' },
]

export const FALLBACK_CATEGORY_ID = 'other'

db.on('populate', async (tx) => {
  await tx.table('categories').bulkAdd(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i })))
})

export const emptyFees = (): Fees => ({
  delivery: 0,
  packaging: 0,
  platform: 0,
  taxes: 0,
  tip: 0,
  other: 0,
  discount: 0,
})

export const newId = () => crypto.randomUUID()

export async function getSetting(key: string): Promise<string | undefined> {
  return (await db.settings.get(key))?.value
}

export async function setSetting(key: string, value: string) {
  await db.settings.put({ key, value })
}
