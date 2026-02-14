"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

type StatusType = "idle" | "connecting" | "connected" | "recording" | "thinking" | "error"

interface StatusIndicatorProps {
  status: StatusType
  label: string
  className?: string
}

export function StatusIndicator({ status, label, className }: StatusIndicatorProps) {
  const isPulse =
    status === "connecting" || status === "recording" || status === "thinking"
  const isGlow = status === "connected" || status === "recording"
  const isError = status === "error"

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs font-medium uppercase tracking-wider",
        className
      )}
    >
      <motion.span
        className={cn(
          "h-2 w-2 shrink-0",
          status === "connected" && "bg-primary",
          status === "connecting" && "bg-warning",
          status === "recording" && "bg-destructive",
          status === "thinking" && "bg-primary",
          status === "error" && "bg-destructive",
          status === "idle" && "bg-muted-foreground/50"
        )}
        animate={
          isPulse
            ? { opacity: [1, 0.4, 1], scale: [1, 1.05, 1] }
            : {}
        }
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        style={
          isGlow && !isError
            ? { boxShadow: "0 0 8px hsl(var(--primary) / 0.5)" }
            : undefined
        }
      />
      <span
        className={cn(
          status === "connected" && "text-primary",
          status === "connecting" && "text-warning",
          status === "recording" && "text-destructive",
          status === "thinking" && "text-primary",
          status === "error" && "text-destructive",
          status === "idle" && "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </div>
  )
}
