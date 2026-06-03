import { describe, it, expect } from 'vitest'
import {
  addMonths,
  adjustToBusinessDay,
  isWeekend,
  mondayOf,
  parseExcelSerial,
  weekRangeLabel,
} from '../../src/domain/dates'

describe('dates', () => {
  it('25 may 2026 es lunes', () => {
    expect(mondayOf('2026-05-25')).toBe('2026-05-25')
    expect(mondayOf('2026-05-31')).toBe('2026-05-25') // domingo de esa semana
  })

  it('weekRangeLabel en español', () => {
    expect(weekRangeLabel('2026-05-25')).toBe('25 al 31 mayo')
    expect(weekRangeLabel('2026-06-29')).toBe('29 junio al 5 julio')
  })

  it('fin de semana y ajuste a día hábil', () => {
    expect(isWeekend('2026-08-15')).toBe(true) // sábado
    expect(adjustToBusinessDay('2026-08-15', 'previous')).toBe('2026-08-14') // viernes
    expect(adjustToBusinessDay('2026-08-16', 'next')).toBe('2026-08-17') // domingo → lunes
    expect(adjustToBusinessDay('2026-08-13', 'previous')).toBe('2026-08-13') // jueves, sin cambio
  })

  it('parseExcelSerial (25569 = 1970-01-01, constante conocida)', () => {
    expect(parseExcelSerial(25569)).toBe('1970-01-01')
  })

  it('addMonths con clamp de fin de mes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-06-15', 2)).toBe('2026-08-15')
  })
})
