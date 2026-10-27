import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, setSetting } from '../../db'
import { extractFromText } from '../gemini'

const answer = {
  source: 'Manual', merchant: '', day: null, month: null, year: null,
  items: [{ name: 'Auto', brand: null, product: 'Auto ride', quantity: 1, size: null, unit: 'pc', price: 120, category: 'Transport' }],
  fees: { delivery: 0, packaging: 0, platform: 0, taxes: 0, tip: 0, other: 0, discount: 0 }, total: 120, note: null,
}
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }))
const status = (code: number, message = 'x') => new Response(JSON.stringify({ error: { message } }), { status: code })
/** Never answers until aborted, like an overloaded model. */
const hang = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))

function mockFetch(byModel: Record<string, (init?: RequestInit) => Promise<Response> | Response>) {
  const calls: string[] = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const model = /models\/([^:]+):/.exec(url)![1]
    calls.push(model)
    return Promise.resolve(byModel[model](init))
  })
  return calls
}

describe('model fallback', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await setSetting('geminiApiKey', 'test')
    await setSetting('geminiModel', 'gemini-3.8-flash')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('moves on immediately when a model is overloaded', async () => {
    const calls = mockFetch({ 'gemini-3.8-flash': () => status(503), 'gemini-3.5-flash': ok, 'gemini-3.5-flash-lite': ok })
    const r = await extractFromText('auto 120')
    expect(r.model).toBe('gemini-3.5-flash-lite')
    expect(r.draft.items[0].price).toBe(120)
    expect(calls).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite'])
  })

  it('starts the next model alongside a slow one and takes the first answer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const calls = mockFetch({ 'gemini-3.8-flash': hang, 'gemini-3.5-flash-lite': hang, 'gemini-3.5-flash': ok })
    const pending = extractFromText('auto 120')
    // Database reads use real async scheduling, so wait for each request before moving the clock.
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(15_000)
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    await vi.advanceTimersByTimeAsync(15_000)
    const r = await pending
    expect(r.model).toBe('gemini-3.5-flash')
    expect(calls).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'])
  })

  it('does not fall back on a bad API key', async () => {
    const calls = mockFetch({ 'gemini-3.8-flash': () => status(400, 'API key not valid'), 'gemini-3.5-flash-lite': ok })
    await expect(extractFromText('auto 120')).rejects.toThrow(/API key/)
    expect(calls).toEqual(['gemini-3.8-flash'])
  })

  it('reports busy when every model fails', async () => {
    mockFetch({ 'gemini-3.8-flash': () => status(503), 'gemini-3.5-flash': () => status(429), 'gemini-3.5-flash-lite': () => status(503) })
    await expect(extractFromText('auto 120')).rejects.toThrow(/overloaded|limit/)
  })
})
