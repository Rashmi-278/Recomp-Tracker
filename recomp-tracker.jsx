import { useState, useEffect, useCallback, useRef } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Protocol starts Wed Mar 11, but Week 1 grid starts Mon Mar 9
const PROTOCOL_START = new Date("2026-03-11"); // Wednesday
const GRID_START = new Date("2026-03-09"); // Monday of that week
const END_DATE = new Date("2026-06-14"); // Sun of Week 14 (covers 12 full weeks from Wed)
const TOTAL_DAYS = 91; // 13 weeks × 7 days, but protocol is ~91 days (Mar 11 – Jun 10)

// Mon/Tue of Week 1 (day index 0,1) are before protocol start → disabled
const isDayDisabled = (weekIndex, dayIndex) => {
  if (weekIndex === 0 && dayIndex < 2) return true; // Mon, Tue of week 1
  return false;
};

const getWeekDates = (weekIndex) => {
  const start = new Date(GRID_START);
  start.setDate(start.getDate() + weekIndex * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
};

const getDaysElapsed = () => {
  const now = new Date();
  if (now < PROTOCOL_START) return 0;
  const protocolEnd = new Date("2026-06-10");
  if (now > protocolEnd) return TOTAL_DAYS;
  return Math.ceil((now - PROTOCOL_START) / (1000 * 60 * 60 * 24));
};

const getCurrentWeek = () => {
  const now = new Date();
  if (now < GRID_START) return 0;
  return Math.min(13, Math.floor((now - GRID_START) / (1000 * 60 * 60 * 24 * 7)));
};

const WEEK_LABELS = Array.from({ length: 14 }, (_, i) => `Week ${i + 1}`);

const PARAMS = [
  { id: "fasting", label: "16:8 Fast", icon: "⏱️", subtext: "Zero app", weeklyTarget: 7 },
  { id: "calories", label: "500 cal Deficit", icon: "🔥", subtext: "MyFitnessPal", weeklyTarget: 7 },
  { id: "protein", label: "120g Protein", icon: "🍗", subtext: "MyFitnessPal", weeklyTarget: 7 },
  { id: "water", label: "Water 3L+", icon: "💧", subtext: "8-10 glasses", weeklyTarget: 7 },
  { id: "sleep", label: "7-8h Sleep", icon: "🌙", subtext: "Recovery + hormones", weeklyTarget: 7 },
  { id: "strength", label: "Strength", icon: "🏋️‍♀️", subtext: "4x / week", weeklyTarget: 4 },
  { id: "walk", label: "10K Walk", icon: "🚶‍♀️", subtext: "3x / week", weeklyTarget: 3 },
  { id: "steps", label: "8K+ Steps", icon: "👟", subtext: "Daily NEAT", weeklyTarget: 7 },
];

const WEEKLY_CHECKINS = [
  { id: "weight", label: "Weight (kg)", icon: "⚖️", type: "number" },
  { id: "waist", label: "Waist (cm)", icon: "📏", type: "number" },
  { id: "bodyfat", label: "Body Fat %", icon: "📊", type: "number" },
  { id: "energy", label: "Energy", icon: "⚡", type: "rating" },
  { id: "mood", label: "Mood", icon: "🧠", type: "rating" },
  { id: "soreness", label: "Soreness", icon: "💪", type: "rating" },
];

const HYPE_MESSAGES = [
  "SHE'S ON FIRE TODAY 🔥",
  "MAIN CHARACTER ENERGY ✨",
  "HOTTEST VERSION LOADING... 💅",
  "QUEEN THINGS ONLY 👑",
  "BODY IS BODYING 🪞",
  "GLOW UP IN PROGRESS 🌸",
  "THAT GIRL ERA ACTIVATED 💖",
  "MIRROR'S NOT READY 🔥",
  "UNSTOPPABLE TODAY 💎",
  "SHE REALLY DID THAT 🦋",
];

const initWeekData = () => {
  const checks = {};
  PARAMS.forEach((p) => { checks[p.id] = Array(7).fill(false); });
  const weekly = {};
  WEEKLY_CHECKINS.forEach((w) => { weekly[w.id] = w.type === "rating" ? 3 : ""; });
  return { checks, weekly, notes: "" };
};

const Storage = {
  async load(weekIndex) {
    try {
      const r = await window.storage.get(`recomp-week-${weekIndex}`);
      return r ? JSON.parse(r.value) : null;
    } catch { return null; }
  },
  async save(weekIndex, data) {
    try { await window.storage.set(`recomp-week-${weekIndex}`, JSON.stringify(data)); }
    catch (e) { console.error("Save failed:", e); }
  },
};

// ─── Celebration overlay ───
function CelebrationOverlay({ message, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const particles = [];
    const emojis = ["✨", "💖", "🔥", "👑", "💅", "🦋", "🌸", "💎", "⭐", "🪞"];
    const colors = ["#ff6b9d", "#ff85b3", "#ffa3c4", "#ffb6d3", "#ffd1e3", "#fff", "#ffc2e2", "#e84393", "#fd79a8"];

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: -(Math.random() * 8 + 4),
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        emoji: Math.random() > 0.6 ? emojis[Math.floor(Math.random() * emojis.length)] : null,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8,
        gravity: 0.06 + Math.random() * 0.04,
        opacity: 1,
        delay: Math.random() * 30,
        life: 0,
      });
    }

    let frame = 0;
    let animId;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;
      particles.forEach((p) => {
        if (frame < p.delay) return;
        p.life++;
        p.x += p.vx;
        p.vy += p.gravity;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        p.opacity = Math.max(0, 1 - p.life / 120);

        if (p.opacity <= 0) return;
        alive++;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);

        if (p.emoji) {
          ctx.font = `${p.size * 2.5}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.emoji, 0, 0);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          // heart shape
          const s = p.size;
          ctx.moveTo(0, s * 0.3);
          ctx.bezierCurveTo(-s, -s * 0.5, -s * 0.5, -s * 1.2, 0, -s * 0.5);
          ctx.bezierCurveTo(s * 0.5, -s * 1.2, s, -s * 0.5, 0, s * 0.3);
          ctx.fill();
        }
        ctx.restore();
      });
      frame++;
      if (alive > 0 && frame < 200) animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div style={celebStyles.overlay} onClick={onClose}>
      <canvas ref={canvasRef} style={celebStyles.canvas} />
      <div style={celebStyles.messageWrap}>
        <div style={celebStyles.flame}>🔥</div>
        <div style={celebStyles.messageText}>{message}</div>
        <div style={celebStyles.subText}>All 8 checks hit — you're literally getting hotter</div>
        <button style={celebStyles.dismissBtn} onClick={onClose}>I know 💅</button>
      </div>
    </div>
  );
}

const celebStyles = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "radial-gradient(ellipse at center, rgba(255,107,157,0.15) 0%, rgba(20,5,10,0.92) 70%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(4px)",
  },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },
  messageWrap: {
    position: "relative", zIndex: 2, textAlign: "center",
    padding: "40px 48px", borderRadius: "24px",
    background: "linear-gradient(135deg, rgba(255,107,157,0.12), rgba(255,182,211,0.08))",
    border: "1px solid rgba(255,107,157,0.3)",
    boxShadow: "0 0 60px rgba(255,107,157,0.2), 0 0 120px rgba(255,107,157,0.1)",
    animation: "celebPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
  },
  flame: { fontSize: "56px", marginBottom: "12px", animation: "celebPulse 0.8s ease-in-out infinite alternate" },
  messageText: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: "28px", fontWeight: 700, color: "#ff85b3",
    letterSpacing: "2px", marginBottom: "8px",
    textShadow: "0 0 20px rgba(255,107,157,0.4)",
  },
  subText: { fontSize: "14px", color: "#c9809e", letterSpacing: "1px", marginBottom: "24px" },
  dismissBtn: {
    background: "linear-gradient(135deg, #ff6b9d, #e84393)",
    border: "none", color: "#fff", padding: "12px 32px", borderRadius: "50px",
    fontSize: "15px", fontWeight: 700, cursor: "pointer", letterSpacing: "1px",
    boxShadow: "0 4px 20px rgba(255,107,157,0.4)",
    fontFamily: "inherit",
  },
};

// ─── Progress Bar ───
function ProgressBar() {
  const elapsed = getDaysElapsed();
  const pct = Math.min(100, Math.round((elapsed / TOTAL_DAYS) * 100));
  const weeksLeft = Math.max(0, Math.ceil((TOTAL_DAYS - elapsed) / 7));

  const milestones = [
    { label: "START", pct: 0 },
    { label: "Month 1", pct: Math.round((28 / TOTAL_DAYS) * 100) },
    { label: "Month 2", pct: Math.round((56 / TOTAL_DAYS) * 100) },
    { label: "GOAL 💖", pct: 100 },
  ];

  return (
    <div style={s.progressWrap}>
      <div style={s.progressHeader}>
        <span style={s.progressLabel}>DAY {elapsed} / {TOTAL_DAYS}</span>
        <span style={s.progressMeta}>{weeksLeft}w left · {pct}%</span>
      </div>
      <div style={s.progressTrack}>
        <div style={{
          ...s.progressFill,
          width: `${pct}%`,
          background: pct >= 75
            ? "linear-gradient(90deg, #ff6b9d, #e84393, #a855f7)"
            : pct >= 40
            ? "linear-gradient(90deg, #ff6b9d, #ffb6d3)"
            : "linear-gradient(90deg, #ffb6d3, #ffd1e3)",
        }} />
        {milestones.map((m, i) => (
          <div key={i} style={{ ...s.milestone, left: `${m.pct}%` }}>
            <div style={{
              ...s.milestoneDot,
              background: pct >= m.pct ? "#ff6b9d" : "rgba(255,107,157,0.2)",
              boxShadow: pct >= m.pct ? "0 0 8px rgba(255,107,157,0.5)" : "none",
              border: pct >= m.pct ? "2px solid #ff85b3" : "2px solid rgba(255,107,157,0.3)",
            }} />
            <span style={{ ...s.milestoneLabel, color: pct >= m.pct ? "#ff85b3" : "#664455" }}>{m.label}</span>
          </div>
        ))}
      </div>
      <div style={s.progressDates}>
        <span>Mar 11</span>
        <span style={{ color: "#ff6b9d", fontWeight: 700, fontSize: "12px" }}>36% → 26% ✨</span>
        <span>Jun 10</span>
      </div>
    </div>
  );
}

// ─── Main App ───
export default function RecompTracker() {
  const [week, setWeek] = useState(getCurrentWeek);
  const [data, setData] = useState(initWeekData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("daily");
  const [celebration, setCelebration] = useState(null);
  const prevScoresRef = useRef({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Storage.load(week).then((saved) => {
      if (cancelled) return;
      const d = saved || initWeekData();
      setData(d);
      // rebuild prev scores so we don't celebrate on load
      const scores = {};
      for (let i = 0; i < 7; i++) {
        scores[i] = PARAMS.reduce((sum, p) => sum + (d.checks[p.id]?.[i] ? 1 : 0), 0);
      }
      prevScoresRef.current = scores;
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [week]);

  const persist = useCallback((newData) => {
    setData(newData);
    setSaving(true);
    Storage.save(week, newData).then(() => setSaving(false));
  }, [week]);

  const toggleCheck = (paramId, dayIdx) => {
    if (isDayDisabled(week, dayIdx)) return;
    const next = { ...data, checks: { ...data.checks } };
    next.checks[paramId] = [...next.checks[paramId]];
    next.checks[paramId][dayIdx] = !next.checks[paramId][dayIdx];

    // check if this toggle completes the day
    const newScore = PARAMS.reduce((sum, p) => sum + (next.checks[p.id]?.[dayIdx] ? 1 : 0), 0);
    const oldScore = prevScoresRef.current[dayIdx] || 0;

    if (newScore === PARAMS.length && oldScore < PARAMS.length) {
      const msg = HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)];
      setCelebration(msg);
    }
    prevScoresRef.current[dayIdx] = newScore;
    persist(next);
  };

  const updateWeekly = (id, value) => persist({ ...data, weekly: { ...data.weekly, [id]: value } });
  const updateNotes = (value) => persist({ ...data, notes: value });

  const weeklyHits = (pid) => data.checks[pid]?.filter(Boolean).length || 0;
  const activeDays = DAYS.reduce((sum, _, i) => sum + (isDayDisabled(week, i) ? 0 : 1), 0);
  const totalHits = PARAMS.reduce((sum, p) => sum + weeklyHits(p.id), 0);
  const adherence = activeDays > 0 ? Math.round((totalHits / (PARAMS.length * activeDays)) * 100) : 0;
  const dayScore = (i) => isDayDisabled(week, i) ? -1 : PARAMS.reduce((sum, p) => sum + (data.checks[p.id]?.[i] ? 1 : 0), 0);

  return (
    <div style={s.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes celebPop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes celebPulse { from { transform: scale(1); } to { transform: scale(1.15); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes perfectDay { 0% { box-shadow: 0 0 0 0 rgba(255,107,157,0.4); } 70% { box-shadow: 0 0 0 8px rgba(255,107,157,0); } 100% { box-shadow: 0 0 0 0 rgba(255,107,157,0); } }
        @keyframes gentleFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>

      {celebration && <CelebrationOverlay message={celebration} onClose={() => setCelebration(null)} />}

      <ProgressBar />

      <div style={s.header}>
        <div style={s.headerTop}>
          <div>
            <h1 style={s.title}>RECOMP</h1>
            <p style={s.subtitle}>36% → 26% · 12 weeks · that girl era</p>
          </div>
          <div style={s.adherenceRing}>
            <svg width="70" height="70" viewBox="0 0 70 70">
              <defs>
                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff6b9d" />
                  <stop offset="100%" stopColor="#e84393" />
                </linearGradient>
              </defs>
              <circle cx="35" cy="35" r="28" fill="none" stroke="rgba(255,107,157,0.1)" strokeWidth="5" />
              <circle cx="35" cy="35" r="28" fill="none" stroke="url(#ringGrad)" strokeWidth="5"
                strokeDasharray={`${(adherence / 100) * 175.9} 175.9`}
                strokeLinecap="round" transform="rotate(-90 35 35)"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            </svg>
            <span style={s.adherenceText}>{adherence}%</span>
          </div>
        </div>

        <div style={s.weekRow}>
          <button style={s.weekBtn} onClick={() => setWeek(Math.max(0, week - 1))}>‹</button>
          <div style={{ textAlign: "center" }}>
            <span style={s.weekLabel}>{WEEK_LABELS[week]}</span>
            <div style={s.weekDates}>{getWeekDates(week)}</div>
          </div>
          <button style={s.weekBtn} onClick={() => setWeek(Math.min(13, week + 1))}>›</button>
          {saving && <span style={s.saveIndicator}>saving…</span>}
        </div>

        <div style={s.tabs}>
          {["daily", "weekly", "notes"].map((t) => (
            <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
              {t === "daily" ? "✦ Daily" : t === "weekly" ? "✦ Weekly" : "✦ Notes"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={s.loading}>Loading…</div>
      ) : tab === "daily" ? (
        <div style={s.content}>
          <div style={s.gridHeader}>
            <div style={s.paramLabelSpace} />
            {DAYS.map((d, i) => {
              const disabled = isDayDisabled(week, i);
              const score = dayScore(i);
              const perfect = !disabled && score === PARAMS.length;
              return (
                <div key={d} style={{ ...s.dayHeader, opacity: disabled ? 0.25 : 1 }}>
                  <span style={{ ...s.dayName, color: perfect ? "#ff6b9d" : "#886677" }}>{d}</span>
                  <span style={{
                    ...s.dayScore,
                    color: disabled ? "#332228" : perfect ? "#ff6b9d" : score >= PARAMS.length - 2 ? "#ffb6d3" : "#553344",
                    animation: perfect ? "gentleFloat 2s ease-in-out infinite" : "none",
                  }}>
                    {disabled ? "—" : perfect ? "💖" : `${score}/${PARAMS.length}`}
                  </span>
                </div>
              );
            })}
            <div style={s.weeklyColHeader}>Wk</div>
          </div>

          {PARAMS.map((param) => {
            const hits = weeklyHits(param.id);
            const met = hits >= param.weeklyTarget;
            return (
              <div key={param.id} style={s.row}>
                <div style={s.paramLabel}>
                  <span style={s.paramIcon}>{param.icon}</span>
                  <div>
                    <div style={s.paramName}>{param.label}</div>
                    <div style={s.paramSub}>{param.subtext}</div>
                  </div>
                </div>
                {DAYS.map((_, i) => {
                  const disabled = isDayDisabled(week, i);
                  const checked = !disabled && data.checks[param.id]?.[i];
                  return (
                    <button key={i}
                      disabled={disabled}
                      style={{
                        ...s.cell,
                        ...(disabled ? s.cellDisabled : {}),
                        ...(checked ? s.cellActive : {}),
                        ...(dayScore(i) === PARAMS.length && checked ? { animation: "perfectDay 2s infinite" } : {}),
                      }}
                      onClick={() => toggleCheck(param.id, i)}
                    >
                      {disabled ? "" : checked ? "♥" : ""}
                    </button>
                  );
                })}
                <div style={{ ...s.weeklyCount, color: met ? "#ff6b9d" : "#664455" }}>
                  {hits}/{param.weeklyTarget}
                </div>
              </div>
            );
          })}

          <div style={s.legend}>
            <span style={s.legendItem}><span style={{ ...s.dot, background: "#ff6b9d" }} /> On target</span>
            <span style={s.legendItem}><span style={{ ...s.dot, background: "#ffb6d3" }} /> Close</span>
            <span style={s.legendItem}><span style={{ ...s.dot, background: "#553344" }} /> Needs love</span>
          </div>
        </div>
      ) : tab === "weekly" ? (
        <div style={s.content}>
          <div style={s.weeklyGrid}>
            {WEEKLY_CHECKINS.map((item) => (
              <div key={item.id} style={s.weeklyCard}>
                <div style={s.weeklyCardHeader}>
                  <span>{item.icon}</span>
                  <span style={s.weeklyCardLabel}>{item.label}</span>
                </div>
                {item.type === "number" ? (
                  <input type="number" step="0.1" style={s.numInput}
                    value={data.weekly[item.id]}
                    onChange={(e) => updateWeekly(item.id, e.target.value)}
                    placeholder="—"
                  />
                ) : (
                  <div style={s.ratingRow}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button key={v}
                        style={{ ...s.ratingBtn, ...(data.weekly[item.id] === v ? s.ratingBtnActive : {}) }}
                        onClick={() => updateWeekly(item.id, v)}
                      >{v}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={s.content}>
          <textarea style={s.notesArea} value={data.notes}
            onChange={(e) => updateNotes(e.target.value)}
            placeholder="How did this week go? Energy, hunger, training feels, PCOS symptoms, wins, vibes..."
          />
        </div>
      )}

      <div style={s.protocol}>
        <div style={s.protocolTitle}>THE PROTOCOL ✨</div>
        <div style={s.protocolGrid}>
          {[
            ["⏱️", "16:8 IF daily"], ["🔥", "500 cal deficit"], ["🍗", "120g protein"],
            ["🏋️‍♀️", "Strength 4x/wk"], ["🚶‍♀️", "10K walk 3x/wk"], ["💧", "3L+ water"],
          ].map(([icon, text], i) => (
            <div key={i} style={s.protocolItem}><span>{icon}</span><span>{text}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───
const s = {
  container: {
    fontFamily: "'DM Sans', -apple-system, sans-serif",
    background: "linear-gradient(170deg, #1a0a10 0%, #120810 40%, #0d0609 100%)",
    color: "#e8c8d8",
    minHeight: "100vh",
  },
  // Progress
  progressWrap: {
    background: "rgba(26,10,16,0.95)",
    padding: "16px 20px 12px",
    borderBottom: "1px solid rgba(255,107,157,0.12)",
    position: "sticky", top: 0, zIndex: 20,
    backdropFilter: "blur(12px)",
  },
  progressHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px",
  },
  progressLabel: { fontSize: "13px", fontWeight: 700, color: "#ff85b3", letterSpacing: "2px" },
  progressMeta: { fontSize: "12px", color: "#886677" },
  progressTrack: {
    position: "relative", height: "8px",
    background: "rgba(255,107,157,0.08)", borderRadius: "4px",
    overflow: "visible", marginBottom: "24px",
  },
  progressFill: {
    height: "100%", borderRadius: "4px", transition: "width 0.6s ease",
    boxShadow: "0 0 16px rgba(255,107,157,0.3)",
  },
  milestone: {
    position: "absolute", top: "-4px", transform: "translateX(-50%)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
  },
  milestoneDot: { width: "16px", height: "16px", borderRadius: "50%", transition: "all 0.3s" },
  milestoneLabel: { fontSize: "10px", fontWeight: 600, letterSpacing: "1px", whiteSpace: "nowrap" },
  progressDates: {
    display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#553344",
  },
  // Header
  header: {
    background: "linear-gradient(135deg, rgba(255,107,157,0.04) 0%, rgba(20,8,12,0.9) 100%)",
    padding: "20px 20px 0",
    borderBottom: "1px solid rgba(255,107,157,0.1)",
  },
  headerTop: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px",
  },
  title: {
    margin: 0, fontSize: "32px", fontWeight: 800, letterSpacing: "6px", lineHeight: 1,
    fontFamily: "'Playfair Display', Georgia, serif",
    background: "linear-gradient(135deg, #ff6b9d, #e84393, #ff85b3)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  },
  subtitle: { margin: "6px 0 0", fontSize: "13px", color: "#886677", letterSpacing: "1px" },
  adherenceRing: {
    position: "relative", width: "70px", height: "70px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  adherenceText: { position: "absolute", fontSize: "16px", fontWeight: 700, color: "#ff85b3" },
  weekRow: { display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" },
  weekBtn: {
    background: "rgba(255,107,157,0.08)", border: "1px solid rgba(255,107,157,0.15)",
    color: "#ff85b3", padding: "8px 16px", borderRadius: "8px",
    cursor: "pointer", fontSize: "18px", fontFamily: "inherit",
    transition: "all 0.2s",
  },
  weekLabel: { fontSize: "16px", fontWeight: 700, color: "#ffb6d3", letterSpacing: "1px" },
  weekDates: { fontSize: "12px", color: "#664455", marginTop: "2px" },
  saveIndicator: { fontSize: "12px", color: "#ff6b9d", marginLeft: "auto", opacity: 0.7 },
  tabs: { display: "flex", gap: 0 },
  tab: {
    flex: 1, background: "none", border: "none",
    borderBottom: "2px solid transparent", color: "#664455",
    padding: "12px 0", fontSize: "13px", fontFamily: "inherit",
    letterSpacing: "1px", cursor: "pointer", transition: "all 0.2s",
  },
  tabActive: { color: "#ff85b3", borderBottomColor: "#ff6b9d" },
  content: { padding: "16px 12px", overflowX: "auto" },
  loading: { padding: "40px", textAlign: "center", color: "#664455", fontSize: "15px" },
  // Grid
  gridHeader: {
    display: "grid", gridTemplateColumns: "minmax(150px, 1fr) repeat(7, 44px) 48px",
    gap: "4px", marginBottom: "8px", alignItems: "end", minWidth: "fit-content",
  },
  paramLabelSpace: {},
  dayHeader: {
    textAlign: "center", display: "flex", flexDirection: "column",
    alignItems: "center", gap: "2px",
  },
  dayName: { fontSize: "13px", fontWeight: 700, letterSpacing: "1px" },
  dayScore: { fontSize: "11px", fontWeight: 600 },
  weeklyColHeader: { fontSize: "13px", fontWeight: 700, color: "#886677", textAlign: "center" },
  row: {
    display: "grid", gridTemplateColumns: "minmax(150px, 1fr) repeat(7, 44px) 48px",
    gap: "4px", marginBottom: "6px", alignItems: "center", minWidth: "fit-content",
  },
  paramLabel: { display: "flex", alignItems: "center", gap: "8px", paddingRight: "8px" },
  paramIcon: { fontSize: "18px", flexShrink: 0 },
  paramName: { fontSize: "13px", fontWeight: 600, color: "#e8c8d8", whiteSpace: "nowrap" },
  paramSub: { fontSize: "11px", color: "#664455", whiteSpace: "nowrap" },
  cell: {
    width: "44px", height: "44px",
    border: "1px solid rgba(255,107,157,0.12)", borderRadius: "10px",
    background: "rgba(255,107,157,0.03)", color: "#ff6b9d",
    fontSize: "16px", fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s ease", fontFamily: "inherit", padding: 0,
  },
  cellActive: {
    background: "rgba(255,107,157,0.12)", borderColor: "rgba(255,107,157,0.4)",
    boxShadow: "0 0 12px rgba(255,107,157,0.15)",
    color: "#ff6b9d",
  },
  cellDisabled: {
    background: "rgba(255,107,157,0.01)", borderColor: "rgba(255,107,157,0.04)",
    cursor: "not-allowed", opacity: 0.2,
  },
  weeklyCount: { fontSize: "13px", fontWeight: 700, textAlign: "center" },
  legend: { display: "flex", gap: "16px", marginTop: "18px", justifyContent: "center" },
  legendItem: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#886677" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
  // Weekly
  weeklyGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  weeklyCard: {
    background: "rgba(255,107,157,0.04)", border: "1px solid rgba(255,107,157,0.1)",
    borderRadius: "14px", padding: "16px",
  },
  weeklyCardHeader: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", fontSize: "15px" },
  weeklyCardLabel: { fontWeight: 600, color: "#e8c8d8" },
  numInput: {
    width: "100%", background: "rgba(255,107,157,0.04)", border: "1px solid rgba(255,107,157,0.15)",
    borderRadius: "10px", padding: "10px", color: "#ffb6d3",
    fontSize: "20px", fontWeight: 700, fontFamily: "inherit",
    textAlign: "center", outline: "none", boxSizing: "border-box",
  },
  ratingRow: { display: "flex", gap: "6px" },
  ratingBtn: {
    flex: 1, padding: "10px 0", background: "rgba(255,107,157,0.04)",
    border: "1px solid rgba(255,107,157,0.12)", borderRadius: "10px",
    color: "#664455", fontSize: "16px", fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
  },
  ratingBtnActive: {
    background: "rgba(255,107,157,0.15)", borderColor: "rgba(255,107,157,0.4)", color: "#ff6b9d",
  },
  notesArea: {
    width: "100%", minHeight: "300px",
    background: "rgba(255,107,157,0.03)", border: "1px solid rgba(255,107,157,0.1)",
    borderRadius: "14px", padding: "16px", color: "#e8c8d8",
    fontSize: "15px", fontFamily: "inherit", lineHeight: 1.6,
    resize: "vertical", outline: "none", boxSizing: "border-box",
  },
  protocol: {
    margin: "16px 12px", padding: "16px",
    background: "rgba(255,107,157,0.03)", border: "1px solid rgba(255,107,157,0.08)",
    borderRadius: "14px",
  },
  protocolTitle: {
    fontSize: "12px", fontWeight: 700, letterSpacing: "3px", color: "#886677", marginBottom: "12px",
  },
  protocolGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" },
  protocolItem: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#aa7799" },
};
