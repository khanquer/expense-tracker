import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '../db'
import { useCategories } from '../hooks'
import { formatDate, moneyPrecise } from '../lib/format'
import { productStats, type PricePoint } from '../lib/prices'
import { describeQuantity } from '../lib/units'
import { Icon } from '../components/Icon'
import { AppBar, Badge, EmptyState, IconButton, SectionLabel, Sheet, Switch, toast } from '../components/ui'

export function ProductDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const categories = useCategories()
  const [withFees, setWithFees] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)

  const product = useLiveQuery(async () => (await db.products.get(id)) ?? null, [id])
  const items = useLiveQuery(() => db.items.where('productId').equals(id).toArray(), [id])
  const others = useLiveQuery(
    async () => (mergeOpen ? (await db.products.orderBy('name').toArray()).filter((p) => p.id !== id) : []),
    [mergeOpen, id],
  )

  if (product === undefined || items === undefined) return null
  if (product === null) {
    return (
      <div className="screen">
        <AppBar title="Product" back />
        <EmptyState icon="prices" title="Product not found" />
      </div>
    )
  }

  const stats = productStats(items, withFees)
  const points = stats?.points ?? []
  const byStore = storeSummary(points)
  const unitWord = stats?.label.slice(1) ?? 'pc'

  const rename = async (name: string) => {
    if (name.trim() && name.trim() !== product.name) await db.products.update(id, { name: name.trim() })
  }

  const setCategory = async (categoryId: string) => {
    await db.transaction('rw', [db.products, db.items], async () => {
      await db.products.update(id, { categoryId })
      await db.items.where('productId').equals(id).modify({ categoryId })
    })
  }

  const mergeInto = async (targetId: string, targetName: string) => {
    await db.transaction('rw', [db.products, db.items, db.aliases], async () => {
      await db.items.where('productId').equals(id).modify({ productId: targetId })
      await db.aliases.where('productId').equals(id).modify({ productId: targetId })
      await db.products.delete(id)
    })
    setMergeOpen(false)
    toast(`Merged into ${targetName}`)
    navigate(`/prices/${targetId}`, { replace: true })
  }

  return (
    <div className="screen">
      <AppBar
        title={
          <input
            key={product.name}
            className="title-input"
            defaultValue={product.name}
            aria-label="Product name"
            onBlur={(e) => rename(e.target.value)}
          />
        }
        back
        actions={<IconButton icon="merge" label="Merge with another product" onClick={() => setMergeOpen(true)} />}
      />

      {stats?.best && stats.last && (
        <div className="stat-tiles">
          <div className="stat stat-best">
            <span className="stat-label">Cheapest</span>
            <span className="stat-value">
              {moneyPrecise(stats.best.value)}
              <small>{stats.label}</small>
            </span>
            <span className="small ellipsis">
              {stats.best.item.merchant || '—'} · {formatDate(stats.best.item.date)}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Last paid</span>
            <span className="stat-value">
              {moneyPrecise(stats.last.value)}
              <small>{stats.label}</small>
            </span>
            <span className="small muted ellipsis">
              {stats.last.item.merchant || '—'} · {formatDate(stats.last.item.date)}
            </span>
          </div>
        </div>
      )}

      <div className="group">
        <Switch checked={withFees} onChange={setWithFees} label="Include delivery, taxes & discounts" />
      </div>

      {points.length >= 2 && (
        <>
          <SectionLabel>Price per {unitWord} over time</SectionLabel>
          <div className="card" style={{ paddingLeft: 4 }}>
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer>
                <LineChart data={points.map((p) => ({ ...p, date: formatDate(p.item.date) }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} className="chart-grid" />
                  <XAxis dataKey="date" tickLine={false} axisLine={{ className: 'chart-axis' }} tick={{ className: 'chart-tick', fontSize: 12 }} minTickGap={16} />
                  <YAxis
                    width={48}
                    tickLine={false}
                    axisLine={false}
                    tick={{ className: 'chart-tick', fontSize: 12 }}
                    tickFormatter={(v: number) => `₹${Math.round(v)}`}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    cursor={{ className: 'chart-axis' }}
                    content={({ active, payload }) => {
                      const p = payload?.[0]?.payload as (PricePoint & { date: string }) | undefined
                      if (!active || !p) return null
                      return (
                        <div className="chart-tooltip">
                          <div className="muted small">
                            {p.date} · {p.item.merchant || '—'}
                          </div>
                          <div className="num" style={{ fontWeight: 600 }}>
                            {moneyPrecise(p.value)}
                            {p.label}
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Line
                    dataKey="value"
                    type="linear"
                    className="chart-line"
                    strokeWidth={2}
                    dot={{ r: 4, className: 'chart-dot' }}
                    activeDot={{ r: 6, className: 'chart-dot' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {byStore.length > 1 && (
        <>
          <SectionLabel>By shop</SectionLabel>
          <div className="group plain-dividers">
            {byStore.map((s, i) => (
              <div key={s.store} className="row-item" style={{ minHeight: 56 }}>
                <span className="grow row-text">
                  <span className="row-title">
                    {s.store} {i === 0 && <span className="tag tag-good">● Cheapest</span>}
                  </span>
                  <span className="row-sub">
                    {s.count} {s.count === 1 ? 'buy' : 'buys'} · avg {moneyPrecise(s.avg)}
                    {stats?.label}
                  </span>
                </span>
                <span className="row-amount">
                  {moneyPrecise(s.min)}
                  <span className="muted small" style={{ fontWeight: 400 }}>
                    {stats?.label}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Purchases</SectionLabel>
      <div className="group plain-dividers">
        {[...items]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((item) => {
            const p = points.find((x) => x.item.id === item.id)
            const isBest = p && p === stats?.best && points.length > 1
            return (
              <button key={item.id} className="row-item pressable" onClick={() => navigate(`/expense/${item.expenseId}`)}>
                <span className="grow row-text">
                  <span className="row-title">{item.merchant || '—'}</span>
                  <span className="row-sub">
                    {formatDate(item.date)} · {[item.brand, describeQuantity(item)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="row-end">
                  <span className="row-amount">{moneyPrecise(withFees ? item.effective : item.price)}</span>
                  {p && (
                    <span className="row-sub" style={isBest ? { color: 'var(--good)', fontWeight: 600 } : undefined}>
                      {moneyPrecise(p.value)}
                      {p.label}
                    </span>
                  )}
                </span>
                <Icon name="chevronRight" size={20} className="chev" />
              </button>
            )
          })}
      </div>

      <SectionLabel>Category</SectionLabel>
      <label className="field">
        <span>Applies to every purchase of this product</span>
        <select className="input" value={product.categoryId} onChange={(e) => setCategory(e.target.value)}>
          {categories
            .filter((c) => !c.archived || c.id === product.categoryId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
        </select>
      </label>

      <Sheet open={mergeOpen} onClose={() => setMergeOpen(false)} title={`Merge “${product.name}” into…`}>
        <p className="sheet-text">Use this when the same thing ended up under two names. Its purchases move to the product you pick.</p>
        <div className="sheet-list">
          {others?.map((p) => (
            <button key={p.id} className="row-item pressable" style={{ minHeight: 52 }} onClick={() => mergeInto(p.id, p.name)}>
              <Badge>{categories.find((c) => c.id === p.categoryId)?.emoji ?? '•'}</Badge>
              <span className="grow row-title">{p.name}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function storeSummary(points: PricePoint[]) {
  const map = new Map<string, number[]>()
  for (const p of points) {
    const store = p.item.merchant || '—'
    map.set(store, [...(map.get(store) ?? []), p.value])
  }
  return [...map.entries()]
    .map(([store, values]) => ({
      store,
      min: Math.min(...values),
      avg: values.reduce((s, v) => s + v, 0) / values.length,
      count: values.length,
    }))
    .sort((a, b) => a.min - b.min)
}
