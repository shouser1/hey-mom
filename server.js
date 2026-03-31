const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");
const path = require("path");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.VOICE_ID; // set this after first clone

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Clone a voice from an uploaded audio file ─────────────────────────────────
app.post("/api/clone-voice", upload.single("audio"), async (req, res) => {
  if (!ELEVENLABS_API_KEY) return res.status(500).json({ error: "API key not configured on server." });
  if (!req.file) return res.status(400).json({ error: "No audio file received." });

  const voiceName = req.body.voiceName || "Mom";

  try {
    const fd = new FormData();
    fd.append("name", voiceName);
    fd.append("description", "Voice cloned for Hey Mom app");
    fd.append("files", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const upstream = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, ...fd.getHeaders() },
      body: fd,
    });

    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.detail?.message || "Voice clone failed." });

    res.json({ voiceId: data.voice_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Text-to-speech using stored or provided voice ID ─────────────────────────
app.post("/api/speak", async (req, res) => {
  if (!ELEVENLABS_API_KEY) return res.status(500).json({ error: "API key not configured on server." });

  const { text, voiceId } = req.body;
  const resolvedVoiceId = voiceId || VOICE_ID;

  if (!text) return res.status(400).json({ error: "No text provided." });
  if (!resolvedVoiceId) return res.status(400).json({ error: "No voice ID available. Clone a voice first." });

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.82, style: 0.2, use_speaker_boost: true },
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: err.detail?.message || "TTS failed." });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    upstream.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    ready: !!ELEVENLABS_API_KEY,
    voiceReady: !!(VOICE_ID),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hey Mom server running on port ${PORT}`));
