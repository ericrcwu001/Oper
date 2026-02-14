// caller911.js
// Utility: apply caller-side “911 phone” processing using ffmpeg.
// Exports: processCaller911({ inWavPath, outWavPath, addNoise? }), convertMp3ToWav
//
// Requirements: ffmpeg on PATH

import { spawn, execSync } from "child_process";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";

let cachedFfmpegPath = null;

/** Resolve ffmpeg: FFMPEG_PATH env > where (Windows) > winget Gyan.FFmpeg bin > "ffmpeg". */
function getFfmpegCommand() {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath && fsSync.existsSync(envPath)) {
    cachedFfmpegPath = envPath;
    return cachedFfmpegPath;
  }
  if (process.platform === "win32") {
    try {
      const out = execSync("where ffmpeg", { encoding: "utf8", timeout: 2000 });
      const first = out.split("\n")[0]?.trim();
      if (first && first.endsWith("ffmpeg.exe") && fsSync.existsSync(first)) {
        cachedFfmpegPath = first;
        return cachedFfmpegPath;
      }
    } catch {
      // ignore
    }
    // Winget Gyan.FFmpeg installs to .../ffmpeg-*-full_build/bin/ but PATH often points at parent only
    try {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
      const winGetPkgs = path.join(localAppData, "Microsoft", "WinGet", "Packages");
      if (fsSync.existsSync(winGetPkgs)) {
        const dirs = fsSync.readdirSync(winGetPkgs);
        for (const d of dirs) {
          if (!d.startsWith("Gyan.FFmpeg")) continue;
          const pkgDir = path.join(winGetPkgs, d);
          const subdirs = fsSync.readdirSync(pkgDir);
          for (const sub of subdirs) {
            if (sub.startsWith("ffmpeg-") && sub.endsWith("-full_build")) {
              const exe = path.join(pkgDir, sub, "bin", "ffmpeg.exe");
              if (fsSync.existsSync(exe)) {
                cachedFfmpegPath = exe;
                return cachedFfmpegPath;
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return "ffmpeg";
}

function run(cmd, args, { timeoutMs = 60_000 } = {}) {
  const resolvedCmd = cmd === "ffmpeg" ? getFfmpegCommand() : cmd;
  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCmd, args, { stdio: ["ignore", "ignore", "pipe"] });
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

/**
 * Convert WebM (or other) audio buffer to WAV for Whisper. Uses ffmpeg.
 * @param {Buffer} audioBuffer - Raw audio (e.g. webm from browser MediaRecorder)
 * @returns {Promise<Buffer>} - WAV file buffer (16kHz mono, Whisper-friendly)
 * @throws {Error} - If ffmpeg is missing or conversion fails
 */
export async function convertWebmToWav(audioBuffer) {
  const tmpDir = os.tmpdir();
  const id = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const webmPath = path.join(tmpDir, `${id}.webm`);
  const wavPath = path.join(tmpDir, `${id}.wav`);
  try {
    await fs.writeFile(webmPath, audioBuffer);
    await run("ffmpeg", [
      "-y",
      "-i",
      webmPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      wavPath,
    ], { timeoutMs: 15_000 });
    const wavBuffer = await fs.readFile(wavPath);
    return wavBuffer;
  } finally {
    await unlinkSafe(webmPath);
    await unlinkSafe(wavPath);
  }
}
