import { formatMXN, formatMXNCompact, formatSigned } from '../../domain/money'
import type { Cents } from '../../domain/types'
import { cn } from '../../lib/cn'

interface MoneyProps {
  cents: Cents
  /** Muestra signo y color (verde/rojo) — para montos de movimientos. */
  signed?: boolean
  /** Siempre 2 decimales. */
  full?: boolean
  className?: string
}

/** Importe en mono tabular (look de libro contable). */
export function Money({ cents, signed, full, className }: MoneyProps) {
  const text = signed ? formatSigned(cents) : full ? formatMXN(cents) : formatMXNCompact(cents)
  const tone = signed ? (cents > 0 ? 'text-pos' : cents < 0 ? 'text-neg' : 'text-ink') : ''
  return <span className={cn('font-mono tnum', tone, className)}>{text}</span>
}
