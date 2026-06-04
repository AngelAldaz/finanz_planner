// Bloqueo con PIN: gate de privacidad (no es cifrado — los datos siguen en IndexedDB).
// Guardamos solo el hash SHA-256 del PIN en localStorage.
const KEY = 'finanz-pin'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function hasPin(): boolean {
  return !!localStorage.getItem(KEY)
}

export async function setPin(pin: string): Promise<void> {
  localStorage.setItem(KEY, await sha256(pin))
}

export function removePin(): void {
  localStorage.removeItem(KEY)
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(KEY)
  return !!stored && stored === (await sha256(pin))
}
