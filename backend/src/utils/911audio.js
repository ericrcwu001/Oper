// caller911.js
// Utility: apply caller-side “911 phone” processing using ffmpeg.
// Exports: processCaller911({ inWavPath, outWavPath, addNoise? }), convertMp3ToWav
//
// Requirements: ffmpeg on PATH

import { spawn } from "child_process";
import fs from "fs/promises";

function run(cmd, args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${cmd} exited ${code}: ${stderr}`));
      else resolve();
    });
  });
}

async function unlinkSafe(path) {
  try {
    await fs.unlink(path);
  } catch {
    // ignore missing or already removed
  }
}

/**
 * Apply caller-side 911 telephone chain:
 * - mono, 8 kHz, tight band (400–3200 Hz) for phone character
 * - heavy compression + limiter (squashed, phone-like)
 * - G.711 µ-law encode/decode (codec texture)
 * - grainy line noise; optional light bitcrush for lo-fi
 * Deletes intermediate files; only outWavPath is kept.
 *
 * @param {Object} opts
 * @param {string} opts.inWavPath - input WAV path (ideally clean PCM from TTS)
 * @param {string} opts.outWavPath - output WAV path (8kHz mono PCM) – only this file is kept
 * @param {boolean} [opts.addNoise=true] - mix grainy line noise
 */
export async function processCaller911({ inWavPath, outWavPath, addNoise = true }) {
  if (!inWavPath || !outWavPath) throw new Error("inWavPath and outWavPath are required");

  const tmpMulaw = outWavPath.replace(/\.wav$/i, ".mulaw.wav");
  const tmpPhone = outWavPath.replace(/\.wav$/i, ".phone.wav");

  try {
    // 1) Tight phone band (400–3200 Hz) + heavy dynamics -> 8k mono
    await run("ffmpeg", [
      "-y",
      "-i",
      inWavPath,
      "-ac",
      "1",
      "-ar",
      "8000",
      "-af",
      [
        "highpass=f=400",
        "lowpass=f=3200",
        "acompressor=threshold=-28dB:ratio=6:attack=3:release=100:makeup=8",
        "alimiter=limit=-0.5dB",
      ].join(","),
      "-c:a",
      "pcm_s16le",
      tmpPhone,
    ]);

    // 2) µ-law encode (telephone codec)
    await run("ffmpeg", ["-y", "-i", tmpPhone, "-ac", "1", "-ar", "8000", "-c:a", "pcm_mulaw", tmpMulaw]);

    if (!addNoise) {
      await run("ffmpeg", ["-y", "-i", tmpMulaw, "-ac", "1", "-ar", "8000", "-c:a", "pcm_s16le", outWavPath]);
      return;
    }

    // 3) Decode + grainy line noise; duration=shortest keeps output same length as input
    await run("ffmpeg", [
      "-y",
      "-i",
      tmpMulaw,
      "-f",
      "lavfi",
      "-i",
      "anoisesrc=color=white:amplitude=0.022",
      "-filter_complex",
      [
        "[0:a][1:a]amix=inputs=2:weights=1 0.45:duration=shortest",
        "highpass=f=400",
        "lowpass=f=3200",
        "alimiter=limit=-0.5dB",
      ].join(","),
      "-ac",
      "1",
      "-ar",
      "8000",
      "-c:a",
      "pcm_s16le",
      outWavPath,
    ]);
  } finally {
    await unlinkSafe(tmpPhone);
    await unlinkSafe(tmpMulaw);
  }
}

/**
 * Convert MP3 to mono PCM WAV (for feeding into processCaller911).
 * @param {string} mp3Path - path to input MP3
 * @param {string} wavPath - path to output WAV (e.g. pcm_s16le, 44.1kHz mono)
 */
export async function convertMp3ToWav(mp3Path, wavPath) {
  await run("ffmpeg", [
    "-y",
    "-i",
    mp3Path,
    "-ac",
    "1",
    "-ar",
    "44100",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ]);
}
