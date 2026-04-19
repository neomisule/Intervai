"use client";

import { useUser } from "@auth0/nextjs-auth0/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Session {
  id: string;
  role: string;
  company: string;
  type: string;
  date: number;
  finalReport?: { overallScore?: number } | null;
}

const B = {
  bg:      "#f0f9ff",
  surface: "#ffffff",
  border:  "#e0f2fe",
  text:    "#0f172a",
  text2:   "#475569",
  text3:   "#94a3b8",
  blue:    "#1d4ed8",
  blueMid: "#3b82f6",
  blueLt:  "#dbeafe",
  blueXlt: "#eff6ff",
  green:   "#10b981",
  amber:   "#f59e0b",
  red:     "#ef4444",
};

function scoreColor(s: number) {
  if (s >= 8) return B.green;
  if (s >= 5) return B.blueMid;
  return B.amber;
}

export default function Home() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("intervai_sessions") || "[]");
    setSessions(stored);
  }, []);

  if (isLoading) return (
    <div style={{ minHeight: "100vh", background: B.bg, display: "flex", alignItems: "center", justifyContent: "center", color: B.text2, fontFamily: "system-ui" }}>
      Loading...
    </div>
  );

  // ─── Landing (not logged in) ───────────────────────────────────────────────
  if (!user) return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #dbeafe 0%, #f0f9ff 55%, #e0f2fe 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      textAlign: "center", padding: 24,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Logo mark */}
      <div style={{
        width: 76, height: 76, borderRadius: 22,
        background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 34, marginBottom: 28,
        boxShadow: "0 8px 32px rgba(29,78,216,0.3)",
      }}>🎙️</div>

      <h1 style={{ fontSize: 52, fontWeight: 900, margin: "0 0 14px", color: B.text, letterSpacing: "-2px", lineHeight: 1 }}>
        Interv<span style={{ color: B.blue }}>AI</span>
      </h1>
      <p style={{ fontSize: 18, color: B.text2, maxWidth: 460, lineHeight: 1.75, margin: "0 0 44px" }}>
        Voice-powered mock interviews with real-time AI feedback.<br />
        Practice like it&apos;s the real thing.
      </p>

      <a href="/auth/login" style={{
        padding: "16px 48px", borderRadius: 14,
        background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
        color: "#fff", fontSize: 16, fontWeight: 700, textDecoration: "none",
        boxShadow: "0 6px 28px rgba(29,78,216,0.35)",
        display: "inline-block",
      }}>
        Get Started →
      </a>

      {/* Feature pills */}
      <div style={{ marginTop: 56, display: "flex", gap: 28, color: B.text2, fontSize: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {["GPT-4o Interviewer", "ElevenLabs Voice", "Detailed AI Feedback", "Resume-tailored Questions"].map(f => (
          <span key={f} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: B.blue, fontWeight: 700 }}>✓</span> {f}
          </span>
        ))}
      </div>
    </main>
  );

  // ─── Dashboard (logged in) ─────────────────────────────────────────────────
  const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n)));
  const withScore = sessions.filter(s => s.finalReport?.overallScore != null && s.finalReport.overallScore <= 10);
  const avgScore = withScore.length
    ? (withScore.reduce((acc, s) => acc + clamp(s.finalReport?.overallScore ?? 5), 0) / withScore.length).toFixed(1)
    : null;
  const bestScore = withScore.length
    ? Math.max(...withScore.map(s => clamp(s.finalReport?.overallScore ?? 0)))
    : null;

  return (
    <main style={{ minHeight: "100vh", background: B.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: B.text }}>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "15px 32px", background: B.surface,
        borderBottom: `1px solid ${B.border}`,
        boxShadow: "0 1px 8px rgba(29,78,216,0.06)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px", color: B.text }}>
          Interv<span style={{ color: B.blue }}>AI</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 14, color: B.text2 }}>{user.name || user.email}</span>
          <a href="/auth/logout" style={{
            fontSize: 13, color: B.text2, textDecoration: "none",
            padding: "6px 14px", border: `1px solid ${B.border}`,
            borderRadius: 8, background: B.surface,
            transition: "all 0.15s",
          }}>Sign out</a>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "44px 24px" }}>

        {/* Welcome */}
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 4px", color: B.text, letterSpacing: "-0.5px" }}>
          Welcome back, {user.name?.split(" ")[0] || "there"} 👋
        </h1>
        <p style={{ margin: "0 0 36px", color: B.text2, fontSize: 15 }}>
          Ready to practice? Each session sharpens your edge.
        </p>

        {/* Stats */}
        {sessions.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 32 }}>
            {[
              { label: "Interviews Done", value: sessions.length, icon: "🎙️", accent: B.blue },
              { label: "Avg Score", value: avgScore ? `${avgScore}/10` : "—", icon: "📈", accent: B.green },
              { label: "Best Score", value: bestScore ? `${bestScore}/10` : "—", icon: "⭐", accent: B.amber },
              { label: "Companies", value: new Set(sessions.map(s => s.company)).size, icon: "🏢", accent: B.blueMid },
            ].map(stat => (
              <div key={stat.label} style={{
                background: B.surface, border: `1px solid ${B.border}`,
                borderRadius: 16, padding: "20px 22px",
                boxShadow: "0 2px 12px rgba(29,78,216,0.06)",
              }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{stat.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: stat.accent, lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: B.text2, marginTop: 5, fontWeight: 500 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* CTA card */}
        <div style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #3b82f6 100%)",
          borderRadius: 22, padding: "32px 36px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 36, gap: 24,
          boxShadow: "0 8px 32px rgba(29,78,216,0.25)",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              Ready to practice?
            </div>
            <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: "#fff" }}>
              Start a New Interview
            </h2>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
              Pick your role, company, and type. Upload your resume for tailored questions.
            </p>
          </div>
          <button onClick={() => router.push("/start")} style={{
            padding: "14px 30px", borderRadius: 13, border: "none",
            background: "#fff",
            color: B.blue, fontSize: 15, fontWeight: 800, cursor: "pointer",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            transition: "transform 0.15s",
          }}>
            🎙️ Start Interview
          </button>
        </div>

        {/* Past sessions */}
        {sessions.length > 0 ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: B.text }}>Past Interviews</h2>
              <span style={{ fontSize: 13, color: B.text3 }}>{sessions.length} session{sessions.length > 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sessions.map(s => {
                const rawScore = s.finalReport?.overallScore ?? null;
                const score = rawScore !== null && rawScore <= 10 ? clamp(rawScore) : null;
                const col = score !== null ? scoreColor(score) : B.text3;
                const typeIcon = s.type === "technical" ? "💻" : s.type === "hr" ? "🤝" : "⚡";
                const typeLabel = s.type === "technical" ? "Technical" : s.type === "hr" ? "HR" : "Mixed";
                return (
                  <div key={s.id} style={{
                    background: B.surface, border: `1px solid ${B.border}`,
                    borderRadius: 16, padding: "16px 22px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    boxShadow: "0 2px 10px rgba(29,78,216,0.05)",
                    gap: 16,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: B.blueXlt, border: `1px solid ${B.blueLt}`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                      }}>
                        {typeIcon}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: B.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.role}
                        </div>
                        <div style={{ fontSize: 12, color: B.text2, marginTop: 3 }}>
                          {s.company} · {typeLabel} · {new Date(s.date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      {score !== null ? (
                        <div style={{
                          width: 40, height: 40, borderRadius: 10,
                          background: `${col}18`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 800, fontSize: 14, color: col,
                          border: `1.5px solid ${col}40`,
                        }}>
                          {score}
                        </div>
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: B.blueXlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: B.text3 }}>
                          —
                        </div>
                      )}
                      <button onClick={() => router.push(`/results?id=${s.id}`)} style={{
                        padding: "8px 14px", borderRadius: 9,
                        border: `1px solid ${B.border}`, background: B.surface,
                        color: B.text2, fontSize: 12, cursor: "pointer", fontWeight: 500,
                      }}>Report</button>
                      <button onClick={() => router.push(`/start?role=${s.role}&company=${s.company}&type=${s.type}`)} style={{
                        padding: "8px 14px", borderRadius: 9,
                        border: `1px solid ${B.blueLt}`, background: B.blueXlt,
                        color: B.blue, fontSize: 12, cursor: "pointer", fontWeight: 700,
                      }}>Retry →</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            background: B.surface, borderRadius: 20,
            border: `1px dashed ${B.border}`,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎙️</div>
            <p style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: B.text }}>No interviews yet</p>
            <p style={{ margin: "0 0 24px", color: B.text2, fontSize: 14 }}>Hit <strong>Start Interview</strong> above to do your first practice session.</p>
            <button onClick={() => router.push("/start")} style={{
              padding: "12px 28px", borderRadius: 11, border: "none",
              background: `linear-gradient(135deg, #1e3a8a, #1d4ed8)`,
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>Get Started →</button>
          </div>
        )}

      </div>
    </main>
  );
}
