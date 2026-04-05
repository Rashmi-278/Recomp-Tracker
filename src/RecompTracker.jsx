import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Dynamic date calculations from user's chosen start date ───
function computeDates(startDateStr) {
  const protocolStart = new Date(startDateStr + "T00:00:00");
  if (isNaN(protocolStart.getTime())) return null;
  const dayOfWeek = protocolStart.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const gridStart = new Date(protocolStart);
  gridStart.setDate(gridStart.getDate() + mondayOffset);

  const endDate = new Date(protocolStart);
  endDate.setMonth(endDate.getMonth() + 3);

  const totalDays = Math.ceil((endDate - protocolStart) / (1000 * 60 * 60 * 24));
  const disabledDaysInWeek0 = dayOfWeek === 1 ? 0 : dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const totalGridDays = Math.ceil((endDate - gridStart) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.ceil(totalGridDays / 7);

  const fmt = (d) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });

  return {
    protocolStart, gridStart, endDate, totalDays, totalWeeks, disabledDaysInWeek0,
    startLabel: fmt(protocolStart), endLabel: fmt(endDate),
  };
}

const isDayDisabled = (weekIndex, dayIndex, disabledDaysInWeek0) => {
  return weekIndex === 0 && dayIndex < disabledDaysInWeek0;
};

const getWeekDates = (weekIndex, gridStart) => {
  const start = new Date(gridStart);
  start.setDate(start.getDate() + weekIndex * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
};

const getDaysElapsed = (protocolStart, endDate, totalDays) => {
  const now = new Date();
  if (now < protocolStart) return 0;
  if (now > endDate) return totalDays;
  return Math.ceil((now - protocolStart) / (1000 * 60 * 60 * 24));
};

const getCurrentWeek = (gridStart, totalWeeks) => {
  const now = new Date();
  if (now < gridStart) return 0;
  return Math.min(totalWeeks - 1, Math.floor((now - gridStart) / (1000 * 60 * 60 * 24 * 7)));
};

// ─── Dynamic PARAMS based on user profile goals ───
function getParams(profile) {
  const cal = profile?.calorieDeficit || 500;
  const pro = profile?.proteinGoal || 120;
  const bonusLabel = profile?.bonusGoal || "5 min Dance";
  const bonusIcon = profile?.bonusIcon || "\u{1F483}";
  return [
    { id: "fasting", label: "16:8 Fast", icon: "\u23F1\uFE0F", subtext: "Zero app", weeklyTarget: 7 },
    { id: "calories", label: `${cal} cal Deficit`, icon: "\u{1F525}", subtext: "MyFitnessPal", weeklyTarget: 7 },
    { id: "protein", label: `${pro}g Protein`, icon: "\u{1F357}", subtext: "MyFitnessPal", weeklyTarget: 7 },
    { id: "water", label: "Water 3L+", icon: "\u{1F4A7}", subtext: "8-10 glasses", weeklyTarget: 7 },
    { id: "sleep", label: "7-8h Sleep", icon: "\u{1F319}", subtext: "Recovery + hormones", weeklyTarget: 7 },
    { id: "strength", label: "Strength", icon: "\u{1F3CB}\uFE0F\u200D\u2640\uFE0F", subtext: "4x / week", weeklyTarget: 4 },
    { id: "walk", label: "10K Walk", icon: "\u{1F6B6}\u200D\u2640\uFE0F", subtext: "3x / week", weeklyTarget: 3 },
    { id: "dance", label: bonusLabel, icon: bonusIcon, subtext: "Bonus goal", weeklyTarget: 7 },
  ];
}

const PARAM_IDS = ["fasting", "calories", "protein", "water", "sleep", "strength", "walk", "dance"];

const WEEKLY_CHECKINS = [
  { id: "weight", label: "Weight (kg)", icon: "\u2696\uFE0F", type: "number" },
  { id: "waist", label: "Waist (cm)", icon: "\u{1F4CF}", type: "number" },
  { id: "bodyfat", label: "Body Fat %", icon: "\u{1F4CA}", type: "number" },
  { id: "energy", label: "Energy", icon: "\u26A1", type: "rating" },
  { id: "mood", label: "Mood", icon: "\u{1F9E0}", type: "rating" },
  { id: "soreness", label: "Soreness", icon: "\u{1F4AA}", type: "rating" },
];

const HYPE_MESSAGES = [
  "SHE'S ON FIRE TODAY \u{1F525}",
  "MAIN CHARACTER ENERGY \u2728",
  "HOTTEST VERSION LOADING... \u{1F485}",
  "QUEEN THINGS ONLY \u{1F451}",
  "BODY IS BODYING \u{1FA9E}",
  "GLOW UP IN PROGRESS \u{1F338}",
  "THAT GIRL ERA ACTIVATED \u{1F496}",
  "MIRROR'S NOT READY \u{1F525}",
  "UNSTOPPABLE TODAY \u{1F48E}",
  "SHE REALLY DID THAT \u{1F98B}",
];

const initWeekData = () => {
  const checks = {};
  PARAM_IDS.forEach((id) => { checks[id] = Array(7).fill(false); });
  const weekly = {};
  WEEKLY_CHECKINS.forEach((w) => { weekly[w.id] = w.type === "rating" ? 3 : ""; });
  return { checks, weekly, notes: "" };
};

// ─── Session Security (HMAC-signed anonymous sessions) ───
const SESSION_SALT = "recomp-v1-session-integrity";

async function hmacSign(message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(SESSION_SALT),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacVerify(message, signature) {
  const expected = await hmacSign(message);
  if (expected.length !== signature.length) return false;
  let match = true;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== signature[i]) match = false;
  }
  return match;
}

async function getOrCreateSession() {
  try {
    const stored = localStorage.getItem("recomp-session");
    if (stored) {
      const session = JSON.parse(stored);
      if (session.id && session.createdAt && session.sig) {
        const valid = await hmacVerify(
          session.id + ":" + session.createdAt,
          session.sig
        );
        if (valid) return session;
      }
    }
  } catch {}

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = "anon-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const createdAt = Date.now();
  const sig = await hmacSign(id + ":" + createdAt);
  const session = { id, createdAt, sig };
  localStorage.setItem("recomp-session", JSON.stringify(session));
  return session;
}

function trackVisitDay() {
  const today = new Date().toISOString().split("T")[0];
  try {
    const raw = localStorage.getItem("recomp-visits");
    const visits = raw ? JSON.parse(raw) : [];
    if (!visits.includes(today)) {
      visits.push(today);
      localStorage.setItem("recomp-visits", JSON.stringify(visits));
    }
    return visits.length;
  } catch { return 1; }
}

function clearSession() {
  localStorage.removeItem("recomp-session");
  localStorage.removeItem("recomp-visits");
}

const isAnonymousId = (userId) => typeof userId === "string" && userId.startsWith("anon-");

// ─── Upstash Redis Storage (via /api/redis proxy — credentials stay server-side) ───
// useRedis is always true; the proxy returns 503 if Redis isn't configured and
// the Storage methods fall through to localStorage automatically.
const useRedis = true;

const redis = {
  async _call(command, key, value) {
    const res = await fetch("/api/redis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, key, ...(value !== undefined ? { value } : {}) }),
    });
    if (!res.ok) throw new Error(`Redis ${command} failed: ${res.status}`);
    return res.json();
  },
  async get(key) {
    const json = await this._call("get", key);
    return json.result;
  },
  async set(key, value) {
    await this._call("set", key, value);
  },
  async setnx(key, value) {
    const json = await this._call("setnx", key, value);
    return json.result; // 1 = key was set (new), 0 = key already exists
  },
  async del(key) {
    await this._call("del", key);
  },
};

// Skip Redis for anonymous users (local-only until they create an account)
const shouldUseRedis = (userId) => !isAnonymousId(userId);

// Migrate old "steps" param ID to "dance" in loaded data
function migrateWeekData(data) {
  if (!data || !data.checks) return data;
  if (data.checks.steps && !data.checks.dance) {
    data.checks.dance = data.checks.steps;
    delete data.checks.steps;
  }
  PARAM_IDS.forEach((id) => {
    if (!data.checks[id]) data.checks[id] = Array(7).fill(false);
  });
  return data;
}

export const Storage = {
  async load(weekIndex, userId) {
    const key = `recomp-${userId}-week-${weekIndex}`;
    try {
      if (shouldUseRedis(userId)) {
        try {
          const raw = await redis.get(key);
          if (raw) return migrateWeekData(JSON.parse(raw));
        } catch {}
      }
      const raw = localStorage.getItem(key);
      return raw ? migrateWeekData(JSON.parse(raw)) : null;
    } catch { return null; }
  },
  async save(weekIndex, data, userId) {
    const key = `recomp-${userId}-week-${weekIndex}`;
    const value = JSON.stringify(data);
    try {
      localStorage.setItem(key, value);
      if (shouldUseRedis(userId)) {
        try { await redis.set(key, value); } catch (e) { console.error("Redis save failed:", e); }
      }
    } catch (e) { console.error("Save failed:", e); }
  },
  async loadProfile(userId) {
    const key = `recomp-${userId}-profile`;
    try {
      if (shouldUseRedis(userId)) {
        try {
          const raw = await redis.get(key);
          if (raw) return JSON.parse(raw);
        } catch {}
      }
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  async saveProfile(userId, profile) {
    const key = `recomp-${userId}-profile`;
    const value = JSON.stringify(profile);
    try {
      localStorage.setItem(key, value);
      if (shouldUseRedis(userId)) {
        try { await redis.set(key, value); } catch (e) { console.error("Profile Redis save failed:", e); }
      }
    } catch (e) { console.error("Profile save failed:", e); }
  },

  // Atomic username reservation — uses Redis SETNX to prevent race conditions
  async reserveUsername(username, userId) {
    const key = `recomp-username-${username.toLowerCase()}`;
    const value = JSON.stringify({ userId });

    if (useRedis) {
      try {
        const result = await redis.setnx(key, value);
        if (result === 0) {
          // Key already exists — check if it belongs to this user (re-saving own username)
          try {
            const existing = await redis.get(key);
            if (existing) {
              const parsed = JSON.parse(existing);
              if (parsed.userId === userId) {
                localStorage.setItem(key, value);
                return true;
              }
            }
          } catch {}
          return false;
        }
        localStorage.setItem(key, value);
        return true;
      } catch {
        // Redis unavailable — fall through to localStorage
      }
    }

    // Fallback: localStorage (not truly atomic, works for single device)
    try {
      const existing = localStorage.getItem(key);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (parsed.userId === userId) return true;
        return false;
      }
      localStorage.setItem(key, value);
      return true;
    } catch { return false; }
  },

  async lookupUsername(username) {
    const key = `recomp-username-${username.toLowerCase()}`;
    try {
      if (useRedis) {
        try {
          const raw = await redis.get(key);
          if (raw) return JSON.parse(raw);
        } catch {}
      }
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  async migrateOldData(userId) {
    const migrated = localStorage.getItem(`recomp-${userId}-migrated`);
    if (migrated) return;
    for (let i = 0; i < 14; i++) {
      const oldKey = `recomp-week-${i}`;
      const raw = localStorage.getItem(oldKey);
      if (raw) {
        const newKey = `recomp-${userId}-week-${i}`;
        if (!localStorage.getItem(newKey)) {
          const data = migrateWeekData(JSON.parse(raw));
          localStorage.setItem(newKey, JSON.stringify(data));
          if (shouldUseRedis(userId)) {
            try { await redis.set(newKey, JSON.stringify(data)); } catch {}
          }
        }
      }
    }
    localStorage.setItem(`recomp-${userId}-migrated`, "true");
  },

  // Migrate anonymous local data to an authenticated user account
  async migrateAnonymousToUser(anonId, userId) {
    try {
      const anonProfile = await Storage.loadProfile(anonId);
      if (!anonProfile) return null;

      const dates = computeDates(anonProfile.startDate);
      const totalWeeks = dates ? dates.totalWeeks : 20;

      // Copy all week data
      for (let i = 0; i < totalWeeks; i++) {
        const weekData = await Storage.load(i, anonId);
        if (weekData) {
          await Storage.save(i, weekData, userId);
        }
      }

      // Save migrated profile (stripped of anonymous flag, no username yet)
      const userProfile = { ...anonProfile };
      delete userProfile.isAnonymous;
      await Storage.saveProfile(userId, userProfile);

      // Clean up anonymous keys
      for (let i = 0; i < totalWeeks; i++) {
        localStorage.removeItem(`recomp-${anonId}-week-${i}`);
      }
      localStorage.removeItem(`recomp-${anonId}-profile`);
      localStorage.removeItem(`recomp-${anonId}-migrated`);
      clearSession();

      return userProfile;
    } catch (e) {
      console.error("Anonymous migration failed:", e);
      return null;
    }
  },

  async exportAll(userId, totalWeeks) {
    const profile = await Storage.loadProfile(userId);
    const weeks = {};
    for (let i = 0; i < (totalWeeks || 20); i++) {
      const d = await Storage.load(i, userId);
      if (d) weeks[i] = d;
    }
    return { profile, weeks, exportedAt: new Date().toISOString() };
  },
  async deleteAll(userId, totalWeeks, username) {
    const keys = [`recomp-${userId}-profile`, `recomp-${userId}-migrated`];
    if (username) keys.push(`recomp-username-${username.toLowerCase()}`);
    for (let i = 0; i < (totalWeeks || 20); i++) {
      keys.push(`recomp-${userId}-week-${i}`);
    }
    for (let i = 0; i < 14; i++) {
      keys.push(`recomp-week-${i}`);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
      if (useRedis) {
        try { await redis.del(key); } catch {}
      }
    }
  },
};

// ─── Shared exports for PublicProfile ───
export { computeDates, getDaysElapsed, getCurrentWeek, getWeekDates, isDayDisabled, getParams, PARAM_IDS, WEEKLY_CHECKINS, DAYS, initWeekData };

// ─── CSS (moved out of render to avoid re-injection) ───
const APP_CSS = `
  @keyframes celebPop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes celebPulse { from { transform: scale(1); } to { transform: scale(1.15); } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes perfectDay { 0% { box-shadow: 0 0 0 0 rgba(255,107,157,0.4); } 70% { box-shadow: 0 0 0 8px rgba(255,107,157,0); } 100% { box-shadow: 0 0 0 0 rgba(255,107,157,0); } }
  @keyframes gentleFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes slideBannerIn { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
`;

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
    const emojis = ["\u2728", "\u{1F496}", "\u{1F525}", "\u{1F451}", "\u{1F485}", "\u{1F98B}", "\u{1F338}", "\u{1F48E}", "\u2B50", "\u{1FA9E}"];
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
          const sz = p.size;
          ctx.moveTo(0, sz * 0.3);
          ctx.bezierCurveTo(-sz, -sz * 0.5, -sz * 0.5, -sz * 1.2, 0, -sz * 0.5);
          ctx.bezierCurveTo(sz * 0.5, -sz * 1.2, sz, -sz * 0.5, 0, sz * 0.3);
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
        <div style={celebStyles.flame}>{"\u{1F525}"}</div>
        <div style={celebStyles.messageText}>{message}</div>
        <div style={celebStyles.subText}>All 8 checks hit — you're literally getting hotter</div>
        <button style={celebStyles.dismissBtn} onClick={onClose}>I know {"\u{1F485}"}</button>
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
function ProgressBar({ dates }) {
  const { protocolStart, endDate, totalDays, startLabel, endLabel } = dates;
  const elapsed = getDaysElapsed(protocolStart, endDate, totalDays);
  const pct = Math.min(100, Math.round((elapsed / totalDays) * 100));
  const weeksLeft = Math.max(0, Math.ceil((totalDays - elapsed) / 7));

  const milestones = [
    { label: "START", pct: 0 },
    { label: "Month 1", pct: Math.round((30 / totalDays) * 100) },
    { label: "Month 2", pct: Math.round((60 / totalDays) * 100) },
    { label: "GOAL \u{1F496}", pct: 100 },
  ];

  return (
    <div style={s.progressWrap}>
      <div style={s.progressHeader}>
        <span style={s.progressLabel}>DAY {elapsed} / {totalDays}</span>
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
        <span>{startLabel}</span>
        <span style={{ color: "#ff6b9d", fontWeight: 700, fontSize: "12px" }}>12-week recomp {"\u2728"}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

// ─── Upgrade Banner (shown after 2+ visit days for anonymous users) ───
function UpgradeBanner({ onSave, onDismiss }) {
  return (
    <div style={s.upgradeBanner}>
      <div style={s.upgradeBannerInner}>
        <div style={{ flex: 1 }}>
          <div style={s.upgradeBannerTitle}>{"\u{1F525}"} You're on a roll!</div>
          <div style={s.upgradeBannerText}>
            Create an account to save progress across devices & get a public profile
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
          <button style={s.upgradeSaveBtn} onClick={onSave}>Save Progress</button>
          <button style={s.upgradeDismissBtn} onClick={onDismiss}>{"\u2715"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Onboarding Form (shown when authenticated user needs username) ───
function OnboardingForm({ onComplete, existingProfile, userId }) {
  const today = new Date();
  const defaultDate = existingProfile?.startDate || today.toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(defaultDate);
  const [username, setUsername] = useState("");
  const [calorieDeficit, setCalorieDeficit] = useState(existingProfile?.calorieDeficit || 500);
  const [proteinGoal, setProteinGoal] = useState(existingProfile?.proteinGoal || 120);
  const [bonusGoal, setBonusGoal] = useState(existingProfile?.bonusGoal || "5 min Dance");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isUpgrade = Boolean(existingProfile);
  const previewDates = computeDates(startDate);
  const durationWeeks = previewDates ? Math.ceil(previewDates.totalDays / 7) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    const clean = username.trim().toLowerCase();
    if (!clean) { setError("Username is required"); return; }
    if (!/^[a-z0-9_]+$/.test(clean)) { setError("Only lowercase letters, numbers, underscore"); return; }
    if (clean.length < 3 || clean.length > 30) { setError("Username must be 3-30 characters"); return; }
    if (!previewDates) { setError("Invalid date"); return; }

    setSubmitting(true);

    // Atomic username reservation via Upstash SETNX
    const reserved = await Storage.reserveUsername(clean, userId);
    if (!reserved) { setError("Username already taken"); setSubmitting(false); return; }

    onComplete({
      startDate,
      username: clean,
      calorieDeficit: Math.max(100, Math.min(1500, Number(calorieDeficit) || 500)),
      proteinGoal: Math.max(50, Math.min(300, Number(proteinGoal) || 120)),
      bonusGoal: (bonusGoal.trim() || "5 min Dance").slice(0, 50),
      bonusIcon: "\u{1F483}",
      publicProfile: true,
    });
  };

  return (
    <div style={{ ...s.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={s.onboardCard}>
        <h1 style={s.title}>RECOMP</h1>
        <p style={{ ...s.subtitle, marginBottom: "8px" }}>
          {isUpgrade ? "Almost there! Choose your username" : "Set up your 12-week protocol"}
        </p>
        <p style={{ fontSize: "13px", color: "#886677", marginBottom: "24px" }}>
          {isUpgrade
            ? "Your tracking data has been saved. Pick a username to finish setup."
            : "Customize your goals and pick a start date"}
        </p>

        <label style={s.onboardLabel}>Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          style={s.onboardTextInput}
          placeholder="rashmivabbigeri"
          maxLength={30}
          required
        />
        <p style={s.onboardHint}>Your public profile: /{username || "username"}</p>

        <label style={s.onboardLabel}>Start Date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={s.onboardDateInput}
          required
        />

        <div style={s.onboardGoalsGrid}>
          <div>
            <label style={s.onboardLabel}>Calorie Deficit</label>
            <input
              type="number"
              value={calorieDeficit}
              onChange={(e) => setCalorieDeficit(e.target.value)}
              style={s.onboardNumInput}
              min="100"
              max="1500"
              placeholder="500"
            />
            <p style={s.onboardUnit}>cal / day</p>
          </div>
          <div>
            <label style={s.onboardLabel}>Protein Goal</label>
            <input
              type="number"
              value={proteinGoal}
              onChange={(e) => setProteinGoal(e.target.value)}
              style={s.onboardNumInput}
              min="50"
              max="300"
              placeholder="120"
            />
            <p style={s.onboardUnit}>grams / day</p>
          </div>
        </div>

        <label style={s.onboardLabel}>Bonus Daily Goal</label>
        <input
          type="text"
          value={bonusGoal}
          onChange={(e) => setBonusGoal(e.target.value)}
          style={s.onboardTextInput}
          placeholder="5 min Dance"
          maxLength={50}
        />
        <p style={s.onboardHint}>Your extra daily habit to track</p>

        {previewDates && (
          <div style={s.onboardPreview}>
            <div style={s.onboardPreviewRow}>
              <span style={s.onboardPreviewLabel}>Starts</span>
              <span style={s.onboardPreviewValue}>{previewDates.startLabel}</span>
            </div>
            <div style={s.onboardPreviewRow}>
              <span style={s.onboardPreviewLabel}>Ends</span>
              <span style={s.onboardPreviewValue}>{previewDates.endLabel}</span>
            </div>
            <div style={s.onboardPreviewRow}>
              <span style={s.onboardPreviewLabel}>Duration</span>
              <span style={s.onboardPreviewValue}>{previewDates.totalDays} days ({durationWeeks} weeks)</span>
            </div>
          </div>
        )}

        {error && <p style={s.onboardError}>{error}</p>}
        <button type="submit" style={{ ...s.loginBtn, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>
          {submitting ? "Setting up..." : isUpgrade ? "Complete Setup \u2728" : "Let's Go \u2728"}
        </button>
      </form>
    </div>
  );
}

// ─── Main App ───
export default function RecompTracker() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  // Anonymous session
  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [visitDays, setVisitDays] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Profile & tracker state
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [week, setWeek] = useState(0);
  const [data, setData] = useState(initWeekData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("daily");
  const [celebration, setCelebration] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const prevScoresRef = useRef({});
  const saveTimerRef = useRef(null);
  const latestDataRef = useRef(null);

  // Effective userId: Privy user when authenticated, anonymous session otherwise
  const userId = authenticated ? user?.id : session?.id;
  const dates = profile ? computeDates(profile.startDate) : null;
  const params = getParams(profile);
  const showUpgradeBanner = !authenticated && visitDays >= 2 && !bannerDismissed;

  // ─── Initialize anonymous session ───
  useEffect(() => {
    getOrCreateSession().then((s) => {
      setSession(s);
      setSessionReady(true);
      const days = trackVisitDay();
      setVisitDays(days);
    });
  }, []);

  // ─── Load profile for anonymous users (auto-create default on first visit) ───
  useEffect(() => {
    if (!sessionReady || !session || authenticated) return;
    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      let p = await Storage.loadProfile(session.id);
      if (cancelled) return;
      if (!p) {
        // First visit — auto-create default profile, user lands on tracker immediately
        p = {
          startDate: new Date().toISOString().split("T")[0],
          calorieDeficit: 500,
          proteinGoal: 120,
          bonusGoal: "5 min Dance",
          bonusIcon: "\u{1F483}",
          publicProfile: false,
          isAnonymous: true,
        };
        await Storage.saveProfile(session.id, p);
      }
      const d = computeDates(p.startDate);
      if (d) {
        setProfile(p);
        setWeek(getCurrentWeek(d.gridStart, d.totalWeeks));
      }
      setProfileLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sessionReady, session, authenticated]);

  // ─── Load profile for authenticated users (+ migrate anonymous data if upgrading) ───
  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      await Storage.migrateOldData(user.id);

      let p = await Storage.loadProfile(user.id);

      // If no profile but we have an anonymous session, migrate that data
      if (!p && session) {
        p = await Storage.migrateAnonymousToUser(session.id, user.id);
      }

      if (cancelled) return;
      if (p) {
        const d = computeDates(p.startDate);
        if (d) {
          setProfile(p);
          setWeek(getCurrentWeek(d.gridStart, d.totalWeeks));
        } else {
          setProfile(null);
        }
      }
      setProfileLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ready, authenticated, user?.id]);

  // ─── Load week data ───
  useEffect(() => {
    if (!userId || !profile) return;
    let cancelled = false;
    setLoading(true);
    Storage.load(week, userId).then((saved) => {
      if (cancelled) return;
      const d = saved || initWeekData();
      setData(d);
      latestDataRef.current = d;
      const scores = {};
      for (let i = 0; i < 7; i++) {
        scores[i] = params.reduce((sum, p) => sum + (d.checks[p.id]?.[i] ? 1 : 0), 0);
      }
      prevScoresRef.current = scores;
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [week, userId, profile]);

  // ─── Debounced persist ───
  const persist = useCallback((newData) => {
    setData(newData);
    latestDataRef.current = newData;
    setSaving(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      Storage.save(week, latestDataRef.current, userId).then(() => setSaving(false));
    }, 500);
  }, [week, userId]);

  // Flush pending save on unmount or week change
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        if (latestDataRef.current) {
          Storage.save(week, latestDataRef.current, userId);
        }
      }
    };
  }, [week, userId]);

  const handleOnboardingComplete = async (profileData) => {
    await Storage.saveProfile(userId, profileData);
    setProfile(profileData);
    const d = computeDates(profileData.startDate);
    if (d) setWeek(getCurrentWeek(d.gridStart, d.totalWeeks));
  };

  const handleExport = async () => {
    const tw = dates ? dates.totalWeeks : 20;
    const exported = await Storage.exportAll(userId, tw);
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recomp-${profile?.username || "data"}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete ALL your data? This cannot be undone.")) return;
    if (!window.confirm("Are you absolutely sure? All weeks, notes, and profile will be permanently deleted.")) return;
    setDeleting(true);
    const tw = dates ? dates.totalWeeks : 20;
    await Storage.deleteAll(userId, tw, profile?.username);
    setProfile(null);
    setData(initWeekData());
    setDeleting(false);
    setShowProfile(false);
  };

  const toggleCheck = (paramId, dayIdx) => {
    if (!dates || isDayDisabled(week, dayIdx, dates.disabledDaysInWeek0)) return;
    const next = { ...data, checks: { ...data.checks } };
    next.checks[paramId] = [...next.checks[paramId]];
    next.checks[paramId][dayIdx] = !next.checks[paramId][dayIdx];

    const newScore = params.reduce((sum, p) => sum + (next.checks[p.id]?.[dayIdx] ? 1 : 0), 0);
    const oldScore = prevScoresRef.current[dayIdx] || 0;

    if (newScore === params.length && oldScore < params.length) {
      setCelebration(HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)]);
    }
    prevScoresRef.current[dayIdx] = newScore;
    persist(next);
  };

  const updateWeekly = (id, value) => persist({ ...data, weekly: { ...data.weekly, [id]: value } });
  const updateNotes = (value) => {
    const trimmed = value.slice(0, 5000);
    persist({ ...data, notes: trimmed });
  };

  const weeklyHits = (pid) => data.checks[pid]?.filter(Boolean).length || 0;
  const disabled0 = dates ? dates.disabledDaysInWeek0 : 0;
  const activeDays = DAYS.reduce((sum, _, i) => sum + (isDayDisabled(week, i, disabled0) ? 0 : 1), 0);
  const totalHits = params.reduce((sum, p) => sum + weeklyHits(p.id), 0);
  const adherence = activeDays > 0 ? Math.round((totalHits / (params.length * activeDays)) * 100) : 0;
  const dayScore = (i) => isDayDisabled(week, i, disabled0) ? -1 : params.reduce((sum, p) => sum + (data.checks[p.id]?.[i] ? 1 : 0), 0);

  const WEEK_LABELS = dates ? Array.from({ length: dates.totalWeeks }, (_, i) => `Week ${i + 1}`) : [];
  const maxWeek = dates ? dates.totalWeeks - 1 : 0;

  // ─── Render gates ───
  const isReady = sessionReady && ready;

  if (!isReady) {
    return (
      <div style={{ ...s.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={s.loading}>Loading...</div>
      </div>
    );
  }

  // Authenticated user without a username → needs onboarding to pick username
  if (authenticated && !profileLoading && (!profile || !profile.username)) {
    return <OnboardingForm existingProfile={profile} userId={userId} onComplete={handleOnboardingComplete} />;
  }

  if (profileLoading) {
    return (
      <div style={{ ...s.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={s.loading}>{authenticated ? "Loading your profile..." : "Setting up tracker..."}</div>
      </div>
    );
  }

  if (!profile || !dates) {
    return (
      <div style={{ ...s.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={s.loading}>Profile has invalid dates. Please delete and re-create.</div>
      </div>
    );
  }

  const isAnon = !authenticated;
  const userEmail = user?.email?.address || user?.google?.email || "";
  const displayName = isAnon
    ? "Guest"
    : userEmail || (user?.wallet?.address ? user.wallet.address.slice(0, 8) + "..." : "User");

  return (
    <div style={s.container}>
      <style>{APP_CSS}</style>

      {celebration && <CelebrationOverlay message={celebration} onClose={() => setCelebration(null)} />}

      <ProgressBar dates={dates} />

      {/* User bar — different for anonymous vs authenticated */}
      <div style={s.userBar}>
        {isAnon ? (
          <>
            <span style={s.userInfo}>
              {"\u{1F525}"} Guest mode {"\u00B7"} tracking locally
            </span>
            <button style={s.signInSmallBtn} onClick={login}>Sign In</button>
          </>
        ) : (
          <>
            <span style={s.userInfo}>{displayName} {"\u00B7"} <span style={{ color: "#886677" }}>/{profile.username}</span></span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button style={s.profileIconBtn} onClick={() => setShowProfile(true)} title="Profile">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff85b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </button>
              <button style={s.logoutBtn} onClick={logout}>Logout</button>
            </div>
          </>
        )}
      </div>

      {/* Upgrade banner for engaged anonymous users */}
      {showUpgradeBanner && (
        <UpgradeBanner onSave={login} onDismiss={() => setBannerDismissed(true)} />
      )}

      {/* Profile panel (authenticated only) */}
      {showProfile && authenticated && (
        <div style={s.profileOverlay} onClick={() => setShowProfile(false)}>
          <div style={s.profilePanel} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#ff85b3" }}>Profile</h2>
              <button style={s.profileCloseBtn} onClick={() => setShowProfile(false)}>{"\u2715"}</button>
            </div>

            <div style={s.profileSection}>
              <div style={s.profileRow}><span style={s.profileLabel}>Username</span><span style={s.profileVal}>/{profile.username}</span></div>
              <div style={s.profileRow}><span style={s.profileLabel}>Start Date</span><span style={s.profileVal}>{dates.startLabel}</span></div>
              <div style={s.profileRow}><span style={s.profileLabel}>End Date</span><span style={s.profileVal}>{dates.endLabel}</span></div>
              <div style={s.profileRow}><span style={s.profileLabel}>Calorie Deficit</span><span style={s.profileVal}>{profile.calorieDeficit || 500} cal</span></div>
              <div style={s.profileRow}><span style={s.profileLabel}>Protein Goal</span><span style={s.profileVal}>{profile.proteinGoal || 120}g</span></div>
              <div style={s.profileRow}><span style={s.profileLabel}>Bonus Goal</span><span style={s.profileVal}>{profile.bonusGoal || "5 min Dance"}</span></div>
              <div style={s.profileRow}>
                <span style={s.profileLabel}>Public Profile</span>
                <button
                  style={{
                    ...s.profileToggle,
                    background: profile.publicProfile !== false ? "rgba(255,107,157,0.3)" : "rgba(255,107,157,0.08)",
                  }}
                  onClick={async () => {
                    const updated = { ...profile, publicProfile: profile.publicProfile === false };
                    await Storage.saveProfile(userId, updated);
                    setProfile(updated);
                  }}
                >
                  <span style={{
                    ...s.profileToggleDot,
                    transform: profile.publicProfile !== false ? "translateX(16px)" : "translateX(0)",
                  }} />
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" }}>
              <button style={s.profileExportBtn} onClick={handleExport}>Export All Data (JSON)</button>
              <button style={s.profileDeleteBtn} onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete All My Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={s.header}>
        <div style={s.headerTop}>
          <div>
            <h1 style={s.title}>RECOMP</h1>
            <p style={s.subtitle}>12-week recomp {"\u00B7"} {dates.startLabel} – {dates.endLabel}</p>
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
          <button style={s.weekBtn} onClick={() => setWeek(Math.max(0, week - 1))}>{"\u2039"}</button>
          <div style={{ textAlign: "center" }}>
            <span style={s.weekLabel}>{WEEK_LABELS[week]}</span>
            <div style={s.weekDates}>{getWeekDates(week, dates.gridStart)}</div>
          </div>
          <button style={s.weekBtn} onClick={() => setWeek(Math.min(maxWeek, week + 1))}>{"\u203A"}</button>
          {saving && <span style={s.saveIndicator}>saving…</span>}
        </div>

        <div style={s.tabs}>
          {["daily", "weekly", "notes"].map((t) => (
            <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
              {t === "daily" ? "\u2726 Daily" : t === "weekly" ? "\u2726 Weekly" : "\u2726 Notes"}
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
              const dis = isDayDisabled(week, i, disabled0);
              const score = dayScore(i);
              const perfect = !dis && score === params.length;
              return (
                <div key={d} style={{ ...s.dayHeader, opacity: dis ? 0.25 : 1 }}>
                  <span style={{ ...s.dayName, color: perfect ? "#ff6b9d" : "#886677" }}>{d}</span>
                  <span style={{
                    ...s.dayScore,
                    color: dis ? "#332228" : perfect ? "#ff6b9d" : score >= params.length - 2 ? "#ffb6d3" : "#553344",
                    animation: perfect ? "gentleFloat 2s ease-in-out infinite" : "none",
                  }}>
                    {dis ? "\u2014" : perfect ? "\u{1F496}" : `${score}/${params.length}`}
                  </span>
                </div>
              );
            })}
            <div style={s.weeklyColHeader}>Wk</div>
          </div>

          {params.map((param) => {
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
                  const dis = isDayDisabled(week, i, disabled0);
                  const checked = !dis && data.checks[param.id]?.[i];
                  return (
                    <button key={i}
                      disabled={dis}
                      style={{
                        ...s.cell,
                        ...(dis ? s.cellDisabled : {}),
                        ...(checked ? s.cellActive : {}),
                        ...(dayScore(i) === params.length && checked ? { animation: "perfectDay 2s infinite" } : {}),
                      }}
                      onClick={() => toggleCheck(param.id, i)}
                    >
                      {dis ? "" : checked ? "\u2665" : ""}
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
                    placeholder="\u2014"
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
            placeholder="How did this week go? Energy, hunger, training feels, wins, vibes..."
            maxLength={5000}
          />
        </div>
      )}

      <div style={s.protocol}>
        <div style={s.protocolTitle}>YOUR PROTOCOL {"\u2728"}</div>
        <div style={s.protocolGrid}>
          {[
            ["\u23F1\uFE0F", "16:8 IF daily"],
            ["\u{1F525}", `${profile.calorieDeficit || 500} cal deficit`],
            ["\u{1F357}", `${profile.proteinGoal || 120}g protein`],
            ["\u{1F3CB}\uFE0F\u200D\u2640\uFE0F", "Strength 4x/wk"],
            ["\u{1F6B6}\u200D\u2640\uFE0F", "10K walk 3x/wk"],
            ["\u{1F483}", profile.bonusGoal || "5 min Dance"],
          ].map(([icon, text], i) => (
            <div key={i} style={s.protocolItem}><span>{icon}</span><span>{text}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shared Styles (exported for PublicProfile) ───
export const s = {
  container: {
    fontFamily: "'DM Sans', -apple-system, sans-serif",
    background: "linear-gradient(170deg, #1a0a10 0%, #120810 40%, #0d0609 100%)",
    color: "#e8c8d8",
    minHeight: "100vh",
  },
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
    cursor: "pointer", fontSize: "18px", fontFamily: "inherit", transition: "all 0.2s",
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
    background: "rgba(255,107,157,0.12)", border: "1px solid rgba(255,107,157,0.4)",
    boxShadow: "0 0 12px rgba(255,107,157,0.15)", color: "#ff6b9d",
  },
  cellDisabled: {
    background: "rgba(255,107,157,0.01)", border: "1px solid rgba(255,107,157,0.04)",
    cursor: "not-allowed", opacity: 0.2,
  },
  weeklyCount: { fontSize: "13px", fontWeight: 700, textAlign: "center" },
  legend: { display: "flex", gap: "16px", marginTop: "18px", justifyContent: "center" },
  legendItem: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#886677" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
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
    background: "rgba(255,107,157,0.15)", border: "1px solid rgba(255,107,157,0.4)", color: "#ff6b9d",
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
  loginBtn: {
    background: "linear-gradient(135deg, #ff6b9d, #e84393)",
    border: "none", color: "#fff", padding: "14px 40px", borderRadius: "50px",
    fontSize: "16px", fontWeight: 700, cursor: "pointer", letterSpacing: "1px",
    boxShadow: "0 4px 20px rgba(255,107,157,0.4)",
    fontFamily: "inherit",
  },
  userBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 20px",
    background: "rgba(255,107,157,0.04)",
    borderBottom: "1px solid rgba(255,107,157,0.08)",
  },
  userInfo: {
    fontSize: "13px", color: "#ff85b3", fontWeight: 600, letterSpacing: "0.5px",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%",
  },
  logoutBtn: {
    background: "rgba(255,107,157,0.08)", border: "1px solid rgba(255,107,157,0.2)",
    color: "#ff85b3", padding: "6px 16px", borderRadius: "20px",
    fontSize: "12px", fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.5px",
  },
  signInSmallBtn: {
    background: "linear-gradient(135deg, #ff6b9d, #e84393)",
    border: "none", color: "#fff", padding: "6px 18px", borderRadius: "20px",
    fontSize: "12px", fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.5px",
    boxShadow: "0 2px 10px rgba(255,107,157,0.3)",
  },
  // Upgrade banner styles
  upgradeBanner: {
    padding: "12px 20px",
    background: "linear-gradient(135deg, rgba(255,107,157,0.1), rgba(232,67,147,0.08))",
    borderBottom: "1px solid rgba(255,107,157,0.2)",
    animation: "slideBannerIn 0.4s ease-out",
  },
  upgradeBannerInner: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: "12px", flexWrap: "wrap",
  },
  upgradeBannerTitle: {
    fontSize: "14px", fontWeight: 700, color: "#ff85b3", marginBottom: "2px",
  },
  upgradeBannerText: {
    fontSize: "12px", color: "#886677",
  },
  upgradeSaveBtn: {
    background: "linear-gradient(135deg, #ff6b9d, #e84393)",
    border: "none", color: "#fff", padding: "8px 20px", borderRadius: "20px",
    fontSize: "12px", fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.5px",
    boxShadow: "0 2px 12px rgba(255,107,157,0.3)",
    whiteSpace: "nowrap",
  },
  upgradeDismissBtn: {
    background: "none", border: "1px solid rgba(255,107,157,0.15)",
    color: "#886677", width: "28px", height: "28px", borderRadius: "50%",
    fontSize: "12px", cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center", padding: 0,
    flexShrink: 0,
  },
  // Onboarding styles
  onboardCard: {
    textAlign: "center", padding: "40px 32px", borderRadius: "24px",
    background: "linear-gradient(135deg, rgba(255,107,157,0.08), rgba(255,182,211,0.04))",
    border: "1px solid rgba(255,107,157,0.2)",
    boxShadow: "0 0 60px rgba(255,107,157,0.1)",
    maxWidth: "440px", width: "90%",
  },
  onboardLabel: {
    display: "block", fontSize: "11px", fontWeight: 700, color: "#ff85b3",
    letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px",
    textAlign: "left",
  },
  onboardDateInput: {
    width: "100%", background: "rgba(255,107,157,0.06)", border: "1px solid rgba(255,107,157,0.2)",
    borderRadius: "12px", padding: "12px 16px", color: "#ffb6d3",
    fontSize: "16px", fontWeight: 600, fontFamily: "inherit",
    textAlign: "center", outline: "none", boxSizing: "border-box",
    marginBottom: "16px", colorScheme: "dark",
  },
  onboardTextInput: {
    width: "100%", background: "rgba(255,107,157,0.06)", border: "1px solid rgba(255,107,157,0.2)",
    borderRadius: "12px", padding: "12px 16px", color: "#ffb6d3",
    fontSize: "16px", fontWeight: 600, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box", marginBottom: "4px",
  },
  onboardNumInput: {
    width: "100%", background: "rgba(255,107,157,0.06)", border: "1px solid rgba(255,107,157,0.2)",
    borderRadius: "12px", padding: "12px 16px", color: "#ffb6d3",
    fontSize: "20px", fontWeight: 700, fontFamily: "inherit",
    textAlign: "center", outline: "none", boxSizing: "border-box",
  },
  onboardGoalsGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
    marginBottom: "16px",
  },
  onboardUnit: {
    fontSize: "11px", color: "#664455", marginTop: "4px", textAlign: "center",
  },
  onboardHint: {
    fontSize: "12px", color: "#664455", marginBottom: "16px", textAlign: "left",
  },
  onboardError: {
    fontSize: "13px", color: "#ff4757", marginBottom: "12px", fontWeight: 600,
  },
  onboardPreview: {
    background: "rgba(255,107,157,0.04)", border: "1px solid rgba(255,107,157,0.1)",
    borderRadius: "14px", padding: "16px", marginBottom: "20px",
  },
  onboardPreviewRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "6px 0",
  },
  onboardPreviewLabel: { fontSize: "13px", color: "#886677" },
  onboardPreviewValue: { fontSize: "14px", fontWeight: 600, color: "#ffb6d3" },
  profileIconBtn: {
    background: "rgba(255,107,157,0.08)", border: "1px solid rgba(255,107,157,0.15)",
    borderRadius: "50%", width: "30px", height: "30px",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", padding: 0,
  },
  profileOverlay: {
    position: "fixed", inset: 0, zIndex: 900,
    background: "rgba(10,4,8,0.85)", backdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  profilePanel: {
    background: "linear-gradient(135deg, #1a0a10, #160a0f)",
    border: "1px solid rgba(255,107,157,0.2)",
    borderRadius: "20px", padding: "28px 24px",
    width: "90%", maxWidth: "380px",
    boxShadow: "0 0 40px rgba(255,107,157,0.1)",
  },
  profileCloseBtn: {
    background: "none", border: "none", color: "#886677",
    fontSize: "18px", cursor: "pointer", padding: "4px 8px",
  },
  profileSection: {
    background: "rgba(255,107,157,0.04)", border: "1px solid rgba(255,107,157,0.08)",
    borderRadius: "12px", padding: "12px 16px",
  },
  profileRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 0", borderBottom: "1px solid rgba(255,107,157,0.06)",
  },
  profileLabel: { fontSize: "13px", color: "#886677" },
  profileVal: { fontSize: "13px", fontWeight: 600, color: "#ffb6d3" },
  profileExportBtn: {
    background: "rgba(255,107,157,0.08)", border: "1px solid rgba(255,107,157,0.2)",
    color: "#ff85b3", padding: "12px 20px", borderRadius: "12px",
    fontSize: "14px", fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.5px",
  },
  profileDeleteBtn: {
    background: "rgba(255,71,87,0.08)", border: "1px solid rgba(255,71,87,0.25)",
    color: "#ff4757", padding: "12px 20px", borderRadius: "12px",
    fontSize: "14px", fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.5px",
  },
  profileToggle: {
    width: "36px", height: "20px", borderRadius: "10px",
    border: "1px solid rgba(255,107,157,0.2)",
    cursor: "pointer", position: "relative", padding: 0,
    transition: "background 0.2s",
  },
  profileToggleDot: {
    width: "14px", height: "14px", borderRadius: "50%",
    background: "#ff85b3", position: "absolute", top: "2px", left: "2px",
    transition: "transform 0.2s",
  },
};
