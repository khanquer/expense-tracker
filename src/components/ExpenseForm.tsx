import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, imageBlob, type Fees } from '../db'
import { useCategories } from '../hooks'
import {
  emptyItem,
  expectedTotal,
  FEE_LABELS,
  itemsSubtotal,
  netFees,
  saveDraft,
  validate,
  type Draft,
  type DraftItem,
} from '../lib/draft'
import { formatDate, money, moneyPrecise, round2 } from '../lib/format'
import { describeQuantity, UNIT_CHOICES, unitPrice } from '../lib/units'
import { withTimeout } from '../lib/async'
import { Icon } from './Icon'
import { NumField } from './NumField'
import { AppBar, Badge, IconButton, SectionLabel, useObjectUrl } from './ui'

interface Props {
  initial: Draft
  /** App bar title for the summary (or the form, when there is no summary). */
  title: string
  /** `warning` is set when the expense saved but an optional part (the photo) didn't. */
  onSaved: (id: string, total: number, warning?: string) => void
  /** Leaving the screen from the top level. */
  onCancel: () => void
  /** Start with a read-only receipt view (bills Gemini filled in, saved expenses) instead of the form. */
  summaryFirst?: boolean
  /** Small line under the app bar, e.g. which model read the bill. */
  note?: ReactNode
  /** Extra app bar buttons, e.g. delete. */
  actions?: ReactNode
  /** Offer Save on the summary even before any change (true for new bills, false when viewing a saved one). */
  saveFromSummary?: boolean
}

const SOURCES = ['Swiggy', 'Zomato', 'Instamart', 'Zepto', 'Blinkit', 'BigBasket', 'Amazon', 'Receipt', 'Manual']

type Category = { id: string; name: string; emoji: string }

export function ExpenseForm({ initial, title, onSaved, onCancel, summaryFirst, note, actions, saveFromSummary = true }: Props) {
  const categories = useCategories()
  const activeCategories = categories.filter((c) => !c.archived)
  const [d, setD] = useState<Draft>(initial)
  // A fresh manual entry has no total yet: keep it equal to items + fees until the user edits it.
  const [autoTotal, setAutoTotal] = useState(initial.total === 0)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(!summaryFirst)
  const [changed, setChanged] = useState(false)
  const [showFees, setShowFees] = useState(netFees(initial.fees) !== 0 || initial.fees.discount > 0)
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initial.items.filter((i) => !i.name).map((i) => i.key)),
  )

  const expected = expectedTotal(d)
  const total = autoTotal ? expected : d.total
  const mismatch = round2(total - expected)
  const merchants = useLiveQuery(async () => {
    const names = await db.expenses.orderBy('merchant').uniqueKeys()
    return (names as string[]).filter(Boolean)
  }, [])

  // Braces matter: newer browsers return a promise from scrollTo, which React would treat as a cleanup.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [editing])

  const edit = (fn: (prev: Draft) => Draft) => {
    setChanged(true)
    setD(fn)
  }
  const update = (patch: Partial<Draft>) => edit((prev) => ({ ...prev, ...patch }))
  const updateItem = (key: string, patch: Partial<DraftItem>) =>
    // Touching an item counts as checking it.
    edit((prev) => ({ ...prev, items: prev.items.map((i) => (i.key === key ? { ...i, ...patch, unclear: false } : i)) }))
  const setFee = (k: keyof Fees, v: number | null) => edit((prev) => ({ ...prev, fees: { ...prev.fees, [k]: v ?? 0 } }))

  const addItem = () => {
    const last = d.items[d.items.length - 1]
    const item = emptyItem(last?.categoryId)
    update({ items: [...d.items, item] })
    setExpanded((s) => new Set(s).add(item.key))
  }

  const toggle = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const save = async () => {
    const final = { ...d, total }
    const errs = validate(final)
    setErrors(errs)
    if (errs.length) {
      setEditing(true)
      return
    }
    setSaving(true)
    try {
      const { id, warning } = await withTimeout(saveDraft(final), 20_000, "Saving didn't finish after 20 seconds")
      onSaved(id, final.total, warning)
    } catch (err) {
      // Show the real reason: it's the only way to diagnose a failure on the phone.
      console.error('save failed', err)
      const e = err as Error
      setErrors([`Couldn't save. ${e.message}${e.name && e.name !== 'Error' ? ` (${e.name})` : ''}. Please try again.`])
      setSaving(false)
    }
  }

  const checks = [
    ...(d.warnings ?? []),
    ...d.items.filter((i) => i.unclear).map((i) => `“${i.name || 'An item'}” was hard to read.`),
    ...(Math.abs(mismatch) >= 1
      ? [
          mismatch > 0
            ? `${moneyPrecise(mismatch)} of the total isn't covered by the items and fees.`
            : `Items and fees add up to ${moneyPrecise(-mismatch)} more than the total.`,
        ]
      : []),
  ]

  const saveLabel = saving ? 'Saving…' : `Save ${total > 0 ? moneyPrecise(total) : ''}`
  const errorList = errors.length > 0 && (
    <div className="error">
      {errors.map((e) => (
        <div key={e}>{e}</div>
      ))}
    </div>
  )

  if (!editing) {
    return (
      <div className="screen with-bar">
        <AppBar title={title} back={onCancel} actions={actions} />
        {note}
        {checks.length > 0 && (
          <div className="notice">
            <Icon name="alert" size={22} />
            <div className="grow">
              <strong>Please check</strong>
              <ul>
                {checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <button className="btn btn-small" style={{ marginTop: 10 }} onClick={() => setEditing(true)}>
                Review details
              </button>
            </div>
          </div>
        )}
        <Receipt draft={d} total={total} categories={categories} onEdit={() => setEditing(true)} />
        {errorList}
        <div className="action-bar">
          {saveFromSummary || changed ? (
            <>
              <button className="btn btn-tonal" onClick={() => setEditing(true)}>
                <Icon name="pencil" size={18} /> Edit
              </button>
              <button className="btn btn-filled" disabled={saving} onClick={save}>
                {saveLabel}
              </button>
            </>
          ) : (
            <button className="btn btn-tonal" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={18} /> Edit
            </button>
          )}
        </div>
      </div>
    )
  }

  const leaveForm = summaryFirst ? () => setEditing(false) : onCancel

  return (
    <div className="screen with-bar">
      <AppBar title={summaryFirst ? 'Edit details' : title} back={leaveForm} actions={summaryFirst ? undefined : actions} />

      <Images
        imageIds={d.imageIds}
        newImages={d.newImages}
        onRemoveSaved={(id) => update({ imageIds: d.imageIds.filter((x) => x !== id) })}
        onRemoveNew={(b) => update({ newImages: d.newImages.filter((x) => x !== b) })}
      />

      <SectionLabel>Details</SectionLabel>
      <div className="card stack" style={{ gap: 8, padding: 10 }}>
        <label className="field">
          <span>Shop or payee</span>
          <input
            className="input"
            list="merchants"
            value={d.merchant}
            placeholder="e.g. Kerala Mess"
            onChange={(e) => update({ merchant: e.target.value })}
          />
          <datalist id="merchants">{merchants?.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Date</span>
            <input className="input" type="date" value={d.date} onChange={(e) => update({ date: e.target.value })} />
          </label>
          <label className="field">
            <span>Source</span>
            <input className="input" list="sources" value={d.source} onChange={(e) => update({ source: e.target.value })} />
            <datalist id="sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
        </div>
      </div>

      <SectionLabel>
        Items · {d.items.length}
      </SectionLabel>
      <div className="group">
        {d.items.map((item) => (
          <ItemEditor
            key={item.key}
            item={item}
            categories={activeCategories}
            expanded={expanded.has(item.key)}
            onToggle={() => toggle(item.key)}
            onChange={(patch) => updateItem(item.key, patch)}
            onRemove={d.items.length > 1 ? () => update({ items: d.items.filter((i) => i.key !== item.key) }) : undefined}
          />
        ))}
        <button className="row-item pressable" onClick={addItem} style={{ minHeight: 56 }}>
          <Badge tone="accent">
            <Icon name="plus" size={20} />
          </Badge>
          <span className="row-title" style={{ color: 'var(--accent)' }}>
            Add item
          </span>
        </button>
      </div>

      <SectionLabel
        action={
          <button className="btn btn-text" onClick={() => setShowFees(!showFees)}>
            {showFees ? 'Hide' : netFees(d.fees) ? `${money(netFees(d.fees))} · Show` : 'Add'}
          </button>
        }
      >
        Fees &amp; discounts
      </SectionLabel>
      {showFees && (
        <div className="card grid-2" style={{ padding: 10 }}>
          {(Object.keys(FEE_LABELS) as (keyof Fees)[]).map((k) => (
            <label key={k} className="field">
              <span>{FEE_LABELS[k]}</span>
              <NumField value={d.fees[k]} onChange={(v) => setFee(k, v)} />
            </label>
          ))}
        </div>
      )}

      <SectionLabel>Total</SectionLabel>
      <div className="card stack" style={{ padding: 10 }}>
        <div className="totals">
          <span>Items</span>
          <span className="num">{moneyPrecise(itemsSubtotal(d.items))}</span>
          <span>Fees − discounts</span>
          <span className="num">{moneyPrecise(netFees(d.fees))}</span>
        </div>
        <label className="field">
          <span>Total paid</span>
          <NumField
            value={total}
            onChange={(v) => {
              setAutoTotal(false)
              update({ total: v ?? 0 })
            }}
          />
        </label>
        {Math.abs(mismatch) >= 1 && (
          <div className="notice">
            <Icon name="alert" size={22} />
            <div className="grow">
              {mismatch > 0
                ? `${moneyPrecise(mismatch)} of the total isn't covered by the items and fees. Check for a missed item or fee.`
                : `Items and fees add up to ${moneyPrecise(-mismatch)} more than the total. Check for a missed discount or a misread price.`}
              <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-small" onClick={() => update({ total: expected })}>
                  Use {money(expected)} as total
                </button>
              </div>
              <div className="small" style={{ marginTop: 8, opacity: 0.85 }}>
                If you save anyway, the difference is spread across the items.
              </div>
            </div>
          </div>
        )}
      </div>

      <label className="field">
        <span>Note</span>
        <textarea className="input" rows={2} value={d.note} placeholder="Optional" onChange={(e) => update({ note: e.target.value })} />
      </label>

      {errorList}

      <div className="action-bar">
        <button className="btn btn-tonal" onClick={leaveForm}>
          {summaryFirst ? 'Done' : 'Cancel'}
        </button>
        <button className="btn btn-filled" disabled={saving} onClick={save}>
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

function Receipt({ draft: d, total, categories, onEdit }: { draft: Draft; total: number; categories: Category[]; onEdit: () => void }) {
  const cat = new Map(categories.map((c) => [c.id, c]))
  const fees = (Object.keys(FEE_LABELS) as (keyof Fees)[]).filter((k) => d.fees[k])
  const firstImage = useFirstImage(d)
  return (
    <button className="card receipt pressable" onClick={onEdit} aria-label="Edit details">
      <div className="receipt-head">
        {firstImage ? <img className="receipt-thumb" src={firstImage} alt="" /> : <Badge tone="accent">🧾</Badge>}
        <div className="grow row-text">
          <span className="receipt-merchant ellipsis">{d.merchant || 'Unknown shop'}</span>
          <span className="row-sub">
            {formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {d.source}
          </span>
        </div>
        <Icon name="pencil" size={20} className="chev" />
      </div>
      <div className="receipt-lines">
        {d.items.map((i) => {
          const c = cat.get(i.categoryId)
          const qty = i.quantity !== 1 || i.size ? describeQuantity(i) : ''
          return (
            <div key={i.key} className="receipt-line">
              <Badge>{c?.emoji ?? '•'}</Badge>
              <span className="grow row-text">
                <span className="row-title">
                  {i.name || 'Unnamed item'} {i.unclear && <span className="tag tag-warn">check</span>}
                </span>
                <span className="row-sub">{[qty, c?.name].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="row-amount">{moneyPrecise(i.price)}</span>
            </div>
          )
        })}
        {fees.length > 0 && (
          <div className="receipt-fees">
            {fees.map((k) => (
              <FeeLine key={k} label={FEE_LABELS[k]} amount={k === 'discount' ? -d.fees[k] : d.fees[k]} />
            ))}
          </div>
        )}
      </div>
      <div className="receipt-total">
        <span>Total</span>
        <span className="num">{moneyPrecise(total)}</span>
      </div>
    </button>
  )
}

function FeeLine({ label, amount }: { label: string; amount: number }) {
  return (
    <>
      <span>{label}</span>
      <span className="num" style={amount < 0 ? { color: 'var(--good)' } : undefined}>
        {amount < 0 ? `−${moneyPrecise(-amount)}` : moneyPrecise(amount)}
      </span>
    </>
  )
}

/** Object URL for the bill's first image (new or saved), for the receipt header. */
function useFirstImage(d: Draft) {
  const saved = useLiveQuery(async () => {
    const img = d.imageIds[0] ? await db.images.get(d.imageIds[0]) : undefined
    return img && imageBlob(img)
  }, [d.imageIds[0]])
  return useObjectUrl(d.newImages[0] ?? saved)
}

function ItemEditor({
  item,
  categories,
  expanded,
  onToggle,
  onChange,
  onRemove,
}: {
  item: DraftItem
  categories: Category[]
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<DraftItem>) => void
  onRemove?: () => void
}) {
  const cat = categories.find((c) => c.id === item.categoryId)
  // Per-piece price of a single un-sized item is just its price, so only show it when it adds something.
  const up = item.price > 0 && (item.unit || item.quantity > 1) ? unitPrice(item, item.price) : null
  const summary = [
    item.product && item.product.toLowerCase() !== item.name.toLowerCase() ? item.product : null,
    item.brand || null,
    describeQuantity(item),
    up && up.base !== 'pc' ? `${moneyPrecise(up.value)}${up.label}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={`item-editor ${item.unclear ? 'item-unclear' : ''}`}>
      {item.unclear && (
        <span className="tag tag-warn" style={{ alignSelf: 'flex-start' }}>
          Hard to read — please check
        </span>
      )}
      <div className="row" style={{ alignItems: 'stretch' }}>
        <label className="field grow">
          <span>Item</span>
          <input className="input" placeholder="e.g. Parotta" value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <label className="field" style={{ width: 112, flex: 'none' }}>
          <span>Price ₹</span>
          <NumField value={item.price} onChange={(v) => onChange({ price: v ?? 0 })} />
        </label>
      </div>
      <div className="row">
        <label className="field grow">
          <span>Category</span>
          <select className="input" value={item.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })}>
            {!cat && <option value={item.categoryId}>—</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
        <IconButton icon={expanded ? 'up' : 'chevronDown'} label={expanded ? 'Fewer details' : 'More details'} onClick={onToggle} />
        {onRemove && <IconButton icon="trash" label="Remove item" onClick={onRemove} />}
      </div>
      {!expanded && summary && (
        <button className="item-summary ellipsis" onClick={onToggle}>
          {summary}
        </button>
      )}
      {expanded && (
        <>
          <div className="grid-2">
            <label className="field">
              <span>Product (to compare prices)</span>
              <input
                className="input"
                placeholder={item.name || 'e.g. Toned milk'}
                value={item.product}
                onChange={(e) => onChange({ product: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Brand</span>
              <input className="input" placeholder="Optional" value={item.brand} onChange={(e) => onChange({ brand: e.target.value })} />
            </label>
          </div>
          <div className="grid-3">
            <label className="field">
              <span>Qty</span>
              <NumField value={item.quantity} onChange={(v) => onChange({ quantity: v ?? 1 })} placeholder="1" />
            </label>
            <label className="field">
              <span>Pack size</span>
              <NumField value={item.size} onChange={(v) => onChange({ size: v })} placeholder="—" />
            </label>
            <label className="field">
              <span>Unit</span>
              <select className="input" value={item.unit ?? ''} onChange={(e) => onChange({ unit: e.target.value || null })}>
                <option value="">—</option>
                {UNIT_CHOICES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {up && (
            <div className="small muted" style={{ padding: '0 4px' }}>
              Works out to <span className="num">{moneyPrecise(up.value)}</span>
              {up.label}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Images({
  imageIds,
  newImages,
  onRemoveSaved,
  onRemoveNew,
}: {
  imageIds: string[]
  newImages: Blob[]
  onRemoveSaved: (id: string) => void
  onRemoveNew: (b: Blob) => void
}) {
  // Blobs are built inside the query so they keep their identity between renders.
  const saved = useLiveQuery(
    async () => (await db.images.bulkGet(imageIds)).flatMap((img) => (img ? [{ id: img.id, blob: imageBlob(img) }] : [])),
    [imageIds.join(',')],
  )
  if (imageIds.length === 0 && newImages.length === 0) return null
  return (
    <div className="thumbs">
      {saved?.map((img) => <Thumb key={img.id} blob={img.blob} onRemove={() => onRemoveSaved(img.id)} />)}
      {newImages.map((b, i) => (
        <Thumb key={i} blob={b} onRemove={() => onRemoveNew(b)} />
      ))}
    </div>
  )
}

function Thumb({ blob, onRemove }: { blob: Blob; onRemove: () => void }) {
  const url = useObjectUrl(blob)
  if (!url) return null
  return (
    <div className="thumb">
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="Bill" />
      </a>
      <button aria-label="Remove image" onClick={onRemove}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
