"use client";

import { useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const QUESTION_TYPES = [
  { value: "technical", label: "💻 Technical / Project-Based", desc: "DSA, system design, coding concepts, project deep-dives" },
  { value: "hr",        label: "🤝 HR / Behavioral",           desc: "Culture fit, STAR stories, motivation, communication" },
  { value: "mixed",     label: "⚡ Mixed",                      desc: "Best of both — realistic full-round interview" },
];

const BLUE     = "#1e40af";
const BLUE_MID = "#2563eb";
const BLUE_LT  = "#dbeafe";
const BORDER   = "#e2e8f0";
const TEXT      = "#0f172a";
const TEXT2    = "#475569";

function StartForm() {
  const router = useRouter();
  const params = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm]         = useState({ role: params.get("role") || "", company: params.get("company") || "", type: params.get("type") || "technical" });
  const [focused, setFocused]   = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [parsing, setParsing]     = useState(false);
  const [parseError, setParseError] = useState("");

  const isReady = form.role.trim() && form.company.trim();

  const inputStyle = (field: string): React.CSSProperties => ({
    width: "100%", padding: "12px 15px", borderRadius: 11,
    border: `1.5px solid ${focused === field ? BLUE_MID : BORDER}`,
    background: focused === field ? "#f8faff" : "#f8fafc",
    color: TEXT, fontSize: 15, outline: "none",
    boxShadow: focused === field ? `0 0 0 3px ${BLUE_LT}` : "none",
    transition: "all 0.2s", boxSizing: "border-box" as const,
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeName(file.name);
    setResumeText("");
    setParseError("");
    setParsing(true);

    try {
      // Read file as text (works well for .txt; PDFs will have some readable text)
      const rawText = await file.text();

      // Send to Featherless AI for structured extraction
      const res = await fetch("/api/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: rawText, filename: file.name }),
      });

      const data = await res.json();
      if (data.resumeText) {
        setResumeText(data.resumeText);
      }
      if (data.error) {
        setParseError(data.error);
      }
    } catch {
      setParseError("Failed to parse resume. Try a .txt file.");
    }

    setParsing(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReady) return;
    const q = new URLSearchParams({
      role: form.role,
      company: form.company,
      type: form.type,
      resume: resumeText,
    });
    router.push(`/interview?${q.toString()}`);
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #dbeafe 0%, #f0f9ff 50%, #e0f2fe 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 500 }}>

        <button onClick={() => router.push("/")} style={{
          background: "none", border: "none", cursor: "pointer",
          color: TEXT2, fontSize: 14, marginBottom: 20,
          display: "flex", alignItems: "center", gap: 6, padding: 0,
        }}>← Back</button>

        <div style={{
          background: "#fff", borderRadius: 22, padding: "36px 32px",
          boxShadow: "0 8px 40px rgba(30,64,175,0.12)",
          border: `1px solid ${BORDER}`,
        }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: `linear-gradient(135deg, ${BLUE}, ${BLUE_MID})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, margin: "0 auto 14px",
              boxShadow: `0 4px 18px rgba(30,64,175,0.25)`,
            }}>🎙️</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 5px", color: TEXT, letterSpacing: "-0.5px" }}>
              Set Up Interview
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: TEXT2 }}>
              AI-tailored questions for your role and company
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Role */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Job Role
              </label>
              <input type="text" placeholder="e.g. Software Engineer, PM, Data Scientist"
                value={form.role} required
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                onFocus={() => setFocused("role")} onBlur={() => setFocused(null)}
                style={inputStyle("role")} />
            </div>

            {/* Company */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Company
              </label>
              <input type="text" placeholder="e.g. Google, Amazon, a startup"
                value={form.company} required
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                onFocus={() => setFocused("company")} onBlur={() => setFocused(null)}
                style={inputStyle("company")} />
            </div>

            {/* Resume upload */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Resume <span style={{ color: TEXT2, fontWeight: 400, textTransform: "none" }}>(optional — helps tailor questions)</span>
              </label>
              <input ref={fileRef} type="file" accept=".txt,.pdf,.doc,.docx" onChange={handleFile} style={{ display: "none" }} />
              <button type="button" onClick={() => fileRef.current?.click()} style={{
                width: "100%", padding: "12px 16px", borderRadius: 11,
                border: `1.5px dashed ${resumeName ? BLUE_MID : BORDER}`,
                background: resumeName ? BLUE_LT : "#f8fafc",
                color: resumeName ? BLUE : TEXT2,
                fontSize: 14, cursor: "pointer", textAlign: "center",
                transition: "all 0.2s",
              }}>
                {parsing ? "Parsing..." : resumeName ? `📄 ${resumeName}` : "📎 Upload Resume (.txt / .pdf)"}
              </button>
              {parsing && (
                <div style={{ marginTop: 6, fontSize: 11, color: BLUE_MID, fontWeight: 600 }}>
                  ⏳ Parsing with AI...
                </div>
              )}
              {resumeText && !parsing && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#10b981", fontWeight: 600 }}>
                  ✓ Resume parsed — questions will reference your experience
                </div>
              )}
              {parseError && !parsing && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#ef4444" }}>
                  ⚠ {parseError}
                </div>
              )}
            </div>

            {/* Type */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Interview Type
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {QUESTION_TYPES.map(t => (
                  <label key={t.value} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px", borderRadius: 11, cursor: "pointer",
                    border: `1.5px solid ${form.type === t.value ? BLUE_MID : BORDER}`,
                    background: form.type === t.value ? BLUE_LT : "#f8fafc",
                    transition: "all 0.15s",
                  }}>
                    <input type="radio" name="type" value={t.value}
                      checked={form.type === t.value}
                      onChange={() => setForm(f => ({ ...f, type: t.value }))}
                      style={{ accentColor: BLUE_MID, width: 15, height: 15 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: TEXT2, marginTop: 1 }}>{t.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" disabled={!isReady} style={{
              marginTop: 4, padding: "14px",
              borderRadius: 12, border: "none",
              background: isReady ? `linear-gradient(135deg, ${BLUE}, ${BLUE_MID})` : BORDER,
              color: isReady ? "#fff" : TEXT2,
              fontSize: 15, fontWeight: 700,
              cursor: isReady ? "pointer" : "not-allowed",
              boxShadow: isReady ? `0 4px 18px rgba(30,64,175,0.3)` : "none",
              transition: "all 0.2s",
            }}>
              Start Interview →
            </button>
          </form>

          <p style={{ textAlign: "center", margin: "18px 0 0", fontSize: 11, color: TEXT2 }}>
            Voice by ElevenLabs · AI by TerpAI · Max 5 min
          </p>
        </div>
      </div>
    </main>
  );
}

export default function StartPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading...</div>}>
      <StartForm />
    </Suspense>
  );
}
