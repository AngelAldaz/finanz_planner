// Dinero en centavos enteros. `Math.round` SOLO al importar; las sumas son enteras → cero drift.
import type { Cents } from './types'

export const toCents = (mxn: number): Cents => Math.round(mxn * 100)
export const fromCents = (c: Cents): number => c / 100
export const sumCents = (xs: Cents[]): Cents => xs.reduce((a, b) => a + b, 0)

const MXN2 = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const MXN0 = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

/** Siempre con 2 decimales: "$9,828.70". */
export const formatMXN = (c: Cents): string => MXN2.format(c / 100)

/** Sin decimales si es pesos exactos (números grandes en UI): "$37,575". */
export const formatMXNCompact = (c: Cents): string =>
  c % 100 === 0 ? MXN0.format(c / 100) : MXN2.format(c / 100)

/** Con signo explícito para movimientos: "+$3,200" / "−$1,000". */
export const formatSigned = (c: Cents): string => {
  const sign = c > 0 ? '+' : c < 0 ? '−' : ''
  return sign + formatMXNCompact(Math.abs(c))
}
