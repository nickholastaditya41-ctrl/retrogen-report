// RetroGen Report · baca angka layar alat dengan AI vision lewat APMix.
// Env Vercel: APMIX_API_KEY (wajib), APMIX_MODEL (opsional, default claude-sonnet-4-6),
// ALLOWED_ORIGINS (opsional, pisahkan koma; default *.vercel.app milik project ini + localhost).

const BASE = process.env.APMIX_BASE_URL || "https://api.apmix.ai/v1";
const MODEL = process.env.APMIX_MODEL || "claude-sonnet-4-6";
const MAX_IMAGE_CHARS = 3_000_000; // ~2,2 MB base64

const COLOR = { red: "Merah", white: "Putih", yellow: "Kuning", blue: "Biru", green: "Hijau", orange: "Oranye", brown: "Coklat" };

const PROMPTS = {
  reflektor: `You read the display of a handheld retroreflectometer for signs/reflectors from a field photo.
The display shows readings stacked vertically. The FIRST (top) large number is the 0.2° observation-angle reading.
The SECOND number below it is the 0.5° reading. Ignore any further numbers (a third reading), icons and symbols.
The display may also show a color word such as red, white, yellow, blue, green, orange or brown.
Copy the digits exactly as shown, including the decimal point. If a value is not clearly readable, use null.
Reply with JSON only, no prose: {"n02": number|null, "n05": number|null, "color": string|null, "confidence": "high"|"low"}`,
  marka: `You read the display of a road-marking retroreflectometer from a field photo.
The display has a table with columns RL and Qd. Rows numbered 1, 2, 3... are individual readings; a row marked with x̄ (x-bar) is the mean.
Return the FIRST individual reading only: the row numbered 1. Do NOT use the mean row, temperature, humidity, date or time.
Copy the digits exactly as shown. If a value is not clearly readable, use null.
Reply with JSON only, no prose: {"rl": number|null, "qd": number|null, "confidence": "high"|"low"}`
};

function allowed(req) {
  const origin = req.headers.origin || "";
  const list = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (list.length) return list.includes(origin);
  const host = req.headers.host || "";
  return !origin || origin === `https://${host}` || /^http:\/\/localhost(:\d+)?$/.test(origin);
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 10000 ? n : null;
}

function parseJson(text, mode) {
  const t = String(text || "").replace(/```(?:json)?/gi, "").trim();
  const m = t.match(/\{[\s\S]*?\}/g);
  if (m) for (const c of m.reverse()) { try { return JSON.parse(c); } catch {} }
  // Cadangan: jawaban tidak berupa JSON rapi, ambil per kunci dari teks.
  const key = k => { const x = t.match(new RegExp(`"?${k}"?\\s*[:=]\\s*"?(-?\\d+(?:[.,]\\d+)?|null)`, "i")); return x ? (x[1] === "null" ? null : x[1]) : undefined; };
  const keys = mode === "marka" ? ["rl", "qd"] : ["n02", "n05"];
  const o = {};
  for (const k of keys) o[k] = key(k);
  const col = t.match(/"?colou?r"?\s*[:=]\s*"?([a-z]+)/i);
  if (col) o.color = col[1];
  if (/"?confidence"?\s*[:=]\s*"?low/i.test(t)) o.confidence = "low";
  if (keys.some(k => o[k] === undefined)) throw new Error("no json");
  return o;
}

function contentOf(data) {
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  let c = msg && msg.content;
  if (Array.isArray(c)) c = c.map(p => (p && p.text) || "").join("");
  if (!c && Array.isArray(data && data.content)) c = data.content.map(p => (p && p.text) || "").join("");
  if (!c && msg && msg.reasoning_content) c = msg.reasoning_content;
  return String(c || "");
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Gunakan POST." });
  if (!allowed(req)) return res.status(403).json({ ok: false, error: "Asal permintaan tidak diizinkan." });
  if (!process.env.APMIX_API_KEY) return res.status(500).json({ ok: false, error: "APMIX_API_KEY belum diisi di Vercel." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const mode = body && body.mode === "marka" ? "marka" : "reflektor";
  const image = body && body.image;
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) return res.status(400).json({ ok: false, error: "Foto tidak valid." });
  if (image.length > MAX_IMAGE_CHARS) return res.status(413).json({ ok: false, error: "Foto terlalu besar." });

  const t0 = Date.now();
  const ask = (extra) => fetch(`${BASE}/chat/completions`, {
      method: "POST", signal: AbortSignal.timeout(40000),
      headers: { Authorization: `Bearer ${process.env.APMIX_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0, max_tokens: 600, stream: false,
        messages: [{ role: "user", content: [
          { type: "text", text: PROMPTS[mode] + (extra || "") },
          { type: "image_url", image_url: { url: image } }
        ] }]
      })
    });
  try {
    let j = null, lastText = "";
    for (let attempt = 1; attempt <= 2 && !j; attempt++) {
      const r = await ask(attempt > 1 ? "\nIMPORTANT: your previous answer was not valid JSON. Output ONLY the JSON object on one line, starting with { and ending with }." : "");
      const data = await r.json().catch(() => ({}));
      console.log(`ocr mode=${mode} model=${MODEL} try=${attempt} status=${r.status} ms=${Date.now() - t0} img=${Math.round(image.length / 1024)}KB`);
      if (!r.ok) return res.status(502).json({ ok: false, error: `APMix ${r.status}: ${String((data.error && data.error.message) || "").slice(0, 160)}` });
      lastText = contentOf(data);
      try { j = parseJson(lastText, mode); }
      catch { console.error(`ocr bukan json try=${attempt} finish=${data.choices && data.choices[0] && data.choices[0].finish_reason} isi=${JSON.stringify(lastText.slice(0, 300))}`); }
    }
    if (!j) return res.status(502).json({ ok: false, error: "Balasan AI tidak bisa dibaca." });
    const lowConf = j.confidence === "low";
    if (mode === "marka") {
      const rl = toNum(j.rl), qd = toNum(j.qd);
      return res.status(200).json({ ok: rl !== null && qd !== null, mode, rl, qd, low: lowConf, model: MODEL });
    }
    const n02 = toNum(j.n02), n05 = toNum(j.n05);
    const c = String(j.color || "").toLowerCase().match(/red|white|yellow|blue|green|orange|brown/);
    return res.status(200).json({ ok: n02 !== null && n05 !== null, mode, n02, n05, warna: c ? COLOR[c[0]] : null, low: lowConf, model: MODEL });
  } catch (e) {
    const timeout = e && (e.name === "TimeoutError" || e.name === "AbortError");
    console.error(`ocr gagal mode=${mode} ms=${Date.now() - t0} err=${e && e.name}: ${e && e.message}`);
    return res.status(timeout ? 504 : 502).json({ ok: false, error: timeout ? "APMix tidak menjawab dalam 45 detik. Coba lagi." : "Balasan AI tidak bisa dibaca." });
  }
};

module.exports.config = { maxDuration: 60 };
