// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from '../../src/App'

afterEach(cleanup)

describe('App (smoke)', () => {
  it('monta, siembra el plan y muestra el libro semanal con datos del Excel', async () => {
    render(<App />)
    // cabecera
    expect(await screen.findByText('finanz.')).toBeTruthy()
    // tras sembrar (async) aparecen escenario, hero y la primera semana real
    expect(await screen.findByText('Realista')).toBeTruthy()
    expect(await screen.findByText(/Saldo final/i)).toBeTruthy()
    expect(await screen.findByText('25 al 31 mayo')).toBeTruthy()
    // el anchor inicial (saldo real) y su etiqueta
    expect(await screen.findByText('Dinero en tarjeta')).toBeTruthy()
    expect(await screen.findByText('= saldo real')).toBeTruthy()
    // "Don René" recurre cada semana (6 veces en la semilla)
    expect(await screen.findAllByText('Don René')).toHaveLength(6)
  })
})
