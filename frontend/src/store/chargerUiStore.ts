import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ChargerUiStore {
  displayNames: Record<string, string>
  groups: Record<string, string>
  setDisplayName: (cpId: string, name: string) => void
  setGroup: (cpId: string, group: string) => void
  removeGroup: (cpId: string) => void
}

export const useChargerUiStore = create<ChargerUiStore>()(
  persist(
    (set) => ({
      displayNames: {},
      groups: {},
      setDisplayName: (cpId, name) =>
        set((s) => ({ displayNames: { ...s.displayNames, [cpId]: name } })),
      setGroup: (cpId, group) =>
        set((s) => ({ groups: { ...s.groups, [cpId]: group } })),
      removeGroup: (cpId) =>
        set((s) => {
          const groups = { ...s.groups }
          delete groups[cpId]
          return { groups }
        }),
    }),
    { name: 'ocpp-charger-ui' }
  )
)
