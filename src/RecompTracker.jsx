import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import LiftTracker from "./LiftTracker";

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

// ─── Date key for checks (ISO date string for a specific cell) ───
const dateKey = (gridStart, weekIdx, dayIdx) => {
  const d = new Date(gridStart);
  d.setDate(d.getDate() + weekIdx * 7 + dayIdx);
  return d.toISOString().slice(0, 10);
};

// ─── Migrate old array-based checks to date-keyed format ───
const migrateChecksFormat = (data, weekIdx, gridStart) => {
  if (!data?.checks) return data;
  const entries = Object.entries(data.checks);
  if (!entries.length) return data;
  const hasOldFormat = entries.some(([key]) => !/^\d{4}-\d{2}-\d{2}$/.test(key));
  if (!hasOldFormat) return data; // already fully date-keyed
  // Mixed or fully old format — preserve existing date entries, convert arrays
  const newChecks = {};
  entries.forEach(([key, val]) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      newChecks[key] = val; // preserve existing date-keyed entries
    } else if (Array.isArray(val)) {
      val.forEach((checked, dayIdx) => {
        if (checked) {
          const dk = dateKey(gridStart, weekIdx, dayIdx);
          if (!newChecks[dk]) newChecks[dk] = {};
          newChecks[dk][key] = true;
        }
      });
    }
  });
  return { ...data, checks: newChecks };
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
    { id: "strength", label: "Strength", icon: "\u{1F3CB}\uFE0F\u200D\u2640\uFE0F", subtext: "3x / week", weeklyTarget: 3 },
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
  const weekly = {};
  WEEKLY_CHECKINS.forEach((w) => { weekly[w.id] = w.type === "rating" ? null : ""; });
  return { checks: {}, weekly, notes: "" };
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
      // Check localStorage first, then fall back to Redis (data may only exist there
      // if the user tracked on multiple devices before auth was added)
      let raw = localStorage.getItem(oldKey);
      if (!raw && shouldUseRedis(userId)) {
        try { raw = await redis.get(oldKey); } catch {}
      }
      if (raw) {
        const newKey = `recomp-${userId}-week-${i}`;
        const alreadyMigrated = localStorage.getItem(newKey) ||
          (shouldUseRedis(userId) ? await redis.get(newKey).catch(() => null) : null);
        if (!alreadyMigrated) {
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
  async loadLifts(userId) {
    const key = `recomp-${userId}-lifts-all`;
    if (shouldUseRedis(userId)) {
      const raw = await redis.get(key);
      if (raw) {
        // raw is the Upstash result — may be a plain object, a JSON string,
        // or a double-encoded JSON string (from the seed script).
        let parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        return parsed;
      }
    }
    const local = localStorage.getItem(key);
    return local ? JSON.parse(local) : null;
  },
  async saveLifts(userId, data) {
    const key = `recomp-${userId}-lifts-all`;
    const value = JSON.stringify(data);
    let localSaved = false;
    try { localStorage.setItem(key, value); localSaved = true; } catch {}
    if (shouldUseRedis(userId)) {
      try {
        await redis.set(key, value);
      } catch {
        if (localSaved) { const e = new Error("Local only"); e.localOnly = true; throw e; }
        throw new Error("Save failed");
      }
    }
  },
};

// ─── Shared exports for PublicProfile ───
export { computeDates, getDaysElapsed, getCurrentWeek, getWeekDates, isDayDisabled, getParams, PARAM_IDS, WEEKLY_CHECKINS, DAYS, initWeekData, dateKey, migrateChecksFormat };

// ─── CSS (moved out of render to avoid re-injection) ───
const APP_CSS = `
  @keyframes celebPop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes celebPulse { from { transform: scale(1); } to { transform: scale(1.15); } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes perfectDay { 0% { box-shadow: 0 0 0 0 rgba(165,56,96,0.4); } 70% { box-shadow: 0 0 0 8px rgba(165,56,96,0); } 100% { box-shadow: 0 0 0 0 rgba(165,56,96,0); } }
  @keyframes gentleFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes slideBannerIn { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
  .rc-cell:hover:not(:disabled) { background: rgba(165,56,96,0.12) !important; border-color: rgba(239,136,173,0.35) !important; }
  .rc-cell:active:not(:disabled) { transform: scale(0.92); }
  .rc-rating:hover { background: rgba(165,56,96,0.12) !important; border-color: rgba(103,13,47,0.5) !important; color: #EF88AD !important; }
  .rc-weekbtn:hover { background: rgba(165,56,96,0.15) !important; border-color: rgba(103,13,47,0.5) !important; }
  @media (max-width: 480px) {
    .rc-param-label-text { display: none !important; }
    .rc-weekly-count { display: none !important; }
    .rc-weekly-col-header { display: none !important; }
    .rc-grid-row { grid-template-columns: 32px repeat(7, 36px) !important; }
    .rc-grid-header { grid-template-columns: 32px repeat(7, 36px) !important; }
    .rc-cell { width: 36px !important; height: 36px !important; }
  }
  @media (max-width: 480px) { .rc-weekly-grid { grid-template-columns: 1fr !important; } }
  .rc-menu-overlay { position: fixed; inset: 0; z-index: 800; background: rgba(10,4,8,0.7); backdrop-filter: blur(4px); }
  .rc-menu-panel { position: absolute; top: 50px; right: 12px; background: #1a0a10; border: 1px solid rgba(103,13,47,0.4); border-radius: 14px; padding: 8px 0; min-width: 200px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
  .rc-menu-item { display: flex; align-items: center; gap: 10px; padding: 12px 20px; font-size: 13px; color: #EF88AD; cursor: pointer; border: none; background: none; width: 100%; font-family: inherit; text-align: left; }
  .rc-menu-item:hover { background: rgba(165,56,96,0.1); }
  .rc-menu-divider { height: 1px; background: rgba(103,13,47,0.3); margin: 4px 0; }
  .rc-menu-item.danger { color: #ff4757; }
  .rc-menu-item.danger:hover { background: rgba(255,71,87,0.08); }
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
    const colors = ["#EF88AD", "#A53860", "#c9608a", "#EF88AD", "#670D2F", "#fff", "#d4789a", "#A53860", "#EF88AD"];

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
    background: "radial-gradient(ellipse at center, rgba(165,56,96,0.15) 0%, rgba(20,5,10,0.92) 70%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(4px)",
  },
  canvas: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },
  messageWrap: {
    position: "relative", zIndex: 2, textAlign: "center",
    padding: "40px 48px", borderRadius: "24px",
    background: "linear-gradient(135deg, rgba(165,56,96,0.15), rgba(103,13,47,0.1))",
    border: "1px solid rgba(165,56,96,0.3)",
    boxShadow: "0 0 60px rgba(165,56,96,0.2), 0 0 120px rgba(165,56,96,0.1)",
    animation: "celebPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
  },
  flame: { fontSize: "56px", marginBottom: "12px", animation: "celebPulse 0.8s ease-in-out infinite alternate" },
  messageText: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: "28px", fontWeight: 700, color: "#EF88AD",
    letterSpacing: "2px", marginBottom: "8px",
    textShadow: "0 0 20px rgba(165,56,96,0.4)",
  },
  subText: { fontSize: "14px", color: "#c9809e", letterSpacing: "1px", marginBottom: "24px" },
  dismissBtn: {
    background: "linear-gradient(135deg, #A53860, #EF88AD)",
    border: "none", color: "#fff", padding: "12px 32px", borderRadius: "50px",
    fontSize: "15px", fontWeight: 700, cursor: "pointer", letterSpacing: "1px",
    boxShadow: "0 4px 20px rgba(165,56,96,0.4)",
    fontFamily: "inherit",
  },
};

// ─── Progress Bar ───
function ProgressBar({ dates, isAnon }) {
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
        <span style={s.progressLabel}>{isAnon ? `${startLabel} → ${endLabel}` : `DAY ${elapsed} / ${totalDays}`}</span>
        <span style={s.progressMeta}>{isAnon ? `${weeksLeft}w to go` : `${weeksLeft}w left · ${pct}%`}</span>
      </div>
      <div style={s.progressTrack}>
        <div style={{
          ...s.progressFill,
          width: `${pct}%`,
          background: pct >= 75
            ? "linear-gradient(90deg, #A53860, #EF88AD, #a855f7)"
            : pct >= 40
            ? "linear-gradient(90deg, #A53860, #EF88AD)"
            : "linear-gradient(90deg, #670D2F, #A53860)",
        }} />
        {milestones.map((m, i) => (
          <div key={i} style={{ ...s.milestone, left: `${m.pct}%` }}>
            <div style={{
              ...s.milestoneDot,
              background: pct >= m.pct ? "#EF88AD" : "rgba(165,56,96,0.2)",
              boxShadow: pct >= m.pct ? "0 0 8px rgba(165,56,96,0.5)" : "none",
              border: pct >= m.pct ? "2px solid #EF88AD" : "2px solid rgba(165,56,96,0.3)",
            }} />
            <span style={{ ...s.milestoneLabel, color: pct >= m.pct ? "#EF88AD" : "#887766" }}>{m.label}</span>
          </div>
        ))}
      </div>
      <div style={s.progressDates}>
        <span>{startLabel}</span>
        <span style={{ color: "#EF88AD", fontWeight: 700, fontSize: "12px" }}>12-week recomp {"\u2728"}</span>
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
          placeholder="aspiring_athlete"
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
  const [showMenu, setShowMenu] = useState(false);
  const [syncState, setSyncState] = useState("synced"); // "synced" | "saving" | "error"
  const [deleting, setDeleting] = useState(false);
  const [prevWeekData, setPrevWeekData] = useState(null);
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
      let d = saved || initWeekData();
      // Migrate old array-based checks to date-keyed format
      if (dates) {
        const migrated = migrateChecksFormat(d, week, dates.gridStart);
        if (migrated !== d) {
          d = migrated;
          Storage.save(week, d, userId); // re-save in new format silently
        }
      }
      setData(d);
      latestDataRef.current = d;
      const scores = {};
      for (let i = 0; i < 7; i++) {
        const dk = dates ? dateKey(dates.gridStart, week, i) : null;
        scores[i] = params.reduce((sum, p) => sum + (dk && d.checks[dk]?.[p.id] ? 1 : 0), 0);
      }
      prevScoresRef.current = scores;
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [week, userId, profile]);

  // ─── Load previous week data for weekly tab context ───
  useEffect(() => {
    if (!userId || !profile || week === 0) { setPrevWeekData(null); return; }
    Storage.load(week - 1, userId).then((saved) => setPrevWeekData(saved));
  }, [week, userId, profile]);

  // ─── Debounced persist ───
  const persist = useCallback((newData) => {
    setData(newData);
    latestDataRef.current = newData;
    setSaving(true);
    setSyncState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      Storage.save(week, latestDataRef.current, userId)
        .then(() => { setSaving(false); setSyncState("synced"); })
        .catch(() => { setSaving(false); setSyncState("error"); });
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
    const dk = dateKey(dates.gridStart, week, dayIdx);
    const next = { ...data, checks: { ...data.checks } };
    next.checks[dk] = { ...(next.checks[dk] || {}), [paramId]: !next.checks[dk]?.[paramId] };

    const newScore = params.reduce((sum, p) => sum + (next.checks[dk]?.[p.id] ? 1 : 0), 0);
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

  const disabled0 = dates ? dates.disabledDaysInWeek0 : 0;
  const activeDays = DAYS.reduce((sum, _, i) => sum + (isDayDisabled(week, i, disabled0) ? 0 : 1), 0);
  const weeklyHits = (pid) => {
    if (!dates) return 0;
    return DAYS.reduce((sum, _, i) => {
      const dk = dateKey(dates.gridStart, week, i);
      return sum + (data.checks[dk]?.[pid] ? 1 : 0);
    }, 0);
  };
  const maxHits = params.reduce((sum, p) => sum + Math.min(p.weeklyTarget, activeDays), 0);
  const totalHits = params.reduce((sum, p) => sum + Math.min(weeklyHits(p.id), Math.min(p.weeklyTarget, activeDays)), 0);
  const adherence = maxHits > 0 ? Math.min(100, Math.round((totalHits / maxHits) * 100)) : 0;
  const dayScore = (i) => {
    if (isDayDisabled(week, i, disabled0) || !dates) return -1;
    const dk = dateKey(dates.gridStart, week, i);
    return params.reduce((sum, p) => sum + (data.checks[dk]?.[p.id] ? 1 : 0), 0);
  };

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

  return (
    <div style={s.container}>
      <style>{APP_CSS}</style>

      {celebration && <CelebrationOverlay message={celebration} onClose={() => setCelebration(null)} />}

      <ProgressBar dates={dates} isAnon={isAnon} />

      {/* Upgrade banner for engaged anonymous users */}
      {showUpgradeBanner && (
        <UpgradeBanner onSave={login} onDismiss={() => setBannerDismissed(true)} />
      )}

      {/* Compact top bar: week nav + adherence + sync + menu */}
      <div style={s.topBar}>
        <div style={s.topBarLeft}>
          <button className="rc-weekbtn" style={{ ...s.weekBtnSmall, opacity: week === 0 ? 0.3 : 1, pointerEvents: week === 0 ? "none" : "auto" }} onClick={() => setWeek(Math.max(0, week - 1))}>{"\u2039"}</button>
          <div>
            <span style={s.weekLabel}>{WEEK_LABELS[week]}</span>
            <span style={s.topBarAdherence}>{"\u00B7"} {adherence}%</span>
          </div>
          <button className="rc-weekbtn" style={{ ...s.weekBtnSmall, opacity: week === maxWeek ? 0.3 : 1, pointerEvents: week === maxWeek ? "none" : "auto" }} onClick={() => setWeek(Math.min(maxWeek, week + 1))}>{"\u203A"}</button>
        </div>
        <div style={s.topBarRight}>
          <span style={s.weekDatesCompact}>{getWeekDates(week, dates.gridStart)}</span>
          <span style={{
            ...s.syncDot,
            background: syncState === "synced" ? "#6bff9d" : syncState === "saving" ? "#ffd700" : "#ff4757",
          }} title={syncState === "synced" ? "Synced" : syncState === "saving" ? "Saving..." : "Offline — saved locally"} />
          {isAnon ? (
            <button style={s.signInSmallBtn} onClick={login}>Sign In</button>
          ) : (
            <button style={s.menuBtn} onClick={() => setShowMenu(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF88AD" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Hamburger menu overlay */}
      {showMenu && (
        <div className="rc-menu-overlay" onClick={() => setShowMenu(false)}>
          <div className="rc-menu-panel" onClick={(e) => e.stopPropagation()}>
            <button className="rc-menu-item" onClick={() => { setShowMenu(false); setShowProfile(true); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Profile
            </button>
            {profile?.username && (
              <button className="rc-menu-item" onClick={() => { setShowMenu(false); window.open(`/${profile.username}`, "_blank"); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                Public Page
              </button>
            )}
            <button className="rc-menu-item" onClick={() => { setShowMenu(false); handleExport(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Export Data
            </button>
            <div className="rc-menu-divider" />
            <button className="rc-menu-item" onClick={() => { setShowMenu(false); logout(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Logout
            </button>
            <div className="rc-menu-divider" />
            <button className="rc-menu-item danger" onClick={() => { setShowMenu(false); handleDelete(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              Delete All Data
            </button>
          </div>
        </div>
      )}

      {/* Profile panel (authenticated only) */}
      {showProfile && authenticated && (
        <div style={s.profileOverlay} onClick={() => setShowProfile(false)}>
          <div style={s.profilePanel} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#EF88AD" }}>Profile</h2>
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
                    background: profile.publicProfile !== false ? "rgba(165,56,96,0.3)" : "rgba(165,56,96,0.08)",
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
          </div>
        </div>
      )}

      <div style={s.header}>
        <div style={s.tabs}>
          {["daily", "weekly", "lifts", "notes"].map((t) => (
            <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={s.loading}>Loading…</div>
      ) : tab === "daily" ? (
        <div style={s.content}>
          <div className="rc-grid-header" style={s.gridHeader}>
            <div style={s.paramLabelSpace} />
            {DAYS.map((d, i) => {
              const dis = isDayDisabled(week, i, disabled0);
              const score = dayScore(i);
              const perfect = !dis && score === params.length;
              const colDate = new Date(dates.gridStart);
              colDate.setDate(colDate.getDate() + week * 7 + i);
              const dateLabel = colDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
              return (
                <div key={d} style={{ ...s.dayHeader, opacity: dis ? 0.25 : 1 }}>
                  <span style={{ ...s.dayName, color: perfect ? "#EF88AD" : "#886677" }}>{d}</span>
                  <span style={s.dayDate}>{dateLabel}</span>
                  <span style={{
                    ...s.dayScore,
                    color: dis ? "#332228" : perfect ? "#EF88AD" : score >= params.length - 2 ? "#EF88AD" : "#776655",
                    animation: perfect ? "gentleFloat 2s ease-in-out infinite" : "none",
                  }}>
                    {dis ? "\u2014" : perfect ? "\u{1F496}" : `${score}/${params.length}`}
                  </span>
                </div>
              );
            })}
            <div className="rc-weekly-col-header" style={s.weeklyColHeader}>Wk</div>
          </div>

          {params.map((param) => {
            const hits = weeklyHits(param.id);
            const met = hits >= param.weeklyTarget;
            return (
              <div key={param.id} className="rc-grid-row" style={s.row}>
                <div style={s.paramLabel}>
                  <span style={s.paramIcon}>{param.icon}</span>
                  <div className="rc-param-label-text">
                    <div style={s.paramName}>{param.label}</div>
                    <div style={s.paramSub}>{param.subtext}</div>
                  </div>
                </div>
                {DAYS.map((_, i) => {
                  const dis = isDayDisabled(week, i, disabled0);
                  const dk = dates ? dateKey(dates.gridStart, week, i) : null;
                  const checked = !dis && dk && data.checks[dk]?.[param.id];
                  return (
                    <button key={i}
                      className="rc-cell"
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
                <div className="rc-weekly-count" style={{ ...s.weeklyCount, color: met ? "#EF88AD" : "#887766" }}>
                  {hits}/{param.weeklyTarget}
                </div>
              </div>
            );
          })}

        </div>
      ) : tab === "weekly" ? (
        <div style={s.content}>
          <div className="rc-weekly-grid" style={s.weeklyGrid}>
            {WEEKLY_CHECKINS.map((item) => {
              const prev = prevWeekData?.weekly?.[item.id];
              const cur = data.weekly[item.id];
              return (
                <div key={item.id} style={s.weeklyCard}>
                  <div style={s.weeklyCardHeader}>
                    <span>{item.icon}</span>
                    <span style={s.weeklyCardLabel}>{item.label}</span>
                  </div>
                  {item.type === "number" ? (
                    <>
                      <input type="number" step="0.1" style={s.numInput}
                        value={cur}
                        onChange={(e) => updateWeekly(item.id, e.target.value)}
                        placeholder="\u2014"
                      />
                      {prev && prev !== "" && (
                        <div style={s.weeklyDelta}>
                          {cur && cur !== "" ? (() => {
                            const diff = (parseFloat(cur) - parseFloat(prev)).toFixed(1);
                            const sign = diff > 0 ? "\u2191" : diff < 0 ? "\u2193" : "";
                            return `${sign} ${Math.abs(diff)} from ${prev}`;
                          })() : `last week: ${prev}`}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={s.ratingRow}>
                        {[1, 2, 3, 4, 5].map((v) => (
                          <button key={v}
                            className="rc-rating"
                            style={{ ...s.ratingBtn, ...(cur === v ? s.ratingBtnActive : {}) }}
                            onClick={() => updateWeekly(item.id, v)}
                          >{v}</button>
                        ))}
                      </div>
                      {prev != null && (
                        <div style={s.weeklyDelta}>last week: {prev}</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === "lifts" ? (
        <LiftTracker userId={userId} Storage={Storage} />
      ) : (
        <div style={s.content}>
          <textarea style={s.notesArea} value={data.notes}
            onChange={(e) => updateNotes(e.target.value)}
            placeholder="How did this week go? Energy, hunger, training feels, wins, vibes..."
            maxLength={5000}
          />
        </div>
      )}

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
    borderBottom: "1px solid rgba(165,56,96,0.12)",
    position: "sticky", top: 0, zIndex: 20,
    backdropFilter: "blur(12px)",
  },
  progressHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px",
  },
  progressLabel: { fontSize: "13px", fontWeight: 700, color: "#EF88AD", letterSpacing: "2px" },
  progressMeta: { fontSize: "12px", color: "#886677" },
  progressTrack: {
    position: "relative", height: "8px",
    background: "rgba(165,56,96,0.08)", borderRadius: "4px",
    overflow: "visible", marginBottom: "24px",
  },
  progressFill: {
    height: "100%", borderRadius: "4px", transition: "width 0.6s ease",
    boxShadow: "0 0 16px rgba(165,56,96,0.3)",
  },
  milestone: {
    position: "absolute", top: "-4px", transform: "translateX(-50%)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
  },
  milestoneDot: { width: "16px", height: "16px", borderRadius: "50%", transition: "all 0.3s" },
  milestoneLabel: { fontSize: "10px", fontWeight: 600, letterSpacing: "1px", whiteSpace: "nowrap" },
  progressDates: {
    display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#776655",
  },
  header: {
    borderBottom: "1px solid rgba(165,56,96,0.1)",
  },
  // Keep these for PublicProfile which still uses them
  headerTop: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px",
  },
  title: {
    margin: 0, fontSize: "32px", fontWeight: 800, letterSpacing: "6px", lineHeight: 1,
    fontFamily: "'Playfair Display', Georgia, serif",
    background: "linear-gradient(135deg, #EF88AD, #A53860, #EF88AD)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  },
  subtitle: { margin: "6px 0 0", fontSize: "13px", color: "#886677", letterSpacing: "1px" },
  adherenceRing: {
    position: "relative", width: "70px", height: "70px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  adherenceText: { position: "absolute", fontSize: "16px", fontWeight: 700, color: "#EF88AD" },
  // ─── Compact top bar ───
  topBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 16px",
    background: "rgba(26,10,16,0.9)",
    borderBottom: "1px solid rgba(103,13,47,0.3)",
  },
  topBarLeft: {
    display: "flex", alignItems: "center", gap: "10px",
  },
  topBarRight: {
    display: "flex", alignItems: "center", gap: "10px",
  },
  topBarAdherence: {
    fontSize: "14px", fontWeight: 700, color: "#EF88AD", marginLeft: "6px",
  },
  weekDatesCompact: {
    fontSize: "11px", color: "#887766", display: "none",
  },
  syncDot: {
    width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
    transition: "background 0.3s",
  },
  menuBtn: {
    background: "none", border: "1px solid rgba(103,13,47,0.3)",
    borderRadius: "8px", padding: "6px 8px", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  weekBtnSmall: {
    background: "none", border: "none",
    color: "#EF88AD", padding: "4px 8px",
    cursor: "pointer", fontSize: "18px", fontFamily: "inherit",
  },
  weekRow: { display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" },
  weekBtn: {
    background: "rgba(165,56,96,0.08)", border: "1px solid rgba(165,56,96,0.15)",
    color: "#EF88AD", padding: "8px 16px", borderRadius: "8px",
    cursor: "pointer", fontSize: "18px", fontFamily: "inherit", transition: "all 0.2s",
  },
  weekLabel: { fontSize: "15px", fontWeight: 700, color: "#EF88AD", letterSpacing: "1px" },
  weekDates: { fontSize: "12px", color: "#887766", marginTop: "2px" },
  saveIndicator: { fontSize: "12px", color: "#EF88AD", marginLeft: "auto", opacity: 0.7 },
  tabs: { display: "flex", gap: 0 },
  tab: {
    flex: 1, background: "none", border: "none",
    borderBottom: "2px solid transparent", color: "#887766",
    padding: "12px 0", fontSize: "13px", fontFamily: "inherit",
    letterSpacing: "1px", cursor: "pointer", transition: "all 0.2s",
  },
  tabActive: { color: "#EF88AD", borderBottomColor: "#EF88AD" },
  content: { padding: "16px 12px", overflowX: "auto" },
  loading: { padding: "40px", textAlign: "center", color: "#887766", fontSize: "15px" },
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
  dayDate: { fontSize: "11px", fontWeight: 500, color: "#887766", letterSpacing: "0px" },
  dayScore: { fontSize: "11px", fontWeight: 600 },
  weeklyColHeader: { fontSize: "13px", fontWeight: 700, color: "#886677", textAlign: "center" },
  row: {
    display: "grid", gridTemplateColumns: "minmax(150px, 1fr) repeat(7, 44px) 48px",
    gap: "4px", marginBottom: "6px", alignItems: "center", minWidth: "fit-content",
  },
  paramLabel: { display: "flex", alignItems: "center", gap: "8px", paddingRight: "8px" },
  paramIcon: { fontSize: "18px", flexShrink: 0 },
  paramName: { fontSize: "13px", fontWeight: 600, color: "#e8c8d8", whiteSpace: "nowrap" },
  paramSub: { fontSize: "11px", color: "#887766", whiteSpace: "nowrap" },
  cell: {
    width: "44px", height: "44px",
    border: "1px solid rgba(165,56,96,0.12)", borderRadius: "10px",
    background: "rgba(165,56,96,0.03)", color: "#EF88AD",
    fontSize: "16px", fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s ease", fontFamily: "inherit", padding: 0,
  },
  cellActive: {
    background: "rgba(165,56,96,0.12)", border: "1px solid rgba(165,56,96,0.4)",
    boxShadow: "0 0 12px rgba(165,56,96,0.15)", color: "#EF88AD",
  },
  cellDisabled: {
    background: "rgba(165,56,96,0.01)", border: "1px solid rgba(165,56,96,0.04)",
    cursor: "not-allowed", opacity: 0.2,
  },
  weeklyCount: { fontSize: "13px", fontWeight: 700, textAlign: "center" },
  weeklyGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  weeklyCard: {
    background: "rgba(165,56,96,0.04)", border: "1px solid rgba(165,56,96,0.1)",
    borderRadius: "14px", padding: "16px",
  },
  weeklyCardHeader: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", fontSize: "15px" },
  weeklyCardLabel: { fontWeight: 600, color: "#e8c8d8" },
  numInput: {
    width: "100%", background: "rgba(165,56,96,0.04)", border: "1px solid rgba(165,56,96,0.15)",
    borderRadius: "10px", padding: "10px", color: "#EF88AD",
    fontSize: "20px", fontWeight: 700, fontFamily: "inherit",
    textAlign: "center", outline: "none", boxSizing: "border-box",
  },
  ratingRow: { display: "flex", gap: "6px" },
  ratingBtn: {
    flex: 1, padding: "10px 0", background: "rgba(165,56,96,0.04)",
    border: "1px solid rgba(165,56,96,0.12)", borderRadius: "10px",
    color: "#887766", fontSize: "16px", fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
  },
  ratingBtnActive: {
    background: "rgba(165,56,96,0.15)", border: "1px solid rgba(165,56,96,0.4)", color: "#EF88AD",
  },
  weeklyDelta: {
    fontSize: "11px", color: "#887766", marginTop: "6px", textAlign: "center",
    letterSpacing: "0.3px",
  },
  notesArea: {
    width: "100%", minHeight: "300px",
    background: "rgba(165,56,96,0.03)", border: "1px solid rgba(165,56,96,0.1)",
    borderRadius: "14px", padding: "16px", color: "#e8c8d8",
    fontSize: "15px", fontFamily: "inherit", lineHeight: 1.6,
    resize: "vertical", outline: "none", boxSizing: "border-box",
  },
  loginBtn: {
    background: "linear-gradient(135deg, #A53860, #EF88AD)",
    border: "none", color: "#fff", padding: "14px 40px", borderRadius: "50px",
    fontSize: "16px", fontWeight: 700, cursor: "pointer", letterSpacing: "1px",
    boxShadow: "0 4px 20px rgba(165,56,96,0.4)",
    fontFamily: "inherit",
  },
  userBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 20px",
    background: "rgba(165,56,96,0.04)",
    borderBottom: "1px solid rgba(165,56,96,0.08)",
  },
  userInfo: {
    fontSize: "13px", color: "#EF88AD", fontWeight: 600, letterSpacing: "0.5px",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%",
  },
  logoutBtn: {
    background: "rgba(165,56,96,0.08)", border: "1px solid rgba(165,56,96,0.2)",
    color: "#EF88AD", padding: "6px 16px", borderRadius: "20px",
    fontSize: "12px", fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.5px",
  },
  signInSmallBtn: {
    background: "linear-gradient(135deg, #A53860, #EF88AD)",
    border: "none", color: "#fff", padding: "6px 18px", borderRadius: "20px",
    fontSize: "12px", fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.5px",
    boxShadow: "0 2px 10px rgba(165,56,96,0.3)",
  },
  // Upgrade banner styles
  upgradeBanner: {
    padding: "12px 20px",
    background: "linear-gradient(135deg, rgba(165,56,96,0.12), rgba(103,13,47,0.1))",
    borderBottom: "1px solid rgba(165,56,96,0.2)",
    animation: "slideBannerIn 0.4s ease-out",
  },
  upgradeBannerInner: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: "12px", flexWrap: "wrap",
  },
  upgradeBannerTitle: {
    fontSize: "14px", fontWeight: 700, color: "#EF88AD", marginBottom: "2px",
  },
  upgradeBannerText: {
    fontSize: "12px", color: "#886677",
  },
  upgradeSaveBtn: {
    background: "linear-gradient(135deg, #A53860, #EF88AD)",
    border: "none", color: "#fff", padding: "8px 20px", borderRadius: "20px",
    fontSize: "12px", fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: "0.5px",
    boxShadow: "0 2px 12px rgba(165,56,96,0.3)",
    whiteSpace: "nowrap",
  },
  upgradeDismissBtn: {
    background: "none", border: "1px solid rgba(165,56,96,0.15)",
    color: "#886677", width: "28px", height: "28px", borderRadius: "50%",
    fontSize: "12px", cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center", padding: 0,
    flexShrink: 0,
  },
  // Onboarding styles
  onboardCard: {
    textAlign: "center", padding: "40px 32px", borderRadius: "24px",
    background: "linear-gradient(135deg, rgba(165,56,96,0.1), rgba(103,13,47,0.06))",
    border: "1px solid rgba(165,56,96,0.2)",
    boxShadow: "0 0 60px rgba(165,56,96,0.1)",
    maxWidth: "440px", width: "90%",
  },
  onboardLabel: {
    display: "block", fontSize: "11px", fontWeight: 700, color: "#EF88AD",
    letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px",
    textAlign: "left",
  },
  onboardDateInput: {
    width: "100%", background: "rgba(165,56,96,0.06)", border: "1px solid rgba(165,56,96,0.2)",
    borderRadius: "12px", padding: "12px 16px", color: "#EF88AD",
    fontSize: "16px", fontWeight: 600, fontFamily: "inherit",
    textAlign: "center", outline: "none", boxSizing: "border-box",
    marginBottom: "16px", colorScheme: "dark",
  },
  onboardTextInput: {
    width: "100%", background: "rgba(165,56,96,0.06)", border: "1px solid rgba(165,56,96,0.2)",
    borderRadius: "12px", padding: "12px 16px", color: "#EF88AD",
    fontSize: "16px", fontWeight: 600, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box", marginBottom: "4px",
  },
  onboardNumInput: {
    width: "100%", background: "rgba(165,56,96,0.06)", border: "1px solid rgba(165,56,96,0.2)",
    borderRadius: "12px", padding: "12px 16px", color: "#EF88AD",
    fontSize: "20px", fontWeight: 700, fontFamily: "inherit",
    textAlign: "center", outline: "none", boxSizing: "border-box",
  },
  onboardGoalsGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
    marginBottom: "16px",
  },
  onboardUnit: {
    fontSize: "11px", color: "#887766", marginTop: "4px", textAlign: "center",
  },
  onboardHint: {
    fontSize: "12px", color: "#887766", marginBottom: "16px", textAlign: "left",
  },
  onboardError: {
    fontSize: "13px", color: "#ff4757", marginBottom: "12px", fontWeight: 600,
  },
  onboardPreview: {
    background: "rgba(165,56,96,0.04)", border: "1px solid rgba(165,56,96,0.1)",
    borderRadius: "14px", padding: "16px", marginBottom: "20px",
  },
  onboardPreviewRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "6px 0",
  },
  onboardPreviewLabel: { fontSize: "13px", color: "#886677" },
  onboardPreviewValue: { fontSize: "14px", fontWeight: 600, color: "#EF88AD" },
  profileIconBtn: {
    background: "rgba(165,56,96,0.08)", border: "1px solid rgba(165,56,96,0.15)",
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
    border: "1px solid rgba(165,56,96,0.2)",
    borderRadius: "20px", padding: "28px 24px",
    width: "90%", maxWidth: "380px",
    boxShadow: "0 0 40px rgba(165,56,96,0.1)",
  },
  profileCloseBtn: {
    background: "none", border: "none", color: "#886677",
    fontSize: "18px", cursor: "pointer", padding: "4px 8px",
  },
  profileSection: {
    background: "rgba(165,56,96,0.04)", border: "1px solid rgba(165,56,96,0.08)",
    borderRadius: "12px", padding: "12px 16px",
  },
  profileRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 0", borderBottom: "1px solid rgba(165,56,96,0.06)",
  },
  profileLabel: { fontSize: "13px", color: "#886677" },
  profileVal: { fontSize: "13px", fontWeight: 600, color: "#EF88AD" },
  profileExportBtn: {
    background: "rgba(165,56,96,0.08)", border: "1px solid rgba(165,56,96,0.2)",
    color: "#EF88AD", padding: "12px 20px", borderRadius: "12px",
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
    border: "1px solid rgba(165,56,96,0.2)",
    cursor: "pointer", position: "relative", padding: 0,
    transition: "background 0.2s",
  },
  profileToggleDot: {
    width: "14px", height: "14px", borderRadius: "50%",
    background: "#EF88AD", position: "absolute", top: "2px", left: "2px",
    transition: "transform 0.2s",
  },
};
