Product Requirements Document (PRD)
Project: AI Emergency Response Simulator – 911 Operator Training
Objective:
Train 911 operators using realistic, AI-generated emergency call scenarios. Operators respond to live AI-driven calls, input notes and summaries, and receive real-time evaluation, analytics, and personalized feedback.

1. Product Overview
Problem:
911 operators need high-quality, scalable training in realistic scenarios.
Traditional training is limited, static, and often cannot simulate high-stress or rare emergencies.
Solution:
AI-generated, dynamic emergency scenarios
Live speech-to-speech interaction between operator and AI caller
Evaluation engine provides performance metrics and feedback
Dashboard visualizes performance and tracks improvement
Impact:
Improves operator readiness
Reduces errors in real emergencies
Provides scalable, customizable training

2. Key Features
Feature
Description
Priority
Scenario Generation
AI generates realistic emergencies (type, caller, critical info, expected actions)
Must-have
Speech-to-Speech Simulation
AI acts as caller (ElevenLabs TTS), operator responds via microphone (STT)
Must-have
Operator Input
Notes and summary captured during/after simulation
Must-have
AI Evaluation Engine
Compares operator response to scenario, scoring protocol adherence, timeliness, critical info capture
Must-have
Dashboard & Analytics
Scores, missed actions, conversation transcript, improvement suggestions
Must-have
Real-time Conversation
AI responds dynamically to operator inputs during call
Must-have
Multi-language Support
Optional translation of operator responses
Nice-to-have
Difficulty Levels
Scenario complexity adjustable
Nice-to-have
Stress/Performance Indicators
Tracks hesitation or errors in real-time
Nice-to-have


3. User Stories
As a trainee operator, I want to experience realistic emergency calls so I can practice responding correctly.
As a trainee operator, I want to see real-time feedback and a final score so I can improve my performance.
As a trainer, I want to review conversation transcripts and analytics so I can evaluate operator readiness.
As a trainee operator, I want the AI to respond dynamically so the simulation feels like a real call.

4. Technical Requirements
Component
Tech / Tool
Notes
Frontend
React + TailwindCSS
Live audio interface, notes input, dashboard
Backend
Express (Node.js)
REST APIs, scenario & evaluation engine
AI Models
OpenAI GPT
Scenario generation, dialogue generation, evaluation & feedback
Voice
ElevenLabs TTS, Whisper/Vosk STT
Speech-to-text & text-to-speech pipeline
Data Storage
SQLite/Supabase
Store scenarios, operator responses, evaluation metrics
Real-time
WebSockets
Stream conversation, sync audio & evaluation
DevOps
Vercel / Replit / Modal
Host frontend/backend, run inference efficiently


5. MVP Scope (36-Hour Hackathon)
AI generates 2-3 emergency scenarios (cardiac arrest, fire, accident)
Speech-to-speech live simulation (operator ↔ AI caller)
Operator inputs notes & summary
Evaluation engine scores performance and generates feedback
Dashboard shows transcript, scores, and key metrics

6. Success Metrics
Completion of at least 1 full live simulation
Real-time AI caller generation
Automatic evaluation & feedback displayed
Dashboard with transcript and metrics
Positive user testing: operator can navigate simulation and see useful feedback

7. Constraints & Risks
Limited training data for rare emergency scenarios → mitigate using AI-generated creative scenarios
Real-time speech processing latency → optimize STT/TTS and streaming to reduce latency
Accurate evaluation requires mapping AI scenario → operator response → mitigate by pre-defining expected actions

Optimal Initial AI Prompt
Here’s a starting prompt for the AI (OpenAI GPT) to generate scenarios and caller dialogue):
You are an AI 911 training assistant. Generate a realistic emergency scenario for a trainee 911 operator. Follow this structure:

1. Scenario Type (e.g., cardiac arrest, fire, assault, traffic accident)
2. Caller Profile (e.g., panicked parent, elderly bystander)
3. Critical Information (list key facts the operator must extract)
4. Expected Operator Actions (list correct steps in order)
5. Optional Complications (caller exaggerates, misreports, panics)

Then, simulate a conversation as the caller, responding naturally to operator input. Speak in short, realistic sentences, conveying urgency and stress. Ensure the scenario is safe, educational, and diverse.

Output format:
{
  "scenario_type": "...",
  "caller_profile": "...",
  "critical_info": ["...", "..."],
  "expected_actions": ["...", "..."],
  "optional_complications": ["...", "..."],
  "caller_lines": [
    {"turn": 1, "line": "..."},
    {"turn": 2, "line": "..."}
  ]
}

Make sure your conversation allows the operator to gather all critical information if they follow correct protocol.

This prompt can be looped for multiple scenario generations
Adjust temperature for creativity vs. realism


