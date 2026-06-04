// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from '../../src/App'

// Fija "hoy" antes del horizonte de la semilla → todas las semanas visibles (determinista).
beforeAll(() => {
  // solo falsear Date (no los timers, que fake-indexeddb necesita reales)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-05-20T12:00:00Z'))
})
afterAll(() => vi.useRealTimers())
afterEach(cleanup)

describe('App (smoke)', () => {
  it('monta, siembra el plan y muestra el libro semanal con datos del Excel', async () => {
    render(<App />)
    // cabecera
    expect(await screen.findByText('finanz.')).toBeTruthy()
    // tras sembrar (async) aparecen escenario, hero y la primera semana real
    expect(await screen.findByText('Realista')).toBeTruthy()
    expect(await screen.findByText(/Saldo líquido/i)).toBeTruthy()
    expect(await screen.findByText('25 al 31 mayo')).toBeTruthy()
    // el anchor inicial (saldo real)
    expect(await screen.findByText('Dinero en tarjeta')).toBeTruthy()
    // "Don René" recurre cada semana (6 veces en la semilla)
    expect(await screen.findAllByText('Don René')).toHaveLength(6)
  })
})
