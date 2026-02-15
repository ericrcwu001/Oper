#!/usr/bin/env node
/**
 * Setup Lat2-Terminus16 font glyphs for map labels.
 *
 * Step 1: Downloads and extracts Terminus TTF (closest match to Lat2-Terminus16).
 * Step 2: You must generate PBF glyphs manually:
 *   - Go to https://maplibre.org/font-maker/
 *   - Upload a .ttf from the extracted folder (e.g. TerminusTTF-*.ttf)
 *   - Name the font: Lat2-Terminus16
 *   - Download the ZIP
 *   - Extract into frontend/public/fonts/Lat2-Terminus16/
 *     (folder should contain 0-255.pbf, 256-511.pbf, etc.)
 *
 * Run from frontend/: node scripts/setup-fonts.js
 */

const path = require("path")
const frontendDir = path.join(__dirname, "..")
const tempDir = path.join(frontendDir, ".font-temp")
const fontsDir = path.join(frontendDir, "public", "fonts", "Lat2-Terminus16")

async function main() {
  console.log("Step 1: Download and extract Terminus TTF...\n")
  const { run } = require("./download-terminus.js")
  await run()

  const fs = require("fs")
  function findTtf(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        const found = findTtf(full)
        if (found) return found
      } else if (e.name.endsWith(".ttf") && !e.name.includes("Italic")) {
        return full
      }
    }
    return null
  }

  const ttfPath = findTtf(tempDir)
  if (!ttfPath) {
    console.error("No TTF found in", tempDir)
    process.exit(1)
  }

  console.log("\nStep 2: Generate PBF glyphs")
  console.log("──────────────────────────")
  console.log("1. Open https://maplibre.org/font-maker/")
  console.log("2. Upload:", path.basename(ttfPath))
  console.log("   (from", path.dirname(ttfPath) + ")")
  console.log("3. Name the font: Lat2-Terminus16")
  console.log("4. Wait for the progress bar, then download the ZIP")
  console.log("5. Extract the ZIP contents into:")
  console.log("   ", fontsDir)
  console.log("\n   The folder should contain: 0-255.pbf, 256-511.pbf, etc.")
  console.log("\nAfter that, restart the dev server and map labels will use Lat2-Terminus16.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
