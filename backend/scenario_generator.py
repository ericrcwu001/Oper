"""
Backend scenario generation module for 911 operator training.

Generates dynamic emergency scenarios (including edge/rare cases) from a difficulty
level using OpenAI Chat Completions. Output is structured for:
1. Frontend (scenario metadata, caller_profile, critical_info, expected_actions, etc.)
2. ElevenLabs Flash v2.5 voice agent: system prompt fields (role_instruction,
   scenario_summary_for_agent, critical_info, behavior_notes) and persona
   (stability, style, speed, voice_description) for voice_settings and agent prompt.

Output shape (single JSON object):
- scenario: id, scenario_type, title, description, caller_profile {name, age, emotion, gender, race, other_relevant_details},
  critical_info[], expected_actions[], optional_complications[], difficulty, language ("en")
- persona: stability (0-1 float), style (0-1 float), speed (float), voice_description (string)
- caller_script: string[] (suggested caller lines/beats)
- role_instruction: string (for voice agent system prompt)
- scenario_summary_for_agent: string (2-4 sentences ground truth)
- critical_info: string[] (facts caller should reveal when asked)
- withheld_information: string[] (details that require more probing/questioning from the operator to surface; NOT information the persona is purposely hiding—e.g. perpetrator height/race after a crime, or layout of the room; they simply don't come up until the operator asks the right questions)
- behavior_notes: string (optional complications / how caller may react)
- dialogue_directions: string (explicit acting directions: disfluencies like ums/pauses, volatility, sentence structure; match severity of scenario; easy=clear sentences, hard=fragmented/emotional)
- response_behavior: string[] (how to react to operator: when to give info, when to reveal details that need probing; e.g. "Give address only after being asked" or "Reveal suspect description when operator asks what the person looked like")
- opening_line: string (optional; the first thing the caller says when the call connects)
- do_not_say: string[] (optional; phrases/topics the caller would never say—stay in character; e.g. "I'm an AI", "What's the script?")

Persona → ElevenLabs Flash v2.5:
- Pass persona.stability, persona.style, persona.speed to ElevenLabs voice_settings API.
- Include persona.voice_description in the agent system prompt (e.g. "You sound like...").
- Use build_voice_agent_system_prompt(payload) to produce the full system prompt string.
"""

import json
import os
import uuid
from openai import OpenAI

# -----------------------------------------------------------------------------
# JSON response schema (for prompt and parsing)
# -----------------------------------------------------------------------------

SCENARIO_RESPONSE_SCHEMA = {
    "type": "object",
    "required": [
        "scenario",
        "persona",
        "caller_script",
        "role_instruction",
        "scenario_summary_for_agent",
        "critical_info",
        "behavior_notes",
        "dialogue_directions",
        "response_behavior",
    ],
    "properties": {
        "scenario": {
            "type": "object",
            "required": [
                "id",
                "scenario_type",
                "title",
                "description",
                "caller_profile",
                "critical_info",
                "expected_actions",
                "optional_complications",
                "difficulty",
                "language",
            ],
            "properties": {
                "id": {"type": "string"},
                "scenario_type": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "caller_profile": {
                    "type": "object",
                    "required": ["name", "age", "emotion", "gender", "race"],
                    "properties": {
                        "name": {"type": "string"},
                        "age": {"type": "number"},
                        "emotion": {"type": "string"},
                        "gender": {"type": "string"},
                        "race": {"type": "string"},
                        "other_relevant_details": {"type": "string"},
                    },
                },
                "critical_info": {"type": "array", "items": {"type": "string"}},
                "expected_actions": {"type": "array", "items": {"type": "string"}},
                "optional_complications": {"type": "array", "items": {"type": "string"}},
                "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                "language": {"type": "string"},
            },
        },
        "persona": {
            "type": "object",
            "required": ["stability", "style", "speed", "voice_description"],
            "properties": {
                "stability": {"type": "number", "minimum": 0, "maximum": 1},
                "style": {"type": "number", "minimum": 0, "maximum": 1},
                "speed": {"type": "number"},
                "voice_description": {"type": "string"},
            },
        },
        "caller_script": {"type": "array", "items": {"type": "string"}},
        "role_instruction": {"type": "string"},
        "scenario_summary_for_agent": {"type": "string"},
        "critical_info": {"type": "array", "items": {"type": "string"}},
        "withheld_information": {"type": "array", "items": {"type": "string"}},
        "behavior_notes": {"type": "string"},
        "dialogue_directions": {"type": "string"},
        "response_behavior": {"type": "array", "items": {"type": "string"}},
        "opening_line": {"type": "string"},
        "do_not_say": {"type": "array", "items": {"type": "string"}},
    },
}

# -----------------------------------------------------------------------------
# Prompts
# -----------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an AI 911 training assistant. Generate exactly ONE realistic emergency scenario for a trainee 911 operator. Your response must be valid JSON only, no markdown or extra text.

Requirements:
- Scenario must be realistic and grounded: plausible emergencies, correct protocols, no fantasy or inappropriate content.
- Emphasize edge/rare scenarios that 911 operators must be trained on but are less common: e.g. domestic violence, suicidal caller, child calling for parent, intoxicated or confused caller, hearing-impaired caller, barricaded subject, hoax, medical with language barrier. Scale detail and complications by difficulty (easy: fewer; hard: more stress, misreporting, or emotional volatility).
- Keep scenarios not overly complex: 4-7 critical_info items, 4-7 expected_actions, 1-3 optional_complications. Short descriptions and caller_script lines.
- Language is always English ("en").
- Caller profile must include personal details: name, age, emotion, gender, race, and optionally other_relevant_details (e.g. accent, first language, occupation if relevant to the scenario, physical description). Use these so the persona and voice agent can generate realistic, grounded dialogue.
- Caller persona must be aligned to ElevenLabs Flash v2.5 voice settings: provide stability (0-1 float, lower = more emotional range), style (0-1 float), speed (float e.g. 0.9-1.2), and voice_description (short text: accent, age, gender, emotional tone). These will be used for the voice agent system prompt and ElevenLabs API.
- Voice-agent fields: role_instruction (one short line, e.g. "You are [name], [age], calling 911 as..."), scenario_summary_for_agent (2-4 sentences ground truth the agent must know), critical_info (facts the caller should reveal when asked), withheld_information (details that require more probing and questioning from the operator to surface—NOT information the persona is purposely hiding from 911. These are contextual details that help the operator understand the situation better but only come out when the operator asks the right questions. Examples: after a crime, perpetrator height/race/clothing; layout of the room; whether anyone else is in the building. Include 1-4 items for medium/hard; easy may have 0-1.), behavior_notes (how caller may react, e.g. may become tearful, may misstate address once), dialogue_directions (explicit acting directions for how to speak: disfluencies like ums/uhs/pauses, false starts, volatility of language, sentence length; scale by difficulty—easy: minimal fillers, clear sentences; medium: some hesitation, repetition; hard: heavy disfluency, fragmented speech, emotional outbursts, crying), response_behavior (array of short instructions for how to react to the operator, e.g. "Give address only after being asked" or "Reveal suspect description when operator asks what they looked like"), opening_line (the first thing the caller says when the call connects; one short line), do_not_say (array of phrases or topics the caller would never say—stay in character; e.g. "I'm an AI", "What's the script?", breaking the fourth wall).

Difficulty drives how the caller persona behaves (tone, coherence, need for calming). Match persona and behavior_notes to these patterns:

- **Easy:** The caller gives information relatively calmly and accurately. They answer questions in order, speak clearly, and stay coherent. Persona: higher stability (e.g. 0.6-0.8), normal speed (e.g. 1.0), voice_description like "calm, clear, cooperative" or "composed, speaks in full sentences". behavior_notes: "Caller remains cooperative and follows operator guidance; may need minimal reassurance."

- **Medium:** The caller is stressed or worried but can still answer when prompted. Some hesitation or repeated details; may need brief reassurance to stay on track. Persona: moderate stability (e.g. 0.4-0.6), slightly faster speed (e.g. 1.0-1.1), voice_description like "anxious but coherent" or "worried, occasional hesitation". behavior_notes: "Caller may repeat themselves or need one or two prompts to give location; remains responsive to direct questions."

- **Hard:** The caller is panicked, emotional, or overwhelmed and often must be calmed before useful information can be given. May cry, speak in fragments, give information out of order, or fixate on one detail. Persona: lower stability (e.g. 0.2-0.45), faster or uneven speed (e.g. 1.1-1.3), voice_description like "panicked, breathless, needs calming" or "distraught, crying, speaks in bursts". behavior_notes: "Caller is highly emotional; operator may need to calmly repeat questions and reassure before getting location or key facts; may misstate details once or become tearful mid-call."

Output JSON with this exact structure (use these keys):
{
  "scenario": {
    "id": "<unique short id>",
    "scenario_type": "<e.g. domestic-violence, suicidal-caller, cardiac-arrest, fire, traffic-accident>",
    "title": "<short title>",
    "description": "<2-4 sentences>",
    "caller_profile": { "name": "<string>", "age": <number>, "emotion": "<string>", "gender": "<string>", "race": "<string>", "other_relevant_details": "<optional: accent, first language, occupation, etc.>" },
    "critical_info": ["<item>", ...],
    "expected_actions": ["<item>", ...],
    "optional_complications": ["<item>", ...],
    "difficulty": "easy" | "medium" | "hard",
    "language": "en"
  },
  "persona": {
    "stability": <0-1 float>,
    "style": <0-1 float>,
    "speed": <float>,
    "voice_description": "<short: accent, age, gender, emotional tone>"
  },
  "caller_script": ["<suggested caller line>", ...],
  "role_instruction": "<one short line for voice agent>",
  "scenario_summary_for_agent": "<2-4 sentences ground truth>",
  "critical_info": ["<fact to reveal when asked>", ...],
  "withheld_information": ["<detail that needs operator probing to surface—e.g. perpetrator height/race, room layout; NOT purposely hidden>", ...],
  "behavior_notes": "<optional complications / how caller may react>",
  "dialogue_directions": "<how to speak: disfluencies, pauses, volatility; match difficulty (easy=clear, hard=fragmented/emotional)>",
  "response_behavior": ["<how to react to operator, e.g. Give address only after being asked>", ...],
  "opening_line": "<first thing caller says when call connects>",
  "do_not_say": ["<phrase/topic caller would never say>", ...]
}"""


def _user_prompt(difficulty: str) -> str:
    return f"""Generate one 911 training scenario for difficulty: {difficulty}. Return only the JSON object, no other text. Ensure the scenario is realistic, grounded, and appropriate for 911 operator training. Use edge or rare scenario types where appropriate for this difficulty level."""


# -----------------------------------------------------------------------------
# Generator and system prompt builder
# -----------------------------------------------------------------------------


def generate_scenario(difficulty: str) -> dict:
    """
    Generate a single scenario payload for the given difficulty.

    Args:
        difficulty: One of "easy", "medium", "hard".

    Returns:
        A dict with keys: scenario, persona, caller_script, role_instruction,
        scenario_summary_for_agent, critical_info, withheld_information, behavior_notes,
        dialogue_directions, response_behavior, opening_line, do_not_say.
        Ready for frontend and for build_voice_agent_system_prompt().

    Raises:
        ValueError: If OPENAI_API_KEY is missing or difficulty is invalid.
        Exception: On OpenAI API errors.
    """
    if difficulty not in ("easy", "medium", "hard"):
        raise ValueError("difficulty must be one of: easy, medium, hard")

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.8,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(difficulty)},
        ],
    )

    content = response.choices[0].message.content
    payload = json.loads(content)

    # Ensure scenario has id and language if missing
    scenario = payload.get("scenario", {})
    if not scenario.get("id"):
        scenario["id"] = f"scenario-{uuid.uuid4().hex[:8]}"
    if scenario.get("language") != "en":
        scenario["language"] = "en"
    payload["scenario"] = scenario

    return payload


def build_voice_agent_system_prompt(payload: dict) -> str:
    """
    Build a single system prompt string for the ElevenLabs Flash v2.5 voice agent
    from the scenario generator payload.

    Sections: Role, Caller personal details, Scenario summary, Critical info, Details that emerge with probing,
    Voice, Dialogue directions, Response behavior, Opening line, Do not say, Behavioral notes.
    """
    parts = []

    role = payload.get("role_instruction") or ""
    if role:
        parts.append(f"## Role\n{role}")

    scenario = payload.get("scenario") or {}
    caller_profile = scenario.get("caller_profile") or {}
    profile_parts = []
    for key in ("name", "age", "emotion", "gender", "race", "other_relevant_details"):
        val = caller_profile.get(key)
        if val is not None and val != "":
            profile_parts.append(f"- {key}: {val}")
    if profile_parts:
        parts.append(f"## Caller personal details\n" + "\n".join(profile_parts))

    summary = payload.get("scenario_summary_for_agent") or ""
    if summary:
        parts.append(f"## Scenario summary (ground truth)\n{summary}")

    critical = payload.get("critical_info")
    if isinstance(critical, list) and critical:
        lines = "\n".join(f"- {item}" for item in critical)
        parts.append(f"## Critical information to convey (reveal when the operator asks; do not dump all at once)\n{lines}")

    withheld = payload.get("withheld_information")
    if isinstance(withheld, list) and withheld:
        lines = "\n".join(f"- {item}" for item in withheld)
        parts.append(f"## Details that emerge with operator probing\n{lines}\nThese are NOT things you are purposely hiding. They are contextual details that help the operator understand the situation better; they simply don't come up until the operator asks the right questions (e.g. suspect description, layout, who else is present). When the operator probes or asks relevant questions, provide these details naturally.")

    persona = payload.get("persona") or {}
    voice_desc = persona.get("voice_description") or ""
    if voice_desc:
        parts.append(f"## Voice / how to speak\nYou sound like: {voice_desc}")

    dialogue_dir = payload.get("dialogue_directions") or ""
    if dialogue_dir:
        parts.append(f"## Dialogue / acting directions\n{dialogue_dir}")

    response_beh = payload.get("response_behavior")
    if isinstance(response_beh, list) and response_beh:
        lines = "\n".join(f"- {item}" for item in response_beh)
        parts.append(f"## How to react to the operator\n{lines}")

    opening = payload.get("opening_line") or ""
    if opening:
        parts.append(f"## Opening line\nWhen the call connects, start with something like: \"{opening}\"")

    do_not = payload.get("do_not_say")
    if isinstance(do_not, list) and do_not:
        lines = "\n".join(f"- {item}" for item in do_not)
        parts.append(f"## Do NOT say (stay in character)\n{lines}")

    behavior = payload.get("behavior_notes") or ""
    if behavior:
        parts.append(f"## Behavioral notes\n{behavior}")

    return "\n\n".join(parts) if parts else ""
