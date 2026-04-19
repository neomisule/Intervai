/**
 * IntervAI — TerpAI (NebulAOne / GPT-4o) Proxy
 *
 * Response format: Server-Sent Events stream
 * Each "response-updated" event has base64-encoded text chunks to concatenate.
 * Final answer = decode + join all response-updated data fields.
 */

const TERPAI_TOKEN     = process.env.TERPAI_BEARER_TOKEN  || "";
const TERPAI_BASE      = process.env.TERPAI_BASE          || "https://terpai.umd.edu";
const TERPAI_SYSTEM_ID = process.env.TERPAI_GPT_SYSTEM_ID || "";
const FEATHERLESS_KEY  = process.env.FEATHERLESS_API_KEY   || "";
const FEATHERLESS_URL  = "https://api.featherless.ai/v1/chat/completions";
const FEATHERLESS_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function decodeBase64(str) {
  try {
    return Buffer.from(str.trim(), "base64").toString("utf-8");
  } catch {
    return str;
  }
}

async function callTerpAI(messages) {
  const userMessage = messages.filter(m => m.role === "user").at(-1)?.content || "";

  const res = await fetch(
    `${TERPAI_BASE}/api/internal/userConversations/byGptSystemId/${TERPAI_SYSTEM_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TERPAI_TOKEN}`,
        Accept: "text/event-stream, */*",
      },
      body: JSON.stringify({
        question: userMessage,
        visionImageIds: [],
        attachmentIds: [],
        segmentTraceLogLevel: "NonPersisted",
        session: { sessionIdentifier: uuid() },
      }),
    }
  );

  if (!res.ok) throw new Error(`TerpAI ${res.status}: ${await res.text()}`);

  // Read SSE stream and accumulate base64 chunks from "response-updated" events
  const text = await res.text();
  const lines = text.split("\n");

  let fullResponse = "";
  let currentEvent = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent = line.replace("event:", "").trim();
    } else if (line.startsWith("data:") && currentEvent === "response-updated") {
      const b64 = line.replace("data:", "").trim();
      if (b64) fullResponse += decodeBase64(b64);
    }
  }

  if (!fullResponse.trim()) {
    console.error("[TerpAI] Empty response. Raw SSE:", text.slice(0, 500));
    throw new Error("TerpAI returned empty response");
  }

  console.log("[IntervAI] TerpAI GPT-4o response length:", fullResponse.length);
  return fullResponse.trim();
}

async function callFeatherless(messages) {
  const res = await fetch(FEATHERLESS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FEATHERLESS_KEY}`,
    },
    body: JSON.stringify({
      model: FEATHERLESS_MODEL,
      messages,
      temperature: 0.85,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error(`Featherless ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { messages, prompt, systemPrompt } = req.body;
  const msgs = messages || [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    { role: "user", content: prompt },
  ];

  // TerpAI (GPT-4o) — primary
  if (TERPAI_TOKEN && TERPAI_SYSTEM_ID) {
    try {
      const content = await callTerpAI(msgs);
      console.log("[IntervAI] Using TerpAI GPT-4o ✓");
      return res.status(200).json({ content, source: "terpai-gpt4o" });
    } catch (e) {
      console.warn("[IntervAI] TerpAI failed:", e.message, "→ falling back to Featherless");
    }
  }

  // Featherless (Llama 3.3 70B) — fallback
  try {
    const content = await callFeatherless(msgs);
    console.log("[IntervAI] Using Featherless Llama ✓");
    return res.status(200).json({ content, source: "featherless" });
  } catch (err) {
    console.error("[IntervAI] All providers failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
