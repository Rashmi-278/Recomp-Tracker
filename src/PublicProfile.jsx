import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Storage, computeDates, getDaysElapsed, getWeekDates, isDayDisabled,
  getParams, DAYS, WEEKLY_CHECKINS, initWeekData, s,
} from "./RecompTracker";

export default function PublicProfile() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [userId, setUserId] = useState(null);
  const [week, setWeek] = useState(0);
  const [data, setData] = useState(initWeekData);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [allWeeksData, setAllWeeksData] = useState([]);

  // Lookup username → userId → profile
  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    (async () => {
      const mapping = await Storage.lookupUsername(username);
      if (!mapping) { setNotFound(true); setLoading(false); return; }
      setUserId(mapping.userId);
      const p = await Storage.loadProfile(mapping.userId);
      if (!p || p.publicProfile === false) { setNotFound(true); setLoading(false); return; }
      setProfile(p);
      const d = computeDates(p.startDate);
      const now = new Date();
      const currentWk = now < d.gridStart ? 0 : Math.min(d.totalWeeks - 1, Math.floor((now - d.gridStart) / (1000 * 60 * 60 * 24 * 7)));
      setWeek(currentWk);
      setLoading(false);
    })();
  }, [username]);

  // Load week data
  useEffect(() => {
    if (!userId || !profile) return;
    Storage.load(week, userId).then((saved) => {
      setData(saved || initWeekData());
    });
  }, [week, userId, profile]);

  // Load all weeks data for overall adherence and weekly bars
  useEffect(() => {
    if (!userId || !profile) return;
    const d = computeDates(profile.startDate);
    const now = new Date();
    const currentWkIdx = now < d.gridStart ? 0 : Math.min(d.totalWeeks - 1, Math.floor((now - d.gridStart) / (1000 * 60 * 60 * 24 * 7)));
    Promise.all(
      Array.from({ length: currentWkIdx + 1 }, (_, wk) =>
        Storage.load(wk, userId).then((saved) => saved || initWeekData())
      )
    ).then(setAllWeeksData);
  }, [userId, profile]);

  if (loading) {
    return (
      <div style={{ ...s.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={s.loading}>Loading profile...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ ...s.container, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
        `}</style>
        <h1 style={s.title}>RECOMP</h1>
        <p style={{ color: "#886677", fontSize: "16px" }}>User <strong style={{ color: "#ff85b3" }}>/{username}</strong> not found</p>
        <Link to="/" style={{ color: "#ff6b9d", textDecoration: "none", fontSize: "14px" }}>← Go to tracker</Link>
      </div>
    );
  }

  const dates = computeDates(profile.startDate);
  const params = getParams(profile);
  const disabled0 = dates.disabledDaysInWeek0;
  const WEEK_LABELS = Array.from({ length: dates.totalWeeks }, (_, i) => `Week ${i + 1}`);
  const maxWeek = dates.totalWeeks - 1;

  const weeklyHits = (pid) => data.checks[pid]?.filter(Boolean).length || 0;
  const activeDays = DAYS.reduce((sum, _, i) => sum + (isDayDisabled(week, i, disabled0) ? 0 : 1), 0);
  const totalHits = params.reduce((sum, p) => sum + weeklyHits(p.id), 0);
  const adherence = activeDays > 0 ? Math.min(100, Math.round((totalHits / (params.length * activeDays)) * 100)) : 0;

  // Overall adherence across all weeks loaded so far
  const overallAdherence = (() => {
    if (!allWeeksData.length) return 0;
    let hits = 0, possible = 0;
    allWeeksData.forEach((weekData, wk) => {
      DAYS.forEach((_, dayIdx) => {
        if (isDayDisabled(wk, dayIdx, disabled0)) return;
        possible += params.length;
        params.forEach(p => { if (weekData.checks[p.id]?.[dayIdx]) hits++; });
      });
    });
    return possible > 0 ? Math.min(100, Math.round((hits / possible) * 100)) : 0;
  })();
  const dayScore = (i) => isDayDisabled(week, i, disabled0) ? -1 : params.reduce((sum, p) => sum + (data.checks[p.id]?.[i] ? 1 : 0), 0);

  const elapsed = getDaysElapsed(dates.protocolStart, dates.endDate, dates.totalDays);
  const pct = Math.min(100, Math.round((elapsed / dates.totalDays) * 100));
  const weeksLeft = Math.max(0, Math.ceil((dates.totalDays - elapsed) / 7));

  return (
    <div style={s.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
      `}</style>

      {/* Progress bar */}
      <div style={s.progressWrap}>
        <div style={s.progressHeader}>
          <span style={s.progressLabel}>DAY {elapsed} / {dates.totalDays}</span>
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
        </div>
        <div style={s.progressDates}>
          <span>{dates.startLabel}</span>
          <span style={{ color: "#ff6b9d", fontWeight: 700, fontSize: "12px" }}>/{profile.username}'s recomp</span>
          <span>{dates.endLabel}</span>
        </div>
      </div>

      {/* Public header */}
      <div style={{ ...s.userBar, justifyContent: "center" }}>
        <span style={{ ...s.userInfo, textAlign: "center", maxWidth: "100%" }}>
          {profile.username}'s 12-week recomp · read-only view
        </span>
      </div>

      <div style={s.header}>
        <div style={s.headerTop}>
          <div>
            <h1 style={s.title}>RECOMP</h1>
            <p style={s.subtitle}>{dates.startLabel} – {dates.endLabel}</p>
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
                strokeDasharray={`${(overallAdherence / 100) * 175.9} 175.9`}
                strokeLinecap="round" transform="rotate(-90 35 35)"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            </svg>
            <span style={s.adherenceText}>{overallAdherence}%</span>
          </div>
        </div>

        {allWeeksData.length > 0 && (
          <div style={{ margin: "12px 0 0", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#664455", letterSpacing: "1px", marginBottom: "2px" }}>
              WEEKLY ADHERENCE
            </div>
            {allWeeksData.map((weekData, wk) => {
              let hits = 0, possible = 0;
              DAYS.forEach((_, dayIdx) => {
                if (isDayDisabled(wk, dayIdx, disabled0)) return;
                possible += params.length;
                params.forEach(p => { if (weekData.checks[p.id]?.[dayIdx]) hits++; });
              });
              const pctWk = possible > 0 ? Math.min(100, Math.round((hits / possible) * 100)) : 0;
              const isCurrentWk = wk === week;
              return (
                <div key={wk} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
                  onClick={() => setWeek(wk)}>
                  <span style={{ fontSize: "10px", color: isCurrentWk ? "#ff6b9d" : "#553344", width: "42px", flexShrink: 0, fontWeight: isCurrentWk ? 700 : 400 }}>
                    Wk {wk + 1}
                  </span>
                  <div style={{ flex: 1, height: "6px", background: "rgba(255,107,157,0.08)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: "3px",
                      width: `${pctWk}%`,
                      background: pctWk >= 75 ? "linear-gradient(90deg, #ff6b9d, #e84393)"
                        : pctWk >= 40 ? "linear-gradient(90deg, #ffb6d3, #ff6b9d)"
                        : "rgba(255,107,157,0.3)",
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                  <span style={{ fontSize: "10px", color: isCurrentWk ? "#ff6b9d" : "#664455", width: "32px", textAlign: "right", flexShrink: 0 }}>
                    {pctWk}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={s.weekRow}>
          <button className="rc-weekbtn" style={{ ...s.weekBtn, opacity: week === 0 ? 0.3 : 1, pointerEvents: week === 0 ? "none" : "auto" }} onClick={() => setWeek(Math.max(0, week - 1))}>‹</button>
          <div style={{ textAlign: "center" }}>
            <span style={s.weekLabel}>{WEEK_LABELS[week]}</span>
            <div style={s.weekDates}>{getWeekDates(week, dates.gridStart)}</div>
          </div>
          <button className="rc-weekbtn" style={{ ...s.weekBtn, opacity: week === maxWeek ? 0.3 : 1, pointerEvents: week === maxWeek ? "none" : "auto" }} onClick={() => setWeek(Math.min(maxWeek, week + 1))}>›</button>
        </div>
      </div>

      {/* Read-only daily grid */}
      <div style={s.content}>
        <div style={s.gridHeader}>
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
                <span style={{ ...s.dayName, color: perfect ? "#ff6b9d" : "#886677" }}>{d}</span>
                <span style={s.dayDate}>{dateLabel}</span>
                <span style={{
                  ...s.dayScore,
                  color: dis ? "#332228" : perfect ? "#ff6b9d" : score >= params.length - 2 ? "#ffb6d3" : "#553344",
                }}>
                  {dis ? "—" : perfect ? "💖" : `${score}/${params.length}`}
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
                  <div key={i} style={{
                    ...s.cell,
                    ...(dis ? s.cellDisabled : {}),
                    ...(checked ? s.cellActive : {}),
                    cursor: "default",
                  }}>
                    {dis ? "" : checked ? "♥" : ""}
                  </div>
                );
              })}
              <div style={{ ...s.weeklyCount, color: met ? "#ff6b9d" : "#664455" }}>
                {hits}/{param.weeklyTarget}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center", padding: "20px" }}>
        <Link to="/" style={{ color: "#ff6b9d", textDecoration: "none", fontSize: "14px" }}>Start your own recomp →</Link>
      </div>
    </div>
  );
}
