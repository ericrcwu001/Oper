/**
 * RAG (Retrieval-Augmented Generation) for post-call evaluation.
 * Loads 911 operator reference docs from ragDocs, chunks them, embeds with OpenAI,
 * and retrieves relevant passages to ground the evaluation.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_MAX_CHARS = 1200;
const CHUNK_OVERLAP = 120;
const TOP_K = 8;

let openai = null;
let chunkCache = null;
let embeddingCache = null;

function getOpenAI() {
  if (!config.openai?.apiKey) return null;
  if (!openai) openai = new OpenAI({ apiKey: config.openai.apiKey });
  return openai;
}

/**
 * Load all .md and .txt files from ragDocs directory.
 * @param {string} dirPath
 * @returns {Promise<{ path: string, content: string }[]>}
 */
async function loadDocuments(dirPath) {
  const results = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (ext !== '.md' && ext !== '.txt') continue;
      const fullPath = path.join(dirPath, e.name);
      const content = await fs.readFile(fullPath, 'utf-8');
      results.push({ path: e.name, content: content.trim() });
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('RAG: load docs error', err.message);
  }
  return results;
}

/**
 * Split text into overlapping chunks for embedding.
 * @param {string} text
 * @returns {string[]}
 */
function chunkText(text) {
  const chunks = [];
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  let buffer = '';
  for (const p of paragraphs) {
    if (buffer.length + p.length + 2 > CHUNK_MAX_CHARS && buffer.length > 0) {
      chunks.push(buffer.trim());
      const overlapStart = Math.max(0, buffer.length - CHUNK_OVERLAP);
      buffer = buffer.slice(overlapStart) + '\n\n' + p;
    } else {
      buffer += (buffer ? '\n\n' : '') + p;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  if (chunks.length === 0 && text.trim()) chunks.push(text.trim().slice(0, CHUNK_MAX_CHARS));
  return chunks;
}

/**
 * Build chunk list from all docs and optionally compute embeddings.
 * @returns {Promise<{ text: string, source?: string }[]>}
 */
async function buildChunks() {
  const ragDir = config.rag?.docsDir
    ? path.resolve(process.cwd(), config.rag.docsDir)
    : path.join(__dirname, '..', '..', 'ragDocs');

  const docs = await loadDocuments(ragDir);
  const chunks = [];
  for (const { path: name, content } of docs) {
    const parts = chunkText(content);
    for (const text of parts) {
      if (text.length < 20) continue;
      chunks.push({ text, source: name });
    }
  }
  return chunks;
}

/**
 * Get embeddings for texts (batch to avoid rate limits).
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function getEmbeddings(texts) {
  const client = getOpenAI();
  if (!client) return [];
  const out = [];
  const batchSize = 20;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    const order = res.data.sort((a, b) => a.index - b.index);
    for (const d of order) out.push(d.embedding);
  }
  return out;
}

function dotProduct(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function norm(a) {
  return Math.sqrt(dotProduct(a, a));
}

function cosineSimilarity(a, b) {
  const n = norm(a) * norm(b);
  return n === 0 ? 0 : dotProduct(a, b) / n;
}

/**
 * Initialize RAG: load chunks and compute embeddings (cached in memory).
 * Call once at startup or lazily on first query.
 */
async function ensureIndex() {
  if (chunkCache && embeddingCache) return;
  const chunks = await buildChunks();
  chunkCache = chunks;
  if (chunks.length === 0) {
    embeddingCache = [];
    return;
  }
  const client = getOpenAI();
  if (!client) {
    embeddingCache = [];
    return;
  }
  embeddingCache = await getEmbeddings(chunks.map((c) => c.text));
}

/**
 * Retrieve top-k chunks most relevant to the query (for evaluation context).
 * @param {string} query - e.g. scenario description + transcript summary
 * @param {number} k
 * @returns {Promise<string>} Formatted reference text to inject into the prompt
 */
export async function getRelevantContext(query, k = TOP_K) {
  await ensureIndex();
  if (chunkCache.length === 0) return '';

  const client = getOpenAI();
  if (!client) return '';

  const [queryEmb] = await getEmbeddings([query.slice(0, 8000)]);
  if (!queryEmb) return '';

  const scored = chunkCache.map((c, i) => ({
    text: c.text,
    source: c.source,
    score: cosineSimilarity(queryEmb, embeddingCache[i]),
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, k).filter((s) => s.score > 0.1);

  if (top.length === 0) return '';

  const lines = top.map((s) => (s.source ? `[${s.source}]\n${s.text}` : s.text));
  return `## Reference material (911 operator protocols and best practices – use to ground your evaluation and scoring):\n\n${lines.join('\n\n---\n\n')}`;
}
