import { useState, useEffect, useCallback } from "react";

// ─── NLP Parser ───────────────────────────────────────────────────────────────

const EXERCISE_MAP = {
  "farmer": "Farmers Walk",
  "farmers": "Farmers Walk",
  "lat pull": "Lat Pulldown",
  "lat pulldown": "Lat Pulldown",
  "lat pull up": "Lat Pulldown",
  "lat pull-up": "Lat Pulldown",
  "lat pulls": "Lat Pulldown",
  "pull up bar": "Lat Pulldown",
  "pull-up bar": "Lat Pulldown",
  "shoulder press": "Shoulder Press",
  "shoulders press": "Shoulder Press",
  "goblet squat": "Goblet Squat",
  "goblet squats": "Goblet Squat",
  "gob squat": "Goblet Squat",
  "butt hinge": "Butt Hinge",
  "butt hinges": "Butt Hinge",
  "hip hinge": "Butt Hinge",
  "plank": "Plank",
  "row": "Row",
  "pushup": "Pushup",
  "push up": "Pushup",
  "pull up": "Pull Up",
  "pull-up": "Pull Up",
};

function normalizeExerciseName(raw) {
  const lower = raw.toLowerCase().trim();
  for (const [key, val] of Object.entries(EXERCISE_MAP)) {
    if (lower.includes(key)) return val;
  }
  // Title-case the raw string as fallback
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseWeight(str) {
  // Handles "40kg", "40 kg", "40lb", "40 lb", "40Lb", "40KG"
  const m = str.match(/(\d+(?:\.\d+)?)\s*(kg|lb)/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  return { val, unit, kg: unit === "lb" ? +(val * 0.453592).toFixed(2) : val };
}

function parseSetsReps(str) {
  // "3x12", "3X12", "3×12", "3*12", "3 x 12"
  const m = str.match(/(\d+)\s*[xX×*]\s*(\d+)/);
  if (m) return { sets: parseInt(m[1]), reps: parseInt(m[2]) };
  return null;
}

function parseDuration(str) {
  // "45s", "2mins", "2 mins", "2 min", "1:30", "1:30sec"
  const mmss = str.match(/(\d+):(\d+)/);
  if (mmss) return parseInt(mmss[1]) * 60 + parseInt(mmss[2]);
  const mins = str.match(/(\d+(?:\.\d+)?)\s*min/i);
  if (mins) return Math.round(parseFloat(mins[1]) * 60);
  const secs = str.match(/(\d+)\s*s(?:ec)?/i);
  if (secs) return parseInt(secs[1]);
  return null;
}

function parseWorkoutText(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let sessionDate = null;
  const sets = [];
  const unrecognized = [];

  // Date patterns: "Apr 5", "April 5", "Apr 5th", "4/5", "March 5th", "Feb 6"
  const dateRe = /^(?:(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+\d{4})?)/i;

  for (const line of lines) {
    // Check for date header
    const dm = line.match(dateRe);
    if (dm) {
      const year = new Date().getFullYear();
      try {
        const d = new Date(line.replace(/(\d+)(st|nd|rd|th)/i, "$1") + ` ${year}`);
        if (!isNaN(d.getTime())) {
          sessionDate = d.toISOString().slice(0, 10);
          continue;
        }
      } catch {}
    }

    // Identify exercise line: must have a weight or reps indicator
    const hasWeight = /\d+\s*(?:kg|lb)/i.test(line);
    const hasSetsReps = /\d+\s*[xX×*]\s*\d+/.test(line);
    const hasDuration = /\d+\s*(?:min|sec|s\b)/i.test(line) || /\d+:\d+/.test(line);
    const hasReps = /\d+\s*(?:rep|r\b)/i.test(line);

    if (!hasWeight && !hasSetsReps && !hasDuration && !hasReps) {
      // Might be a pure exercise name header (e.g. "Goblet Squat") — skip silently
      continue;
    }

    // Extract exercise name (text before the first number/unit)
    const nameMatch = line.match(/^([a-zA-Z][a-zA-Z\s\-\/]*?)(?:\s+\d|\s+@|\s*$)/);
    if (!nameMatch) { unrecognized.push(line); continue; }

    const exerciseName = normalizeExerciseName(nameMatch[1]);
    const weightInfo = parseWeight(line);
    const srInfo = parseSetsReps(line);
    const dur = parseDuration(line);

    // Reps fallback: standalone number at end
    let reps = srInfo ? srInfo.reps : null;
    if (!reps) {
      const repMatch = line.match(/(\d+)\s*(?:rep|r\b)/i) || line.match(/\s(\d+)\s*$/);
      if (repMatch) reps = parseInt(repMatch[1]);
    }

    sets.push({
      exercise: exerciseName,
      sets: srInfo ? srInfo.sets : 1,
      reps: reps || null,
      weight_kg: weightInfo ? weightInfo.kg : null,
      weight_unit: weightInfo ? weightInfo.unit : null,
      duration_s: dur || null,
    });
  }

  return { sessionDate, sets, unrecognized };
}

// ─── Session merge (Keep Notes append mode) ──────────────────────────────────

function mergeIntoData(existing, todayStr, newSets) {
  const data = existing
    ? { sessions: [...(existing.sessions || [])], progression: { ...(existing.progression || {}) } }
    : { sessions: [], progression: {} };

  // Find or create today's session
  let sessionIdx = data.sessions.findIndex((s) => s.date === todayStr);
  if (sessionIdx === -1) {
    data.sessions.push({ date: todayStr, exercises: {} });
    sessionIdx = data.sessions.length - 1;
  }

  const session = { ...data.sessions[sessionIdx], exercises: { ...data.sessions[sessionIdx].exercises } };

  for (const set of newSets) {
    const name = set.exercise;
    if (!session.exercises[name]) {
      session.exercises[name] = { top_weight_kg: null, sets: [], num_sets: 0, total_volume: 0 };
    }
    const ex = { ...session.exercises[name], sets: [...session.exercises[name].sets] };
    ex.sets.push({
      sets: set.sets,
      reps: set.reps,
      weight_kg: set.weight_kg,
      duration_s: set.duration_s,
    });
    ex.num_sets = ex.sets.length;
    const weights = ex.sets.map((s) => s.weight_kg).filter(Boolean);
    ex.top_weight_kg = weights.length ? Math.max(...weights) : null;
    ex.total_volume = ex.sets.reduce((acc, s) => {
      if (s.weight_kg && s.reps) return acc + s.weight_kg * s.reps * (s.sets || 1);
      return acc;
    }, 0);
    session.exercises[name] = ex;
  }

  data.sessions[sessionIdx] = session;

  // Rebuild progression for affected exercises
  const affectedNames = [...new Set(newSets.map((s) => s.exercise))];
  for (const name of affectedNames) {
    const prog = data.sessions
      .filter((s) => s.exercises[name])
      .map((s) => ({
        date: s.date,
        top_weight_kg: s.exercises[name].top_weight_kg,
        total_volume: s.exercises[name].total_volume,
        num_sets: s.exercises[name].num_sets,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    data.progression[name] = prog;
  }

  return data;
}

// ─── Plateau detection ────────────────────────────────────────────────────────

function detectPlateau(progression) {
  if (!progression || progression.length < 3) return null;
  const recent = progression.slice(-3).map((p) => p.top_weight_kg).filter((w) => w != null);
  if (recent.length < 3) return null;
  if (Math.max(...recent) - Math.min(...recent) <= 0) {
    return { weight: recent[0], sessions: 3 };
  }
  return null;
}

// ─── SVG Line Chart ───────────────────────────────────────────────────────────

function ExerciseChart({ name, progression }) {
  if (!progression || progression.length < 2) return null;

  const W = 280, H = 72, PAD = { top: 8, right: 10, bottom: 20, left: 28 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = progression.map((p) => p.top_weight_kg || 0);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const plateau = detectPlateau(progression);

  const toX = (i) => PAD.left + (i / (progression.length - 1)) * innerW;
  const toY = (v) => PAD.top + innerH - ((v - minV) / range) * innerH;

  const points = progression.map((p, i) => `${toX(i)},${toY(p.top_weight_kg || 0)}`).join(" ");

  // Grid lines — just min and max
  const gridLines = [0, 1].map((t) => {
    const y = PAD.top + innerH * (1 - t);
    const val = minV + range * t;
    return { y, label: val % 1 === 0 ? `${val}` : val.toFixed(1) };
  });

  // X axis labels — first and last only
  const xLabels = [
    { i: 0, label: progression[0].date.slice(5).replace("-", "/") },
    { i: progression.length - 1, label: progression[progression.length - 1].date.slice(5).replace("-", "/") },
  ];

  const delta = values[values.length - 1] - values[0];
  const deltaStr = delta > 0 ? `+${delta}kg` : delta < 0 ? `${delta}kg` : "—";
  const deltaColor = delta > 0 ? "#a8e6a3" : delta < 0 ? "#e68a8a" : "#886677";

  return (
    <div style={{
      background: "rgba(165,56,96,0.02)",
      border: "1px solid rgba(165,56,96,0.08)",
      borderRadius: "12px",
      padding: "10px 12px 8px",
      marginBottom: "8px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#EF88AD" }}>{name}</span>
        <span style={{ fontSize: "11px", fontWeight: 600, color: deltaColor }}>{deltaStr}</span>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", height: "72px" }}>
        {/* Grid lines */}
        {gridLines.map(({ y, label }) => (
          <g key={y}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="rgba(165,56,96,0.06)" strokeWidth="1" />
            <text x={PAD.left - 4} y={y + 3} fontSize="8" fill="#776655" textAnchor="end">{label}</text>
          </g>
        ))}

        {/* Polyline */}
        <polyline points={points} fill="none"
          stroke="rgba(165,56,96,0.5)" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Dots */}
        {progression.map((p, i) => (
          <circle key={i} cx={toX(i)} cy={toY(p.top_weight_kg || 0)}
            r="3" fill="#EF88AD" />
        ))}

        {/* X labels — first and last */}
        {xLabels.map(({ i, label }) => (
          <text key={i} x={toX(i)} y={H - 3} fontSize="8" fill="#776655"
            textAnchor={i === 0 ? "start" : "end"}>{label}</text>
        ))}
      </svg>

      {plateau && (
        <div style={{
          background: "rgba(255,200,50,0.06)",
          border: "1px solid rgba(255,200,50,0.15)",
          borderRadius: "6px",
          padding: "5px 10px",
          fontSize: "11px",
          color: "#d4a800",
          marginTop: "6px",
        }}>
          {`⚡ Plateau: ${plateau.weight}kg × ${plateau.sessions} sessions — try +2.5kg`}
        </div>
      )}
    </div>
  );
}

// ─── Session History Card ─────────────────────────────────────────────────────

function SessionCard({ session }) {
  const [open, setOpen] = useState(false);
  const exerciseNames = Object.keys(session.exercises);
  const summary = exerciseNames.slice(0, 3).map((n) => {
    const ex = session.exercises[n];
    return ex.top_weight_kg ? `${n} ${ex.top_weight_kg}kg` : n;
  }).join(", ");

  const dateLabel = new Date(session.date + "T12:00:00").toLocaleDateString("en-GB", {
    month: "short", day: "numeric",
  });

  return (
    <div style={{ borderBottom: "1px solid rgba(165,56,96,0.06)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "12px 0", display: "flex", justifyContent: "space-between",
          alignItems: "center", color: "#886677", fontSize: "13px", textAlign: "left",
        }}
      >
        <span>
          <span style={{ color: "#EF88AD", marginRight: "8px" }}>{dateLabel}</span>
          <span style={{ color: "#887766", marginRight: "8px" }}>·</span>
          <span>{exerciseNames.length} exercise{exerciseNames.length !== 1 ? "s" : ""}</span>
          <span style={{ color: "#776655", marginLeft: "8px" }}>{summary}{exerciseNames.length > 3 ? " …" : ""}</span>
        </span>
        <span style={{ color: "#887766", fontSize: "11px" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ paddingBottom: "12px" }}>
          {exerciseNames.map((name) => {
            const ex = session.exercises[name];
            return (
              <div key={name} style={{ marginBottom: "8px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#EF88AD", marginBottom: "4px" }}>{name}</div>
                {ex.sets.map((set, i) => (
                  <div key={i} style={{ fontSize: "12px", color: "#887766", paddingLeft: "12px" }}>
                    {set.sets > 1 ? `${set.sets}×` : ""}
                    {set.reps ? `${set.reps} reps` : ""}
                    {set.weight_kg ? ` @ ${set.weight_kg}kg` : ""}
                    {set.duration_s ? ` ${set.duration_s}s` : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Confirmation Card ────────────────────────────────────────────────────────

function ConfirmCard({ parsed, onSave, onClear }) {
  const { sessionDate, sets, unrecognized } = parsed;
  return (
    <div style={{
      background: "rgba(165,56,96,0.04)",
      border: "1px solid rgba(165,56,96,0.1)",
      borderRadius: "14px",
      padding: "16px",
      marginTop: "12px",
    }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "#EF88AD", marginBottom: "12px", letterSpacing: "1px" }}>
        ✓ Parsed{sessionDate ? ` — ${new Date(sessionDate + "T12:00:00").toLocaleDateString("en-GB", { month: "short", day: "numeric" })}` : " — today"}
      </div>

      {sets.map((set, i) => (
        <div key={i} style={{ fontSize: "13px", color: "#e8c8d8", marginBottom: "4px", display: "flex", gap: "8px" }}>
          <span style={{ color: "#886677", minWidth: "140px" }}>{set.exercise}</span>
          <span style={{ color: "#887766" }}>
            {set.sets > 1 ? `${set.sets}×` : ""}
            {set.reps ? `${set.reps}` : ""}
            {set.weight_kg ? ` @ ${set.weight_kg}kg` : ""}
            {set.duration_s ? ` ${set.duration_s}s` : ""}
          </span>
        </div>
      ))}

      {unrecognized.map((line, i) => (
        <div key={i} style={{ fontSize: "11px", color: "#776655", marginTop: "4px" }}>
          unrecognized: {line}
        </div>
      ))}

      <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <button onClick={onSave} style={{
          background: "linear-gradient(135deg, #EF88AD, #A53860)",
          border: "none", color: "#fff",
          padding: "10px 28px", borderRadius: "50px",
          fontSize: "14px", fontWeight: 700, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(165,56,96,0.4)",
        }}>
          ✓ Looks right — save it
        </button>
        <button onClick={onClear} style={{
          background: "rgba(165,56,96,0.08)",
          border: "1px solid rgba(165,56,96,0.15)",
          color: "#EF88AD", borderRadius: "8px",
          padding: "10px 16px", fontSize: "14px", cursor: "pointer",
        }}>
          Clear
        </button>
      </div>
    </div>
  );
}

// ─── Main LiftTracker Component ───────────────────────────────────────────────

export default function LiftTracker({ userId, Storage }) {
  const [loadState, setLoadState] = useState("loading"); // "loading" | "ok" | "error"
  const [data, setData] = useState(null);
  const [inputText, setInputText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // { type: "ok"|"warn"|"error", text }

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const d = await Storage.loadLifts(userId);
      setData(d || { sessions: [], progression: {} });
      setLoadState("ok");
    } catch {
      setLoadState("error");
    }
  }, [userId, Storage]);

  useEffect(() => { load(); }, [load]);

  function handleParse() {
    if (!inputText.trim()) return;
    const result = parseWorkoutText(inputText);
    if (result.sets.length === 0) {
      setSaveMsg({ type: "error", text: "Couldn't parse any exercises. Check the format." });
      return;
    }
    if (!result.sessionDate) result.sessionDate = today;
    setParsed(result);
    setSaveMsg(null);
  }

  async function handleSave() {
    if (!parsed) return;
    setSaving(true);
    setSaveMsg(null);
    const merged = mergeIntoData(data, parsed.sessionDate || today, parsed.sets);
    try {
      await Storage.saveLifts(userId, merged);
      setData(merged);
      setParsed(null);
      setInputText("");
      setSaveMsg({ type: "ok", text: "Saved!" });
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err) {
      if (err.localOnly) {
        setData(merged);
        setParsed(null);
        setInputText("");
        setSaveMsg({ type: "warn", text: "Saved locally · couldn't sync to cloud" });
      } else {
        setSaveMsg({ type: "error", text: "Couldn't save. Try again." });
      }
    }
    setSaving(false);
  }

  function handleClear() {
    setParsed(null);
    setInputText("");
    setSaveMsg(null);
  }

  const PLACEHOLDER = `Apr 5 — gym session
farmer walk — 24kg 50 steps
lat pulls 3x12 @40kg
shoulder press 3x10 @15kg
goblet squat 3x15 @16kg
hip hinge 3x12 @20kg
plank hold 3x45s`;

  const sortedSessions = data ? [...(data.sessions || [])].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const exercisesWithProg = data && data.progression
    ? Object.entries(data.progression).filter(([, prog]) => prog && prog.length >= 1)
    : [];

  // ─── Error state ───
  if (loadState === "error") {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: "24px", marginBottom: "12px" }}>⚠️</div>
        <div style={{ fontSize: "14px", color: "#886677", marginBottom: "16px" }}>
          Couldn't load your lift data.
        </div>
        <button onClick={load} style={{
          background: "rgba(165,56,96,0.08)",
          border: "1px solid rgba(165,56,96,0.15)",
          color: "#EF88AD", borderRadius: "8px",
          padding: "10px 20px", fontSize: "14px", cursor: "pointer",
        }}>
          Retry
        </button>
      </div>
    );
  }

  // ─── Loading state ───
  if (loadState === "loading") {
    return <div style={{ padding: "40px 20px", textAlign: "center", color: "#776655", fontSize: "14px" }}>Loading…</div>;
  }

  return (
    <div style={{ padding: "20px 16px" }}>

      {/* Input area */}
      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder={PLACEHOLDER}
        style={{
          width: "100%", minHeight: "140px", boxSizing: "border-box",
          background: "rgba(165,56,96,0.03)",
          border: "1px solid rgba(165,56,96,0.1)",
          borderRadius: "14px", color: "#e8c8d8",
          fontSize: "14px", fontFamily: "'DM Sans', sans-serif",
          padding: "14px", resize: "vertical", outline: "none",
        }}
      />

      <button
        onClick={handleParse}
        disabled={!inputText.trim() || saving}
        style={{
          marginTop: "10px",
          background: inputText.trim() ? "linear-gradient(135deg, #EF88AD, #A53860)" : "rgba(165,56,96,0.08)",
          border: "none", color: inputText.trim() ? "#fff" : "#887766",
          padding: "10px 28px", borderRadius: "50px",
          fontSize: "14px", fontWeight: 700, cursor: inputText.trim() ? "pointer" : "not-allowed",
          boxShadow: inputText.trim() ? "0 4px 20px rgba(165,56,96,0.3)" : "none",
        }}
      >
        Log it 💪
      </button>

      {/* Save message */}
      {saveMsg && (
        <div style={{
          marginTop: "10px", fontSize: "13px", padding: "8px 12px", borderRadius: "8px",
          background: saveMsg.type === "error" ? "rgba(232,67,147,0.08)" : saveMsg.type === "warn" ? "rgba(255,200,50,0.08)" : "rgba(107,255,157,0.08)",
          border: `1px solid ${saveMsg.type === "error" ? "rgba(232,67,147,0.2)" : saveMsg.type === "warn" ? "rgba(255,200,50,0.2)" : "rgba(107,255,157,0.2)"}`,
          color: saveMsg.type === "error" ? "#A53860" : saveMsg.type === "warn" ? "#d4a800" : "#6bff9d",
        }}>
          {saveMsg.text}
        </div>
      )}

      {/* Confirmation card */}
      {parsed && (
        <ConfirmCard parsed={parsed} onSave={handleSave} onClear={handleClear} />
      )}

      {/* Session history */}
      {sortedSessions.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{
            fontSize: "12px", fontWeight: 700, letterSpacing: "3px",
            color: "#887766", textTransform: "uppercase", marginBottom: "8px",
          }}>
            Session History
          </div>
          {sortedSessions.map((session) => (
            <SessionCard key={session.date} session={session} />
          ))}
        </div>
      )}

      {/* Progression charts */}
      {exercisesWithProg.length > 0 && (
        <div style={{ marginTop: "20px" }}>
          <div style={{
            fontSize: "11px", fontWeight: 700, letterSpacing: "3px",
            color: "#776655", textTransform: "uppercase", marginBottom: "8px",
          }}>
            Progression
          </div>
          {exercisesWithProg.map(([name, prog]) => (
            <ExerciseChart key={name} name={name} progression={prog} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {sortedSessions.length === 0 && !parsed && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#887766", fontSize: "14px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>🏋️‍♀️</div>
          <div style={{ marginBottom: "8px" }}>No gym sessions logged yet.</div>
          <div style={{ color: "#776655", fontSize: "13px" }}>
            Paste your session notes above and hit "Log it".<br />
            Format: exercise name, weight/reps, e.g.<br />
            <code style={{ color: "#886677" }}>shoulder press 3x10 @15kg</code>
          </div>
        </div>
      )}
    </div>
  );
}
