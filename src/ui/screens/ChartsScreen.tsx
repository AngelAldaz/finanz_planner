import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import { effectiveDate } from '../../domain/ledger'
import { Money } from '../components/Money'
import { cn } from '../../lib/cn'

const INK = '#141414'
const NEG = '#ff3b30'
const RESERVED = '#9b51e0'
const money = (v: number) => formatMXNCompact(Math.round(v * 100))
const yearOf = (iso: string) => Number(iso.slice(0, 4))

export function ChartsScreen() {
  const computed = useComputed()
  const categories = usePlanStore((s) => s.categories)
  const threshold = usePlanStore((s) => s.lowBalanceThreshold)
  const setThreshold = usePlanStore((s) => s.setLowBalanceThreshold)
  const [input, setInput] = useState('')

  // ---- navegación por año: solo los años que tienen datos (atrás, ahora y adelante)
  const years = useMemo(
    () => [...new Set(computed.weeks.map((w) => yearOf(w.key.weekStart)))].sort((a, b) => a - b),
    [computed],
  )
  const thisYear = new Date().getFullYear()
  const [pickedYear, setPickedYear] = useState<number | null>(null)
  const year = useMemo(() => {
    if (!years.length) return thisYear
    if (pickedYear !== null && years.includes(pickedYear)) return pickedYear
    if (years.includes(thisYear)) return thisYear
    // sin datos este año: el más cercano hacia atrás, si no el primero hacia adelante
    const back = years.filter((y) => y < thisYear)
    return back.length ? back[back.length - 1] : years[0]
  }, [years, pickedYear, thisYear])
  const yearIdx = years.indexOf(year)
  const prevYear = yearIdx > 0 ? years[yearIdx - 1] : undefined
  const nextYear = yearIdx >= 0 && yearIdx < years.length - 1 ? years[yearIdx + 1] : undefined

  const yearWeeks = useMemo(
    () => computed.weeks.filter((w) => yearOf(w.key.weekStart) === year),
    [computed, year],
  )
  const hasReserved = useMemo(() => yearWeeks.some((w) => w.reservedClosing !== 0), [yearWeeks])

  const balanceData = useMemo(
    () =>
      yearWeeks.map((w) => {
        const s = parseISO(w.key.weekStart)
        return {
          label: `${s.d}/${s.m}`,
          cierre: fromCents(w.closingBalance),
          min: fromCents(w.lowestBalance),
          total: fromCents(w.closingBalance + w.reservedClosing),
        }
      }),
    [yearWeeks],
  )
  const yearClosing = yearWeeks.length ? yearWeeks[yearWeeks.length - 1].closingBalance : 0
  const yearMin = yearWeeks.length ? Math.min(...yearWeeks.map((w) => w.lowestBalance)) : 0

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of computed.points) {
      const m = p.movement
      if (yearOf(effectiveDate(m)) !== year) continue
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
  }, [computed, categories, year])

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

      {/* selector de año */}
      <div className="flex items-center justify-between rounded-chunky border-2 border-line bg-surface px-2 py-1.5 shadow-hard-sm">
        <button
          onClick={() => prevYear !== undefined && setPickedYear(prevYear)}
          disabled={prevYear === undefined}
          aria-label="Año anterior"
          className="rounded-lg p-1.5 text-fg active:bg-canvas disabled:opacity-25"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <div className="font-display text-xl font-bold tabular-nums">{year}</div>
          <div className="text-[11px] text-muted">
            {yearWeeks.length
              ? `${yearWeeks.length} ${yearWeeks.length === 1 ? 'semana' : 'semanas'} con datos`
              : 'sin datos'}
            {year === thisYear && ' · este año'}
          </div>
        </div>
        <button
          onClick={() => nextYear !== undefined && setPickedYear(nextYear)}
          disabled={nextYear === undefined}
          aria-label="Año siguiente"
          className="rounded-lg p-1.5 text-fg active:bg-canvas disabled:opacity-25"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <ChartCard title={`Liquidez disponible por semana · ${year}`}>
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
            {hasReserved && (
              <Line
                type="monotone"
                dataKey="total"
                stroke={RESERVED}
                strokeWidth={2}
                strokeDasharray="2 3"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        <Legend
          items={[
            { c: INK, t: 'Disponible al cierre' },
            { c: NEG, t: 'Mínimo' },
            ...(hasReserved ? [{ c: RESERVED, t: 'Con apartados' }] : []),
          ]}
        />
      </ChartCard>

      <ChartCard title={`Gasto por categoría · ${year}`}>
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
        {year}: cierre <Money cents={yearClosing} /> · mínimo <Money cents={yearMin} />
        {computed.finalReserved !== 0 && (
          <>
            {' '}
            · apartado hoy <Money cents={computed.finalReserved} />
          </>
        )}
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
