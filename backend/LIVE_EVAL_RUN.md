# Live Call Evaluation – Architecture & Run Instructions

## Overview

Live call evaluation streams operator mic audio to the backend over WebSocket, transcribes it (chunked Whisper or mock), runs a rule-based assessment engine, and streams back **live transcript** and **dispatch recommendations** (EMT/BLS, ALS, Police, Fire, SWAT). No map or resources yet—transcript only.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend (React)                                                       │
│  • Mic capture (MediaRecorder → chunks every 250ms)                      │
│  • WebSocket client → ws://<API_HOST>/live-eval                           │
│  • Sends: binary audio chunks (or AUDIO_CHUNK with base64)               │
│  • Receives: TRANSCRIPT_DELTA, TRANSCRIPT_FINAL, RECOMMENDATION_UPDATE   │
│  • UI: live transcript lines + partial; recommendation panel (units)    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend (Node + Express + ws)                                            │
│  • HTTP server: Express + WebSocket upgrade on path /live-eval           │
│  • websocket-handler.js: per-connection STT stream + assessment engine  │
└─────────────────────────────────────────────────────────────────────────┘
        │                    │                          │
        ▼                    ▼                          ▼
┌───────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐
│  stt-stream.js│  │ incident-state  │  │  assessment-engine.js            │
│  Chunked STT  │  │ incident-state  │  │  • processFinalTranscript(text)  │
│  • Buffer     │  │ • fullTranscript │  │  • evaluateRules(transcript)     │
│  • Every 2.5s│  │ • signals       │  │  • Debounce 1/s; immediate for    │
│  • Whisper or │  │ • rationales    │  │    critical (shots, no breath,   │
│    mock       │  │                 │  │    fire)                         │
└───────────────┘  └─────────────────┘  └─────────────────────────────────┘
        │                                          │
        │                                          ▼
        │                                ┌─────────────────────┐
        │                                │  policy-rules.js     │
        │                                │  10–15 rules        │
        │                                │  severity + rationale│
        └───────────────────────────────┴──────────────────────┘
```

### Backend modules (all under `src/call-evaluation/`)

| File | Role |
|------|------|
| `message-contracts.js` | Message type constants and payload JSDoc (TRANSCRIPT_DELTA, TRANSCRIPT_FINAL, RECOMMENDATION_UPDATE). |
| `incident-state.js` | Incident state store: fullTranscript, signals, recommendedUnits, severity, rationales. |
| `policy-rules.js` | Default 10–15 rule set; regex/function match → units + severity + rationale; `critical` flag for immediate update. |
| `assessment-engine.js` | Consumes final transcript segments, runs rules, debounces recommendations (max 1/sec), bypasses debounce for critical. |
| `stt-stream.js` | Buffers audio chunks; every 2.5s runs Whisper (if OPENAI_API_KEY) or emits mock transcript. |
| `websocket-handler.js` | WS upgrade on `/live-eval`; per connection: STT stream + assessment engine; sends transcript + recommendation events. |

### WebSocket message contracts

- **Client → Server**
  - Binary: raw audio chunk (Buffer / ArrayBuffer).
  - JSON: `{ type: 'AUDIO_CHUNK', payload: { base64: '...' } }`, `{ type: 'END_SESSION' }`.
- **Server → Client** (JSON)
  - `TRANSCRIPT_DELTA`: `{ type, payload: { text, isPartial } }`.
  - `TRANSCRIPT_FINAL`: `{ type, payload: { text } }`.
  - `RECOMMENDATION_UPDATE`: `{ type, payload: { units: [{ unit, rationale, severity }], severity } }`.
  - `ERROR`: `{ type, payload: { message } }`.

### Debounce and critical signals

- Normal: recommendation updates at most once per second.
- Critical (e.g. shots fired, not breathing, fire): update immediately and skip debounce.

---

## How to run (minimal E2E)

### 1. Backend

```bash
cd treehacks/backend
npm install
npm run dev
```

- Server: `http://localhost:3001`
- WebSocket: `ws://localhost:3001/live-eval`

Without `OPENAI_API_KEY`, STT uses a **mock** (single placeholder transcript per chunk) so you can test the pipeline. With `OPENAI_API_KEY` in `.env`, chunked Whisper is used.

### 2. Frontend

```bash
cd treehacks/frontend
npm install
npm run dev
```

- Open `http://localhost:3000` (or the port Next.js prints).
- Go to **Live Eval** (nav).
- Click **Connect** → **Start mic**.
- Speak; final transcript segments and recommendation updates appear. With mock STT, recommendations still update from the placeholder text; for real speech, set `OPENAI_API_KEY` and speak clearly.

### 3. Optional: real STT

Add to `backend/.env`:

```env
OPENAI_API_KEY=sk-...
```

Restart backend. Mic chunks are then sent to Whisper every 2.5s and real transcript drives the assessment engine.

---

## Default policy rules (summary)

- **Critical (immediate):** shots fired / gun → Police, SWAT; not breathing / CPR / cardiac arrest → EMT_BLS, ALS; fire / smoke → Fire, EMT_BLS.
- **High:** bleeding, stroke, overdose, assault, chest pain.
- **Medium:** fall/fracture, breathing difficulty, traffic accident, intruder, general emergency.
- **Low:** sick / pain / not feeling well.

Each rule has a rationale string and severity; the engine picks max severity and merges recommended units.

---

## File checklist

- Backend: `src/call-evaluation/message-contracts.js`, `incident-state.js`, `policy-rules.js`, `assessment-engine.js`, `stt-stream.js`, `websocket-handler.js`; `src/index.js` (HTTP server + `attachLiveEvalWebSocket`).
- Frontend: `lib/live-eval-types.ts`, `lib/api.ts` (`getLiveEvalWsUrl`), `hooks/use-live-call-eval.ts`, `app/live-eval/page.tsx`; nav link in `app-shell.tsx`.
