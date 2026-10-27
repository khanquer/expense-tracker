import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ExpenseForm } from '../components/ExpenseForm'
import { GeminiKeyInput } from '../components/GeminiKeyInput'
import { AddOptions } from '../components/AddOptions'
import { Icon } from '../components/Icon'
import { AppBar, haptic, toast, useObjectUrl } from '../components/ui'
import { db, getSetting } from '../db'
import { applyLearning, deleteExpense, emptyDraft, type Draft } from '../lib/draft'
import { extractFromImages, extractFromText, type ExtractResult } from '../lib/gemini'
import { compressImage } from '../lib/image'
import { takeFiles } from '../lib/inbox'
import { money } from '../lib/format'
import { SHARE_CACHE, SHARE_PREFIX } from '../share'

type State =
  | { step: 'choose' }
  | { step: 'note' }
  | { step: 'working'; what: string; image?: Blob }
  | { step: 'failed'; error: string; retry: () => void; fallback: Draft }
  | { step: 'needs-key'; images: Blob[] }
  | { step: 'review'; draft: Draft; fromAi: boolean; model?: string }

const NOTE_EXAMPLES = ['auto to office 120', 'milk 2L 68 and bread 45 at More', 'movie tickets 2 × 350']

export function Add() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode')
  const [state, setState] = useState<State>(() =>
    mode === 'note'
      ? { step: 'note' }
      : mode === 'manual'
        ? { step: 'review', draft: emptyDraft(), fromAi: false }
        : mode === 'images'
          ? { step: 'working', what: 'Preparing…' }
          : { step: 'choose' },
  )
  const [text, setText] = useState('')
  const hasKey = useLiveQuery(async () => !!(await db.settings.get('geminiApiKey')), [], true)
  const started = useRef(false)
  const shareHandled = useRef(false)

  // Back to wherever the user came from; straight to Home when the app was opened on this screen (a share).
  const leave = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/', { replace: true }))

  const review = (draft: Draft) => setState({ step: 'review', draft, fromAi: false })

  const reviewAi = async ({ draft, model }: ExtractResult) => {
    const learned = await applyLearning(draft)
    // Gemini's remarks go in the "please check" list rather than into the user's note.
    const warnings = [...(draft.warnings ?? []), ...(draft.note ? [draft.note] : [])]
    setState({ step: 'review', draft: { ...learned, note: '', warnings }, fromAi: true, model })
  }

  const readImages = async (images: Blob[]) => {
    const run = async () => {
      setState({ step: 'working', what: images.length > 1 ? `Reading ${images.length} images…` : 'Reading your receipt…', image: images[0] })
      try {
        await reviewAi(await extractFromImages(images))
      } catch (err) {
        setState({ step: 'failed', error: (err as Error).message, retry: run, fallback: { ...emptyDraft('Receipt'), newImages: images } })
      }
    }
    await run()
  }

  const fromImages = async (files: Blob[]) => {
    if (files.length === 0) return
    setState({ step: 'working', what: 'Preparing…' })
    let images: Blob[]
    try {
      images = await Promise.all(files.map(compressImage))
    } catch (err) {
      setState({ step: 'failed', error: `Couldn't open that image: ${(err as Error).message}`, retry: () => fromImages(files), fallback: emptyDraft() })
      return
    }
    // Checked at call time: the live query may not have loaded yet (e.g. right after a share).
    if (!(await getSetting('geminiApiKey'))) return setState({ step: 'needs-key', images })
    await readImages(images)
  }

  const fromText = async (note: string) => {
    if (!note.trim()) return
    const run = async () => {
      setState({ step: 'working', what: 'Filling in the details…' })
      try {
        await reviewAi(await extractFromText(note.trim()))
      } catch (err) {
        setState({ step: 'failed', error: (err as Error).message, retry: run, fallback: emptyDraft() })
      }
    }
    await run()
  }

  // Images picked in the add sheet.
  useEffect(() => {
    if (mode !== 'images' || started.current) return
    started.current = true
    const files = takeFiles()
    // Nothing to read if the page was reloaded after picking; offer the options again.
    if (files.length) void fromImages(files)
    else setState({ step: 'choose' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Files sent from the Android share sheet are parked in a cache by the service worker.
  useEffect(() => {
    if (params.get('shared') !== '1') {
      // Re-arm for the next share once this one's marker is cleared.
      shareHandled.current = false
      return
    }
    if (shareHandled.current) return
    shareHandled.current = true
    setParams({}, { replace: true })
    void (async () => {
      const cache = await caches.open(SHARE_CACHE)
      const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.includes(`/${SHARE_PREFIX}`))
      const files: Blob[] = []
      let sharedText = ''
      for (const req of keys) {
        const res = await cache.match(req)
        if (!res) continue
        if (req.url.endsWith(`${SHARE_PREFIX}text`)) sharedText = await res.text()
        else files.push(await res.blob())
        await cache.delete(req)
      }
      if (files.length) await fromImages(files)
      else if (sharedText) {
        setText(sharedText)
        setState({ step: 'note' })
      }
    })()
    // Runs once per share; fromImages reads the latest state on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  if (state.step === 'review') {
    return (
      <ExpenseForm
        initial={state.draft}
        title={state.fromAi ? 'Check & save' : 'New expense'}
        summaryFirst={state.fromAi}
        note={
          state.fromAi && (
            <div className="row small muted">
              <Icon name="sparkle" size={16} /> Read by {state.model ?? 'Gemini'} · corrections are remembered
            </div>
          )
        }
        onSaved={(id, total, warning) => {
          haptic()
          toast(warning ?? `Saved ${money(total)}`, { label: 'Undo', run: () => void deleteExpense(id) })
          leave()
        }}
        onCancel={leave}
      />
    )
  }

  if (state.step === 'working') {
    return (
      <div className="screen">
        <AppBar title="" back={leave} />
        <Reading what={state.what} image={state.image} />
      </div>
    )
  }

  if (state.step === 'failed') {
    return (
      <div className="screen">
        <AppBar title="Couldn't read it" back={leave} />
        <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: '28px 20px' }}>
          <span className="badge badge-warn" style={{ width: 56, height: 56 }}>
            <Icon name="alert" size={28} />
          </span>
          <span>{state.error}</span>
          <div className="row" style={{ width: '100%', marginTop: 8 }}>
            <button className="btn btn-tonal grow" onClick={() => review(state.fallback)}>
              Enter manually
            </button>
            <button className="btn btn-filled grow" onClick={state.retry}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (state.step === 'needs-key') {
    return (
      <div className="screen">
        <AppBar title="One-time setup" back={leave} />
        <div className="card stack">
          <span className="badge badge-accent" style={{ width: 52, height: 52 }}>
            <Icon name="sparkle" size={26} />
          </span>
          <h2 style={{ fontSize: '1.2rem' }}>Let Gemini read your receipts</h2>
          <span className="muted">Add your free Gemini key once, and photos and screenshots are filled in for you.</span>
          <GeminiKeyInput buttonLabel="Save key & read receipt" onSaved={() => readImages(state.images)} />
        </div>
        <button className="btn btn-text" onClick={() => review({ ...emptyDraft('Receipt'), newImages: state.images })}>
          Enter it by hand instead
        </button>
      </div>
    )
  }

  if (state.step === 'note') {
    return (
      <div className="screen with-bar">
        <AppBar title="Quick note" back={leave} />
        {!hasKey ? (
          <div className="card stack">
            <span className="muted">Quick notes need a free Gemini key to turn your words into an expense.</span>
            <GeminiKeyInput />
          </div>
        ) : (
          <>
            <textarea
              className="input"
              rows={4}
              autoFocus
              placeholder="What did you pay for?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ fontSize: '1.15rem', background: 'var(--surface)', boxShadow: 'var(--shadow)', borderRadius: 'var(--r-card)' }}
            />
            <div className="chips">
              {NOTE_EXAMPLES.map((ex) => (
                <button key={ex} className="chip" onClick={() => setText(ex)}>
                  {ex}
                </button>
              ))}
            </div>
            <span className="small muted">Mention amounts, and the shop if you like. One note becomes one expense.</span>
            <div className="action-bar">
              <button className="btn btn-filled" disabled={!text.trim()} onClick={() => fromText(text)}>
                <Icon name="sparkle" size={18} /> Fill in
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="screen">
      <AppBar title="Add an expense" back={leave} />
      <div className="group">
        <AddOptions onFiles={(files) => void fromImages(files)} onMode={(m) => (m === 'note' ? setState({ step: 'note' }) : review(emptyDraft()))} />
      </div>
      <p className="small muted" style={{ padding: '0 4px' }}>
        Tip: after taking a screenshot, tap <b>Share</b> and pick <b>Expenses</b> to send it straight here.
      </p>
    </div>
  )
}

function Reading({ what, image }: { what: string; image?: Blob }) {
  const url = useObjectUrl(image)
  return (
    <div className="reading" aria-live="polite">
      {image ? (
        <div className="scan">
          {url && <img src={url} alt="" />}
        </div>
      ) : (
        <span className="reading-icon">
          <Icon name="sparkle" size={34} />
        </span>
      )}
      <div className="stack" style={{ gap: 4 }}>
        <strong style={{ fontSize: '1.15rem' }}>{what}</strong>
        <span className="muted small">Usually takes a few seconds</span>
      </div>
    </div>
  )
}
