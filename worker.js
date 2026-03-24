// ═══════════════════════════════════════════════════════════════
//  Second Brain v3 — Cloudflare Worker Backend
//  Yahan tumhari Gemini API key safe rahegi
//  Deploy: https://workers.cloudflare.com
// ═══════════════════════════════════════════════════════════════

// ⚠️  SIRF YEH LINE BADLO — apni Gemini API key yahan daalo:
const GEMINI_API_KEY = 'APNI_GEMINI_KEY_YAHAN_DAALO';

// Allowed origins — apna GitHub Pages URL yahan daalo deploy ke baad
const ALLOWED_ORIGINS = [
  'https://localhost',
  'http://localhost',
  'http://127.0.0.1',
  // 'https://TUMHARA-USERNAME.github.io',  // ← deploy ke baad uncomment karo
];

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ── CORS helper ──────────────────────────────────────────────
function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin && origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

// ── Main handler ─────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Only POST allowed' }), { status: 405, headers });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
    }

    const { type, payload } = body;

    try {
      let result;

      // ── Route by request type ──────────────────────────────
      switch (type) {

        case 'chat':
        case 'generate_note':
        case 'translate': {
          // Text-only Gemini call
          const { system, messages } = payload;

          // Convert messages to Gemini format
          const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }));

          const geminiBody = {
            system_instruction: { parts: [{ text: system }] },
            contents,
            generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
          };

          const resp = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
          });

          const data = await resp.json();
          if (data.error) throw new Error(data.error.message);
          result = { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
          break;
        }

        case 'analyze_image': {
          // Vision call — image + text
          const { imageBase64, mimeType, prompt, system } = payload;

          const geminiBody = {
            system_instruction: { parts: [{ text: system }] },
            contents: [{
              role: 'user',
              parts: [
                { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
                { text: prompt }
              ]
            }],
            generationConfig: { maxOutputTokens: 1200, temperature: 0.5 }
          };

          // Vision uses gemini-1.5-flash too — same model
          const resp = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
          });

          const data = await resp.json();
          if (data.error) throw new Error(data.error.message);
          result = { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
          break;
        }

        default:
          return new Response(JSON.stringify({ error: 'Unknown type: ' + type }), { status: 400, headers });
      }

      return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers });

    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers });
    }
  }
};
