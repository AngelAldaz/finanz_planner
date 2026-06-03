import { ulid } from 'ulid'

/** ID ordenable y único (sirve para sync multi-dispositivo a futuro). */
export const newId = (): string => ulid()

/** Timestamp ISO para createdAt/updatedAt. */
export const nowISO = (): string => new Date().toISOString()
