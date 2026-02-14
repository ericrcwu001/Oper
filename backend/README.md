# 911 Call Simulation Backend

Node.js/Express backend for the AI Emergency Response Simulator. Generates emergency call audio from a scenario using OpenAI (dialog + Whisper for STT) and ElevenLabs (TTS). Supports live back-and-forth interaction via `/interact`.

## Setup

1. **Install dependencies**

   ```bash
   cd backend && npm install
   ```

2. **API keys (required)**

   - Copy `.env.example` to `.env`.
   - Set `OPENAI_API_KEY` ([OpenAI API keys](https://platform.openai.com/api-keys)).
   - Set `ELEVENLABS_API_KEY` ([ElevenLabs API keys](https://elevenlabs.io/app/settings/api-keys)).

3. **Run the server**

   ```bash
   npm run dev
   ```

   Server runs at `http://localhost:3001` (or `PORT` from `.env`).

## API

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
