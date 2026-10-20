import type { Settings } from '@shared/types'

export function pendingSettings(settings: Settings, edits: Partial<Settings>): Partial<Settings> {
  return Object.fromEntries(
    Object.entries(edits).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(settings[key as keyof Settings]),
    ),
  )
}

export function clearSavedSettings(edits: Partial<Settings>, saved: Partial<Settings>): Partial<Settings> {
  // An edit made while saving belongs to the next save, not the in-flight one.
  return Object.fromEntries(
    Object.entries(edits).filter(([key, value]) =>
      !(key in saved) || JSON.stringify(value) !== JSON.stringify(saved[key as keyof Settings]),
    ),
  )
}
