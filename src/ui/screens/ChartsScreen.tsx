import { useMemo, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { usePlanStore } from '../../state/planStore'
import { useComputed } from '../../state/hooks'
import { formatMXNCompact, fromCents, toCents } from '../../domain/money'
import { parseISO } from '../../domain/dates'
import { Money } from '../components/Money'
import { cn } from '../../lib/cn'

const INK = '#141414'
const NEG = '#ff3b30'
const money = (v: number) => formatMXNCompact(Math.round(v * 100))

export function ChartsScreen() {
  const computed = useComputed()
  const categories = usePlanStore((s) => s.categories)
  const threshold = usePlanStore((s) => s.lowBalanceThreshold)
  const setThreshold = usePlanStore((s) => s.setLowBalanceThreshold)
  const [input, setInput] = useState('')

  const balanceData = useMemo(
    () =>
      computed.weeks.map((w) => {
        const s = parseISO(w.key.weekStart)
        return {
          label: `${s.d}/${s.m}`,
          cierre: fromCents(w.closingBalance),
          min: fromCents(w.lowestBalance),
        }
      }),
    [computed],
  )

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of computed.points) {
      const m = p.movement
      if (m.kind === 'delta' && m.amount < 0 && !m.payCardId && !m.cardBlock) {
        const key = m.categoryId ?? '—'
        map.set(key, (map.get(key) ?? 0) + -m.amount)
      }
    }
    return [...map.entries()]
      .map(([id, cents]) => {
        const cat = categories.find((c) => c.id === id)
        return {
          name: cat?.name ?? 'Sin categoría',
          color: cat?.color ?? '#8a857a',
          total: fromCents(cents),
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [computed, categories])

  const alertWeek = computed.weeks.find((w) => w.lowestBalance < threshold)

  return (
    <div className="space-y-5 pb-28">
      <div
        className={cn(
          'rounded-chunky border-2 border-line p-4 shadow-hard',
          alertWeek ? 'bg-neg text-white' : 'bg-pos text-white',
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
          Alerta de saldo bajo
        </p>
        {alertWeek ? (
          <p className="mt-1 text-sm font-bold">
            Tu saldo baja a {money(fromCents(alertWeek.lowestBalance))} la semana «
            {alertWeek.key.label}».
          </p>
        ) : (
          <p className="mt-1 text-sm font-bold">
            Tu saldo se mantiene por arriba de {threshold > 0 ? money(fromCents(threshold)) : '$0'} ✓
          </p>
        )}
        <label className="mt-3 flex items-center gap-2 rounded-chunky border-2 border-line bg-surface px-3 py-2 text-fg">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
            Avísame si bajo de
          </span>
          <span className="font-mono text-muted">$</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={() => input !== '' && setThreshold(toCents(Number(input)))}
            inputMode="decimal"
            placeholder={String(fromCents(threshold))}
            className="tnum w-full bg-transparent font-mono text-base outline-none"
          />
        </label>
      </div>

      <ChartCard title="Saldo líquido por semana">
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={balanceData} margin={{ top: 8, right: 10, bottom: 0, left: -8 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={INK} />
            <YAxis tick={{ fontSize: 10 }} stroke={INK} tickFormatter={(v) => money(v)} width={64} />
            <Tooltip formatter={(v) => money(Number(v))} />
            <ReferenceLine y={0} stroke={INK} strokeWidth={2} />
            {threshold > 0 && (
              <ReferenceLine y={fromCents(threshold)} stroke={NEG} strokeDasharray="4 4" />
            )}
            <Line
              type="monotone"
              dataKey="cierre"
              stroke={INK}
              strokeWidth={3}
              dot={{ r: 3, fill: INK }}
            />
            <Line
              type="monotone"
              dataKey="min"
              stroke={NEG}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <Legend
          items={[
            { c: INK, t: 'Cierre' },
            { c: NEG, t: 'Mínimo' },
          ]}
        />
      </ChartCard>

      <ChartCard title="Gasto por categoría">
        {byCategory.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Aún no hay gastos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(130, byCategory.length * 40)}>
            <BarChart
              data={byCategory}
              layout="vertical"
              margin={{ top: 4, right: 14, bottom: 4, left: 6 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={96}
                tick={{ fontSize: 11 }}
                stroke={INK}
              />
              <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: '#00000008' }} />
              <Bar dataKey="total" radius={[0, 4, 4, 0]} stroke={INK} strokeWidth={1.5}>
                {byCategory.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <p className="px-1 text-center text-xs text-muted">
        Saldo final <Money cents={computed.finalBalance} /> · mínimo{' '}
        <Money cents={computed.minBalance} />
      </p>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-chunky border-2 border-line bg-surface p-4 shadow-hard">
      <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  )
}

function Legend({ items }: { items: { c: string; t: string }[] }) {
  return (
    <div className="mt-2 flex gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.t} className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded" style={{ background: i.c }} /> {i.t}
        </span>
      ))}
    </div>
  )
}
