import { db, emptyFees, getSetting, newId, FALLBACK_CATEGORY_ID, type Category, type Fees } from '../db'
import { blobToBase64 } from './image'
import { emptyDraft, expectedTotal, itemsSubtotal, type Draft, type DraftItem } from './draft'
import { round2, todayIso, toIsoDate } from './format'
import { parseUnit } from './units'

const API = 'https://generativelanguage.googleapis.com/v1beta'
// On the free tier the newer Flash models are often overloaded (503s, 429s or requests that hang).
// Flash-Lite answers in a few seconds and read real bills as accurately in testing, so it leads.
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash']
const ATTEMPT_TIMEOUT_MS = 60_000
/** How long to wait on a slow model before also asking the next one. */
const HEDGE_MS = 15_000

export class GeminiError extends Error {}

/** Shape Gemini is asked to return. */
interface Extraction {
  source: string
  merchant: string
  /** Date parts as printed; year is null when the bill shows only day and month ("Sept 4"). */
  day: number | null
  month: number | null
  year: number | null
  items: {
    name: string
    brand: string | null
    product: string
    quantity: number
    size: number | null
    unit: string | null
    price: number
    category: string
    unclear?: boolean
  }[]
  fees: Fees
  total: number
  note: string | null
}

const num = { type: 'NUMBER' }
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    source: { type: 'STRING', description: 'Swiggy, Zomato, Instamart, Zepto, Blinkit, BigBasket, Amazon, Receipt, Manual, or another app name' },
    merchant: { type: 'STRING', description: 'Restaurant, shop or payee name. Not the delivery app.' },
    day: { type: 'INTEGER', nullable: true, description: 'Day of month of the purchase/order, or null if no date is shown' },
    month: { type: 'INTEGER', nullable: true, description: '1-12, or null if no date is shown' },
    year: { type: 'INTEGER', nullable: true, description: 'Only if the year is printed (e.g. 26 or 2026); otherwise null' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Item name as printed' },
          brand: { type: 'STRING', nullable: true },
          product: { type: 'STRING', description: 'Generic product name without brand or size, e.g. "Toned milk", "Basmati rice", "Paneer butter masala"' },
          quantity: { type: 'NUMBER', description: 'Number of packs/pieces/plates bought' },
          size: { type: 'NUMBER', nullable: true, description: 'Size of ONE pack in unit, e.g. 500 for a 500 g pack' },
          unit: { type: 'STRING', nullable: true, enum: ['g', 'kg', 'ml', 'l', 'pc', 'dozen'] },
          price: { type: 'NUMBER', description: 'Line total for this item before fees, in rupees' },
          category: { type: 'STRING' },
          unclear: { type: 'BOOLEAN', description: 'True if the name, quantity or price was hard to read or guessed' },
        },
        required: ['name', 'brand', 'product', 'quantity', 'size', 'unit', 'price', 'category', 'unclear'],
        propertyOrdering: ['name', 'brand', 'product', 'quantity', 'size', 'unit', 'price', 'category', 'unclear'],
      },
    },
    fees: {
      type: 'OBJECT',
      properties: { delivery: num, packaging: num, platform: num, taxes: num, tip: num, other: num, discount: num },
      required: ['delivery', 'packaging', 'platform', 'taxes', 'tip', 'other', 'discount'],
    },
    total: { type: 'NUMBER', description: 'Final amount paid' },
    note: { type: 'STRING', nullable: true },
  },
  required: ['source', 'merchant', 'day', 'month', 'year', 'items', 'fees', 'total', 'note'],
  propertyOrdering: ['source', 'merchant', 'day', 'month', 'year', 'items', 'fees', 'total', 'note'],
}

function buildPrompt(categories: Category[], knownProducts: string[], input: 'images' | 'text') {
  const what =
    input === 'images'
      ? 'The image(s) show one purchase: a food/grocery delivery order screenshot (Swiggy, Zomato, Instamart, Zepto, Blinkit, etc.), a shop receipt photo, or a bill. Several images are parts of the SAME order (e.g. a long screenshot split in two) - combine them and do not double count.'
      : 'The text is a quick note the user typed about something they paid for, e.g. "auto to office 120" or "milk 2L 68, bread 45 at More". Source is "Manual" unless the text names an app.'
  return `You extract expenses for a personal expense tracker in India. Amounts are in rupees.
Today is ${todayIso()}.

${what}

Rules:
- One entry per distinct line item. Use the line total as price (quantity × unit price). Leave the quantity out of name ("Dragon Chicken x 1" → "Dragon Chicken").
- quantity is how many packs/pieces/plates; size + unit describe ONE pack ("Amul Taaza 500 ml × 2" → quantity 2, size 500, unit "ml"). For loose produce sold by weight ("Onion 1.2 kg"), use quantity 1, size 1.2, unit "kg". For dishes and things without a size, use unit "pc" and size null.
- product is a short generic name so the same thing can be compared across shops and brands. Reuse one of the known products below when it is the same thing.
- category must be exactly one of: ${categories.map((c) => c.name).join(', ')}.
  Restaurant food ordered via an app is "Food delivery"; groceries from quick-commerce apps are "Groceries" (or Household / Personal care for non-food items).
- fees: delivery, packaging, platform/convenience fees, taxes, tip, other charges (including a positive round-off), and discount (coupons, offers, savings, a negative round-off - as a positive number). Use 0 when absent or waived (a struck-out fee marked FREE is 0). Do not count fees as items.
- total is what was actually paid (grand total / "paid" / "to pay").
- Date: Indian bills print dates as DD/MM/YY or DD/MM/YYYY (19/09/26 is 19 September 2026). Give day and month even when the year is missing ("Order delivered on September 4" → day 4, month 9, year null).
- merchant is the restaurant or store, not the delivery app.
- unclear: true for any item whose name, quantity or price you had to guess (blurry, cut off, covered by a finger). Otherwise false.
- note: anything else worth flagging (e.g. "image cut off, total not visible"), else null.

Known products: ${knownProducts.length ? knownProducts.join(', ') : '(none yet)'}`
}

export interface ExtractResult {
  draft: Draft
  /** Model that actually answered (may be a fallback). */
  model: string
}

/**
 * Asks the chosen model first. If it errors as busy, the next model is tried at once; if it is
 * merely slow, the next model is started alongside it after HEDGE_MS and the first answer wins.
 */
function callGemini(parts: unknown[]): Promise<{ extraction: Extraction; model: string }> {
  return (async () => {
    const apiKey = await getSetting('geminiApiKey')
    if (!apiKey) throw new GeminiError('Add your Gemini API key in Settings first.')
    const chosen = (await getSetting('geminiModel')) || DEFAULT_MODEL
    const models = [...new Set([chosen, ...FALLBACK_MODELS])]

    return new Promise<{ extraction: Extraction; model: string }>((resolve, reject) => {
      const controllers: AbortController[] = []
      const timers: ReturnType<typeof setTimeout>[] = []
      let next = 0
      let running = 0
      let done = false
      let lastError: GeminiError | undefined

      const finish = () => {
        done = true
        timers.forEach(clearTimeout)
        controllers.forEach((c) => c.abort())
      }

      const launch = () => {
        if (done || next >= models.length) return
        const model = models[next++]
        const controller = new AbortController()
        controllers.push(controller)
        running++
        const hedge = setTimeout(launch, HEDGE_MS)
        timers.push(hedge)
        callModel(model, apiKey, parts, controller).then(
          (extraction) => {
            if (done) return
            finish()
            resolve({ extraction, model })
          },
          (err: unknown) => {
            running--
            clearTimeout(hedge)
            if (done) return
            if (!(err instanceof BusyError)) {
              finish()
              reject(err)
              return
            }
            lastError = err
            if (next < models.length) launch()
            else if (running === 0) {
              finish()
              reject(lastError)
            }
          },
        )
      }
      launch()
    })
  })()
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

/** The model is temporarily unavailable; another model may work. */
class BusyError extends GeminiError {}

async function callModel(model: string, apiKey: string, parts: unknown[], controller: AbortController): Promise<Extraction> {
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, ATTEMPT_TIMEOUT_MS)
  let res: Response
  let body: GeminiResponse | null
  try {
    res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
      signal: controller.signal,
    })
    body = await res.json().catch(() => null)
  } catch (err) {
    if (timedOut) throw new BusyError(`Gemini took too long to answer. Try again in a minute.`)
    if (controller.signal.aborted) throw new BusyError('Cancelled')
    throw new GeminiError(`Could not reach Gemini. Check your internet connection. (${(err as Error).message})`)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const msg: string = body?.error?.message ?? res.statusText
    if (res.status === 429) throw new BusyError(`Gemini free-tier limit reached. Wait a minute and try again.`)
    if (res.status === 503 || res.status === 500) throw new BusyError(`Gemini is overloaded right now. Try again in a minute.`)
    if (res.status === 404) throw new BusyError(`Model "${model}" isn't available for your key. Pick another one in Settings.`)
    if (res.status === 400 && /api key/i.test(msg)) throw new GeminiError('Gemini rejected the API key. Check it in Settings.')
    if (res.status === 403) throw new GeminiError(`Gemini refused the request: ${msg}`)
    throw new GeminiError(`Gemini error (${res.status}): ${msg}`)
  }

  const candidate = body?.candidates?.[0]
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join('')
  if (!text) {
    const reason = candidate?.finishReason ?? body?.promptFeedback?.blockReason ?? 'empty response'
    throw new GeminiError(`Gemini returned nothing (${reason}). Try again or enter it manually.`)
  }
  try {
    return JSON.parse(text) as Extraction
  } catch {
    throw new GeminiError('Gemini returned something that is not valid JSON. Try again.')
  }
}

async function context() {
  const categories = (await db.categories.orderBy('order').toArray()).filter((c) => !c.archived)
  // Most recently created products first; enough to steer naming without bloating the prompt.
  const knownProducts = (await db.products.toArray())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 300)
    .map((p) => p.name)
  return { categories, knownProducts }
}

export async function extractFromImages(images: Blob[]): Promise<ExtractResult> {
  const { categories, knownProducts } = await context()
  const imageParts = await Promise.all(
    images.map(async (b) => ({ inlineData: { mimeType: b.type || 'image/jpeg', data: await blobToBase64(b) } })),
  )
  const { extraction, model } = await callGemini([...imageParts, { text: buildPrompt(categories, knownProducts, 'images') }])
  return { draft: { ...toDraft(extraction, categories, 'Receipt'), newImages: images }, model }
}

export async function extractFromText(text: string): Promise<ExtractResult> {
  const { categories, knownProducts } = await context()
  const { extraction, model } = await callGemini([
    { text: buildPrompt(categories, knownProducts, 'text') },
    { text: `Note: ${text}` },
  ])
  return { draft: toDraft(extraction, categories, 'Manual'), model }
}

const nonNeg = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? round2(n) : 0)

export function toDraft(x: Extraction, categories: Category[], fallbackSource: string): Draft {
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
  const fallbackCategory = categories.some((c) => c.id === FALLBACK_CATEGORY_ID)
    ? FALLBACK_CATEGORY_ID
    : (categories[0]?.id ?? FALLBACK_CATEGORY_ID)

  const items: DraftItem[] = (x.items ?? []).map((i) => {
    const unit = parseUnit(i.unit) ? i.unit!.toLowerCase() : null
    return {
      key: newId(),
      name: (i.name ?? '').trim(),
      brand: (i.brand ?? '').trim(),
      product: (i.product ?? '').trim(),
      quantity: nonNeg(i.quantity) || 1,
      size: unit && unit !== 'pc' ? nonNeg(i.size) || null : null,
      unit,
      price: nonNeg(i.price),
      categoryId: byName.get((i.category ?? '').toLowerCase()) ?? fallbackCategory,
      unclear: !!i.unclear,
    }
  })

  const fees = emptyFees()
  for (const k of Object.keys(fees) as (keyof Fees)[]) fees[k] = nonNeg(x.fees?.[k])
  const total = nonNeg(x.total)
  // GST-inclusive bills: if the items alone make up the total, any listed tax is already in the prices.
  if (items.length && Math.abs(itemsSubtotal(items) - total) < 1 && Math.abs(expectedTotal({ items, fees }) - total) >= 1) {
    Object.assign(fees, emptyFees())
  }

  const base = emptyDraft(x.source?.trim() || fallbackSource)
  const date = resolveDate(x.day, x.month, x.year)
  const merchant = (x.merchant ?? '').trim()
  const warnings = [
    !date && "No date found on the bill, so it's set to today.",
    !merchant && fallbackSource !== 'Manual' && "Couldn't read the shop or restaurant name.",
    !total && "Couldn't find the total.",
    items.length === 0 && 'No items found.',
  ].filter((w): w is string => !!w)
  return {
    ...base,
    date: date ?? base.date,
    merchant,
    warnings,
    total,
    fees,
    note: (x.note ?? '').trim(),
    items: items.length ? items : base.items,
  }
}

export interface ModelInfo {
  id: string
  displayName: string
}

/** Models this key can call with generateContent. Also serves as an API key check. */
export async function listModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new GeminiError(body?.error?.message ?? `HTTP ${res.status}`)
  return (body.models ?? [])
    .filter(
      (m: { name: string; supportedGenerationMethods?: string[] }) =>
        m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'),
    )
    .map((m: { name: string; displayName?: string }) => ({
      id: m.name.replace(/^models\//, ''),
      displayName: m.displayName ?? m.name,
    }))
}

/**
 * Builds a YYYY-MM-DD date from the printed parts. When the year isn't printed, uses the most
 * recent occurrence of that day and month that isn't in the future. Rejects impossible or
 * future dates (usually a misread), so the caller falls back to today.
 */
export function resolveDate(
  day: number | null | undefined,
  month: number | null | undefined,
  year: number | null | undefined,
  today = todayIso(),
): string | null {
  if (!day || !month || month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = (y: number) => {
    const d = new Date(y, month - 1, day)
    // Date rolls 31 Feb over into March; treat that as invalid.
    return d.getMonth() === month - 1 ? toIsoDate(d) : null
  }
  if (year) {
    const full = year < 100 ? 2000 + year : year
    const date = iso(full)
    return date && date <= today ? date : null
  }
  const thisYear = Number(today.slice(0, 4))
  const candidate = iso(thisYear)
  return candidate && candidate <= today ? candidate : iso(thisYear - 1)
}
