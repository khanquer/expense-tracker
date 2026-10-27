import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Item } from '../db'
import { useCategories, useCategoryMap } from '../hooks'
import { formatDate, moneyPrecise } from '../lib/format'
import { productStats } from '../lib/prices'
import { Icon } from '../components/Icon'
import { AppBar, Badge, EmptyState } from '../components/ui'

export function Prices() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const categories = useCategories()
  const catMap = useCategoryMap()

  const rows = useLiveQuery(async () => {
    const [products, items] = await Promise.all([db.products.toArray(), db.items.toArray()])
    const byProduct = new Map<string, Item[]>()
    for (const i of items) byProduct.set(i.productId, [...(byProduct.get(i.productId) ?? []), i])
    return products
      .map((p) => ({ product: p, stats: productStats(byProduct.get(p.id) ?? []) }))
      .filter((r) => r.stats)
      .sort((a, b) => b.stats!.lastDate.localeCompare(a.stats!.lastDate))
  }, [])

  const q = query.trim().toLowerCase()
  const shown = (rows ?? []).filter(
    (r) => (!cat || r.product.categoryId === cat) && (!q || r.product.name.toLowerCase().includes(q)),
  )
  const usedCats = new Set((rows ?? []).map((r) => r.product.categoryId))

  return (
    <div className="screen">
      <AppBar title="Prices" large subtitle="What you pay per kg, litre or piece" />

      {rows && rows.length > 0 && (
        <>
          <label className="search">
            <Icon name="search" size={20} />
            <input className="input" type="search" placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="chips">
            <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat(null)}>
              All
            </button>
            {categories
              .filter((c) => usedCats.has(c.id))
              .map((c) => (
                <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
                  {c.emoji} {c.name}
                </button>
              ))}
          </div>
        </>
      )}

      {rows?.length === 0 && (
        <div className="card">
          <EmptyState icon="prices" title="No products yet">
            Every item you add is tracked here, so you can see which shop or pack size is cheapest.
          </EmptyState>
        </div>
      )}
      {rows && rows.length > 0 && shown.length === 0 && <EmptyState icon="search" title="No matching products" />}

      {shown.length > 0 && (
        <div className="group">
          {shown.map(({ product, stats }) => (
            <button key={product.id} className="row-item pressable" onClick={() => navigate(`/prices/${product.id}`)}>
              <Badge>{catMap.get(product.categoryId)?.emoji}</Badge>
              <span className="grow row-text">
                <span className="row-title">{product.name}</span>
                <span className="row-sub">
                  {stats!.count > 1 && stats!.best
                    ? `Best ${moneyPrecise(stats!.best.value)}${stats!.best.label} at ${stats!.best.item.merchant || '—'}`
                    : `Bought ${formatDate(stats!.lastDate)}`}
                </span>
              </span>
              {stats!.last && (
                <span className="row-end">
                  <span className="row-amount">
                    {moneyPrecise(stats!.last.value)}
                    <span className="muted small" style={{ fontWeight: 400 }}>
                      {stats!.last.label}
                    </span>
                  </span>
                  <span className="row-sub">
                    {stats!.count} {stats!.count === 1 ? 'buy' : 'buys'}
                  </span>
                </span>
              )}
              <Icon name="chevronRight" size={20} className="chev" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
