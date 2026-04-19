"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Phase = "loading" | "ai-speaking" | "listening" | "ending";

interface QAEntry {
  question: string;
  answer: string;
  score?: number;
  feedback?: Record<string, unknown>;
}

// ─── Waveform ─────────────────────────────────────────────────────────────────
function Waveform({ active }: { active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, height: 48 }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} style={{
          width: 4, borderRadius: 99,
          background: active
            ? `linear-gradient(180deg, #3b82f6, #1d4ed8)`
            : "#cbd5e1",
          minHeight: 4,
          animationName: active ? "wave" : "none",
          animationDuration: `${0.5 + (i % 5) * 0.12}s`,
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
          animationDirection: "alternate",
          animationDelay: `${i * 0.05}s`,
          boxShadow: active ? "0 0 6px rgba(59,130,246,0.4)" : "none",
        }} />
      ))}
      <style>{`@keyframes wave { from { height: 6px; } to { height: 40px; } }`}</style>
    </div>
  );
}

// ─── AI Avatar ────────────────────────────────────────────────────────────────
function AIAvatar({ speaking, thinking }: { speaking: boolean; thinking: boolean }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 160, height: 160 }}>
      {/* Outer glow */}
      {speaking && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)",
        }} />
      )}
      {/* Pulse rings */}
      {speaking && [0, 1, 2].map(i => (
        <div key={i} style={{
          position: "absolute", width: 130, height: 130, borderRadius: "50%",
          border: "2px solid rgba(59,130,246,0.3)",
          animationName: "pulse-ring",
          animationDuration: "2s",
          animationTimingFunction: "ease-out",
          animationIterationCount: "infinite",
          animationDelay: `${i * 0.6}s`,
        }} />
      ))}
      {/* Thinking spinner ring */}
      {thinking && (
        <div style={{
          position: "absolute", width: 110, height: 110, borderRadius: "50%",
          border: "3px solid #dbeafe",
          borderTopColor: "#3b82f6",
          animationName: "spin",
          animationDuration: "1.2s",
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
        }} />
      )}
      {/* Avatar circle */}
      <div style={{
        width: 96, height: 96, borderRadius: "50%",
        background: thinking
          ? "linear-gradient(135deg, #e2e8f0, #cbd5e1)"
          : speaking
          ? "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #3b82f6 100%)"
          : "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 38,
        boxShadow: speaking
          ? "0 0 0 6px rgba(59,130,246,0.15), 0 8px 40px rgba(29,78,216,0.4)"
          : thinking
          ? "0 4px 20px rgba(15,23,42,0.1)"
          : "0 8px 30px rgba(29,78,216,0.25)",
        transition: "all 0.4s ease",
      }}>
        {thinking ? "💭" : "🎙️"}
      </div>
      <style>{`
        @keyframes pulse-ring { 0% { transform: scale(0.85); opacity: 0.8; } 100% { transform: scale(1.8); opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Difficulty label ─────────────────────────────────────────────────────────
function DifficultyBadge({ qNum }: { qNum: number }) {
  const level = qNum <= 1 ? { label: "Warm-up", color: "#10b981", bg: "#ecfdf5" }
    : qNum <= 3 ? { label: "Core", color: "#1d4ed8", bg: "#f0f9ff" }
    : { label: "Advanced", color: "#f59e0b", bg: "#fffbeb" };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
      background: level.bg, color: level.color, letterSpacing: "0.06em",
    }}>{level.label}</span>
  );
}

// ─── Interview Room ───────────────────────────────────────────────────────────
function InterviewRoom() {
  const router  = useRouter();
  const params  = useSearchParams();
  const role       = params.get("role")    || "Software Engineer";
  const company    = params.get("company") || "the company";
  const type       = params.get("type")    || "technical";
  const resumeText = params.get("resume")  || "";

  const [phase, setPhase]             = useState<Phase>("loading");
  const [question, setQuestion]       = useState("Connecting to your interviewer...");
  const [transcript, setTranscript]   = useState("");
  const [history, setHistory]         = useState<QAEntry[]>([]);
  const [elapsed, setElapsed]         = useState(0);
  const [pauseCount, setPauseCount]   = useState(0);
  const [statusLabel, setStatusLabel] = useState("Starting interview...");
  const [questionNum, setQuestionNum] = useState(0);
  const [endConfirm, setEndConfirm]   = useState(false);

  const historyRef        = useRef<QAEntry[]>([]);
  const transcriptRef     = useRef("");
  const questionRef       = useRef("");
  const pauseCountRef     = useRef(0);
  const questionNumRef    = useRef(0);
  const recognitionRef    = useRef<any>(null);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const isEndingRef       = useRef(false);
  const hasStartedRef     = useRef(false);
  const currentAudioRef   = useRef<HTMLAudioElement | null>(null);
  // Prefetch: fetch next question + TTS while user is still answering
  const prefetchedQ            = useRef<string | null>(null);
  const prefetchedAudio        = useRef<string | null>(null); // object URL
  const prefetchAudioPromise   = useRef<Promise<string | null> | null>(null); // TTS in-flight
  const prefetchNextRef        = useRef<(h: QAEntry[]) => void>(() => {});

  useEffect(() => { historyRef.current = history; }, [history]);

  // Timer — counts UP, ends at 5:00
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(t => {
        if (t >= 299) { clearInterval(timerRef.current!); endInterview(); return 300; }
        return t + 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const urgent = elapsed >= 270; // warn at 4:30

  // ── Fetch TTS audio URL without playing ───────────────────────────────────
  const fetchAudio = useCallback(async (text: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch { return null; }
  }, []);

  // ── Play an already-fetched audio URL (or fall back to silence) ───────────
  const playAudio = useCallback(async (url: string | null): Promise<void> => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    if (!url) { await new Promise(r => setTimeout(r, 600)); return; }
    await new Promise<void>(resolve => {
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      // 15s max timeout — don't hang forever
      const timeout = setTimeout(() => { audio.pause(); currentAudioRef.current = null; resolve(); }, 15000);
      audio.onended = () => { clearTimeout(timeout); URL.revokeObjectURL(url); currentAudioRef.current = null; resolve(); };
      audio.onerror = () => { clearTimeout(timeout); currentAudioRef.current = null; resolve(); };
      audio.play().catch(() => { clearTimeout(timeout); currentAudioRef.current = null; resolve(); });
    });
  }, []);

  // ── Speak = fetch + play ───────────────────────────────────────────────────
  const speak = useCallback(async (text: string): Promise<void> => {
    setPhase("ai-speaking");
    setStatusLabel("Alex is speaking...");
    const url = await fetchAudio(text);
    await playAudio(url);
  }, [fetchAudio, playAudio]);

  // ── Listen ─────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    setPhase("listening");
    setStatusLabel("Your turn — speak your answer");
    setTranscript("");
    transcriptRef.current = "";

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatusLabel("⚠️ Use Chrome for voice support"); return; }

    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }

    const recognition = new SR();
    recognition.continuous     = true;
    recognition.interimResults = true;
    recognition.lang           = "en-US";

    // Accumulate in a local var that persists across onresult calls
    let accumulated = "";
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;

    recognition.onresult = (e: any) => {
      if (pauseTimer) clearTimeout(pauseTimer);
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) accumulated += e.results[i][0].transcript + " ";
        else interim = e.results[i][0].transcript;
      }
      transcriptRef.current = accumulated;
      setTranscript(accumulated + interim);

      // Count pauses > 3s
      pauseTimer = setTimeout(() => {
        pauseCountRef.current += 1;
        setPauseCount(c => c + 1);
      }, 3000);
    };

    recognition.onend = () => {
      // Auto-restart unless we stopped it intentionally
      if (phase === "listening" && !isEndingRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "aborted") console.warn("SR:", e.error);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  // ── Prefetch next question + TTS in background while user answers ─────────
  const prefetchNext = useCallback(async (currentHistory: QAEntry[]) => {
    const nextNum = questionNumRef.current + 1;
    const difficulty = nextNum <= 1 ? "easy warm-up" : nextNum <= 3 ? "medium core" : "hard advanced";
    try {
      const res = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next_question",
          role, company, type, resumeText,
          history: currentHistory,
          difficulty,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.question) return;
      prefetchedQ.current = data.question;
      // Start TTS immediately — store promise so getNextQuestion can await it if needed
      const p = fetchAudio(data.question);
      prefetchAudioPromise.current = p;
      p.then(url => {
        prefetchedAudio.current = url;
        if (prefetchAudioPromise.current === p) prefetchAudioPromise.current = null;
      });
    } catch { /* silent */ }
  }, [role, company, type, resumeText, fetchAudio]);

  // ── Instant warm-up openers (no AI call needed for Q1) ───────────────────
  const getOpener = useCallback((): string => {
    const openers: Record<string, string[]> = {
      technical: [
        `Tell me about yourself — your background, what you've built, and why you're interested in the ${role} role at ${company}.`,
        `Walk me through your experience as a ${role}. What's the most technically challenging project you've worked on?`,
        `Let's start with your background. What does your technical stack look like, and how did you get into this field?`,
      ],
      hr: [
        `Great to meet you! Can you walk me through your background and what brings you to this ${role} opportunity at ${company}?`,
        `Tell me about yourself — your career journey and why you're excited about this role.`,
        `Let's kick things off — can you give me a quick overview of your experience and what you're looking for in your next role?`,
      ],
      mixed: [
        `Hi! Tell me about yourself — your background, your experience, and what excites you about the ${role} role at ${company}.`,
        `Let's start simple — walk me through your journey so far and why you applied for this position.`,
        `Tell me about yourself and what you bring to the table for this ${role} role.`,
      ],
    };
    const list = openers[type] || openers.mixed;
    return list[Math.floor(Math.random() * list.length)];
  }, [role, company, type]);

  // ── Get next question — use prefetch if ready, else fetch fresh ───────────
  const getNextQuestion = useCallback(async () => {
    if (isEndingRef.current) return;
    setTranscript("");
    transcriptRef.current = "";

    const nextNum = questionNumRef.current + 1;
    questionNumRef.current = nextNum;
    setQuestionNum(nextNum);

    let questionText = prefetchedQ.current;
    let audioUrl     = prefetchedAudio.current;
    const audioInFlight = prefetchAudioPromise.current;
    prefetchedQ.current          = null;
    prefetchedAudio.current      = null;
    prefetchAudioPromise.current = null;

    if (!questionText && nextNum === 1) {
      // ── Q1: instant opener, no AI call ──────────────────────────────────
      questionText = getOpener();
      setQuestion(questionText);
      questionRef.current = questionText;
      setStatusLabel("Alex is preparing...");
      audioUrl = await fetchAudio(questionText);

    } else if (!questionText) {
      // ── No prefetch ready — fetch now ───────────────────────────────────
      setPhase("loading");
      setStatusLabel("Alex is thinking...");
      const difficulty = nextNum <= 3 ? "medium core" : "hard advanced";
      try {
        const res = await fetch("/api/ai", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "next_question",
            role, company, type, resumeText,
            history: historyRef.current,
            difficulty,
          }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        if (!data.question) throw new Error("No question");
        questionText = data.question;
        // Show text immediately while TTS loads
        setQuestion(questionText);
        questionRef.current = questionText;
        setStatusLabel("Alex is preparing...");
        audioUrl = await fetchAudio(questionText);
      } catch (err) {
        console.error("Question error:", err);
        setStatusLabel("⚠️ Error — check console");
        return;
      }

    } else {
      // ── Prefetch ready ───────────────────────────────────────────────────
      setQuestion(questionText);
      questionRef.current = questionText;
      if (!audioUrl && audioInFlight) {
        // Text ready but TTS still loading — wait only for remaining TTS time
        setStatusLabel("Alex is preparing...");
        audioUrl = await audioInFlight;
      }
    }

    if (isEndingRef.current) return;
    setPhase("ai-speaking");
    setStatusLabel("Alex is speaking...");
    // Start prefetching next question DURING audio playback — maximizes overlap time
    prefetchNextRef.current(historyRef.current);
    await playAudio(audioUrl);
    if (!isEndingRef.current) {
      startListening();
    }
  }, [role, company, type, resumeText, getOpener, fetchAudio, playAudio, startListening]);

  // ── Submit answer → skip analysis, go straight to next question ────────────
  const submitAnswer = useCallback(async () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    const answer = transcriptRef.current.trim();
    const q      = questionRef.current;

    // Save answer — analysis happens in batch at end
    const entry: QAEntry = { question: q, answer };
    const newHistory = [...historyRef.current, entry];
    historyRef.current = newHistory;
    setHistory(newHistory);

    // Prefetch was already started when listening began — just get next question
    await getNextQuestion();
  }, [getNextQuestion]);

  // ── End interview → save immediately, navigate, results page fetches report ──
  const endInterview = useCallback(() => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
    if (currentAudioRef.current) { currentAudioRef.current.pause(); }
    clearInterval(timerRef.current!);
    setPhase("ending");
    setEndConfirm(false);

    // If user ended while mid-answer (listening phase), capture that answer too
    let finalHistory = historyRef.current;
    const inProgressAnswer  = transcriptRef.current.trim();
    const inProgressQuestion = questionRef.current;
    const alreadySaved = finalHistory.some(h => h.question === inProgressQuestion);
    if (inProgressQuestion && !alreadySaved) {
      // Save even if answer is empty — we'll still show a model answer in the report
      finalHistory = [...finalHistory, { question: inProgressQuestion, answer: inProgressAnswer }];
    }

    const sessionId = Date.now().toString();
    const session = {
      id: sessionId,
      role, company, type,
      date: Date.now(),
      history: finalHistory,
      pauseData: { longPauses: pauseCountRef.current },
      finalReport: null,
    };
    const existing = JSON.parse(localStorage.getItem("intervai_sessions") || "[]");
    existing.unshift(session);
    localStorage.setItem("intervai_sessions", JSON.stringify(existing.slice(0, 20)));
    router.push(`/results?id=${sessionId}`);
  }, [role, company, type, router]);

  // Keep prefetchNextRef current
  useEffect(() => { prefetchNextRef.current = prefetchNext; }, [prefetchNext]);

  // Start once on mount
  const getNextQuestionRef = useRef(getNextQuestion);
  useEffect(() => { getNextQuestionRef.current = getNextQuestion; }, [getNextQuestion]);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    getNextQuestionRef.current();
  }, []);

  const speaking  = phase === "ai-speaking";
  const thinking  = phase === "loading" || phase === "ending";
  const listening = phase === "listening";

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #dbeafe 0%, #eff6ff 40%, #e0f2fe 100%)",
      display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "#0f172a",
    }}>
      {/* Decorative blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -80, left: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(14,165,233,0.1) 0%, transparent 70%)" }} />
      </div>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px",
        borderBottom: "1px solid rgba(148,163,184,0.2)",
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
            Interv<span style={{ color: "#1d4ed8" }}>AI</span>
          </span>
          <DifficultyBadge qNum={questionNum} />
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{role} · {company}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
            Q{questionNum} · {pauseCount > 0 ? `${pauseCount} pause${pauseCount > 1 ? "s" : ""}` : "flowing well"}
          </div>
        </div>

        <div style={{
          fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums",
          color: urgent ? "#ef4444" : "#1e40af",
          background: urgent ? "#fff5f5" : "rgba(219,234,254,0.6)",
          padding: "4px 14px", borderRadius: 10,
          transition: "all 0.5s",
        }}>
          {fmt(elapsed)}
        </div>
      </div>

      {/* Main */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "32px 24px", gap: 28, position: "relative", zIndex: 1,
      }}>
        <AIAvatar speaking={speaking} thinking={thinking} />

        {/* Status pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 18px", borderRadius: 99,
          background: speaking ? "rgba(29,78,216,0.1)" : listening ? "rgba(16,185,129,0.1)" : "rgba(148,163,184,0.1)",
          border: `1px solid ${speaking ? "rgba(29,78,216,0.2)" : listening ? "rgba(16,185,129,0.2)" : "rgba(148,163,184,0.2)"}`,
          transition: "all 0.3s",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", display: "inline-block",
            background: speaking ? "#1d4ed8" : listening ? "#10b981" : "#94a3b8",
            animationName: (speaking || listening) ? "blink" : "none",
            animationDuration: "1.4s", animationIterationCount: "infinite",
            boxShadow: speaking ? "0 0 8px rgba(29,78,216,0.6)" : listening ? "0 0 8px rgba(16,185,129,0.6)" : "none",
          }} />
          <p style={{
            fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
            color: speaking ? "#1d4ed8" : listening ? "#10b981" : "#64748b",
            margin: 0, textTransform: "uppercase",
          }}>
            {statusLabel}
          </p>
        </div>

        {/* Question card */}
        <div style={{
          maxWidth: 640, width: "100%",
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          borderRadius: 22,
          border: `1.5px solid ${speaking ? "rgba(59,130,246,0.35)" : "rgba(226,232,240,0.8)"}`,
          padding: "26px 30px",
          boxShadow: speaking
            ? "0 8px 40px rgba(29,78,216,0.12), 0 2px 8px rgba(15,23,42,0.06)"
            : "0 4px 24px rgba(15,23,42,0.06)",
          transition: "all 0.3s",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, color: "#fff", fontWeight: 800,
            }}>
              {questionNum || "—"}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Question {questionNum}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.7, color: "#0f172a", fontWeight: 600 }}>
            {question}
          </p>
        </div>

        {/* Answer area */}
        {(listening || phase === "ending") && (
          <div style={{
            maxWidth: 640, width: "100%",
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(12px)",
            borderRadius: 22,
            border: `1.5px solid ${listening ? "rgba(59,130,246,0.4)" : "rgba(226,232,240,0.8)"}`,
            padding: "20px 26px",
            boxShadow: "0 4px 24px rgba(59,130,246,0.08)",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "#1d4ed8",
              textTransform: "uppercase", letterSpacing: "0.08em",
              marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: listening ? "#10b981" : "#cbd5e1",
                display: "inline-block",
                boxShadow: listening ? "0 0 8px rgba(16,185,129,0.6)" : "none",
                animationName: listening ? "blink" : "none",
                animationDuration: "1s",
                animationIterationCount: "infinite",
              }} />
              Your Answer
            </div>
            <Waveform active={listening} />
            <p style={{
              margin: "12px 0 0", fontSize: 15, lineHeight: 1.75,
              color: transcript ? "#0f172a" : "#94a3b8", minHeight: 24,
              fontStyle: transcript ? "normal" : "italic",
            }}>
              {transcript || "Listening — speak your answer now..."}
            </p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        padding: "16px 28px",
        borderTop: "1px solid rgba(148,163,184,0.2)",
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        position: "relative", zIndex: 1,
      }}>
        {!endConfirm ? (
          <button onClick={() => setEndConfirm(true)} style={{
            padding: "9px 18px", borderRadius: 10,
            border: "1px solid rgba(252,165,165,0.6)", background: "rgba(255,245,245,0.8)",
            color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>End Interview</button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={endInterview} style={{
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: "#ef4444", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 2px 12px rgba(239,68,68,0.3)",
            }}>Yes, End</button>
            <button onClick={() => setEndConfirm(false)} style={{
              padding: "9px 18px", borderRadius: 10,
              border: "1px solid #e2e8f0", background: "rgba(255,255,255,0.8)",
              color: "#64748b", fontSize: 13, cursor: "pointer",
            }}>Cancel</button>
          </div>
        )}

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {history.length > 0 ? history.map((_, i) => (
            <div key={i} style={{
              width: 9, height: 9, borderRadius: "50%",
              background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
              opacity: 0.3 + (i / Math.max(history.length - 1, 1)) * 0.7,
              boxShadow: i === history.length - 1 ? "0 0 6px rgba(59,130,246,0.5)" : "none",
            }} />
          )) : (
            <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Interview in progress</span>
          )}
        </div>

        <button
          onClick={submitAnswer}
          disabled={!listening || !transcript.trim()}
          style={{
            padding: "12px 28px", borderRadius: 13, border: "none",
            background: listening && transcript.trim()
              ? "linear-gradient(135deg, #1e3a8a, #1d4ed8)"
              : "rgba(241,245,249,0.8)",
            color: listening && transcript.trim() ? "#fff" : "#94a3b8",
            fontSize: 15, fontWeight: 700,
            cursor: listening && transcript.trim() ? "pointer" : "not-allowed",
            boxShadow: listening && transcript.trim() ? "0 4px 20px rgba(29,78,216,0.35)" : "none",
            transition: "all 0.2s",
          }}
        >
          Done Answering →
        </button>
      </div>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </main>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontFamily: "system-ui" }}>
        Loading...
      </div>
    }>
      <InterviewRoom />
    </Suspense>
  );
}
