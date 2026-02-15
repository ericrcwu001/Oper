#!/usr/bin/env node
/**
 * Optional: Generate PBF glyphs using fontnik (if it installs successfully).
 * Fontnik has native bindings and may fail on newer Node / Apple Silicon.
 *
 * If fontnik works: node scripts/generate-font-glyphs.js
 * Otherwise: use the manual web app workflow (see setup-fonts.js).
 */

const fs = require("fs")
const path = require("path")

const FONT_NAME = "Lat2-Terminus16"
const TEMP_DIR = path.join(__dirname, "../.font-temp")
const OUTPUT_DIR = path.join(__dirname, "../public/fonts", FONT_NAME)

function findTtfPath(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      const found = findTtfPath(full)
      if (found) return found
    } else if (e.name.endsWith(".ttf") && !e.name.includes("Italic")) {
      return full
    }
  }
  return null
}

async function main() {
  let fontnik
  try {
    fontnik = require("fontnik")
  } catch (err) {
    console.error("fontnik not installed or failed to load. Use manual workflow:")
    console.error("  https://maplibre.org/font-maker/")
    process.exit(1)
  }

  const ttfPath = findTtfPath(TEMP_DIR)
  if (!ttfPath) {
    console.error("No Terminus TTF found. Run: node scripts/setup-fonts.js")
    process.exit(1)
  }

  const font = fs.readFileSync(ttfPath)
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const rangeSize = 256
  const maxCodePoint = 0x4e00
  let generated = 0

  for (let start = 0; start < maxCodePoint; start += rangeSize) {
    const end = Math.min(start + rangeSize - 1, 65535)
    const range = `${start}-${end}`
    await new Promise((resolve, reject) => {
      fontnik.load(font, start, end, (err, res) => {
        if (err) return reject(err)
        fs.writeFileSync(path.join(OUTPUT_DIR, `${range}.pbf`), res)
        generated++
        if (generated % 16 === 0) process.stdout.write(".")
        resolve()
      })
    })
  }

  console.log("\nGenerated", generated, "glyph range(s) in", OUTPUT_DIR)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
