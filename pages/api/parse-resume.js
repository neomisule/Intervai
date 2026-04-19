/**
 * POST /api/parse-resume
 * Body: { content: string (raw text or base64), filename: string }
 * Uses Featherless AI to extract structured resume info.
 */

const FEATHERLESS_KEY = process.env.FEATHERLESS_API_KEY || "";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { content, filename } = req.body;
  if (!content) return res.status(400).json({ error: "No content" });

  // Strip null bytes and clean up the raw text
  const cleanText = content
    .replace(/\x00/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);

  if (cleanText.length < 30) {
    return res.status(200).json({
      resumeText: "",
      error: "Could not extract readable text from this file. Please use a .txt version of your resume."
    });
  }

  try {
    const aiRes = await fetch("https://api.featherless.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FEATHERLESS_KEY}`,
      },
      body: JSON.stringify({
        model: "mistralai/Mistral-7B-Instruct-v0.3",
        messages: [
          {
            role: "system",
            content: `You are a resume parser. Extract key information from the raw resume text provided and return a clean, structured summary.
Focus on: name, current role/title, years of experience, technical skills, programming languages, frameworks, tools, projects (with brief descriptions), work experience (company + role + duration), education, and notable achievements.
Be concise and factual. Output plain text only, no JSON, no markdown headers — just clean structured sentences that an AI interviewer can use to ask relevant questions.`,
          },
          {
            role: "user",
            content: `Here is the raw resume text from file "${filename}":\n\n${cleanText}\n\nExtract and summarize the key information.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!aiRes.ok) throw new Error(`Featherless ${aiRes.status}`);
    const data = await aiRes.json();
    const resumeText = data.choices[0].message.content.trim();
    return res.status(200).json({ resumeText });
  } catch (err) {
    console.error("Resume parse error:", err);
    // Fall back to raw cleaned text if AI fails
    return res.status(200).json({ resumeText: cleanText.slice(0, 2000) });
  }
}
