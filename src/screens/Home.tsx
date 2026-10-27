import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Item } from '../db'
import { useCategoryMap } from '../hooks'
import { formatDate, money } from '../lib/format'
import { periodFor, shortLabel, trailingPeriods, type PeriodKind } from '../lib/periods'
import { TrendChart } from '../components/TrendChart'
import { Icon } from '../components/Icon'
import { AppBar, Badge, EmptyState, IconButton, SectionLabel } from '../components/ui'

const KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
  { kind: 'year', label: 'Year' },
]

const sum = (items: Item[]) => items.reduce((s, i) => s + i.effective, 0)

/** The category that took the biggest share of each expense, for its list avatar. */
function mainCategory(items: Item[]) {
  const by = new Map<string, number>()
  for (const i of items) by.set(i.categoryId, (by.get(i.categoryId) ?? 0) + i.effective)
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

export function Home() {
  const navigate = useNavigate()
  const categories = useCategoryMap()
  const [kind, setKind] = useState<PeriodKind>('month')
  const [offset, setOffset] = useState(0)
  const [focusCat, setFocusCat] = useState<string | null>(null)

  const period = periodFor(kind, new Date(), offset)
  const trend = trailingPeriods(period, kind === 'year' ? 4 : 6)

  const data = useLiveQuery(async () => {
    const first = trend[0]
    const all = await db.items.where('date').between(first.start, period.end, true, false).toArray()
    const scoped = focusCat ? all.filter((i) => i.categoryId === focusCat) : all
    const inPeriod = all.filter((i) => i.date >= period.start && i.date < period.end)
    const expenseIds = new Set(inPeriod.map((i) => i.expenseId))

    const byCat = new Map<string, number>()
    for (const i of inPeriod) byCat.set(i.categoryId, (byCat.get(i.categoryId) ?? 0) + i.effective)

    return {
      total: sum(inPeriod),
      count: expenseIds.size,
      previous: trend.length > 1 ? sum(all.filter((i) => i.date >= trend[trend.length - 2].start && i.date < period.start)) : 0,
      byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]),
      trend: trend.map((p) => ({
        label: shortLabel(p),
        title: p.label,
        total: Math.round(sum(scoped.filter((i) => i.date >= p.start && i.date < p.end))),
        current: p.start === period.start,
      })),
    }
  }, [kind, offset, focusCat, period.start])

  const recent = useLiveQuery(async () => {
    const expenses = await db.expenses.orderBy('date').reverse().limit(5).toArray()
    const items = await db.items.where('expenseId').anyOf(expenses.map((e) => e.id)).toArray()
    return expenses.map((e) => ({ expense: e, categoryId: mainCategory(items.filter((i) => i.expenseId === e.id)) }))
  }, [])
  const hasAny = useLiveQuery(async () => (await db.expenses.count()) > 0, [])

  const maxCat = data?.byCat[0]?.[1] ?? 0
  const delta = data ? data.total - data.previous : 0
  const periodWord = kind

  return (
    <div className="screen">
      <AppBar title="Spending" large />

      <div className="segmented" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            role="tab"
            aria-selected={k.kind === kind}
            className={k.kind === kind ? 'on' : ''}
            onClick={() => {
              setKind(k.kind)
              setOffset(0)
            }}
          >
            {k.label}
          </button>
        ))}
      </div>

      <section className="hero">
        <div className="hero-nav">
          <IconButton icon="chevronLeft" label={`Previous ${periodWord}`} onClick={() => setOffset(offset - 1)} />
          <span className="hero-period">{period.label}</span>
          <IconButton icon="chevronRight" label={`Next ${periodWord}`} disabled={offset >= 0} onClick={() => setOffset(offset + 1)} />
        </div>
        <div className="hero-amount num">{money(data?.total ?? 0)}</div>
        <div className="hero-meta">
          <span className="pill">
            {data?.count ?? 0} {data?.count === 1 ? 'expense' : 'expenses'}
          </span>
          {data && data.previous > 0 && (
            <span className="pill">
              {delta >= 0 ? '↑' : '↓'} {money(Math.abs(delta))} vs last {periodWord}
            </span>
          )}
        </div>
      </section>

      {hasAny === undefined ? null : hasAny === false ? (
        <div className="card">
          <EmptyState icon="camera" title="No expenses yet">
            Tap <b>+</b> to scan a receipt or share a Swiggy or Zomato screenshot.
          </EmptyState>
        </div>
      ) : (
        <>
          <SectionLabel>Categories</SectionLabel>
          <div className="group">
            {data && data.byCat.length === 0 && (
              <div className="row-item muted">Nothing spent this {periodWord}.</div>
            )}
            {data?.byCat.map(([catId, amount]) => {
              const c = categories.get(catId)
              return (
                <button
                  key={catId}
                  className="row-item pressable"
                  onClick={() => navigate(`/history?cat=${catId}&from=${period.start}&to=${period.end}`)}
                >
                  <Badge>{c?.emoji ?? '•'}</Badge>
                  <span className="grow">
                    <span className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="row-title">{c?.name ?? 'Unknown'}</span>
                      <span className="row-amount">{money(amount)}</span>
                    </span>
                    <span className="bar-track">
                      <span className="bar" style={{ width: `${(amount / maxCat) * 100}%` }} />
                    </span>
                  </span>
                  <span className="small muted num" style={{ width: 34, textAlign: 'right' }}>
                    {Math.round((amount / data.total) * 100)}%
                  </span>
                </button>
              )
            })}
          </div>

          <SectionLabel>Trend{focusCat ? ` · ${categories.get(focusCat)?.name ?? ''}` : ''}</SectionLabel>
          <div className="card">
            {data && <TrendChart data={data.trend} onSelect={(i) => setOffset(offset + i - (data.trend.length - 1))} />}
            {data && data.byCat.length > 0 && (
              <div className="chips" style={{ marginTop: 10 }}>
                <button className={`chip ${focusCat === null ? 'on' : ''}`} onClick={() => setFocusCat(null)}>
                  All
                </button>
                {data.byCat.map(([catId]) => {
                  const c = categories.get(catId)
                  return (
                    <button key={catId} className={`chip ${focusCat === catId ? 'on' : ''}`} onClick={() => setFocusCat(catId)}>
                      {c?.emoji} {c?.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <SectionLabel
            action={
              <button className="btn btn-text" onClick={() => navigate('/history')}>
                See all
              </button>
            }
          >
            Recent
          </SectionLabel>
          <div className="group">
            {recent?.map(({ expense: e, categoryId }) => (
              <button key={e.id} className="row-item pressable" onClick={() => navigate(`/expense/${e.id}`)}>
                <Badge>{(categoryId && categories.get(categoryId)?.emoji) || '🧾'}</Badge>
                <span className="grow row-text">
                  <span className="row-title">{e.merchant || e.source}</span>
                  <span className="row-sub">
                    {formatDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {e.source}
                  </span>
                </span>
                <span className="row-amount">{money(e.total)}</span>
                <Icon name="chevronRight" size={20} className="chev" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
