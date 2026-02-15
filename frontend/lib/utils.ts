import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Split transcript into phrase/sentence chunks for progressive reveal during TTS playback. */
export function splitIntoPhraseChunks(text: string): string[] {
  if (!text?.trim()) return []
  const raw = text
    .split(/(?<=[.!?,])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return raw
}
