import { useState } from 'react'
import { setSetting } from '../db'
import { listModels } from '../lib/gemini'

/** Paste-and-check field for the Gemini API key. Calls onSaved once the key is verified and stored. */
export function GeminiKeyInput({ onSaved, buttonLabel = 'Save key' }: { onSaved?: () => void; buttonLabel?: string }) {
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    const k = key.trim()
    if (!k) return
    setChecking(true)
    setError('')
    try {
      await listModels(k)
      await setSetting('geminiApiKey', k)
      onSaved?.()
    } catch (err) {
      setError(`That key didn't work: ${(err as Error).message}`)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="field">
        <span>Gemini API key</span>
        <input
          className="input"
          type="password"
          autoComplete="off"
          placeholder="Paste it here"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <button className="btn btn-filled" disabled={!key.trim() || checking} onClick={save}>
        {checking ? 'Checking…' : buttonLabel}
      </button>
      {error && <div className="error">{error}</div>}
      <span className="small muted">
        Get one free at{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          aistudio.google.com/apikey
        </a>
        . It stays on this device.
      </span>
    </div>
  )
}
