import type {
  ConnectionStatus,
  TranscriptTurn,
  NoteEntry,
} from "@/lib/types"
import { createSlice } from "@reduxjs/toolkit"

export type CallConversationEntry = { role: "caller" | "operator"; content: string }

export interface CallState {
  /** Which session the active call belongs to; null when no call. */
  sessionId: string | null
  callActive: boolean
  connectionStatus: ConnectionStatus
  transcript: TranscriptTurn[]
  conversationHistory: CallConversationEntry[]
  notes: NoteEntry[]
  callSeconds: number
  lastCallerResponseSeconds: number
  /** For sidebar "Live call" label */
  label: string
  /** For sidebar "Live call" link */
  href: string
}

const initialState: CallState = {
  sessionId: null,
  callActive: false,
  connectionStatus: "disconnected",
  transcript: [],
  conversationHistory: [],
  notes: [],
  callSeconds: 0,
  lastCallerResponseSeconds: 0,
  label: "",
  href: "",
}

const callSlice = createSlice({
  name: "call",
  initialState,
  reducers: {
    startCall: (
      state,
      action: {
        payload: {
          sessionId: string
          label: string
          href: string
          transcript: TranscriptTurn[]
          conversationHistory: CallConversationEntry[]
          notes?: NoteEntry[]
        }
      }
    ) => {
      const { sessionId, label, href, transcript, conversationHistory, notes } =
        action.payload
      state.sessionId = sessionId
      state.callActive = true
      state.connectionStatus = "connected"
      state.transcript = transcript
      state.conversationHistory = conversationHistory
      state.notes = notes ?? []
      state.callSeconds = 0
      state.lastCallerResponseSeconds = 0
      state.label = label
      state.href = href
    },
    updateCallState: (
      state,
      action: {
        payload: {
          transcript?: TranscriptTurn[]
          conversationHistory?: CallConversationEntry[]
          notes?: NoteEntry[]
          callSeconds?: number
          lastCallerResponseSeconds?: number
        }
      }
    ) => {
      const p = action.payload
      if (p.transcript !== undefined) state.transcript = p.transcript
      if (p.conversationHistory !== undefined)
        state.conversationHistory = p.conversationHistory
      if (p.notes !== undefined) state.notes = p.notes
      if (p.callSeconds !== undefined) state.callSeconds = p.callSeconds
      if (p.lastCallerResponseSeconds !== undefined)
        state.lastCallerResponseSeconds = p.lastCallerResponseSeconds
    },
    setCallConnectionStatus: (
      state,
      action: { payload: ConnectionStatus }
    ) => {
      state.connectionStatus = action.payload
    },
    endCall: (state) => {
      state.sessionId = null
      state.callActive = false
      state.connectionStatus = "disconnected"
      state.transcript = []
      state.conversationHistory = []
      state.notes = []
      state.callSeconds = 0
      state.lastCallerResponseSeconds = 0
      state.label = ""
      state.href = ""
    },
  },
})

export const {
  startCall,
  updateCallState,
  setCallConnectionStatus,
  endCall,
} = callSlice.actions
export default callSlice.reducer
