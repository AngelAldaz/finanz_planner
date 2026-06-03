import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Une clases de Tailwind resolviendo conflictos. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
