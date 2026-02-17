## Inspiration
Every year, U.S dispatchers handle ~240 million 911 calls. Yet 82% of emergency communication centers are understaffed, and over 70% of dispatchers report burnout and chronic stress. When systems are stretched this thin, response times suffer — in San Francisco alone, the average 911 answer time recently exceeded 60 seconds. 
After interviewing the Director of Stanford EMS and active EMTs, we learned that dispatchers are being asked to do two fundamentally different jobs simultaneously: manage complex resource allocation across an entire city while providing emotional support to people in crisis. One EMT told us, "We're trained to ignore dispatcher information because it's often incomplete—they're just overwhelmed trying to do everything at once." We wanted to create a solution that could support both fundamental jobs for dispatchers by removing the cognitive burden of city-scale decision-making and helping operators perform at their best when lives are on the line.

## What it does

Oper is a real-time emergency dispatch intelligence and training platform that augments 911 operators during live calls and strengthens them through protocol-grounded post-call feedback. It has 5 core components:

1. Live City Digital Twin
   Oper runs a real-time graph-based model of San Francisco’s road network, tracking every simulated police unit, ambulance, and fire truck — including their exact location and availability — updated every second.
2. Concurrent Emergency Simulation
   Using real historical SF 911 data, Oper simulates overlapping emergencies across the city so decisions are made within a live, resource-constrained environment.
3. Real-Time Call Intelligence
   During a call, Oper transcribes audio, extracts critical signals like severity and location, and retrieves official dispatch protocols using a RAG-backed LLM.
4. Resource-Aware Dispatch Optimization
   Oper combines caller context, protocol guidance, and live vehicle availability using a Haversine-based proximity algorithm to recommend the optimal set of specific EMS units at any given moment, complete with vehicle IDs and provided reasoning.
5. Post-Call Evaluation & Training
 After each call, Oper analyzes the full transcript against official protocols, scoring performance and flagging missed questions or delayed escalations. It provides line-by-line, in-context feedback within realistic, geography-aware training simulations.

### Additional Features
- Interactive Map Integration - Recommendations are directly linked to the live map, so that clicking a dispatch suggestion zooms to the exact responding unit, showing where they are and tracking them live. Labels are shown according to general 
- LLM-generated scenarios — Choose difficulty and get a unique scenario (caller, timeline, critical info) so every practice call is different and level-appropriate. 
- Priority from transcript — Incident type from the transcript maps to priority 1–5 and drives suggested unit counts and map emphasis so recommendations match severity.
- AI-Assisted Note Taking — Oper generates structured, context-aware notes in real time during the call. With a single click, operators can insert optimized notes directly into their record
- Crime sim clock — Historical crimes play back on a sped-up sim clock (e.g. 60×) so a full “day” of incidents unfolds during one practice call.
- Voice input — Respond by speaking using chained speech-to-text and text-to-speech models to handle conversations.
- Live hints — Optional rotating hints during the call (e.g. “Ask for address,” “Dispatch EMS”) so trainees see what the system would recommend in real time.
- Operator notes — Timestamped notes during the call are sent into post-call evaluation so feedback references what the operator actually wrote down.
- Crime resolution — When enough units stay at a crime for a set time, it clears and disappears so the map reflects real-time demand and “cleared” incidents.
- 3D beacons — With the map tilted, 911 and crime points become vertical pillars; crime height scales by priority so severity is visible at a glance.
- SF Graph Visualization— Solid, slightly larger dots = available EMS vehicles color coded by vehicle type; translucent = busy; recommended units get a highlighted ring to distinguish units that are free and suggested.
- Transcript highlights — Review shows inline badges (Missed, Red flag, Good move) on the transcript so feedback is anchored to specific moments in the call.
- Dashboard + persistence — Sessions saved to Supabase; dashboard lists them with summary stats and a session drawer (scores, notes, “View full review”) so progress is trackable.
- Analytics charts — Score trend, missed-action frequency, and top recurring improvements so trainees and admins see patterns over time.

## How we built it
We started by building a custom graph of San Francisco from open road and intersection data, with nodes and edges that represent real geometry so we can update vehicle positions and run proximity logic in one place. That graph is updated every second by a backend simulation service that moves police, fire, and EMS units along the graph and ingests historical SF 911 crime data that was pulled from a open public Kaggle dataset, so we can simulate concurrent incidents in real time. The live map is rendered with MapLibre and a vector basemap; the frontend subscribes to the same simulation feed so the map and the graph stay in sync. For the voice layer, we built a custom pipeline: live audio is streamed into our backend, transcribed in real time, and fed into an LLM that extracts location, severity, and emergency type. We implemented RAG over official 911 dispatch and protocol documents so every suggestion is grounded in real procedures. We run a separate Haversine-based proximity ranking algorithm over the graph’s current state—position and availability updated every second—to compute the closest available unit per type and their ETAs; those results are exposed via an API and drive the recommendations and map highlights. The frontend pushes call context and receives back unit IDs and ETAs, and click-to-dispatch is implemented as a map zoom/focus to the chosen vehicle’s live position. Post-call evaluation uses the same RAG-backed LLM: we run the full transcript against the same protocol corpus, detect missed questions and delayed escalations, and score timeliness and critical information capture to produce structured feedback. For dispatcher training, we use the same simulation and map stack and add a separate AI caller so we can generate dynamic scenarios—including rare edge cases—so operators practice in the same resource-constrained, geographically accurate environment they’ll see on a real call.

## Challenges we ran into
- Keeping the digital twin and map in sync: The graph updates every second with vehicle positions and availability; the frontend had to consume that feed without jank or drift. We had to design a clear contract between the sim and the map (what gets pushed, when, and how the UI reacts) so the live map felt reliable.
- Voice --> structured data in real time: Turning live call audio into clean signals (location, severity, emergency type) for the LLM and RAG was hard—transcription delays, noise, and incomplete sentences meant we had to design the pipeline to handle partial or late updates and still produce usable recommendations.
- Grounded recommendations: We wanted every suggestion tied to real protocols, not generic advice. Getting RAG to retrieve the right protocol chunks from long documents and have the LLM use them consistently took a lot of prompt and retrieval tuning.
- Realistic simulation without real dispatch data: We don’t have live SF dispatch feeds, so we used open road data and historical 911 crime data to build a plausible, resource-constrained environment. Making that feel “real enough” for training and demos required careful design of the graph and crime injection.

## Accomplishments that we're proud of
- End-to-end live flow: From a single 911-style call (live or simulated), we run a digital twin, voice agent, RAG-backed suggestions, Haversine-based closest-unit ranking, and a live map with click-to-dispatch—all in one coherent experience. Getting that full loop working in a hackathon timeline was a big win.
- One system for live support and training: The same graph, sim, voice pipeline, and RAG power both live-call assistance and post-call evaluation plus scenario-based training. That reuse makes the product easier to explain and extend.
- Protocol-grounded AI: Recommendations and feedback are explicitly tied to official dispatch documents, not a generic chatbot. We’re proud that the system can cite protocols and surface missed steps and delayed escalations in a way that’s useful for real operators.
- Geographically real training: Operators can practice with an AI caller on a real SF road graph and simulated concurrent incidents, including edge cases. We’re proud that training happens in the same kind of resource-constrained, spatially accurate environment they’ll see on the job.


## What we learned
- Dispatchers are doing two jobs at once. Our interviews (Stanford EMS, EMTs) made it clear: the bottleneck isn’t only call volume—it’s the impossible combination of city-wide resource allocation and in-the-moment emotional support. That shaped our goal: help with the optimization so they can focus on the human.
- Simply sending the “Closest unit” isn’t enough in real world dispatch scenarios. Real dispatch has to consider type (police vs fire vs EMS), availability, and concurrent incidents. Building a live digital twin and Haversine-based ranking taught us how much structure is needed before “recommend a unit” is actually useful.
RAG has to be tuned for high-stakes domains. For 911, retrieval has to hit the right protocol slices and the LLM has to stick to them. We learned that good RAG is as much about document structure and evaluation as it is about the model.
Simulation makes the product tangible. A map with moving units and concurrent crimes made the value of Oper obvious to users and judges in a way that slides alone wouldn’t.

## What's next for Oper: 
- Pilot with a real center: We want to run Oper alongside real (anonymized or sandboxed) call flow at an emergency communication center to validate that our voice pipeline and recommendations hold up under real noise and protocols.
- Richer protocol coverage and compliance: Ingest more agency-specific protocols and refine RAG and evaluation so feedback and suggestions are even more accurate and defensible for training and QA.
- Multi-agency and multi-jurisdiction: Extend the digital twin and sim beyond SF so Oper can support regions with multiple agencies and different response rules.
- Integration with existing CAD/NG911 systems: Work toward APIs or integrations so Oper can plug into existing Computer-Aided Dispatch and next-gen 911 systems instead of being a standalone layer.
