import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Expense } from '../db'
import { useCategories, useCategoryMap } from '../hooks'
import { formatDate, fromIsoDate, money, toIsoDate } from '../lib/format'
import { Icon } from '../components/Icon'
import { AppBar, Badge, EmptyState, SectionLabel } from '../components/ui'

const PAGE = 60

export function History() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const categories = useCategories()
  const catMap = useCategoryMap()
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const cat = params.get('cat')
  const from = params.get('from')
  const to = params.get('to')

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const rows = useLiveQuery(async () => {
    const expenses: Expense[] =
      from && to
        ? await db.expenses.where('date').between(from, to, true, false).toArray()
        : await db.expenses.toArray()
    expenses.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)

    const items = (await db.items.where('expenseId').anyOf(expenses.map((e) => e.id)).toArray()).sort(
      (a, b) => a.position - b.position,
    )
    const byExpense = new Map<string, typeof items>()
    for (const i of items) byExpense.set(i.expenseId, [...(byExpense.get(i.expenseId) ?? []), i])

    const q = query.trim().toLowerCase()
    const result = []
    for (const e of expenses) {
      const its = byExpense.get(e.id) ?? []
      const matching = cat ? its.filter((i) => i.categoryId === cat) : its
      if (cat && matching.length === 0) continue
      if (q) {
        const hay = [e.merchant, e.source, e.note, ...its.map((i) => i.name)].join(' ').toLowerCase()
        if (!hay.includes(q)) continue
      }
      result.push({
        expense: e,
        amount: cat ? matching.reduce((s, i) => s + i.effective, 0) : e.total,
        itemNames: matching.map((i) => i.name),
        categoryIds: [...new Set(matching.map((i) => i.categoryId))],
      })
    }
    return result
  }, [cat, from, to, query])

  const shown = rows?.slice(0, limit) ?? []
  const total = rows?.reduce((s, r) => s + r.amount, 0) ?? 0
  const days = groupByDay(shown)

  return (
    <div className="screen">
      <AppBar
        title="History"
        large
        subtitle={rows && rows.length > 0 ? `${money(total)} · ${rows.length} ${rows.length === 1 ? 'expense' : 'expenses'}` : undefined}
      />

      <label className="search">
        <Icon name="search" size={20} />
        <input
          className="input"
          type="search"
          placeholder="Search shops and items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="chips">
        {from && to && (
          <button className="chip on" onClick={() => setParams(cat ? { cat } : {}, { replace: true })}>
            {formatDate(from)} – {formatDate(toIsoDate(new Date(fromIsoDate(to).getTime() - 86_400_000)))}
            <Icon name="close" size={16} />
          </button>
        )}
        <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setParam('cat', null)}>
          All
        </button>
        {categories
          .filter((c) => !c.archived || c.id === cat)
          .map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setParam('cat', c.id)}>
              {c.emoji} {c.name}
            </button>
          ))}
      </div>

      {rows?.length === 0 && (
        <EmptyState icon="search" title={query || cat || from ? 'Nothing matches' : 'No expenses yet'}>
          {query || cat || from ? 'Try a different search or filter.' : 'Tap + on the Home screen to add one.'}
        </EmptyState>
      )}

      {days.map(([date, list]) => (
        <div key={date} className="stack" style={{ gap: 10 }}>
          <SectionLabel action={<span className="num">{money(list.reduce((s, r) => s + r.amount, 0))}</span>}>
            {relativeDay(date)}
          </SectionLabel>
          <div className="group">
            {list.map(({ expense: e, amount, itemNames, categoryIds }) => (
              <button key={e.id} className="row-item pressable" onClick={() => navigate(`/expense/${e.id}`)}>
                <Badge>{categoryIds.length === 1 ? catMap.get(categoryIds[0])?.emoji : '🧾'}</Badge>
                <span className="grow row-text">
                  <span className="row-title">{e.merchant || itemNames[0] || e.source}</span>
                  <span className="row-sub">
                    {e.source} · {itemNames.join(', ')}
                  </span>
                </span>
                <span className="row-amount">{money(amount)}</span>
                <Icon name="chevronRight" size={20} className="chev" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {rows && rows.length > limit && (
        <button className="btn btn-tonal" onClick={() => setLimit(limit + PAGE)}>
          Show more
        </button>
      )}
    </div>
  )
}

function relativeDay(iso: string) {
  const today = toIsoDate(new Date())
  const yesterday = toIsoDate(new Date(Date.now() - 86_400_000))
  if (iso === today) return 'Today'
  if (iso === yesterday) return 'Yesterday'
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  return formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

function groupByDay<T extends { expense: Expense }>(rows: T[]): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const r of rows) map.set(r.expense.date, [...(map.get(r.expense.date) ?? []), r])
  return [...map.entries()]
}
