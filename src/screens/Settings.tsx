import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, setSetting, type Category } from '../db'
import { useCategories } from '../hooks'
import { DEFAULT_MODEL, listModels, type ModelInfo } from '../lib/gemini'
import { backupFileName, download, exportBackup, exportCsv, importBackup } from '../lib/backup'
import { formatDate, todayIso } from '../lib/format'
import { GeminiKeyInput } from '../components/GeminiKeyInput'
import { Icon, type IconName } from '../components/Icon'
import { AppBar, Badge, ConfirmSheet, SectionLabel, Sheet, Switch, toast } from '../components/ui'

export function Settings() {
  return (
    <div className="screen">
      <AppBar title="Settings" large />
      <ReadingSettings />
      <CategorySettings />
      <DataSettings />
      <SectionLabel>About</SectionLabel>
      <div className="group">
        <Row icon="phone" title="Install on your phone" sub="Chrome menu ⋮ → Add to Home screen. Then share screenshots straight to Expenses." />
      </div>
    </div>
  )
}

function Row({
  icon,
  title,
  sub,
  onClick,
  end,
  tone,
}: {
  icon: IconName
  title: string
  sub?: React.ReactNode
  onClick?: () => void
  end?: React.ReactNode
  tone?: 'accent' | 'warn'
}) {
  const content = (
    <>
      <Badge tone={tone ?? 'accent'}>
        <Icon name={icon} size={20} />
      </Badge>
      <span className="grow row-text">
        <span className="row-title">{title}</span>
        {sub && <span className="row-sub" style={{ whiteSpace: 'normal' }}>{sub}</span>}
      </span>
      {end ?? (onClick && <Icon name="chevronRight" size={20} className="chev" />)}
    </>
  )
  return onClick ? (
    <button className="row-item pressable" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="row-item">{content}</div>
  )
}

function ReadingSettings() {
  const savedKey = useLiveQuery(async () => (await db.settings.get('geminiApiKey'))?.value ?? '', [])
  const savedModel = useLiveQuery(async () => (await db.settings.get('geminiModel'))?.value ?? DEFAULT_MODEL, [])
  const [keyOpen, setKeyOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [modelError, setModelError] = useState('')

  useEffect(() => {
    if (!modelOpen || !savedKey || models) return
    listModels(savedKey)
      .then(setModels)
      .catch((err) => setModelError((err as Error).message))
  }, [modelOpen, savedKey, models])

  return (
    <>
      <SectionLabel>Receipt reading</SectionLabel>
      <div className="group">
        <Row
          icon="key"
          title="Gemini API key"
          sub={savedKey ? <span style={{ color: 'var(--good)' }}>Connected</span> : 'Not set: tap to add your free key'}
          tone={savedKey ? 'accent' : 'warn'}
          onClick={() => setKeyOpen(true)}
        />
        <Row icon="sparkle" title="Model" sub={savedModel} onClick={() => setModelOpen(true)} />
      </div>

      <Sheet open={keyOpen} onClose={() => setKeyOpen(false)} title={savedKey ? 'Replace your Gemini key' : 'Add your Gemini key'}>
        <div style={{ padding: '0 8px' }}>
          <GeminiKeyInput
            onSaved={() => {
              setKeyOpen(false)
              toast('Gemini key saved')
            }}
          />
          {savedKey && (
            <button
              className="btn btn-text btn-block"
              style={{ color: 'var(--danger)', marginTop: 8 }}
              onClick={async () => {
                await db.settings.delete('geminiApiKey')
                setKeyOpen(false)
                toast('Gemini key removed')
              }}
            >
              Remove key
            </button>
          )}
        </div>
      </Sheet>

      <Sheet open={modelOpen} onClose={() => setModelOpen(false)} title="Model">
        <p className="sheet-text">
          {DEFAULT_MODEL} is fast and accurate on bills. If a model is busy, the app falls back to another automatically.
        </p>
        {!savedKey && <p className="sheet-text">Add your Gemini key first to see the available models.</p>}
        {modelError && <p className="sheet-text error">{modelError}</p>}
        {savedKey && !models && !modelError && <p className="sheet-text muted">Loading…</p>}
        <div className="sheet-list">
          {models
            ?.filter((m) => /flash|pro/.test(m.id) && !/tts|image|live|embedding|audio|robotics|computer|transcribe/.test(m.id))
            .map((m) => (
              <button
                key={m.id}
                className="row-item pressable"
                style={{ minHeight: 52 }}
                onClick={async () => {
                  await setSetting('geminiModel', m.id)
                  setModelOpen(false)
                }}
              >
                <span className="grow row-text">
                  <span className="row-title">{m.id}</span>
                  {m.id === DEFAULT_MODEL && <span className="row-sub">Recommended</span>}
                </span>
                {m.id === savedModel && <Icon name="check" size={22} className="chev" />}
              </button>
            ))}
        </div>
      </Sheet>
    </>
  )
}

function CategorySettings() {
  const categories = useCategories()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  return (
    <>
      <SectionLabel>Categories</SectionLabel>
      <div className="group">
        {categories.map((c) => (
          <button key={c.id} className="row-item pressable" style={{ minHeight: 56, opacity: c.archived ? 0.5 : 1 }} onClick={() => setEditing(c)}>
            <Badge>{c.emoji}</Badge>
            <span className="grow row-text">
              <span className="row-title">{c.name}</span>
              {c.archived && <span className="row-sub">Archived</span>}
            </span>
            <Icon name="chevronRight" size={20} className="chev" />
          </button>
        ))}
        <button className="row-item pressable" style={{ minHeight: 56 }} onClick={() => setEditing('new')}>
          <Badge tone="accent">
            <Icon name="plus" size={20} />
          </Badge>
          <span className="row-title" style={{ color: 'var(--accent)' }}>
            Add category
          </span>
        </button>
      </div>
      <CategorySheet category={editing} categories={categories} onClose={() => setEditing(null)} />
    </>
  )
}

function CategorySheet({ category, categories, onClose }: { category: Category | 'new' | null; categories: Category[]; onClose: () => void }) {
  const isNew = category === 'new'
  const [emoji, setEmoji] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    if (!category) return
    setEmoji(isNew ? '🏷️' : category.emoji)
    setName(isNew ? '' : category.name)
  }, [category, isNew])

  const index = isNew || !category ? -1 : categories.findIndex((c) => c.id === category.id)

  const save = async () => {
    if (!name.trim()) return
    if (isNew) {
      const order = Math.max(0, ...categories.map((c) => c.order)) + 1
      await db.categories.add({ id: newId(), name: name.trim(), emoji: emoji || '🏷️', order })
    } else if (category) {
      await db.categories.update(category.id, { name: name.trim(), emoji: emoji || category.emoji })
    }
    onClose()
  }

  const moveUp = async () => {
    const a = categories[index]
    const b = categories[index - 1]
    if (!a || !b) return
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(a.id, { order: b.order })
      await db.categories.update(b.id, { order: a.order })
    })
    onClose()
  }

  return (
    <Sheet open={!!category} onClose={onClose} title={isNew ? 'New category' : 'Edit category'}>
      <div className="stack" style={{ padding: '0 8px' }}>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <label className="field" style={{ width: 84, flex: 'none' }}>
            <span>Emoji</span>
            <input className="input" style={{ fontSize: '1.3rem' }} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          </label>
          <label className="field grow">
            <span>Name</span>
            <input className="input" value={name} autoFocus={isNew} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        {!isNew && category && (
          <div className="row">
            <button className="btn btn-small" disabled={index <= 0} onClick={moveUp}>
              <Icon name="up" size={18} /> Move up
            </button>
            <button
              className="btn btn-small"
              onClick={async () => {
                await db.categories.update(category.id, { archived: !category.archived })
                onClose()
              }}
            >
              <Icon name={category.archived ? 'restore' : 'archive'} size={18} /> {category.archived ? 'Restore' : 'Archive'}
            </button>
          </div>
        )}
        {!isNew && <span className="small muted">Archived categories stay on old expenses but aren't offered for new ones.</span>}
        <div className="sheet-actions" style={{ padding: 0, marginTop: 4 }}>
          <button className="btn btn-tonal" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-filled" disabled={!name.trim()} onClick={save}>
            {isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function DataSettings() {
  const [withImages, setWithImages] = useState(true)
  const [pending, setPending] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const counts = useLiveQuery(async () => ({ expenses: await db.expenses.count(), images: await db.images.count() }), [])
  const [storage, setStorage] = useState<{ used: number; persisted: boolean } | null>(null)
  const lastBackup = useLiveQuery(async () => (await db.settings.get('lastBackup'))?.value, [])
  const keepImages = useLiveQuery(async () => (await db.settings.get('keepImages'))?.value === '1', [])

  useEffect(() => {
    void (async () => {
      const est = await navigator.storage?.estimate?.()
      const persisted = (await navigator.storage?.persisted?.()) ?? false
      setStorage({ used: est?.usage ?? 0, persisted })
    })()
  }, [counts?.expenses])

  const doExport = async () => {
    download(await exportBackup(withImages), backupFileName())
    await setSetting('lastBackup', todayIso())
    toast('Backup saved to Downloads')
  }

  const doImport = async () => {
    if (!pending) return
    try {
      await importBackup(pending)
      toast('Backup restored')
    } catch (err) {
      toast(`Restore failed: ${(err as Error).message}`)
    }
    setPending(null)
  }

  return (
    <>
      <SectionLabel>Your data</SectionLabel>
      <div className="group">
        <Row
          icon="phone"
          title="Stored only on this phone"
          sub={`${counts?.expenses ?? 0} expenses · ${counts?.images ?? 0} receipt images${storage ? ` · ${(storage.used / 1024 / 1024).toFixed(1)} MB` : ''}`}
        />
        <Switch
          checked={!!keepImages}
          onChange={(v) => setSetting('keepImages', v ? '1' : '0')}
          label={
            <span className="row-text" style={{ paddingLeft: 56 }}>
              <span className="row-title">Keep a copy of receipt photos</span>
              <span className="row-sub" style={{ whiteSpace: 'normal' }}>
                Off: photos are only used for reading, then discarded. Your originals stay in your gallery.
              </span>
            </span>
          }
        />
        {storage && !storage.persisted && (
          <Row icon="alert" tone="warn" title="Install the app to keep data safe" sub="Until it's installed, Chrome may clear it when space runs low." />
        )}
        <Row
          icon="download"
          title="Back up now"
          sub={lastBackup ? `Last backup ${formatDate(lastBackup, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No backup yet'}
          onClick={doExport}
        />
        <Switch checked={withImages} onChange={setWithImages} label={<span style={{ paddingLeft: 56 }}>Include receipt images</span>} />
        <Row icon="table" title="Export to spreadsheet" sub="CSV of every item" onClick={async () => download(await exportCsv(), `expenses-${todayIso()}.csv`)} />
        <Row icon="upload" title="Restore from backup" sub="Replaces what's on this phone" onClick={() => fileRef.current?.click()} />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          setPending(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      <ConfirmSheet
        open={!!pending}
        title="Restore this backup?"
        message={`Everything on this phone will be replaced with “${pending?.name}”. Your Gemini key is kept.`}
        confirmLabel="Replace"
        onClose={() => setPending(null)}
        onConfirm={doImport}
      />
    </>
  )
}
