/**
 * IntervAI — Main AI API Route
 * POST /api/ai
 *
 * Actions:
 *   "next_question"   → generate the next interview question based on history
 *   "analyze_answer"  → score + give feedback on a single answer
 *   "final_report"    → full post-interview report with all feedback
 */

// ─── Provider config ─────────────────────────────────────────────────────────
const TERPAI_TOKEN     = process.env.TERPAI_BEARER_TOKEN  || "";
const TERPAI_BASE      = process.env.TERPAI_BASE          || "https://terpai.umd.edu";
const TERPAI_SYSTEM_ID = process.env.TERPAI_GPT_SYSTEM_ID || "";
const FEATHERLESS_KEY  = process.env.FEATHERLESS_API_KEY  || "";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function decodeBase64(str) {
  try { return Buffer.from(str.trim(), "base64").toString("utf-8"); }
  catch { return ""; }
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
  if (!res.ok) throw new Error(`TerpAI ${res.status}`);
  const text = await res.text();
  let fullResponse = "";
  let currentEvent = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("event:")) currentEvent = line.replace("event:", "").trim();
    else if (line.startsWith("data:") && currentEvent === "response-updated") {
      fullResponse += decodeBase64(line.replace("data:", "").trim());
    }
  }
  if (!fullResponse.trim()) throw new Error("TerpAI empty response");
  return fullResponse.trim();
}

async function callFeatherless(messages, { temperature = 0.85, max_tokens = 1024 } = {}) {
  const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FEATHERLESS_KEY}` },
    body: JSON.stringify({ model: "mistralai/Mistral-7B-Instruct-v0.3", messages, temperature, max_tokens }),
  });
  if (!res.ok) throw new Error(`Featherless ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ─── Core LLM call — TerpAI first, Featherless fallback ──────────────────────
async function callAI(messages, opts = {}) {
  if (TERPAI_TOKEN && TERPAI_SYSTEM_ID) {
    try {
      const content = await callTerpAI(messages);
      console.log("[IntervAI] TerpAI GPT-4o ✓");
      return content;
    } catch (e) {
      console.warn("[IntervAI] TerpAI failed:", e.message, "→ Featherless");
    }
  }
  const content = await callFeatherless(messages, opts);
  console.log("[IntervAI] Featherless ✓");
  return content;
}

// ─── Robust JSON extractor — handles markdown fences, leading text, etc. ──────
function extractJSON(raw) {
  if (!raw) throw new Error("Empty response");
  // 1. Direct parse
  try { return JSON.parse(raw); } catch {}
  // 2. Strip markdown fences
  const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(stripped); } catch {}
  // 3. Find first {...} block (model sometimes adds preamble text)
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  // 4. Last resort — find any JSON-like structure
  const loose = raw.match(/\{[\s\S]*\}/);
  if (loose) { try { return JSON.parse(loose[0]); } catch {} }
  throw new Error("Could not extract JSON from response: " + raw.slice(0, 120));
}

// ─── System prompt factory ────────────────────────────────────────────────────

function interviewerSystem(role, company, type) {
  const focus =
    type === "technical"
      ? "technical concepts, coding, system design, and past projects"
      : type === "hr"
      ? "behavioral questions, motivation, culture fit, and communication"
      : "a mix of technical and behavioral questions";

  return `You are Alex, a friendly senior interviewer at ${company} hiring for ${role}.
Style: conversational, direct, human. No robotic phrasing.
Focus: ${focus}.
RULES:
- Output ONLY the question. No labels, no explanations, no "Difficulty:", no "Guidance:", nothing else.
- Keep questions SHORT — one clear sentence or two max.
- Sound like a real person talking, not a written prompt.`;
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function nextQuestion({ role, company, type, history, resumeText, difficulty }) {
  const historyBlock =
    history && history.length
      ? history.map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer || "(no answer)"}`).join("\n\n")
      : "No questions asked yet — this is the opening question.";

  const difficultyGuide =
    difficulty === "easy warm-up"
      ? "Ask a simple, friendly warm-up question. E.g. 'Tell me about yourself', background, motivation, or a basic concept definition."
      : difficulty === "medium core"
      ? "Ask a solid core question — a specific technical concept, a behavioral STAR question, or a project deep-dive."
      : "Ask a challenging question — system design trade-offs, edge cases, failure handling, or a tough situational scenario.";

  const messages = [
    { role: "system", content: interviewerSystem(role, company, type) },
    {
      role: "user",
      content: `${resumeText ? `Resume summary: ${resumeText.slice(0, 600)}\n\n` : ""}Previous Q&A:\n${historyBlock}

Ask a ${difficulty || "medium"} question. Do NOT repeat any topic above. Output ONLY the question, nothing else.`,
    },
  ];

  const question = await callAI(messages, { temperature: 0.85, max_tokens: 80 });
  // Strip any leaked labels like "Difficulty:", "Question:", quotes
  const clean = question
    .replace(/^(question|difficulty|guidance|q\d*)[:\-\s]*/gi, "")
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
  return { question: clean };
}

async function analyzeAnswer({ role, company, question, answer, resumeText }) {
  const messages = [
    {
      role: "system",
      content: `You are an expert interview coach. Analyze interview answers and give specific, actionable feedback.
RULES:
- score MUST be an integer from 1 to 10. Never output a score outside this range.
- If the answer is unclear, garbled (speech-to-text errors), or off-topic: interpret the candidate's LIKELY INTENT charitably, then analyze that interpretation. Do NOT refuse or give a generic response.
- betterAnswer MUST be written in first person ("I would...") as if you are demonstrating the ideal answer. Be specific, use correct technical terminology, give real examples. 3-5 sentences. Never be generic.
- Reference the candidate's actual words when giving feedback.`,
    },
    {
      role: "user",
      content: `Role: ${role} at ${company}
${resumeText ? `Resume context: ${resumeText.slice(0, 400)}` : ""}

Interview question: "${question}"
Candidate's answer: "${answer || "(no answer — they were silent)"}"

Return ONLY valid JSON, no markdown fences:
{
  "score": <integer 1-10>,
  "strengths": ["<specific thing they did well>", "<strength>"],
  "improvements": ["<specific gap with concrete fix>", "<improvement>"],
  "betterAnswer": "<ideal first-person answer, 3-5 sentences, specific and technical>",
  "tip": "<one coaching tip referencing their specific answer>",
  "communicationNotes": { "clarity": <1-10>, "structure": <1-10>, "confidence": <1-10> }
}`,
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callAI(messages, { temperature: 0.65, max_tokens: 700 });
      return extractJSON(raw);
    } catch (e) {
      if (attempt === 1) throw e;
      console.warn("[analyzeAnswer] Parse failed, retrying...", e.message);
    }
  }
}

async function finalReport({ role, company, type, history, resumeText, pauseData }) {
  const qa = history
    .map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: "${h.answer?.trim() || "(silent)"}"`)
    .join("\n\n");

  const pauseSummary = pauseData?.longPauses > 0
    ? `${pauseData.longPauses} notable pause(s) > 3 seconds.`
    : "No significant pauses.";

  const messages = [
    {
      role: "system",
      content: `You are an expert interview coach. Write an honest, warm, specific performance report.
Use the candidate's actual words. Be a helpful mentor, not generic.
overallScore MUST be an integer from 1 to 10. Never go outside this range.`,
    },
    {
      role: "user",
      content: `Role: ${role} at ${company} (${type} interview)
${resumeText ? `Resume: ${resumeText.slice(0, 400)}\n` : ""}
Interview Q&A:
${qa}
Pauses: ${pauseSummary}

Return ONLY valid JSON (no markdown fences):
{
  "overallScore": <integer 1-10>,
  "summary": "<2-3 warm honest sentences about overall performance>",
  "topStrengths": ["<strength with example from their words>", "<strength>", "<strength>"],
  "areasToImprove": ["<gap with concrete fix>", "<gap>", "<gap>"],
  "communicationInsights": "<observations about pace, clarity, filler words, pauses>",
  "studyRecommendations": ["<topic>", "<topic>", "<topic>"],
  "interviewerTakeaway": "<honest view — would they move forward?>",
  "nextSteps": "<2-3 motivating realistic action items>"
}`,
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callAI(messages, { temperature: 0.65, max_tokens: 900 });
      return extractJSON(raw);
    } catch (e) {
      if (attempt === 1) throw e;
      console.warn("[finalReport] Parse failed, retrying...", e.message);
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, role, company, type, question, answer, history, resumeText, pauseData, terpaiToken, terpaiEndpoint } = req.body;
  const aiOpts = { terpaiToken, terpaiEndpoint };

  if (!action) {
    return res.status(400).json({ error: "Missing 'action' field" });
  }

  try {
    if (action === "next_question") {
      const result = await nextQuestion({ role, company, type, history, resumeText });
      return res.status(200).json(result);
    }

    if (action === "analyze_answer") {
      const result = await analyzeAnswer({ role, company, question, answer, resumeText });
      return res.status(200).json(result);
    }

    if (action === "final_report") {
      const result = await finalReport({ role, company, type, history, resumeText, pauseData });
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error("[IntervAI API Error]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
