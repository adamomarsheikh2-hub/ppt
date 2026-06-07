import { useState, useEffect } from "react";

// 6 zones: rows [U, M, L], sides [L, R]
// Zone order for cycling rows: 0=Upper, 1=Mid, 2=Lower
const ZONES = [
  { id: "UL", label: "Upper Left",  row: 0, side: "L", x: 30, y: 28 },
  { id: "UR", label: "Upper Right", row: 0, side: "R", x: 70, y: 28 },
  { id: "ML", label: "Mid Left",    row: 1, side: "L", x: 25, y: 50 },
  { id: "MR", label: "Mid Right",   row: 1, side: "R", x: 75, y: 50 },
  { id: "LL", label: "Lower Left",  row: 2, side: "L", x: 32, y: 70 },
  { id: "LR", label: "Lower Right", row: 2, side: "R", x: 68, y: 70 },
];

// 6-session cycle (2 pins/day = 3 days):
// session 0: GHK→L, IPA→R  | session 1: GHK→R, IPA→L
// session 2: GHK→L, IPA→R  | session 3: GHK→R, IPA→L  ...
// Row cycles: session 0→row0, session 1→row1, session 2→row2, session 3→row0 ...
// So row = sessionIndex % 3, side flips every session

function getScheduledZones(sessionIndex) {
  const row = sessionIndex % 3;
  const ghkSide = sessionIndex % 2 === 0 ? "L" : "R";
  const ipaSide = ghkSide === "L" ? "R" : "L";
  const ghkZone = ZONES.find(z => z.row === row && z.side === ghkSide);
  const ipaZone = ZONES.find(z => z.row === row && z.side === ipaSide);
  return { ghk: ghkZone, ipa: ipaZone };
}

const MIN_HOURS = 72;

function hoursAgo(isoString) {
  return (Date.now() - new Date(isoString).getTime()) / 3600000;
}

function formatTime(isoString) {
  const h = hoursAgo(isoString);
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function getCooldownLeft(log) {
  if (!log) return 0;
  return Math.max(0, MIN_HOURS - hoursAgo(log.time));
}

function isReady(log) {
  if (!log) return true;
  return hoursAgo(log.time) >= MIN_HOURS;
}

function fmtCool(h) {
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
}

const COMPOUND_COLORS = {
  GHK: { primary: "#7ec8e3", bg: "#0a2a35", border: "#7ec8e3" },
  IPA: { primary: "#c8a0e8", bg: "#1e0a35", border: "#c8a0e8" },
};

export default function InjectionTracker() {
  const [logs, setLogs]           = useState({});   // { zoneId: { time, count, compound } }
  const [sessionIndex, setSession] = useState(0);
  const [loaded, setLoaded]       = useState(false);
  const [confirming, setConfirm]  = useState(false);
  const [tab, setTab]             = useState("today"); // "today" | "map" | "history"
  const [now, setNow]             = useState(Date.now());

  useEffect(() => {
    try {
      const raw = localStorage.getItem("inj_data");
      if (raw) {
        const d = JSON.parse(raw);
        setLogs(d.logs || {});
        setSession(d.sessionIndex || 0);
      } else {
        // Seed: UR=GHK-Cu, UL=IPA+CJC already pinned today (session index 1)
        const seed = {
          UR: { time: new Date().toISOString(), count: 1, compound: "GHK" },
          UL: { time: new Date().toISOString(), count: 1, compound: "IPA" },
        };
        setLogs(seed);
        setSession(2);
        localStorage.setItem("inj_data", JSON.stringify({ logs: seed, sessionIndex: 2 }));
      }
    } catch {}
    setLoaded(true);
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const persist = (newLogs, newSession) => {
    try {
      localStorage.setItem("inj_data", JSON.stringify({ logs: newLogs, sessionIndex: newSession }));
    } catch {}
  };

  const logSession = () => {
    const { ghk, ipa } = getScheduledZones(sessionIndex);
    const newLogs = {
      ...logs,
      [ghk.id]: { time: new Date().toISOString(), count: (logs[ghk.id]?.count || 0) + 1, compound: "GHK" },
      [ipa.id]: { time: new Date().toISOString(), count: (logs[ipa.id]?.count || 0) + 1, compound: "IPA" },
    };
    const newSession = sessionIndex + 1;
    setLogs(newLogs);
    setSession(newSession);
    persist(newLogs, newSession);
    setConfirm(false);
  };

  const clearAll = () => {
    setLogs({});
    setSession(0);
    persist({}, 0);
  };

  if (!loaded) return <div style={{ color: "#aaa", padding: 40, fontFamily: "monospace" }}>Loading...</div>;

  const { ghk: todayGhk, ipa: todayIpa } = getScheduledZones(sessionIndex);
  const ghkReady = isReady(logs[todayGhk.id]);
  const ipaReady = isReady(logs[todayIpa.id]);
  const bothReady = ghkReady && ipaReady;

  // Next session preview
  const { ghk: nextGhk, ipa: nextIpa } = getScheduledZones(sessionIndex + 1);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090f",
      color: "#e8e8f0",
      fontFamily: "'Courier New', monospace",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "20px 16px 40px",
      maxWidth: 400,
      margin: "0 auto",
    }}>
      {/* Header */}
      <div style={{ fontSize: 10, letterSpacing: 4, color: "#444", marginBottom: 2, textTransform: "uppercase" }}>
        Peptide Rotation
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0", marginBottom: 4 }}>
        Injection Tracker
      </div>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 20 }}>
        Session #{sessionIndex + 1} · Day {Math.ceil((sessionIndex + 1) / 2)}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#111118", borderRadius: 8, padding: 3 }}>
        {[["today", "Today"], ["map", "Map"], ["history", "Log"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "6px 14px", borderRadius: 6, border: "none", fontSize: 11, fontFamily: "'Courier New', monospace",
            background: tab === key ? "#1e1e32" : "transparent",
            color: tab === key ? "#e8e8f0" : "#555",
            cursor: "pointer", fontWeight: tab === key ? 700 : 400,
          }}>{label}</button>
        ))}
      </div>

      {/* TODAY TAB */}
      {tab === "today" && (
        <div style={{ width: "100%" }}>
          {/* Today's pins */}
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#444", marginBottom: 10, textTransform: "uppercase" }}>
            Today's Session
          </div>

          {[{ compound: "GHK", label: "GHK-Cu", zone: todayGhk, ready: ghkReady },
            { compound: "IPA", label: "IPA + CJC", zone: todayIpa, ready: ipaReady }].map(({ compound, label, zone, ready }) => {
            const c = COMPOUND_COLORS[compound];
            const log = logs[zone.id];
            const cool = getCooldownLeft(log);
            return (
              <div key={compound} style={{
                background: c.bg,
                border: `1px solid ${ready ? c.border : "#2a1a0a"}`,
                borderRadius: 12,
                padding: "14px 16px",
                marginBottom: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.primary, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#aaa" }}>→ <span style={{ color: "#e8e8f0" }}>{zone.label}</span></div>
                  {log && <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>Last: {formatTime(log.time)}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  {ready ? (
                    <span style={{ fontSize: 11, color: "#2ecc71", background: "#0d3a1f", padding: "3px 8px", borderRadius: 6 }}>✓ Ready</span>
                  ) : (
                    <span style={{ fontSize: 10, color: "#e67e22" }}>{fmtCool(cool)}</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Log session button */}
          <div style={{ marginTop: 8 }}>
            {confirming ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={logSession} style={btnStyle("#2ecc71")}>✓ Confirm Both Pinned</button>
                <button onClick={() => setConfirm(false)} style={{ ...btnStyle("#555"), flex: "0 0 70px" }}>Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirm(true)}
                disabled={!bothReady}
                style={btnStyle(bothReady ? "#2ecc71" : "#2a2a2a", !bothReady)}
              >
                {bothReady ? "Log This Session" : `Not ready yet`}
              </button>
            )}
          </div>

          {!bothReady && (
            <div style={{ fontSize: 11, color: "#555", textAlign: "center", marginTop: 8 }}>
              {!ghkReady && <div>GHK-Cu ({todayGhk.id}): {fmtCool(getCooldownLeft(logs[todayGhk.id]))} left</div>}
              {!ipaReady && <div>IPA+CJC ({todayIpa.id}): {fmtCool(getCooldownLeft(logs[todayIpa.id]))} left</div>}
            </div>
          )}

          {/* Next session preview */}
          <div style={{
            marginTop: 20,
            background: "#111118",
            border: "1px solid #1e1e2e",
            borderRadius: 10,
            padding: "12px 14px",
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#444", marginBottom: 8, textTransform: "uppercase" }}>Next Session</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 3 }}>
              GHK-Cu → <span style={{ color: "#7ec8e3" }}>{nextGhk.label}</span>
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>
              IPA+CJC → <span style={{ color: "#c8a0e8" }}>{nextIpa.label}</span>
            </div>
          </div>

          {/* Reset */}
          <button onClick={clearAll} style={{
            marginTop: 24, width: "100%", padding: "7px 0", borderRadius: 8,
            border: "1px solid #2a1a1a", background: "transparent",
            color: "#552222", fontSize: 11, fontFamily: "'Courier New', monospace", cursor: "pointer",
          }}>Reset All Data</button>
        </div>
      )}

      {/* MAP TAB */}
      {tab === "map" && (
        <div style={{ width: "100%" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#444", marginBottom: 12, textTransform: "uppercase" }}>Site Map</div>
          <div style={{ position: "relative", width: 200, height: 240, margin: "0 auto 20px" }}>
            <svg width="200" height="240" viewBox="0 0 200 240" style={{ position: "absolute", top: 0, left: 0 }}>
              <ellipse cx="100" cy="120" rx="62" ry="95" fill="#12121e" stroke="#2a2a4a" strokeWidth="1.5" />
              <circle cx="100" cy="120" r="3" fill="#333" stroke="#555" strokeWidth="1" />
              <line x1="100" y1="40" x2="100" y2="200" stroke="#1e1e3a" strokeWidth="1" strokeDasharray="4,4" />
              <line x1="42" y1="82" x2="158" y2="82" stroke="#1e1e3a" strokeWidth="1" strokeDasharray="4,4" />
              <line x1="38" y1="120" x2="162" y2="120" stroke="#1e1e3a" strokeWidth="1" strokeDasharray="4,4" />
              <line x1="42" y1="158" x2="158" y2="158" stroke="#1e1e3a" strokeWidth="1" strokeDasharray="4,4" />
              <circle cx="100" cy="120" r="14" fill="none" stroke="#2a2a4a" strokeWidth="1" strokeDasharray="3,3" />
            </svg>
            {ZONES.map((zone) => {
              const log = logs[zone.id];
              const ready = isReady(log);
              const isTodayGhk = todayGhk.id === zone.id;
              const isTodayIpa = todayIpa.id === zone.id;
              const compound = log?.compound;
              const c = compound ? COMPOUND_COLORS[compound] : null;
              const borderColor = isTodayGhk ? COMPOUND_COLORS.GHK.primary : isTodayIpa ? COMPOUND_COLORS.IPA.primary : ready ? "#2ecc71" : "#e67e22";
              const bg = isTodayGhk ? COMPOUND_COLORS.GHK.bg : isTodayIpa ? COMPOUND_COLORS.IPA.bg : ready ? "#0d3a1f" : "#3a1a0a";

              return (
                <div key={zone.id} style={{
                  position: "absolute",
                  left: `${zone.x}%`, top: `${zone.y}%`,
                  transform: "translate(-50%,-50%)",
                  width: 36, height: 36, borderRadius: "50%",
                  background: bg, border: `2px solid ${borderColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: (isTodayGhk || isTodayIpa) ? `0 0 10px ${borderColor}66` : "none",
                }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: borderColor, lineHeight: 1 }}>{zone.id}</span>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 4 }}>
              <span><span style={{ color: "#7ec8e3" }}>●</span> GHK-Cu site</span>
              <span><span style={{ color: "#c8a0e8" }}>●</span> IPA+CJC site</span>
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              <span><span style={{ color: "#2ecc71" }}>●</span> Ready</span>
              <span><span style={{ color: "#e67e22" }}>●</span> Cooldown</span>
            </div>
          </div>

          {/* Per-zone status */}
          <div style={{ marginTop: 16, background: "#111118", border: "1px solid #1e1e2e", borderRadius: 10, padding: "12px 14px" }}>
            {ZONES.map((zone) => {
              const log = logs[zone.id];
              const ready = isReady(log);
              const cool = getCooldownLeft(log);
              const isTodayGhk = todayGhk.id === zone.id;
              const isTodayIpa = todayIpa.id === zone.id;
              return (
                <div key={zone.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 0", borderBottom: "1px solid #1a1a2a", fontSize: 11,
                }}>
                  <span style={{ color: "#888" }}>
                    {zone.label}
                    {isTodayGhk && <span style={{ color: "#7ec8e3", marginLeft: 6 }}>← GHK</span>}
                    {isTodayIpa && <span style={{ color: "#c8a0e8", marginLeft: 6 }}>← IPA</span>}
                  </span>
                  <span style={{ color: ready ? "#2ecc71" : "#e67e22" }}>
                    {ready ? "Ready" : fmtCool(cool)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div style={{ width: "100%" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#444", marginBottom: 12, textTransform: "uppercase" }}>Pin History</div>
          {ZONES.map((zone) => {
            const log = logs[zone.id];
            if (!log) return null;
            const c = COMPOUND_COLORS[log.compound] || { primary: "#888" };
            return (
              <div key={zone.id} style={{
                background: "#111118", border: "1px solid #1e1e2a", borderRadius: 8,
                padding: "10px 14px", marginBottom: 8,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <span style={{ color: c.primary, fontWeight: 700, fontSize: 12 }}>{log.compound === "GHK" ? "GHK-Cu" : "IPA+CJC"}</span>
                  <span style={{ color: "#555", fontSize: 11, marginLeft: 8 }}>{zone.label}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#aaa" }}>{formatTime(log.time)}</div>
                  <div style={{ fontSize: 10, color: "#555" }}>×{log.count} total</div>
                </div>
              </div>
            );
          })}
          {Object.keys(logs).length === 0 && (
            <div style={{ color: "#444", fontSize: 12, textAlign: "center", padding: 20 }}>No pins logged yet.</div>
          )}
          <div style={{ marginTop: 8, fontSize: 10, color: "#333", textAlign: "center" }}>
            Sessions completed: {sessionIndex}
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(color, disabled = false) {
  return {
    width: "100%", padding: "10px 0", borderRadius: 8,
    border: `1px solid ${disabled ? "#222" : color}`,
    background: disabled ? "#111" : `${color}18`,
    color: disabled ? "#333" : color,
    fontSize: 12, fontFamily: "'Courier New', monospace",
    cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700,
  };
}

