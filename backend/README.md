# 911 Call Simulation Backend

Node.js/Express backend for the AI Emergency Response Simulator. Generates emergency call audio from a scenario using OpenAI (dialog + Whisper for STT) and **OpenAI TTS by default** (fast `tts-1` model; voice and speed reflect caller gender, age, and emotion). Optional ElevenLabs TTS when `TTS_PROVIDER=elevenlabs`. Supports live back-and-forth interaction via `/interact`.

## Setup

1. **Install dependencies**

   ```bash
   cd backend && npm install
   ```

2. **API keys (required)**

   - Copy `.env.example` to `.env`.
   - Set `OPENAI_API_KEY` ([OpenAI API keys](https://platform.openai.com/api-keys)) — used for dialog, Whisper STT, and **TTS by default**.
   - For **ElevenLabs TTS** instead: set `TTS_PROVIDER=elevenlabs` and `ELEVENLABS_API_KEY` ([ElevenLabs API keys](https://elevenlabs.io/app/settings/api-keys)).
   - Optional: `OPENAI_TTS_MODEL` — `tts-1` (default, fast/cheap), `tts-1-hd` (higher quality), or `gpt-4o-mini-tts` (adds emotion/tone via instructions: panicked, stressed, calm).

3. **Run the server**

   ```bash
   npm run dev
   ```

   Server runs at `http://localhost:3001` (or `PORT` from `.env`).

## API

### POST `/api/scenarios/generate` (Express)

Generates a dynamic 911 training scenario (including edge/rare cases) from a difficulty level. Uses OpenAI (gpt-4o-mini) and returns a structured payload for the frontend and for the ElevenLabs Flash v2.5 voice agent. Same Express server as the rest of the API; set `OPENAI_API_KEY` in `.env`.

**Request body (JSON):**

```json
{ "difficulty": "medium" }
```

- `difficulty` (required): `"easy"` | `"medium"` | `"hard"`.

**Response (200):** A single JSON object with:

- **scenario** — Frontend-compatible: `id`, `scenario_type`, `title`, `description`, `caller_profile` (`name`, `age`, `emotion`), `critical_info[]`, `expected_actions[]`, `optional_complications[]`, `difficulty`, `language` (`"en"`).
- **persona** — ElevenLabs Flash v2.5: `stability` (0–1), `style` (0–1), `speed` (float), `voice_description` (string). Pass `stability`, `style`, `speed` to ElevenLabs `voice_settings`; include `voice_description` in the agent system prompt.
- **caller_script** — Array of suggested caller lines.
- **role_instruction**, **scenario_summary_for_agent**, **critical_info**, **behavior_notes** — Use with `buildVoiceAgentSystemPrompt(payload)` (from `src/services/scenarioGenerator.js`) to build the full system prompt for the ElevenLabs Flash v2.5 voice agent.

**Persona → ElevenLabs:** Use `persona.stability`, `persona.style`, `persona.speed` in the ElevenLabs API `voice_settings`. Use `persona.voice_description` in the agent system prompt (e.g. “You sound like …”). Build the full prompt with `scenarioGenerator.buildVoiceAgentSystemPrompt(payload)`.

---

### POST `/generate-call-audio`

Generates caller dialog for a scenario and returns an audio URL and transcript.

**Request body (JSON):**

```json
{
  "scenario": "Jack has fallen and broken his arm, explain the situation to the operator."
}
```

- `scenario` (optional): Emergency description. If omitted or empty, a built-in sample scenario is used.

**Response (200):**

```json
{
  "audioUrl": "http://localhost:3001/generated-audio/<uuid>.mp3",
  "transcript": "Generated dialog text"
}
```

**Example (curl):**

```bash
curl -X POST http://localhost:3001/generate-call-audio \
  -H "Content-Type: application/json" \
  -d "{\"scenario\": \"House fire, family trapped upstairs, need help immediately.\"}"
```

### POST `/interact`

Live interaction with the AI caller: send the operator’s message (text or speech), get the next bot response as audio and transcript. Conversation context is kept via `conversationHistory`.

**Request body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scenario` | string | Yes | Original emergency scenario (placeholder for dynamic scenario input later). |
| `userInput` | string | One of these | Operator message as text. |
| `userInputAudio` | string | One of these | Operator message as base64 audio; transcribed with OpenAI Whisper and used as the operator message. |
| `conversationHistory` | array | No | Prior turns: `[{ "role": "caller" \| "operator", "content": "..." }]`. Send the `conversationHistory` returned by the previous response for multi-turn. |

**Response (200):**

```json
{
  "audioUrl": "http://localhost:3001/generated-audio/<uuid>.mp3",
  "transcript": "Next bot (caller) response text",
  "conversationHistory": [
    { "role": "operator", "content": "Hello, what happened?" },
    { "role": "caller", "content": "..." },
    { "role": "operator", "content": "..." },
    { "role": "caller", "content": "..." }
  ]
}
```

**Example (text, first turn):**

```bash
curl -X POST http://localhost:3001/interact \
  -H "Content-Type: application/json" \
  -d "{\"scenario\": \"Jack has fallen and broken his arm.\", \"userInput\": \"Hello, 911, what is your emergency?\"}"
```

**Example (second turn, with history):**  
Use the `conversationHistory` from the first response in the next request:

```bash
curl -X POST http://localhost:3001/interact \
  -H "Content-Type: application/json" \
  -d "{\"scenario\": \"Jack has fallen...\", \"userInput\": \"Is he conscious?\", \"conversationHistory\": [...]}"
```

For speech input, send the recorded audio as base64 in `userInputAudio` (optional `data:audio/...;base64,` prefix is stripped).

## Swapping the scenario

- Send a different `scenario` string in the POST body for each request.
- To change the default sample scenario, edit `SAMPLE_SCENARIO` in `src/routes/callAudio.js`.
- To use a different ElevenLabs voice, set `ELEVENLABS_VOICE_ID` in `.env`.
