import { create } from 'zustand'

export interface NewTaskSeed {
  links?: string
  files?: File[]
}

interface SpeedSample {
  down: number
  up: number
}

interface UiState {
  newTaskOpen: boolean
  newTaskSeed: NewTaskSeed | null
  openNewTask: (seed?: NewTaskSeed) => void
  closeNewTask: () => void
  navOpen: boolean
  setNavOpen: (open: boolean) => void
  speedHistory: SpeedSample[]
  pushSpeed: (sample: SpeedSample) => void
  resetSpeed: () => void
}

const HISTORY = 90

export const useUi = create<UiState>()((set) => ({
  newTaskOpen: false,
  newTaskSeed: null,
  openNewTask: (seed) => set({ newTaskOpen: true, newTaskSeed: seed ?? null }),
  closeNewTask: () => set({ newTaskOpen: false, newTaskSeed: null }),
  navOpen: false,
  setNavOpen: (navOpen) => set({ navOpen }),
  speedHistory: [],
  pushSpeed: (sample) => set((s) => ({ speedHistory: [...s.speedHistory, sample].slice(-HISTORY) })),
  resetSpeed: () => set({ speedHistory: [] }),
}))
