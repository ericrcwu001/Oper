# Scenario Generator Output Schema

This document describes the JSON output of the backend scenario generator (`scenario_generator.py`). Use it when building features that depend on generated scenarios—e.g. frontend scenario cards, voice/TTS agents (ElevenLabs Flash v2.5), or any system that consumes `POST /api/scenarios/generate` or `generate_scenario(difficulty)`.

---

## Overview

- **Entry point:** `generate_scenario(difficulty)` where `difficulty` is `"easy"` | `"medium"` | `"hard"`.
- **API:** `POST /api/scenarios/generate` with body `{ "difficulty": "easy"|"medium"|"hard" }`.
- **Output:** A single JSON object (dict). No streaming.
- **Consumers:**
  1. **Frontend** — scenario metadata, caller profile, expected actions, difficulty, etc. for UI and training flow.
  2. **Voice / persona agent** — system prompt and voice settings for the agent that plays the 911 caller (e.g. ElevenLabs Flash v2.5). Use `build_voice_agent_system_prompt(payload)` to turn the payload into the agent’s system prompt.

---

## Top-Level Keys

| Key | Type | Required | Consumer | Description |
|-----|------|----------|----------|-------------|
| `scenario` | object | Yes | Frontend, Voice agent | Scenario metadata and caller profile. |
| `persona` | object | Yes | Voice agent (ElevenLabs) | Voice settings and description for TTS/agent. |
| `caller_script` | string[] | Yes | Frontend / reference | Suggested caller lines or beats. |
| `role_instruction` | string | Yes | Voice agent | One-line role for the agent (e.g. "You are Jordan, 24, calling 911 as..."). |
| `scenario_summary_for_agent` | string | Yes | Voice agent | 2–4 sentence ground-truth summary. |
| `critical_info` | string[] | Yes | Frontend, Voice agent | Facts the caller should reveal when asked. |
| `withheld_information` | string[] | No | Voice agent | Details that only surface with operator probing (see below). |
| `behavior_notes` | string | Yes | Voice agent | How the caller may react (e.g. tearful, may misstate address). |
| `dialogue_directions` | string | Yes | Voice agent | Acting/speech directions (disfluencies, volatility, pacing). |
| `response_behavior` | string[] | Yes | Voice agent | How to react to the operator (when to give info, when to reveal probing details). |
| `opening_line` | string | No | Voice agent | First thing the caller says when the call connects. |
| `do_not_say` | string[] | No | Voice agent | Phrases/topics to avoid to stay in character. |

---

## `scenario` (object)

Used for UI and for building the “Caller personal details” section of the voice agent system prompt.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique scenario id. Generator may omit; backend sets `scenario-{uuid8}` if missing. |
| `scenario_type` | string | Yes | E.g. `domestic-violence`, `suicidal-caller`, `cardiac-arrest`, `fire`, `traffic-accident`. Frontend may map to icons/labels. |
| `title` | string | Yes | Short display title. |
| `description` | string | Yes | 2–4 sentence scenario description. |
| `caller_profile` | object | Yes | Caller identity and personal details (see below). |
| `critical_info` | string[] | Yes | 4–7 items: key facts for the scenario (operator training / evaluation). |
| `expected_actions` | string[] | Yes | 4–7 items: what the operator should do. |
| `optional_complications` | string[] | Yes | 1–3 items: e.g. caller may hang up, refuse address. |
| `difficulty` | string | Yes | `"easy"` \| `"medium"` \| `"hard"`. |
| `language` | string | Yes | Always `"en"` for now. |

### `scenario.caller_profile` (object)

Personal details for the caller. Included in the voice agent system prompt under **Caller personal details**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Caller’s name. |
| `age` | number | Yes | Caller’s age. |
| `emotion` | string | Yes | Dominant emotion (e.g. "panicked", "calm", "despair"). |
| `gender` | string | Yes | Caller’s gender. |
| `race` | string | Yes | Caller’s race. |
| `other_relevant_details` | string | No | E.g. accent, first language, occupation, physical description—whatever is relevant to the scenario. |

---

## `persona` (object)

ElevenLabs Flash v2.5–aligned voice settings. Pass numeric fields to the ElevenLabs API; use `voice_description` in the agent system prompt.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stability` | number | Yes | 0–1. Lower = more emotional range. |
| `style` | number | Yes | 0–1. |
| `speed` | number | Yes | Speech speed (e.g. 0.9–1.2). |
| `voice_description` | string | Yes | Short text: accent, age, gender, emotional tone (e.g. "young adult, neutral accent, emotional, distraught"). |

---

## Voice-Agent–Specific Fields

These fields are serialized by `build_voice_agent_system_prompt(payload)` into the system prompt for the agent that plays the 911 caller.

### `role_instruction` (string)

One short line defining the role, e.g. *"You are Jordan, 24, calling 911 as you feel suicidal and need help."*  
→ **Section:** `## Role`

### `scenario_summary_for_agent` (string)

2–4 sentences of ground truth the agent must know.  
→ **Section:** `## Scenario summary (ground truth)`

### `critical_info` (string[])

Facts the caller should reveal when the operator asks; the agent should not dump them all at once.  
→ **Section:** `## Critical information to convey (reveal when the operator asks; do not dump all at once)`

### `withheld_information` (string[])

**Important:** These are **not** things the caller is purposely hiding from 911. They are contextual details that help the operator understand the situation but only come out when the operator asks the right questions. Examples: perpetrator height/race/clothing after a crime, room layout, who else is in the building. The persona reveals them naturally when the operator probes.  
→ **Section:** `## Details that emerge with operator probing` (with explanatory sentence that these are not secrets).

### `behavior_notes` (string)

How the caller may react during the call (e.g. may become tearful, may misstate address, may hang up).  
→ **Section:** `## Behavioral notes**

### `dialogue_directions` (string)

Explicit acting directions for how to speak: disfluencies (ums, uhs, pauses), false starts, volatility of language, sentence length. Should scale with difficulty (easy: clear sentences; hard: fragmented, emotional).  
→ **Section:** `## Dialogue / acting directions**

### `response_behavior` (string[])

Short instructions for how to react to the operator, e.g. *"Give address only after being asked"*, *"Reveal suspect description when operator asks what they looked like"*.  
→ **Section:** `## How to react to the operator**

### `opening_line` (string, optional)

The first thing the caller says when the call connects.  
→ **Section:** `## Opening line** — *When the call connects, start with something like: "[opening_line]"*

### `do_not_say` (string[], optional)

Phrases or topics the caller would never say (stay in character), e.g. *"I'm an AI"*, *"What's the script?"*  
→ **Section:** `## Do NOT say (stay in character)**

---

## How the Voice Agent System Prompt Is Built

`build_voice_agent_system_prompt(payload)` concatenates sections in this order (only non-empty sections are included):

1. **Role** — `role_instruction`
2. **Caller personal details** — from `scenario.caller_profile` (name, age, emotion, gender, race, other_relevant_details)
3. **Scenario summary (ground truth)** — `scenario_summary_for_agent`
4. **Critical information to convey** — `critical_info`
5. **Details that emerge with operator probing** — `withheld_information` + explanation
6. **Voice / how to speak** — `persona.voice_description`
7. **Dialogue / acting directions** — `dialogue_directions`
8. **How to react to the operator** — `response_behavior`
9. **Opening line** — `opening_line`
10. **Do NOT say (stay in character)** — `do_not_say`
11. **Behavioral notes** — `behavior_notes`

---

## ElevenLabs Integration

- **voice_settings (API):** Use `persona.stability`, `persona.style`, `persona.speed` in the ElevenLabs request.
- **Agent system prompt:** Use the string returned by `build_voice_agent_system_prompt(payload)`; it already includes `voice_description` and all persona/caller instructions.

---

## Example Payload (minimal structure)

```json
{
  "scenario": {
    "id": "hard-001",
    "scenario_type": "suicidal-caller",
    "title": "Desperate Call for Help",
    "description": "A young adult calls 911 expressing hopelessness and suicidal thoughts.",
    "caller_profile": {
      "name": "Jordan",
      "age": 24,
      "emotion": "despair",
      "gender": "non-binary",
      "race": "Black",
      "other_relevant_details": "Southern accent, speaks in short bursts when upset"
    },
    "critical_info": ["Caller is 24", "In bedroom", "Alone", "Feeling hopeless"],
    "expected_actions": ["Reassure", "Ask about plan/means", "Keep engaged", "Dispatch"],
    "optional_complications": ["May refuse address", "May hang up"],
    "difficulty": "hard",
    "language": "en"
  },
  "persona": {
    "stability": 0.3,
    "style": 0.5,
    "speed": 1.2,
    "voice_description": "young adult, Southern accent, emotional, distraught"
  },
  "caller_script": ["I don't know what to do anymore.", "I just need someone to talk to."],
  "role_instruction": "You are Jordan, 24, calling 911 as you feel suicidal and need help.",
  "scenario_summary_for_agent": "Caller is 24, alone in bedroom, expressing suicidal thoughts. Operator must keep them engaged and dispatch help.",
  "critical_info": ["Caller feels hopeless", "Alone in bedroom", "Heightened emotional state"],
  "withheld_information": ["Has had thoughts about how they would do it (reveal only if operator asks about plan or means)"],
  "behavior_notes": "Highly emotional; may need repeated reassurance. May become tearful or fixate on despair.",
  "dialogue_directions": "Use frequent fillers (um, uh), short fragmented sentences, occasional long pauses or trailing off. Match emotional intensity; may cry or speak in bursts.",
  "response_behavior": ["Give location only after being asked at least once", "Answer questions about feelings if operator asks directly"],
  "opening_line": "I don't know what to do anymore. I just—I need help.",
  "do_not_say": ["I'm an AI", "What's the script?", "This is a simulation"]
}
```

---

## Source of Truth

The schema and prompt are defined in `backend/scenario_generator.py`: `SCENARIO_RESPONSE_SCHEMA`, `SYSTEM_PROMPT`, and `build_voice_agent_system_prompt()`. If you add or change fields, update this document and the generator code together.
