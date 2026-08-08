import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import type { AppState, Appointment } from '../types'
import { loadState, saveState, wipeState } from '../lib/storage'
import { byId } from '../lib/runs'
import { reducer, type Action } from './reducer'

interface StoreValue {
  state: AppState
  dispatch: Dispatch<Action>
  /** Appointment lookup, memoised because nearly every screen needs it. */
  appointmentsById: Map<string, Appointment>
}

const StoreContext = createContext<StoreValue | null>(null)

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)

  // Persist on every single state change — closing the app must never cost work.
  useEffect(() => {
    saveState(state)
  }, [state])

  const value = useMemo<StoreValue>(
    () => ({ state, dispatch, appointmentsById: byId(state.appointments) }),
    [state],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = (): StoreValue => {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <StoreProvider>')
  return value
}

export const useSettings = () => useStore().state.settings

export const wipeEverything = (dispatch: Dispatch<Action>) => {
  wipeState()
  dispatch({ type: 'wipe' })
}
