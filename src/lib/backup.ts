import { db } from '../db'
import { blobToBase64 } from './image'
import { todayIso } from './format'

const FORMAT = 'expense-tracker-backup'
const VERSION = 1

/** Everything except the API key, optionally with receipt images. */
export async function exportBackup(includeImages: boolean): Promise<Blob> {
  const [categories, expenses, items, products, aliases, settings] = await Promise.all([
    db.categories.toArray(),
    db.expenses.toArray(),
    db.items.toArray(),
    db.products.toArray(),
    db.aliases.toArray(),
    db.settings.toArray(),
  ])
  const images = includeImages
    ? await Promise.all(
        (await db.images.toArray()).map(async (i) => ({
          id: i.id,
          type: i.blob.type,
          data: await blobToBase64(i.blob),
          createdAt: i.createdAt,
        })),
      )
    : []
  const data = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    categories,
    expenses,
    items,
    products,
    aliases,
    settings: settings.filter((s) => s.key !== 'geminiApiKey'),
    images,
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

export function backupFileName() {
  return `expenses-${todayIso()}.json`
}

/** Replaces all data with the backup's contents. Keeps the current API key. */
export async function importBackup(file: Blob) {
  const data = JSON.parse(await file.text())
  if (data?.format !== FORMAT) throw new Error('This is not an expense tracker backup file.')

  const images = (data.images ?? []).map((i: { id: string; type: string; data: string; createdAt: number }) => ({
    id: i.id,
    blob: new Blob([Uint8Array.from(atob(i.data), (c) => c.charCodeAt(0))], { type: i.type }),
    createdAt: i.createdAt,
  }))

  await db.transaction(
    'rw',
    [db.categories, db.expenses, db.items, db.products, db.aliases, db.images, db.settings],
    async () => {
      const apiKey = await db.settings.get('geminiApiKey')
      await Promise.all([
        db.categories.clear(),
        db.expenses.clear(),
        db.items.clear(),
        db.products.clear(),
        db.aliases.clear(),
        db.images.clear(),
        db.settings.clear(),
      ])
      await db.categories.bulkAdd(data.categories ?? [])
      await db.expenses.bulkAdd(data.expenses ?? [])
      await db.items.bulkAdd(data.items ?? [])
      await db.products.bulkAdd(data.products ?? [])
      await db.aliases.bulkAdd(data.aliases ?? [])
      await db.images.bulkAdd(images)
      await db.settings.bulkAdd(data.settings ?? [])
      if (apiKey) await db.settings.put(apiKey)
    },
  )
}

/** Items as CSV, for spreadsheets. */
export async function exportCsv(): Promise<Blob> {
  const [items, expenses, products, categories] = await Promise.all([
    db.items.orderBy('date').toArray(),
    db.expenses.toArray(),
    db.products.toArray(),
    db.categories.toArray(),
  ])
  const exp = new Map(expenses.map((e) => [e.id, e]))
  const prod = new Map(products.map((p) => [p.id, p.name]))
  const cat = new Map(categories.map((c) => [c.id, c.name]))
  const header = ['date', 'merchant', 'source', 'item', 'product', 'brand', 'category', 'quantity', 'size', 'unit', 'price', 'effective_price', 'bill_total']
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = items.map((i) =>
    [
      i.date,
      i.merchant,
      exp.get(i.expenseId)?.source,
      i.name,
      prod.get(i.productId),
      i.brand,
      cat.get(i.categoryId),
      i.quantity,
      i.size,
      i.unit,
      i.price,
      i.effective,
      exp.get(i.expenseId)?.total,
    ]
      .map(esc)
      .join(','),
  )
  return new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv' })
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
