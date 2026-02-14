"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"

const BAR_COUNT = 24
const MIN_HEIGHT = 4
const MAX_HEIGHT = 28

interface WaveformVisualizerProps {
  active: boolean
  className?: string
}

export function WaveformVisualizer({ active, className = "" }: WaveformVisualizerProps) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array(BAR_COUNT).fill(MIN_HEIGHT)
  )
  const rafRef = useRef<number>()
  const phaseRef = useRef(0)

  useEffect(() => {
    if (!active) {
      setHeights(Array(BAR_COUNT).fill(MIN_HEIGHT))
      return
    }
    let running = true
    const update = () => {
      if (!running) return
      phaseRef.current += 0.12
      setHeights((prev) =>
        prev.map((_, i) => {
          const wave = Math.sin(phaseRef.current + i * 0.4) * 0.5 + 0.5
          const noise = Math.random() * 0.3 + 0.7
          return MIN_HEIGHT + wave * noise * (MAX_HEIGHT - MIN_HEIGHT)
        })
      )
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [active])

  return (
    <div
      className={"flex items-end justify-center gap-0.5 " + className}
      style={{ height: MAX_HEIGHT }}
    >
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="w-1 bg-primary/70"
          initial={{ height: MIN_HEIGHT }}
          animate={{ height: h }}
          transition={{ duration: 0.08 }}
          style={{ minHeight: MIN_HEIGHT }}
        />
      ))}
    </div>
  )
}
