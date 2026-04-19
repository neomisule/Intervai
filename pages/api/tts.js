/**
 * IntervAI — ElevenLabs Text-to-Speech Route
 * POST /api/tts
 * Body: { text: string }
 * Returns: audio/mpeg stream
 */

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel — calm, professional

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Missing text" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not set" });

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.55,
            similarity_boost: 0.75,
            style: 0.1,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("ElevenLabs error:", err);
      return res.status(500).json({ error: "ElevenLabs API error", detail: err });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("TTS handler error:", err);
    res.status(500).json({ error: err.message });
  }
}
