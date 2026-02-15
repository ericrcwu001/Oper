/** Point type for map markers (911 call vs police/fire/ambulance vs crime dot). */
export type MapPointType = "911" | "police" | "fire" | "ambulance" | "crime"

/** Optional popup fields for 911 calls. */
export interface MapPoint911Popup {
  location?: string
  description?: string
  callerId?: string
  callerName?: string
  timestamp?: string
}

/** Optional popup fields for resource points (police, fire, ambulance). */
export interface MapPointResourcePopup {
  location?: string
  officerInCharge?: string
  unitId?: string
  /** true = en route, false = idle/roaming */
  status?: boolean
}

/** Single point on the SF map. Position is lat/lng; parent updates for movement. */
export interface MapPoint {
  id: string
  type: MapPointType
  lat: number
  lng: number
  label?: string
  selected?: boolean
  disabled?: boolean
  // 911 popup fields
  location?: string
  description?: string
  callerId?: string
  callerName?: string
  timestamp?: string
  // Resource popup fields
  officerInCharge?: string
  unitId?: string
  /** true = en route, false = idle/roaming */
  status?: boolean
  /** Optional scale for circle radius (e.g. 1.5 for pop-in effect). */
  radiusScale?: number
  /** True when this unit is among the closest available (resource allocation); show highlight on map. */
  recommended?: boolean
}
