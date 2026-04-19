"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface PerQ {
  score: number;
  verdict: string;
  modelAnswer: string;
  keyMiss: string;
  tip: string;
}

interface QAEntry {
  question: string;
  answer: string;
  score?: number;
  feedback?: { communicationNotes?: { clarity: number; structure: number; confidence: number } };
}

interface FinalReport {
  overallScore: number;
  summary: string;
  topStrengths: string[];
  areasToImprove: string[];
  perQuestion: PerQ[];
  communicationInsights: string;
  studyRecommendations: string[];
  interviewerTakeaway: string;
  nextSteps: string;
}

interface Session {
  id: string; role: string; company: string; type: string;
  date: number; history: QAEntry[];
  pauseData?: { longPauses: number };
  finalReport: FinalReport | null;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       "#f8fafc",
  surface:  "#ffffff",
  border:   "#e2e8f0",
  text:     "#0f172a",
  text2:    "#475569",
  text3:    "#94a3b8",
  blue:     "#0ea5e9",
  blueDark: "#0369a1",
  blueSoft: "#f0f9ff",
  blueMid:  "#bae6fd",
  green:    "#10b981",
  greenSoft:"#ecfdf5",
  greenMid: "#a7f3d0",
  amber:    "#f59e0b",
  amberSoft:"#fffbeb",
  red:      "#ef4444",
  redSoft:  "#fff5f5",
  slate:    "#64748b",
};

function scoreColor(s: number) {
  if (s >= 8) return C.green;
  if (s >= 6) return C.blue;
  if (s >= 4) return C.amber;
  return C.red;
}
function scoreBg(s: number) {
  if (s >= 8) return C.greenSoft;
  if (s >= 6) return C.blueSoft;
  if (s >= 4) return C.amberSoft;
  return C.redSoft;
}

// ─── Score ring SVG ───────────────────────────────────────────────────────────
function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const r    = size / 2 - 9;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(score / 10, 1) * circ;
  const col  = scoreColor(score);
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={9} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={9}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dasharray 1.2s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: size * 0.24, fontWeight: 800, fill: col, fontFamily: "system-ui" }}>
        {score}
      </text>
    </svg>
  );
}

// ─── Horizontal bar ───────────────────────────────────────────────────────────
function HBar({ value, color, max = 10 }: { value: number; color: string; max?: number }) {
  return (
    <div style={{ height: 7, borderRadius: 99, background: C.border, overflow: "hidden", flex: 1 }}>
      <div style={{
        height: "100%", width: `${(value / max) * 100}%`,
        background: color, borderRadius: 99,
        transition: "width 1.2s ease",
      }} />
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 18, padding: "24px 26px",
      boxShadow: "0 2px 12px rgba(15,23,42,0.05)",
      ...style,
    }}>{children}</div>
  );
}

function H({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
      <span>{icon}</span> {title}
    </div>
  );
}

// ─── Score bar chart ──────────────────────────────────────────────────────────
function ScoreChart({ perQ, history }: { perQ: PerQ[]; history: QAEntry[] }) {
  const scores = perQ.length
    ? perQ.map((p, i) => ({ q: i + 1, s: p.score }))
    : history.map((_, i) => ({ q: i + 1, s: 5 }));

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 90 }}>
      {scores.map(({ q, s }) => (
        <div key={q} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(s) }}>{s}</span>
          <div style={{
            width: "100%", borderRadius: "5px 5px 0 0",
            height: `${Math.max((s / 10) * 64, 4)}px`,
            background: scoreColor(s), opacity: 0.85,
            transition: "height 1.2s ease",
          }} />
          <span style={{ fontSize: 10, color: C.text3 }}>Q{q}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function ResultsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const id     = params.get("id");

  const [session, setSession]       = useState<Session | null>(null);
  const [closedQs, setClosedQs]     = useState<Set<number>>(new Set()); // all open by default
  const [speaking, setSpeaking]     = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    const all: Session[] = JSON.parse(localStorage.getItem("intervai_sessions") || "[]");
    setSession(id ? all.find(s => s.id === id) ?? all[0] : all[0]);
  }, [id]);

  const [retryCount, setRetryCount] = useState(0);

  // Fetch report if session loaded but has no finalReport yet
  useEffect(() => {
    if (!session || session.finalReport) return;
    setLoadingReport(true);

    // Play thank you TTS (fire-and-forget)
    fetch("/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Thank you so much for your time today! I really enjoyed our conversation. Give me just a moment while I put together your personalized feedback and report.` }),
    }).then(r => r.blob()).then(blob => { new Audio(URL.createObjectURL(blob)).play().catch(() => {}); }).catch(() => {});

    // Helper: call API with one retry on network/parse failure
    const callAPI = (body: object, delayMs = 0): Promise<any> =>
      new Promise(resolve => setTimeout(resolve, delayMs))
        .then(() => fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .catch(async (e) => {
          console.warn("[results] API call failed, retrying:", e.message);
          await new Promise(r => setTimeout(r, 1500));
          const r2 = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          return r2.ok ? r2.json() : {};
        })
        .catch(() => ({}));

    // Summary request
    const summaryPromise = callAPI({
      action: "final_report",
      role: session.role, company: session.company, type: session.type,
      resumeText: "", history: session.history, pauseData: session.pauseData,
    });

    // Per-question requests — staggered 300ms apart to avoid rate limits
    const perQPromises = session.history.map((h, i) =>
      callAPI({
        action: "analyze_answer",
        role: session.role, company: session.company,
        question: h.question, answer: h.answer, resumeText: "",
      }, i * 300)
    );

    Promise.all([summaryPromise, Promise.all(perQPromises)])
      .then(([summary, perQResults]) => {
        const perQuestion: PerQ[] = perQResults.map((pq: any) => ({
          score: Math.min(10, Math.max(1, Math.round(pq.score ?? 5))),
          verdict: pq.strengths?.[0] || pq.improvements?.[0] || "See coaching feedback below",
          modelAnswer: pq.betterAnswer || "",
          keyMiss: pq.improvements?.[0] || "",
          tip: pq.tip || "",
        }));

        // Validate — don't save an empty report
        const hasContent = summary.summary || summary.overallScore || perQuestion.some(p => p.modelAnswer);
        if (!hasContent) {
          console.warn("[results] Report came back empty — will retry");
          setRetryCount(c => c + 1); // triggers re-run of this effect via key change
          return;
        }

        const overallScore = Math.min(10, Math.max(1, Math.round(summary.overallScore ?? 5)));
        const finalReport = { ...summary, overallScore, perQuestion };
        const updated = { ...session, finalReport };
        setSession(updated);
        const all: Session[] = JSON.parse(localStorage.getItem("intervai_sessions") || "[]");
        const idx = all.findIndex(s => s.id === session.id);
        if (idx !== -1) { all[idx] = updated; localStorage.setItem("intervai_sessions", JSON.stringify(all)); }
      })
      .catch(err => { console.error("[results] Report generation failed:", err); })
      .finally(() => setLoadingReport(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, retryCount]);

  const hearSummary = async () => {
    if (!session?.finalReport?.summary) return;
    setSpeaking(true);
    try {
      const text = `Here's your interview feedback. ${session.finalReport.summary} ${session.finalReport.nextSteps}`;
      const res  = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => setSpeaking(false);
      audio.play();
    } catch { setSpeaking(false); }
  };

  if (!session) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ fontSize: 40 }}>📋</div>
      <p style={{ color: C.text2 }}>No report found.</p>
      <button onClick={() => router.push("/")} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: C.blue, color: "#fff", cursor: "pointer" }}>Go Home</button>
    </div>
  );

  if (loadingReport || !session.finalReport) return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #dbeafe 0%, #eff6ff 45%, #e0f2fe 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 28, fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 24, textAlign: "center",
    }}>
      {/* Avatar with rings */}
      <div style={{ position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            position: "absolute", width: 120 + i*24, height: 120 + i*24, borderRadius: "50%",
            border: `2px solid rgba(59,130,246,${0.25 - i*0.07})`,
            animationName: "pulse-out", animationDuration: "2.4s",
            animationTimingFunction: "ease-out", animationIterationCount: "infinite",
            animationDelay: `${i * 0.7}s`,
          }} />
        ))}
        <div style={{
          width: 96, height: 96, borderRadius: "50%",
          background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #3b82f6 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40,
          boxShadow: "0 0 0 6px rgba(59,130,246,0.15), 0 8px 40px rgba(29,78,216,0.35)",
        }}>🎙️</div>
      </div>

      <div>
        <h2 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" }}>
          Reviewing your interview...
        </h2>
        <p style={{ margin: "0 0 6px", fontSize: 15, color: "#475569", lineHeight: 1.6 }}>
          Alex is analysing your answers and preparing<br />personalized feedback for you.
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
          {session.role} · {session.company}
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ width: 260, height: 4, borderRadius: 99, background: "#dbeafe", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 99,
          background: "linear-gradient(90deg, #1e3a8a, #3b82f6)",
          animationName: "progress", animationDuration: "12s",
          animationTimingFunction: "ease-in-out", animationFillMode: "forwards",
        }} />
      </div>

      <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
        {retryCount > 0 ? `Retrying... (attempt ${retryCount + 1})` : "This usually takes 10–15 seconds"}
      </p>
      {retryCount >= 2 && (
        <button onClick={() => setRetryCount(c => c + 1)} style={{
          marginTop: 8, padding: "10px 24px", borderRadius: 10, border: "none",
          background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
          color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>
          Try Again
        </button>
      )}

      <style>{`
        @keyframes pulse-out { 0% { transform: scale(0.9); opacity: 0.8; } 100% { transform: scale(1.5); opacity: 0; } }
        @keyframes progress { 0% { width: 5%; } 70% { width: 85%; } 100% { width: 95%; } }
      `}</style>
    </div>
  );

  const r   = session.finalReport || {} as FinalReport;
  const perQ = r.perQuestion || [];

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.text }}>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 32px", background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        boxShadow: "0 1px 6px rgba(15,23,42,0.05)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, fontWeight: 800, color: C.text }}>
          Interv<span style={{ color: C.blue }}>AI</span>
        </button>
        <div style={{ fontSize: 13, color: C.text2 }}>
          {session.role} · {session.company} · {new Date(session.date).toLocaleDateString()}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={hearSummary} disabled={speaking} style={{
            padding: "8px 16px", borderRadius: 9, border: `1px solid ${C.border}`,
            background: speaking ? C.blueSoft : C.surface,
            color: speaking ? C.blue : C.text2, fontSize: 13, cursor: "pointer",
          }}>
            {speaking ? "🔊 Playing..." : "🔊 Hear Summary"}
          </button>
          <button onClick={() => router.push(`/start?role=${session.role}&company=${session.company}&type=${session.type}`)} style={{
            padding: "8px 16px", borderRadius: 9, border: "none",
            background: `linear-gradient(135deg, ${C.blueDark}, ${C.blue})`,
            color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600,
          }}>
            Retry →
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "36px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── QUESTION-BY-QUESTION BREAKDOWN — first thing you see ────────────── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>💬</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: "-0.3px" }}>Question-by-Question Breakdown</div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 1 }}>Your answers · ideal responses · coaching tips</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {session.history.map((h, i) => {
              const pq    = perQ[i];
              const score = pq?.score ?? null;
              const col   = score !== null ? scoreColor(score) : C.text3;
              const bg    = score !== null ? scoreBg(score) : C.surface;
              const open  = !closedQs.has(i); // all open by default

              const toggleQ = () => setClosedQs(prev => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i); else next.add(i);
                return next;
              });

              return (
                <Card key={i} style={{ padding: 0, overflow: "hidden" }}>
                  {/* Header */}
                  <button onClick={toggleQ} style={{
                    width: "100%", background: "none", border: "none",
                    padding: "18px 22px", cursor: "pointer",
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, textAlign: "left",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                      {/* Score badge */}
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: bg, display: "flex", alignItems: "center",
                        justifyContent: "center", fontWeight: 800, fontSize: 16, color: col,
                        border: `1.5px solid ${col}30`,
                      }}>
                        {score ?? "—"}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, marginBottom: 3 }}>
                          Q{i + 1} · {i === 0 ? "Warm-up" : i <= 2 ? "Core" : "Advanced"}
                          {pq?.verdict ? ` · ${pq.verdict}` : ""}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{h.question}</div>
                      </div>
                    </div>
                    <span style={{ color: C.text3, fontSize: 11, flexShrink: 0, marginTop: 4 }}>{open ? "▲ Less" : "▼ More"}</span>
                  </button>

                  {/* Expanded */}
                  {open && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

                      {/* Your answer */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                          Your Answer
                        </div>
                        <p style={{
                          margin: 0, fontSize: 14, color: h.answer ? C.text : C.text3,
                          lineHeight: 1.7, background: C.bg, padding: "14px 16px",
                          borderRadius: 10, border: `1px solid ${C.border}`,
                          fontStyle: h.answer ? "normal" : "italic",
                        }}>
                          {h.answer || "No answer recorded"}
                        </p>
                      </div>

                      {/* Model answer — always shown */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                          💡 What a Great Answer Looks Like
                        </div>
                        <p style={{
                          margin: 0, fontSize: 14, color: "#065f46",
                          lineHeight: 1.75, background: C.greenSoft,
                          padding: "16px 18px", borderRadius: 12,
                          border: `1px solid ${C.greenMid}`,
                        }}>
                          {pq?.modelAnswer || "A strong answer would directly address the question with specific examples, correct technical terminology, and a clear structure. Start with your approach, explain your reasoning, and close with a concrete outcome or example from your experience."}
                        </p>
                      </div>

                      {/* Key miss + tip */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {pq?.keyMiss && (
                          <div style={{ padding: "12px 14px", borderRadius: 10, background: C.amberSoft, border: "1px solid #fde68a" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 6 }}>What You Missed</div>
                            <p style={{ margin: 0, fontSize: 13, color: "#78350f", lineHeight: 1.5 }}>{pq.keyMiss}</p>
                          </div>
                        )}
                        {pq?.tip && (
                          <div style={{ padding: "12px 14px", borderRadius: 10, background: C.blueSoft, border: `1px solid ${C.blueMid}` }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 6 }}>Coaching Tip</div>
                            <p style={{ margin: 0, fontSize: 13, color: C.blueDark, lineHeight: 1.5 }}>{pq.tip}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* ── OVERALL SCORE SUMMARY ─────────────────────────────────────────── */}
        <Card style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap",
          background: "linear-gradient(135deg, #f0f9ff, #ecfdf5)",
          border: `1px solid ${C.blueMid}` }}>
          <ScoreRing score={r.overallScore ?? 0} size={110} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
              Overall Score · {session.role} at {session.company}
            </div>
            <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: C.text }}>
              {(r.overallScore ?? 0) >= 8 ? "Excellent — you're ready to interview!" :
               (r.overallScore ?? 0) >= 6 ? "Good effort — a few things to sharpen" :
               "Keep practicing — progress is coming"}
            </h2>
            <p style={{ margin: 0, color: C.text2, fontSize: 14, lineHeight: 1.7 }}>{r.summary}</p>
          </div>
          {session.pauseData?.longPauses ? (
            <div style={{ padding: "10px 16px", borderRadius: 10, background: C.amberSoft, border: `1px solid #fde68a`, fontSize: 13, color: "#92400e" }}>
              ⏸ {session.pauseData.longPauses} long pause{session.pauseData.longPauses > 1 ? "s" : ""}
            </div>
          ) : null}
        </Card>

        {/* Charts row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <H icon="📊" title="Score Per Question" />
            <ScoreChart perQ={perQ} history={session.history} />
          </Card>
          <Card>
            <H icon="🗣️" title="Communication Breakdown" />
            {[
              { label: "Clarity", value: perQ.length ? Math.round(perQ.reduce((a, p) => a + (p.score >= 7 ? 7 : p.score >= 5 ? 6 : 4), 0) / perQ.length) : 5, color: C.blue },
              { label: "Structure", value: perQ.length ? Math.round(perQ.reduce((a, p) => a + (p.score >= 8 ? 7 : p.score >= 5 ? 5 : 4), 0) / perQ.length) : 5, color: C.green },
              { label: "Confidence", value: session.pauseData?.longPauses ? Math.max(3, 8 - session.pauseData.longPauses) : 7, color: C.amber },
            ].map(m => (
              <div key={m.label} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.value}/10</span>
                </div>
                <HBar value={m.value} color={m.color} />
              </div>
            ))}
            <p style={{ margin: "14px 0 0", fontSize: 13, color: C.text2, lineHeight: 1.6 }}>{r.communicationInsights}</p>
          </Card>
        </div>

        {/* Strengths + Improve */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <H icon="✅" title="What You Did Well" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(r.topStrengths || []).map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: C.greenSoft, border: `1px solid ${C.greenMid}` }}>
                  <span style={{ color: C.green, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 14, color: "#065f46", lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <H icon="🎯" title="Where to Improve" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(r.areasToImprove || []).map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: C.amberSoft, border: "1px solid #fde68a" }}>
                  <span style={{ color: C.amber, fontWeight: 700, flexShrink: 0 }}>→</span>
                  <span style={{ fontSize: 14, color: "#78350f", lineHeight: 1.5 }}>{s}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Interviewer takeaway */}
        <Card style={{ background: "linear-gradient(135deg, #f0f9ff, #f8fafc)", border: `1px solid ${C.blueMid}` }}>
          <H icon="🧑‍💼" title="What the Interviewer Would Think" />
          <p style={{ margin: 0, fontSize: 15, color: C.blueDark, lineHeight: 1.75, fontStyle: "italic" }}>
            &ldquo;{r.interviewerTakeaway}&rdquo;
          </p>
        </Card>

        {/* Study recs + Next steps */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <H icon="📚" title="Study Recommendations" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(r.studyRecommendations || []).map((rec, i) => (
                <div key={i} style={{
                  padding: "10px 14px", borderRadius: 10,
                  background: C.blueSoft, border: `1px solid ${C.blueMid}`,
                  color: C.blueDark, fontSize: 13, fontWeight: 600,
                }}>{rec}</div>
              ))}
            </div>
          </Card>
          <Card style={{ background: "linear-gradient(135deg, #ecfdf5, #f8fafc)", border: `1px solid ${C.greenMid}` }}>
            <H icon="🚀" title="Your Next Steps" />
            <p style={{ margin: 0, fontSize: 14, color: "#065f46", lineHeight: 1.85 }}>{r.nextSteps}</p>
          </Card>
        </div>

      </div>
    </main>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
        Loading report...
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}
