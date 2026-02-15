import type { Metadata, Viewport } from "next"
import { JetBrains_Mono } from "next/font/google"

import { siteConfig } from "@/lib/site-config"
import { Providers } from "@/components/providers"
import "./globals.css"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-terminal",
  display: "swap",
})

export const metadata: Metadata = {
  title: `${siteConfig.siteName} - Operator Training Simulator`,
  description:
    "Realistic 911 call training simulator with live-call practice, note-taking, scoring, and trainer dashboard.",
  icons: {
    icon: siteConfig.favicon,
  },
}

export const viewport: Viewport = {
  themeColor: "#0c0c0e",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${jetbrainsMono.variable} font-mono antialiased text-sm`}
        style={{
          fontFamily: "var(--font-terminal), ui-monospace, 'SF Mono', Monaco, 'Cascadia Mono', 'Segoe UI Mono', 'Roboto Mono', Consolas, monospace",
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
