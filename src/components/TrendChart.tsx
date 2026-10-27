import { Bar, BarChart, Rectangle, ResponsiveContainer, Tooltip, XAxis, type BarShapeProps } from 'recharts'
import { money } from '../lib/format'

export interface TrendPoint {
  label: string
  /** Full label for the tooltip, e.g. "October 2026". */
  title: string
  total: number
  current: boolean
}

/** Spend per period; the selected period is emphasized, the rest recede. */
export function TrendChart({ data, onSelect }: { data: TrendPoint[]; onSelect?: (index: number) => void }) {
  return (
    <div style={{ width: '100%', height: 160 }} role="img" aria-label={data.map((d) => `${d.title}: ${money(d.total)}`).join(', ')}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ className: 'chart-axis' }}
            tick={{ className: 'chart-tick', fontSize: 12 }}
            interval={0}
          />
          <Tooltip
            cursor={{ className: 'chart-cursor' }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as TrendPoint | undefined
              if (!active || !p) return null
              return (
                <div className="chart-tooltip">
                  <div className="muted small">{p.title}</div>
                  <div className="num" style={{ fontWeight: 600 }}>
                    {money(p.total)}
                  </div>
                </div>
              )
            }}
          />
          <Bar
            dataKey="total"
            isAnimationActive={false}
            radius={[6, 6, 6, 6]}
            onClick={(_, index) => onSelect?.(index)}
            shape={(props: BarShapeProps) => (
              <Rectangle
                {...props}
                className={(props.payload as TrendPoint).current ? 'chart-bar-current' : 'chart-bar'}
              />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
