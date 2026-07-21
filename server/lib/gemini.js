// Reusable Google Gemini client (item 7). Dependency-free — talks to the Gemini
// REST API with the global fetch (Node 18+). This is the single place the app
// integrates Gemini; the AI payment-screenshot check (item 22) builds on it, and
// anything else that needs an LLM should call generateContent() here rather than
// re-implementing the transport.
//
// Configure with GEMINI_API_KEY (+ optional GEMINI_MODEL) in .env. With no key,
// isConfigured() is false and callers should skip AI gracefully.
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

function isConfigured() {
  return !!(cfg.GEMINI && cfg.GEMINI.apiKey);
}

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

function fileToInlinePart(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/jpeg';
  const data = fs.readFileSync(filePath).toString('base64');
  return { inline_data: { mime_type: mime, data } };
}

// Core call. `prompt` is the text instruction; `images` is an array of absolute
// file paths to attach. When `json` is true we ask Gemini for a JSON response and
// parse it. Returns { text, json } (json is null when not requested or unparseable).
async function generateContent({ prompt, images = [], json = false, temperature = 0 } = {}) {
  if (!isConfigured()) throw new Error('Gemini is not configured (set GEMINI_API_KEY)');

  const parts = [{ text: prompt }];
  for (const img of images) {
    try {
      parts.push(fileToInlinePart(img));
    } catch (err) {
      throw new Error(`Could not read image for Gemini: ${err.message}`);
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const url = `${API_ROOT}/${cfg.GEMINI.model}:generateContent?key=${encodeURIComponent(cfg.GEMINI.apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();

  let parsed = null;
  if (json) {
    parsed = safeJson(text);
  }
  return { text, json: parsed };
}

// Gemini sometimes wraps JSON in ```json fences even with responseMimeType set —
// strip them before parsing.
function safeJson(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // Last resort: grab the outermost {...}.
    const brace = t.match(/\{[\s\S]*\}/);
    if (brace) {
      try {
        return JSON.parse(brace[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Analyze a UPI/bank payment screenshot for the dues flow. Returns a normalized
// object the dues route stores + acts on. Never throws for "AI couldn't decide" —
// only for hard transport failures (caller catches and marks the check errored).
async function analyzePaymentScreenshot({ imagePath, expectedAmount, todayISO }) {
  const prompt = [
    'You are verifying a screenshot of a UPI / bank payment for a residential society.',
    'Extract the payment details and judge whether the screenshot looks like a genuine, recent payment (not obviously edited or fabricated).',
    expectedAmount ? `The expected payment amount is ₹${expectedAmount}.` : '',
    todayISO ? `Today's date is ${todayISO}. A "recent" payment is within roughly the last 7 days.` : '',
    'Respond ONLY with a JSON object with exactly these keys:',
    '{',
    '  "transaction_id": string|null,   // UTR / transaction / reference / UPI id shown, or null if none visible',
    '  "datetime": string|null,          // the payment date-time as shown, ISO-8601 if possible, else the raw text',
    '  "amount": string|null,            // the amount shown (digits only, no currency symbol), or null',
    '  "is_payment_screenshot": boolean, // true only if this really looks like a payment confirmation screen',
    '  "looks_legit": boolean,           // false if it looks edited, fabricated, or has inconsistent fields',
    '  "is_recent": boolean,             // whether the date-time looks recent per the note above (null-date => false)',
    '  "confidence": number,             // 0..1 overall confidence in your reading',
    '  "notes": string                   // one short sentence explaining anything suspicious or notable',
    '}',
  ]
    .filter(Boolean)
    .join('\n');

  const { json } = await generateContent({ prompt, images: [imagePath], json: true });
  if (!json) {
    return { ok: false, reason: 'Could not read the screenshot clearly.', raw: null };
  }
  return {
    ok: true,
    transaction_id: json.transaction_id ? String(json.transaction_id).trim() : null,
    datetime: json.datetime ? String(json.datetime).trim() : null,
    amount: json.amount != null ? String(json.amount).replace(/[^\d.]/g, '') : null,
    is_payment_screenshot: !!json.is_payment_screenshot,
    looks_legit: !!json.looks_legit,
    is_recent: !!json.is_recent,
    confidence: typeof json.confidence === 'number' ? json.confidence : null,
    notes: json.notes ? String(json.notes).trim() : '',
    raw: json,
  };
}

module.exports = { isConfigured, generateContent, analyzePaymentScreenshot };
