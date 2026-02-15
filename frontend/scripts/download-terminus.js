#!/usr/bin/env node
/**
 * Downloads and extracts Terminus TTF (closest match to Lat2-Terminus16) for glyph generation.
 * Lat2-Terminus16 is a console PSF; Terminus TTF is the TTF conversion.
 * Source: https://files.ax86.net/terminus-ttf/
 */

const fs = require("fs")
const path = require("path")
const https = require("https")
const { createWriteStream } = require("fs")

const FONT_URL = "https://files.ax86.net/terminus-ttf/files/latest.zip"
const OUTPUT_DIR = path.join(__dirname, "../.font-temp")
const ZIP_PATH = path.join(OUTPUT_DIR, "terminus-ttf.zip")

async function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirect = res.headers.location
          if (redirect) {
            return download(redirect).then(resolve).catch(reject)
          }
        }
        const file = createWriteStream(ZIP_PATH)
        res.pipe(file)
        file.on("finish", () => {
          file.close()
          resolve()
        })
      })
      .on("error", reject)
  })
}

function unzip() {
  const { execSync } = require("child_process")
  execSync(`unzip -o "${ZIP_PATH}" -d "${OUTPUT_DIR}"`, { stdio: "inherit" })
  fs.unlinkSync(ZIP_PATH)
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  console.log("Downloading Terminus TTF...")
  await download(FONT_URL)
  console.log("Extracting...")
  await unzip()
  console.log("Done. TTF extracted to", OUTPUT_DIR)
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = { run }
