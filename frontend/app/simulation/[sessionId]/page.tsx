"use client"

import { useState, useEffect, useRef, useMemo, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { TranscriptFeed } from "@/components/transcript-feed"
import { MicControl } from "@/components/mic-control"
import { AudioControl } from "@/components/audio-control"
import { NotesPanel } from "@/components/notes-panel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Phone,
  PhoneOff,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  Heart,
  Flame,
  Car,
  Send,
  HelpCircle,
  Loader2,
  AlertCircle,
  Shield,
} from "lucide-react"
import { scenarios } from "@/lib/mock-data"
import {
  generateCallAudio,
  interact,
  interactWithVoice,
  assessCallTranscript,
  fetchClosestVehicles,
  fetchCrimesDay,
  fetchVehicles,
  postCrimesForSteering,
  type GeneratedScenarioPayload,
  type CallScenarioInput,
  type CrimeRecord,
} from "@/lib/api"
import type {
  TranscriptTurn,
  ConnectionStatus,
  ScenarioType,
  Scenario,
  NoteEntry,
  Difficulty,
} from "@/lib/types"
import type { MapPoint } from "@/lib/map-types"
import { SFMap } from "@/components/sf-map"
import { cn } from "@/lib/utils"
import {
  SIM_SECONDS_PER_TICK,
  CRIME_RESOLVE_RADIUS_DEG,
  MIN_VEHICLES_AT_SCENE,
  SIM_SECONDS_AT_SCENE_TO_RESOLVE,
  CRIME_SIM_CLOCK_SPEEDUP,
} from "@/lib/simulation-constants"

/** Default 911 call point (used when no scenario location). */
const DEFAULT_911_POINT: MapPoint = {
  id: "call-1",
  type: "911",
  lat: 37.7749,
  lng: -122.4194,
  location: "2500 Mission St, SF",
  description: "Cardiac arrest reported",
  callerId: "CALL-001",
  callerName: "Jane Doe",
  timestamp: "14:32",
}

/** Map LLM unit type to simulation vehicle type for list-click zoom. */
function unitTypeToSimType(unit: string): "ambulance" | "police" | "fire" | null {
  switch (unit) {
    case "EMT_BLS":
    case "ALS":
      return "ambulance"
    case "Police":
    case "SWAT":
      return "police"
    case "Fire":
      return "fire"
    default:
      return null
  }
}

/** Initial map points. Optional override911 uses scenario-generated SF location for the 911 call. */
function getInitialMapPoints(override911?: {
  lat: number
  lng: number
  address: string
}): MapPoint[] {
  const callPoint: MapPoint = override911
    ? {
        ...DEFAULT_911_POINT,
        lat: override911.lat,
        lng: override911.lng,
        location: override911.address,
      }
    : DEFAULT_911_POINT
  return [
    callPoint,
    {
      id: "unit-p1",
      type: "police",
      lat: 37.78,
      lng: -122.41,
      location: "Mission District",
      officerInCharge: "Sgt. Smith",
      unitId: "PD-12",
      status: true,
    },
    {
      id: "unit-f1",
      type: "fire",
      lat: 37.768,
      lng: -122.43,
      location: "SOMA",
      officerInCharge: "Capt. Jones",
      unitId: "FD-7",
      status: false,
    },
  ]
}

/** Count emergency vehicles (police/fire/ambulance) within radiusDeg of (lat, lng). */
function countVehiclesNear(
  vehicles: MapPoint[],
  lat: number,
  lng: number,
  radiusDeg: number
): number {
  const r2 = radiusDeg * radiusDeg
  return vehicles.filter((p) => {
    if (p.type !== "police" && p.type !== "fire" && p.type !== "ambulance") return false
    const dlat = p.lat - lat
    const dlng = p.lng - lng
    return dlat * dlat + dlng * dlng <= r2
  }).length
}

const GENERATED_SCENARIO_STORAGE_KEY = "simulation-generated-scenario"

function buildScenarioPayload(
  scenario: Scenario,
  difficulty?: Difficulty
): {
  scenarioDescription: string
  callerDescription: string
  difficulty?: Difficulty
} {
  return {
    scenarioDescription: scenario.description,
    callerDescription: scenario.callerDescription,
    difficulty: difficulty ?? scenario.difficulty,
  }
}

/** Map generator payload to frontend Scenario for UI and hints. */
function payloadToScenario(payload: GeneratedScenarioPayload): Scenario {
  const s = payload.scenario
  const type = (
    ["cardiac-arrest", "fire", "traffic-accident"] as ScenarioType[]
  ).includes(s.scenario_type as ScenarioType)
    ? (s.scenario_type as ScenarioType)
    : "cardiac-arrest"
  const p = s.caller_profile
  return {
    id: s.id,
    scenarioType: type,
    title: s.title,
    description: s.description,
    callerDescription: `${p.name}, ${p.age}y, ${p.emotion}`,
    callerProfile: {
      name: p.name,
      age: p.age,
      emotion: p.emotion,
    },
    criticalInfo: s.critical_info ?? [],
    expectedActions: s.expected_actions ?? [],
    optionalComplications: s.optional_complications ?? [],
    difficulty: s.difficulty as Scenario["difficulty"],
    language: (s.language as Scenario["language"]) || "en",
  }
}

const scenarioIcons: Record<string, React.ElementType> = {
  "cardiac-arrest": Heart,
  fire: Flame,
  "traffic-accident": Car,
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** Timeline: keys = seconds (string), values = event description. Returns events in (lastSeconds, currentSeconds]. */
function getEventsSince(
  lastSeconds: number,
  currentSeconds: number,
  timeline: Record<string, string> | undefined
): string[] {
  if (!timeline || typeof timeline !== "object") return []
  const out: string[] = []
  for (const [key, desc] of Object.entries(timeline)) {
    const t = parseInt(key, 10)
    if (Number.isNaN(t)) continue
    if (t > lastSeconds && t <= currentSeconds && typeof desc === "string" && desc.trim()) {
      out.push(desc.trim())
    }
  }
  return out.sort((_a, _b) => 0) // keep insertion order; keys may not be sorted
}

export default function LiveSimulationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const scenarioIdFromUrl = searchParams.get("scenario")
  const hintsEnabled = searchParams.get("hints") === "true"
  const selectedDifficulty = (searchParams.get("difficulty") as Difficulty) || "medium"

  const fallbackScenario =
    scenarios.find((s) => s.id === (scenarioIdFromUrl || "scenario-1")) ||
    scenarios[0]
  const [scenario, setScenario] = useState<Scenario>(fallbackScenario)
  const [scenarioPayload, setScenarioPayload] =
    useState<GeneratedScenarioPayload | null>(null)
  const [scenarioCallLocation, setScenarioCallLocation] = useState<{
    lat: number
    lng: number
    address: string
  } | null>(null)
  const scenarioCallLocationRef = useRef<typeof scenarioCallLocation>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(
        `${GENERATED_SCENARIO_STORAGE_KEY}-${sessionId}`
      )
      if (raw) {
        const payload = JSON.parse(raw) as GeneratedScenarioPayload
        if (payload?.scenario) {
          setScenario(payloadToScenario(payload))
          setScenarioPayload(payload)
          return
        }
      }
    } catch {
      // ignore
    }
    setScenario(fallbackScenario)
    setScenarioPayload(null)
  }, [sessionId, scenarioIdFromUrl])

  scenarioCallLocationRef.current = scenarioCallLocation

  useEffect(() => {
    const loc = scenarioPayload?.scenario?.location
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      setScenarioCallLocation({ lat: loc.lat, lng: loc.lng, address: loc.address ?? "San Francisco, CA" })
    } else {
      setScenarioCallLocation(null)
    }
  }, [scenarioPayload])

  useEffect(() => {
    if (!scenarioCallLocation) return
    setMapPoints((prev) =>
      prev.map((p) =>
        p.id === "call-1" && p.type === "911"
          ? { ...p, lat: scenarioCallLocation.lat, lng: scenarioCallLocation.lng, location: scenarioCallLocation.address }
          : p
      )
    )
  }, [scenarioCallLocation])

  const scenarioForApi: CallScenarioInput =
    scenarioPayload ?? buildScenarioPayload(scenario, selectedDifficulty)
  const ScenarioIcon =
    scenarioIdFromUrl === "generated"
      ? Activity
      : (scenarioIcons[scenario.scenarioType] || Heart)
  const scenarioId = scenario.id

  const [callActive, setCallActive] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([])
  const [partialText, setPartialText] = useState("")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected")
  const [latency, setLatency] = useState(0)
  const [loading, setLoading] = useState(true)
  const [textInput, setTextInput] = useState("")
  const [wsError, setWsError] = useState(false)
  const [currentHint, setCurrentHint] = useState("")
  const [callerAudioUrl, setCallerAudioUrl] = useState<string | null>(null)
  const [conversationHistory, setConversationHistory] = useState<
    { role: "caller" | "operator"; content: string }[]
  >([])
  const [lastCallerResponseSeconds, setLastCallerResponseSeconds] = useState(0)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteEntry[]>([])
  const [mapPoints, setMapPoints] = useState<MapPoint[]>(() => getInitialMapPoints())
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  // SF crimes feed: visible until enough vehicles at scene for long enough
  const [crimesFromApi, setCrimesFromApi] = useState<CrimeRecord[]>([])
  const [crimesDate, setCrimesDate] = useState<string | null>(null)
  const [crimeSimSeconds, setCrimeSimSeconds] = useState(0)
  const [crimeResolvedIds, setCrimeResolvedIds] = useState<Set<string>>(new Set())
  const [crimeProximitySeconds, setCrimeProximitySeconds] = useState<Record<string, number>>({})
  const crimePointsRef = useRef<MapPoint[]>([])
  const mapPointsRef = useRef<MapPoint[]>([])
  const crimeResolvedIdsRef = useRef<Set<string>>(new Set())
  const crimeProximitySecondsRef = useRef<Record<string, number>>({})
  const [crimePopScales, setCrimePopScales] = useState<Record<string, number>>({})
  const previousCrimeIdsRef = useRef<Set<string>>(new Set())
  const [dispatchRecommendation, setDispatchRecommendation] = useState<{
    units: { unit: string; rationale?: string; severity?: string }[]
    severity: string
    critical?: boolean
    suggestedCount?: number
    stage?: "preliminary" | "confirming" | "confirmed"
    latestTrigger?: { rationale: string; severity: string }[]
    resourceContextUsed?: string
    closestVehicleIds?: string[]
    closestVehicleByType?: { ambulance?: string | null; police?: string | null; fire?: string | null }
  } | null>(null)
  const [isAssessingDispatch, setIsAssessingDispatch] = useState(false)
  /** Closest-available vehicle IDs for map highlight; updated by assess + polling so highlights stay live. */
  const [highlightedVehicleIds, setHighlightedVehicleIds] = useState<string[]>([])
  /** When set, map flies to this point (e.g. after clicking a dispatch list item). */
  const [mapFlyToTarget, setMapFlyToTarget] = useState<{ lat: number; lng: number } | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tick30Ref = useRef<ReturnType<typeof setInterval> | null>(null)
  const angleRef = useRef(0)
  const crimeSimSecondsRef = useRef(0)
  const crimesFromApiRef = useRef<CrimeRecord[]>([])
  crimeSimSecondsRef.current = crimeSimSeconds
  crimesFromApiRef.current = crimesFromApi
  mapPointsRef.current = mapPoints
  crimeResolvedIdsRef.current = crimeResolvedIds
  crimeProximitySecondsRef.current = crimeProximitySeconds

  // Simulated loading
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200)
    return () => clearTimeout(t)
  }, [])

  // Fetch SF crimes for simulation day (one day from CSV, configurable speed playback)
  useEffect(() => {
    fetchCrimesDay()
      .then(({ date, crimes }) => {
        setCrimesDate(date)
        setCrimesFromApi(crimes)
      })
      .catch(() => {
        setCrimesFromApi([])
      })
  }, [])

  // Visible crimes: sim time passed and not yet resolved (resolved when enough vehicles at scene for long enough)
  const crimeMapPoints = useMemo(() => {
    return crimesFromApi
      .filter(
        (c) =>
          c.simSecondsFromMidnight <= crimeSimSeconds && !crimeResolvedIds.has(c.id)
      )
      .map((c) => ({
        id: c.id,
        type: "crime" as const,
        lat: c.lat,
        lng: c.lng,
        location: c.category,
        description: c.address,
        callerId: c.description,
        radiusScale: crimePopScales[c.id] ?? 1,
      }))
  }, [crimesFromApi, crimeSimSeconds, crimeResolvedIds, crimePopScales])
  crimePointsRef.current = crimeMapPoints

  // Mark closest-available (recommended) vehicles for map highlight; source: assess response + polling
  const mapPointsWithRecommended = useMemo(() => {
    const ids = new Set(highlightedVehicleIds)
    return mapPoints.map((p) => ({ ...p, recommended: ids.has(p.id) }))
  }, [mapPoints, highlightedVehicleIds])

  // When new crimes appear, set pop scale for pop-in effect
  useEffect(() => {
    const currentIds = new Set(crimeMapPoints.map((p) => p.id))
    const prev = previousCrimeIdsRef.current
    const added = [...currentIds].filter((id) => !prev.has(id))
    if (added.length > 0) {
      setCrimePopScales((s) => {
        const next = { ...s }
        for (const id of added) next[id] = 1.55
        return next
      })
    }
    previousCrimeIdsRef.current = currentIds
  }, [crimeMapPoints])

  // Decay pop scale toward 1 so pop-in effect fades
  useEffect(() => {
    const id = setInterval(() => {
      setCrimePopScales((prev) => {
        if (Object.keys(prev).length === 0) return prev
        const next = { ...prev }
        for (const crimeId of Object.keys(next)) {
          const v = next[crimeId] * 0.92 + 0.08
          if (v <= 1.02) delete next[crimeId]
          else next[crimeId] = v
        }
        return next
      })
    }, 50)
    return () => clearInterval(id)
  }, [])

  // Poll backend vehicles every 1s; send active crimes so backend steers vehicles toward them (real movement).
  useEffect(() => {
    const POLL_MS = 1000
    const poll = async () => {
      try {
        const crimesForBackend = crimePointsRef.current.map((p) => ({ lat: p.lat, lng: p.lng }))
        await postCrimesForSteering(crimesForBackend).catch(() => {})
        const vehicles = await fetchVehicles()
        if (vehicles.length > 0) {
          const initial = getInitialMapPoints(scenarioCallLocation ?? undefined)
          const callPoint = initial.find((p) => p.type === "911")
          const base = (callPoint ? [callPoint, ...vehicles] : vehicles) as MapPoint[]
          setMapPoints([...base, ...crimePointsRef.current])
        }
        // If vehicles.length === 0, don't overwrite — keep existing mapPoints (initial or animated demo)
      } catch {
        // API down or CORS: leave mapPoints as-is
      }
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [scenarioCallLocation])

  // Single time tick: advance crime sim clock, resolve crimes when enough vehicles at scene long enough, then update map
  useEffect(() => {
    const TICK_MS = 1000 / 30
    tick30Ref.current = setInterval(() => {
      const nextSim = crimeSimSecondsRef.current + SIM_SECONDS_PER_TICK
      crimeSimSecondsRef.current = nextSim
      setCrimeSimSeconds(nextSim)

      const vehicles = mapPointsRef.current.filter(
        (p) => p.type === "police" || p.type === "fire" || p.type === "ambulance"
      )
      const visibleCrimes = crimesFromApiRef.current.filter(
        (c) =>
          c.simSecondsFromMidnight <= nextSim && !crimeResolvedIdsRef.current.has(c.id)
      )
      const newProximity: Record<string, number> = {}
      const newlyResolved: string[] = []
      for (const c of visibleCrimes) {
        const count = countVehiclesNear(vehicles, c.lat, c.lng, CRIME_RESOLVE_RADIUS_DEG)
        if (count >= MIN_VEHICLES_AT_SCENE) {
          const prevSec = crimeProximitySecondsRef.current[c.id] ?? 0
          const nextSec = prevSec + SIM_SECONDS_PER_TICK
          newProximity[c.id] = nextSec
          if (nextSec >= SIM_SECONDS_AT_SCENE_TO_RESOLVE) newlyResolved.push(c.id)
        }
      }

      if (Object.keys(newProximity).length > 0 || newlyResolved.length > 0) {
        setCrimeProximitySeconds((prev) => {
          const next = { ...prev, ...newProximity }
          for (const id of newlyResolved) delete next[id]
          return next
        })
        crimeProximitySecondsRef.current = {
          ...crimeProximitySecondsRef.current,
          ...newProximity,
        }
        for (const id of newlyResolved) delete crimeProximitySecondsRef.current[id]
        if (newlyResolved.length > 0) {
          setCrimeResolvedIds((prev) => {
            const next = new Set(prev)
            for (const id of newlyResolved) next.add(id)
            return next
          })
          crimeResolvedIdsRef.current = new Set([
            ...crimeResolvedIdsRef.current,
            ...newlyResolved,
          ])
        }
      }

      setMapPoints((prev) => {
        const crimes = crimePointsRef.current
        let next: MapPoint[]
        if (prev.length > 10) {
          const nonCrime = prev.filter((p) => p.type !== "crime")
          next = [...nonCrime, ...crimes]
        } else {
          const base = getInitialMapPoints(scenarioCallLocationRef.current ?? undefined)
          const police = base.find((p) => p.id === "unit-p1")
          if (!police || police.type !== "police") {
            next = [...base, ...crimes]
          } else {
            angleRef.current += (2 * Math.PI * 0.2) / 30
            const r = 0.003
            const lat = 37.78 + r * Math.sin(angleRef.current)
            const lng = -122.41 + r * Math.cos(angleRef.current)
            const animatedBase = base.map((p) =>
              p.id === "unit-p1" ? { ...p, lat, lng } : p
            )
            next = [...animatedBase, ...crimes]
          }
        }
        return next.length > 0 ? next : prev
      })
    }, TICK_MS)
    return () => {
      if (tick30Ref.current) clearInterval(tick30Ref.current)
    }
  }, [])

  // Call timer
  useEffect(() => {
    if (callActive) {
      timerRef.current = setInterval(() => {
        setCallSeconds((prev) => prev + 1)
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [callActive])

  // Latency updater
  useEffect(() => {
    if (callActive) {
      const interval = setInterval(() => {
        setLatency(Math.floor(Math.random() * 40 + 20))
      }, 2000)
      return () => clearInterval(interval)
    }
    setLatency(0)
  }, [callActive])

  // Live eval: re-run dispatch assessment on every caller response (start call + each interact response)
  useEffect(() => {
    if (!callActive || conversationHistory.length === 0) {
      setDispatchRecommendation(null)
      setIsAssessingDispatch(false)
      return
    }
    const callerTranscript = conversationHistory
      .filter((t) => t.role === "caller")
      .map((t) => t.content)
      .join(" ")
      .trim()
    if (!callerTranscript) {
      setIsAssessingDispatch(false)
      return
    }
    const incidentLocation =
      scenarioCallLocation ?? { lat: DEFAULT_911_POINT.lat, lng: DEFAULT_911_POINT.lng }
    let cancelled = false
    setIsAssessingDispatch(true)
    assessCallTranscript(callerTranscript, { incidentLocation })
      .then((res) => {
        if (!cancelled) {
          setDispatchRecommendation(res)
          setHighlightedVehicleIds(res.closestVehicleIds ?? [])
          setIsAssessingDispatch(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDispatchRecommendation(null)
          setIsAssessingDispatch(false)
        }
      })
    return () => { cancelled = true }
  }, [callActive, conversationHistory, scenarioCallLocation])

  // Poll closest-available vehicles every 2s while call is active so map highlight updates as positions/availability change
  useEffect(() => {
    if (!callActive) {
      setHighlightedVehicleIds([])
      return
    }
    const incidentLocation =
      scenarioCallLocation ?? { lat: DEFAULT_911_POINT.lat, lng: DEFAULT_911_POINT.lng }
    const poll = async () => {
      try {
        const res = await fetchClosestVehicles(incidentLocation)
        setHighlightedVehicleIds(res.closestVehicleIds)
      } catch {
        // Keep previous highlights on error
      }
    }
    poll()
    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [callActive, scenarioCallLocation])

  // Hint system
  const hintActions =
    scenarioPayload?.scenario?.expected_actions ?? scenario.expectedActions
  useEffect(() => {
    if (!callActive || !hintsEnabled) {
      setCurrentHint("")
      return
    }
    const hints = hintActions
    let hintIdx = 0
    const interval = setInterval(() => {
      if (hintIdx < hints.length) {
        setCurrentHint(hints[hintIdx])
        hintIdx++
      }
    }, 12000)
    // Show first hint after 5s
    const firstHint = setTimeout(() => {
      setCurrentHint(hints[0] || "")
      hintIdx = 1
    }, 5000)
    return () => {
      clearInterval(interval)
      clearTimeout(firstHint)
    }
  }, [callActive, hintsEnabled, hintActions])

  const handleStartCall = async () => {
    if (scenarioIdFromUrl === "generated" && !scenarioPayload) {
      setApiError("Generated scenario not found. Please start again from the setup page.")
      return
    }
    setConnectionStatus("connecting")
    setWsError(false)
    setApiError(null)
    setTranscript([])
    setCallerAudioUrl(null)
    setConversationHistory([])
    setNotes([])
    setLastCallerResponseSeconds(0)
    try {
      const data = await generateCallAudio(scenarioForApi, {
        callTimestampSeconds: 0,
      })
      setCallerAudioUrl(data.audioUrl)
      setTranscript([
        {
          id: `t-${Date.now()}`,
          timestamp: 0,
          speaker: "caller",
          text: data.transcript,
        },
      ])
      setConversationHistory([{ role: "caller", content: data.transcript }])
      setLastCallerResponseSeconds(0)
      setCallActive(true)
      setConnectionStatus("connected")
      setCallSeconds(0)
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to start call")
      setConnectionStatus("disconnected")
    }
  }

  const handleEndCall = () => {
    setCallActive(false)
    setConnectionStatus("disconnected")
    setPartialText("")
    setCallerAudioUrl(null)
    setConversationHistory([])
    setDispatchRecommendation(null)
    setHighlightedVehicleIds([])
    try {
      sessionStorage.setItem(
        `simulation-transcript-${sessionId}`,
        JSON.stringify(transcript)
      )
      sessionStorage.setItem(
        `simulation-notes-${sessionId}`,
        JSON.stringify(notes)
      )
    } catch {
      // ignore storage errors
    }
    router.push(`/simulation/${sessionId}/review?scenario=${scenarioId}`)
  }

  const handleSendText = async () => {
    const message = textInput.trim()
    if (!message || !callActive) return
    setTranscript((prev) => [
      ...prev,
      {
        id: `t-op-${Date.now()}`,
        timestamp: callSeconds,
        speaker: "operator",
        text: message,
      },
    ])
    setTextInput("")
    setApiError(null)
    setApiLoading(true)
    const timeline = scenarioPayload?.timeline
    const eventsSince = getEventsSince(
      lastCallerResponseSeconds,
      callSeconds,
      timeline
    )
    try {
      const data = await interact(
        scenarioForApi,
        message,
        conversationHistory,
        {
          callTimestampSeconds: callSeconds,
          eventsSinceLastResponse:
            eventsSince.length > 0 ? eventsSince : undefined,
        }
      )
      setConversationHistory(data.conversationHistory)
      setCallerAudioUrl(data.audioUrl)
      setLastCallerResponseSeconds(callSeconds)
      setTranscript((prev) => [
        ...prev,
        {
          id: `t-${Date.now()}`,
          timestamp: callSeconds,
          speaker: "caller",
          text: data.transcript,
        },
      ])
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to get caller response")
    } finally {
      setApiLoading(false)
    }
  }

  const handleRequestClarification = async () => {
    if (!callActive) return
    const message =
      "Can you please repeat that? I need to make sure I have the correct information."
    setTranscript((prev) => [
      ...prev,
      {
        id: `t-op-clar-${Date.now()}`,
        timestamp: callSeconds,
        speaker: "operator",
        text: message,
      },
    ])
    setApiError(null)
    setApiLoading(true)
    const timelineClarify = scenarioPayload?.timeline
    const eventsSinceClarify = getEventsSince(
      lastCallerResponseSeconds,
      callSeconds,
      timelineClarify
    )
    try {
      const data = await interact(
        scenarioForApi,
        message,
        conversationHistory,
        {
          callTimestampSeconds: callSeconds,
          eventsSinceLastResponse:
            eventsSinceClarify.length > 0 ? eventsSinceClarify : undefined,
        }
      )
      setConversationHistory(data.conversationHistory)
      setCallerAudioUrl(data.audioUrl)
      setLastCallerResponseSeconds(callSeconds)
      setTranscript((prev) => [
        ...prev,
        {
          id: `t-${Date.now()}`,
          timestamp: callSeconds,
          speaker: "caller",
          text: data.transcript,
        },
      ])
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to get caller response")
    } finally {
      setApiLoading(false)
    }
  }

  const handleVoiceRecordingComplete = async (blob: Blob) => {
    if (!callActive) return
    setApiError(null)
    setApiLoading(true)
    const timelineVoice = scenarioPayload?.timeline
    const eventsSinceVoice = getEventsSince(
      lastCallerResponseSeconds,
      callSeconds,
      timelineVoice
    )
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => {
          const dataUrl = r.result as string
          const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : ""
          resolve(base64)
        }
        r.onerror = () => reject(new Error("Failed to read recording"))
        r.readAsDataURL(blob)
      })
      const data = await interactWithVoice(
        scenarioForApi,
        base64,
        conversationHistory,
        {
          callTimestampSeconds: callSeconds,
          eventsSinceLastResponse:
            eventsSinceVoice.length > 0 ? eventsSinceVoice : undefined,
        }
      )
      setConversationHistory(data.conversationHistory)
      setCallerAudioUrl(data.audioUrl)
      setLastCallerResponseSeconds(callSeconds)
      const operatorTurn = data.conversationHistory[data.conversationHistory.length - 2]
      const operatorText =
        operatorTurn?.role === "operator" ? operatorTurn.content : "[Voice]"
      setTranscript((prev) => [
        ...prev,
        {
          id: `t-op-${Date.now()}`,
          timestamp: callSeconds,
          speaker: "operator",
          text: operatorText,
        },
        {
          id: `t-${Date.now()}`,
          timestamp: callSeconds,
          speaker: "caller",
          text: data.transcript,
        },
      ])
    } catch (e) {
      setApiError(
        e instanceof Error ? e.message : "Failed to send voice message"
      )
    } finally {
      setApiLoading(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
          <div className="mb-6 flex flex-col gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">
            <Skeleton className="h-[500px] rounded-lg" />
            <Skeleton className="h-[500px] rounded-lg" />
            <Skeleton className="h-[500px] rounded-lg" />
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex h-screen flex-col pl-14 pr-4 lg:pl-16 lg:pr-6">
        {/* Compact header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b py-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">Live Call</h1>
            <span className="text-xs text-muted-foreground">Session {sessionId}</span>
            {scenarioPayload?.scenario?.title ?? scenario.title ? (
              <span className="truncate text-sm text-muted-foreground">
                — {scenarioPayload?.scenario?.title ?? scenario.title}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {callActive && (
              <>
                <span className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTime(callSeconds)}
                </span>
                {connectionStatus === "connected" && (
                  <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent text-xs">
                    <Activity className="h-3 w-3 animate-pulse" />
                    Live
                  </Badge>
                )}
              </>
            )}
            {!callActive ? (
              <Button
                onClick={handleStartCall}
                size="sm"
                className="gap-1.5"
                disabled={
                  connectionStatus === "connecting" ||
                  (scenarioIdFromUrl === "generated" && !scenarioPayload)
                }
              >
                {connectionStatus === "connecting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                {connectionStatus === "connecting" ? "Connecting..." : "Start Call"}
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={handleEndCall} className="gap-1.5">
                <PhoneOff className="h-4 w-4" />
                End Call
              </Button>
            )}
          </div>
        </div>

        {/* Errors */}
        {(wsError || apiError) && (
          <div className="flex shrink-0 items-center gap-3 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{apiError ?? "WebSocket disconnected."}</span>
            {!callActive && (
              <Button size="sm" variant="outline" onClick={() => { setWsError(false); setApiError(null); handleStartCall(); }}>
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Hint */}
        {currentHint && hintsEnabled && callActive && (
          <div className="flex shrink-0 items-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-sm">
            <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground"><span className="font-medium">Hint:</span> {currentHint}</span>
          </div>
        )}

        {/* Main: Left = Map (50%), Right = Transcript top, Controls | Dispatch bottom */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 py-3 lg:flex-row">
          {/* Left half — Map */}
          <div className="flex min-h-[280px] min-w-0 flex-1 flex-col lg:min-h-0 lg:max-w-[50%]">
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border bg-card">
              <div className="relative min-h-0 flex-1 w-full">
                <SFMap
                  points={mapPointsWithRecommended}
                  selectedPointId={selectedPointId}
                  onSelectPoint={setSelectedPointId}
                  flyToTarget={mapFlyToTarget}
                  onFlyToComplete={() => setMapFlyToTarget(null)}
                  className="absolute inset-0 h-full w-full"
                />
                <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-4 rounded-md border border-border/80 bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" aria-hidden />
                    911
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" aria-hidden />
                    Police
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#F97316]" aria-hidden />
                    Fire
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" aria-hidden />
                    Ambulance
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FCD34D]" aria-hidden />
                    Crime
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-[#E879F9] bg-transparent" aria-hidden />
                    Closest available
                  </span>
                  {crimesDate && (
                    <span className="text-muted-foreground">Day: {crimesDate} ({CRIME_SIM_CLOCK_SPEEDUP}×)</span>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Right half — 4 components: transcript (top), then bottom split = controls + dispatch | notes */}
          <div className="flex min-h-[320px] min-w-0 flex-1 flex-col gap-3 lg:min-h-0">
            {/* Top half: Live transcription (greatest priority, full width) */}
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border bg-card min-w-0">
              <CardHeader className="shrink-0 border-b py-2.5">
                <CardTitle className="text-sm font-medium">Live transcription</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Caller and operator — scroll to see full conversation
                </p>
              </CardHeader>
              <div className="min-h-0 flex-1 overflow-hidden">
                <TranscriptFeed turns={transcript} partialText={partialText} />
              </div>
            </Card>

            {/* Bottom half: split — (Controls + Dispatch) | Notes */}
            <div className="flex shrink-0 flex-col gap-2 lg:flex-row lg:min-h-0">
              {/* Left: User controls (mic + level) then Dispatch */}
              <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto lg:min-h-0 lg:max-w-[55%]">
                <Card className="shrink-0 border bg-card">
                  <CardContent className="flex flex-col gap-2 py-2 px-3 sm:flex-row sm:items-center sm:gap-4 sm:flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0 w-14">Caller</span>
                      <AudioControl audioUrl={callerAudioUrl} disabled={!callActive} compact />
                    </div>
                    <div className="flex items-center gap-2 min-w-0 border-t pt-2 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-4">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0 w-10">Mic</span>
                      <MicControl
                        disabled={!callActive}
                        onRecordingComplete={handleVoiceRecordingComplete}
                        sending={apiLoading}
                        compact
                      />
                    </div>
                  </CardContent>
                </Card>
                {/* Dispatch recommendations underneath controls */}
            <Card
              className={cn(
                "shrink-0 border bg-card transition-all relative overflow-hidden",
                callActive && "ring-1 ring-primary/30",
                isAssessingDispatch && "ring-primary/50 shadow-md"
              )}
            >
              {callActive && isAssessingDispatch && (
                <>
                  <div
                    className="absolute inset-0 pointer-events-none z-0 opacity-20"
                    aria-hidden
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/25 to-transparent animate-live-shimmer" />
                  </div>
                  <div className="relative z-10 border-b border-primary/30 bg-primary/10 px-3 py-2 flex items-center gap-2">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                    </span>
                    <span className="text-xs font-semibold text-primary">LLM analyzing…</span>
                    <div className="flex-1 h-1 rounded-full bg-primary/20 overflow-hidden ml-1">
                      <div className="h-full w-1/3 rounded-full bg-primary animate-live-shimmer min-w-[60px]" />
                    </div>
                  </div>
                </>
              )}
              <CardHeader className={cn("pb-2 relative z-10", isAssessingDispatch && "pt-2")}>
                <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Dispatch recommendations
                  </span>
                  {callActive && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                        isAssessingDispatch
                          ? "bg-primary/15 text-primary border border-primary/40"
                          : "bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/40"
                      )}
                    >
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          isAssessingDispatch
                            ? "bg-primary animate-live-pulse"
                            : "bg-green-500 animate-live-pulse"
                        )}
                      />
                      {isAssessingDispatch ? "Analyzing" : "Live"}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 relative z-10">
                {!callActive ? (
                  <p className="text-xs text-muted-foreground">
                    Start a call to see live dispatch suggestions from the caller&apos;s words.
                  </p>
                ) : isAssessingDispatch && !dispatchRecommendation ? (
                  <p className="text-xs text-muted-foreground">
                    Waiting for first analysis…
                  </p>
                ) : !dispatchRecommendation ? (
                  <p className="text-xs text-muted-foreground">
                    Updates as the caller speaks. The LLM analyzes each response to suggest units.
                  </p>
                ) : (
                  <div className={cn("space-y-2", isAssessingDispatch && "opacity-90")}>
                    {isAssessingDispatch && (
                      <p className="text-xs text-primary/80 font-medium">Updating with latest…</p>
                    )}
                    {dispatchRecommendation.stage && (
                      <p className="text-xs font-medium text-muted-foreground capitalize">
                        {dispatchRecommendation.stage === "preliminary" && "Preliminary — gathering info"}
                        {dispatchRecommendation.stage === "confirming" && "Confirming — more context"}
                        {dispatchRecommendation.stage === "confirmed" && "Confirmed"}
                      </p>
                    )}
                    {dispatchRecommendation.latestTrigger && dispatchRecommendation.latestTrigger.length > 0 && (
                      <div className="rounded-md bg-primary/10 border border-primary/20 p-1.5">
                        <p className="text-xs font-medium text-primary mb-0.5">Just in:</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {dispatchRecommendation.latestTrigger.map((t, i) => (
                            <li key={i}>{t.rationale}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {dispatchRecommendation.suggestedCount != null && (
                      <p className="text-xs font-medium text-foreground">
                        Suggest sending{" "}
                        <span className="text-primary font-semibold">
                          {dispatchRecommendation.suggestedCount} unit
                          {dispatchRecommendation.suggestedCount !== 1 ? "s" : ""}
                        </span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Severity:{" "}
                      <span
                        className={cn(
                          "font-medium",
                          dispatchRecommendation.severity === "critical" && "text-red-500",
                          dispatchRecommendation.severity === "high" && "text-orange-500",
                          dispatchRecommendation.severity === "medium" && "text-yellow-500"
                        )}
                      >
                        {dispatchRecommendation.severity}
                        {dispatchRecommendation.critical && " (critical)"}
                      </span>
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-xs">
                      {dispatchRecommendation.units.map((u, i) => {
                        const vehicleId = (() => {
                          const simType = unitTypeToSimType(u.unit)
                          if (!simType) return null
                          return dispatchRecommendation.closestVehicleByType?.[simType] ?? null
                        })()
                        const point = vehicleId ? mapPoints.find((p) => p.id === vehicleId) : null
                        const canZoom = Boolean(point)
                        return (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => {
                                if (point) {
                                  setMapFlyToTarget({ lat: point.lat, lng: point.lng })
                                  setSelectedPointId(vehicleId)
                                }
                              }}
                              disabled={!canZoom}
                              className={cn(
                                "text-left hover:underline focus:outline-none focus:underline disabled:no-underline disabled:cursor-default",
                                canZoom && "cursor-pointer"
                              )}
                            >
                              <span className="font-medium">{u.unit}</span>
                              {u.rationale && (
                                <span className="text-muted-foreground"> — {u.rationale}</span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
              </div>

              {/* Right: Operator notes */}
              <Card className="flex min-h-[200px] min-w-0 flex-1 flex-col border bg-card overflow-hidden lg:min-h-0">
                <NotesPanel
                  callSeconds={callSeconds}
                  notes={notes}
                  onAddNote={(entry) => setNotes((prev) => [...prev, entry])}
                />
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
