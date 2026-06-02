/* ===== World Cup 2026 Sweepstake ===== */
"use strict";

// Group of 4 -> 6 fixtures (team indices within the group)
const FIXTURES = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
const KO_ROUNDS = ["R32", "R16", "QF", "SF", "3P", "F"];
const KO_LABEL = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", "3P": "3rd-place play-off", F: "Final" };
const KO_ORDER = { R32: 1, R16: 2, QF: 3, SF: 4, "3P": 5, F: 6 };
// Lower rank = better tournament finish (used as last tiebreaker)
const FINISH_RANK = { winner: 1, runnerUp: 2, third: 3, fourth: 4, qf: 5, r16: 6, r32: 7, gs3: 8, gs4: 9 };
const EXIT_LABEL = {
  winner: "Champions", runnerUp: "Runners-up", third: "3rd place", fourth: "4th place",
  qf: "QF exit", r16: "R16 exit", r32: "R32 exit", gs3: "Group 3rd", gs4: "Group 4th"
};

const LS_CONFIG = "wc2026sweep.config";
const LS_SCORER = "wc2026sweep.scorer";
const LS_CURSWEEP = "wc2026sweep.currentSweep";

const GROUP_COLORS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

let HIST = null;       // historical.json
let PUBLISHED = null;  // pristine config2026.json from the repo
let CFG = null;        // working config (may be a local edited copy)
let SCORER = false;
let ARCHIVE_SEL = -1;
let CURRENT_SWEEP = 0; // index into CFG.sweeps
let ACTIVE_VIEW = "ladder"; // ladder | draw | archive | results | setup

/* ---------- bootstrap ---------- */
async function boot() {
  try {
    const bust = "?t=" + Date.now();
    HIST = await fetch("data/historical.json" + bust).then(r => r.json());
    PUBLISHED = await fetch("data/config2026.json" + bust).then(r => r.json());
  } catch (e) {
    document.querySelector("main").innerHTML =
      '<p class="empty-note">Could not load data files. Serve this folder over HTTP (see README).</p>';
    return;
  }
  PUBLISHED = migrate(PUBLISHED);
  const local = localStorage.getItem(LS_CONFIG);
  CFG = migrate(local ? JSON.parse(local) : deepCopy(PUBLISHED));
  SCORER = localStorage.getItem(LS_SCORER) === "1";
  const savedSweep = parseInt(localStorage.getItem(LS_CURSWEEP) || "0", 10);
  CURRENT_SWEEP = Math.min(Math.max(0, savedSweep), CFG.sweeps.length - 1);

  const toggle = document.getElementById("scorerToggle");
  toggle.checked = SCORER;
  toggle.addEventListener("change", () => {
    SCORER = toggle.checked;
    localStorage.setItem(LS_SCORER, SCORER ? "1" : "0");
    renderAll();
  });

  document.getElementById("tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    ACTIVE_VIEW = t.dataset.view;
    if (t.dataset.sweep != null) {
      CURRENT_SWEEP = +t.dataset.sweep;
      localStorage.setItem(LS_CURSWEEP, String(CURRENT_SWEEP));
    }
    renderAll();
  });

  renderAll();
}

function renderAll() {
  renderTabs();
  showActiveView();
  renderStatusBar();
  renderLadder();
  renderDraw();
  renderResults();
  renderSetup();
  renderArchive();
}

function renderTabs() {
  const nav = document.getElementById("tabs");
  const brand = CFG.brand || "Banterade";
  let html = "";
  CFG.sweeps.forEach((sw, i) => {
    const lActive = ACTIVE_VIEW === "ladder" && CURRENT_SWEEP === i;
    const dActive = ACTIVE_VIEW === "draw" && CURRENT_SWEEP === i;
    html += '<button class="tab' + (lActive ? " active" : "") + '" data-view="ladder" data-sweep="' + i + '">Table - ' + esc(sw.name) + "</button>";
    html += '<button class="tab' + (dActive ? " active" : "") + '" data-view="draw" data-sweep="' + i + '">Draw - ' + esc(sw.name) + "</button>";
  });
  html += '<button class="tab' + (ACTIVE_VIEW === "archive" ? " active" : "") + '" data-view="archive">Overall - ' + esc(brand) + "</button>";
  html += '<button class="tab' + (ACTIVE_VIEW === "results" ? " active" : "") + '" data-view="results">Results</button>';
  html += '<button class="tab' + (ACTIVE_VIEW === "setup" ? " active" : "") + '" data-view="setup">Setup</button>';
  nav.innerHTML = html;
}

function showActiveView() {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const el = document.getElementById("view-" + ACTIVE_VIEW);
  if (el) el.classList.remove("hidden");
}

/* ---------- helpers ---------- */
function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function allTeams() {
  const out = [];
  for (const g of Object.keys(CFG.groups)) CFG.groups[g].forEach(t => { if (t) out.push(t); });
  return out;
}
function teamGroupMap() {
  const m = {};
  for (const g of Object.keys(CFG.groups)) CFG.groups[g].forEach(t => { if (t) m[t] = g; });
  return m;
}
function getSweep() { return CFG.sweeps[CURRENT_SWEEP] || null; }
function getPlayers() { const s = getSweep(); return s ? s.players : []; }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "sweep"; }
function firstName(s) { return String(s || "").split(/\s+/)[0]; }
function isDirty() { return JSON.stringify(CFG) !== JSON.stringify(PUBLISHED); }

/* Migrate config from single-player-list (v1) to multi-sweep (v2). */
function migrate(c) {
  if (!c) return c;
  if (!c.sweeps) {
    c.sweeps = [{
      id: "main",
      name: "Sweep",
      players: Array.isArray(c.players) ? c.players : []
    }];
    delete c.players;
  }
  c.sweeps.forEach((s, i) => {
    if (!s.id) s.id = slugify(s.name || ("sweep-" + (i + 1)));
    if (!Array.isArray(s.players)) s.players = [];
    s.players.forEach(p => { if (!Array.isArray(p.nations)) p.nations = []; });
  });
  if (!c.teamRanks) c.teamRanks = {};
  if (!c.brand) c.brand = "Banterade";
  return c;
}

function saveLocal() {
  CFG.lastUpdated = new Date().toISOString();
  localStorage.setItem(LS_CONFIG, JSON.stringify(CFG));
  renderStatusBar();
}

/* ---------- scoring engine ---------- */
function computeTeams() {
  const rules = CFG.pointsRules;
  const teams = {};
  for (const g of Object.keys(CFG.groups)) {
    CFG.groups[g].forEach((name, idx) => {
      if (!name) return;
      teams[name] = {
        name, group: g, idx, played: 0, w: 0, d: 0, l: 0,
        gGf: 0, gGa: 0, tGf: 0, tGa: 0, groupPts: 0,
        groupPos: null, elimPts: 0, exit: null, status: "IN"
      };
    });
  }
  // group matches
  for (const g of Object.keys(CFG.groups)) {
    FIXTURES.forEach((pair, mi) => {
      const id = g + "-" + mi;
      const res = CFG.groupResults[id];
      const tnA = CFG.groups[g][pair[0]], tnB = CFG.groups[g][pair[1]];
      if (!res || !tnA || !tnB || res.a === "" || res.b === "" || res.a == null || res.b == null) return;
      const a = teams[tnA], b = teams[tnB], ga = +res.a, gb = +res.b;
      if (!isFinite(ga) || !isFinite(gb)) return;
      a.played++; b.played++;
      a.gGf += ga; a.gGa += gb; b.gGf += gb; b.gGa += ga;
      a.tGf += ga; a.tGa += gb; b.tGf += gb; b.tGa += ga;
      if (ga > gb) { a.w++; b.l++; a.groupPts += rules.groupWin; }
      else if (gb > ga) { b.w++; a.l++; b.groupPts += rules.groupWin; }
      else { a.d++; b.d++; a.groupPts += rules.groupDraw; b.groupPts += rules.groupDraw; }
    });
  }
  // group positions (group-stage stats only)
  for (const g of Object.keys(CFG.groups)) {
    const gt = Object.values(teams).filter(t => t.group === g);
    gt.sort(cmpGroup);
    gt.forEach((t, i) => { t.groupPos = i + 1; });
  }
  // is the group stage complete? placement points only apply once it is
  const groupStageDone = Object.keys(CFG.groups).every(g => {
    for (let i = 0; i < 6; i++) {
      const r = CFG.groupResults[g + "-" + i];
      if (!r || r.a == null || r.b == null || r.a === "" || r.b === "") return false;
    }
    return true;
  });
  // best 8 of the 12 third-placed teams advance (only meaningful when group stage is done)
  const thirds = Object.values(teams).filter(t => t.groupPos === 3).sort(cmpGroup);
  const advThird = new Set(thirds.slice(0, 8).map(t => t.name));

  // knockout matches
  const koByTeam = {};
  for (const m of CFG.knockoutMatches) {
    if (!m.teamA || !m.teamB || m.scoreA === "" || m.scoreB === "" || m.scoreA == null || m.scoreB == null) continue;
    const a = teams[m.teamA], b = teams[m.teamB];
    const sa = +m.scoreA, sb = +m.scoreB;
    if (!isFinite(sa) || !isFinite(sb)) continue;
    (koByTeam[m.teamA] = koByTeam[m.teamA] || []).push(m);
    (koByTeam[m.teamB] = koByTeam[m.teamB] || []).push(m);
    if (a) { a.tGf += sa; a.tGa += sb; a.played++; }
    if (b) { b.tGf += sb; b.tGa += sa; b.played++; }
  }

  // determine exit + elimination points per team
  for (const t of Object.values(teams)) {
    const koms = (koByTeam[t.name] || []).slice().sort((x, y) => KO_ORDER[x.round] - KO_ORDER[y.round]);
    if (koms.length === 0) {
      // No knockout matches yet — placement only finalised when group stage is complete.
      if (!groupStageDone) { t.exit = "pending"; t.status = "IN"; continue; }
      if (t.groupPos === 4) { t.elimPts = rules.gs4th; t.exit = "gs4"; t.status = "OUT"; }
      else if (t.groupPos === 3) {
        if (advThird.has(t.name)) { t.exit = "advanced"; t.status = "IN"; }
        else { t.elimPts = rules.gs3rd; t.exit = "gs3"; t.status = "OUT"; }
      } else { t.exit = "advanced"; t.status = "IN"; } // 1st/2nd, awaiting R32
      continue;
    }
    const last = koms[koms.length - 1];
    const winner = koWinner(last);
    const won = winner === t.name;
    if (last.round === "F") {
      if (won) { t.elimPts = rules.winner; t.exit = "winner"; }
      else { t.elimPts = rules.runnerUp; t.exit = "runnerUp"; }
      t.status = "OUT";
    } else if (last.round === "3P") {
      if (won) { t.elimPts = rules.third; t.exit = "third"; }
      else { t.elimPts = rules.fourth; t.exit = "fourth"; }
      t.status = "OUT";
    } else if (won) {
      t.exit = "alive-" + last.round; t.status = "IN";
    } else if (last.round === "R32") { t.elimPts = rules.r32Loser; t.exit = "r32"; t.status = "OUT"; }
    else if (last.round === "R16") { t.elimPts = rules.r16Loser; t.exit = "r16"; t.status = "OUT"; }
    else if (last.round === "QF") { t.elimPts = rules.qfLoser; t.exit = "qf"; t.status = "OUT"; }
    else if (last.round === "SF") { t.exit = "sf-lost"; t.status = "IN"; } // awaits 3rd-place match
  }
  for (const t of Object.values(teams)) {
    t.gGd = t.gGf - t.gGa;
    t.tGd = t.tGf - t.tGa;
    t.total = t.groupPts + t.elimPts;
  }
  return teams;
}

function cmpGroup(a, b) {
  return b.groupPts - a.groupPts ||
    (b.gGf - b.gGa) - (a.gGf - a.gGa) ||
    b.gGf - a.gGf ||
    a.name.localeCompare(b.name);
}
function koWinner(m) {
  const sa = +m.scoreA, sb = +m.scoreB;
  if (sa > sb) return m.teamA;
  if (sb > sa) return m.teamB;
  if (m.pensA != null && m.pensB != null && m.pensA !== "" && m.pensB !== "") {
    return +m.pensA > +m.pensB ? m.teamA : m.teamB;
  }
  return null; // drawn, no penalty result entered
}

function computePlayers(teams, players) {
  const rows = (players || []).map(p => {
    const ns = p.nations.filter(Boolean).map(n => teams[n]).filter(Boolean);
    const finishRanks = ns.map(t => FINISH_RANK[t.exit] != null ? FINISH_RANK[t.exit] : 0);
    return {
      name: p.name,
      nations: p.nations.slice(),
      teams: ns,
      pts: sum(ns.map(t => t.total)),
      gd: sum(ns.map(t => t.tGd)),
      gf: sum(ns.map(t => t.tGf)),
      played: sum(ns.map(t => t.played)),
      status: ns.some(t => t.status === "IN") ? "IN" : "OUT",
      bestFinish: finishRanks.length ? Math.min(...finishRanks) : 99
    };
  });
  rows.sort((a, b) =>
    b.pts - a.pts || b.gd - a.gd || b.gf - a.gf ||
    a.bestFinish - b.bestFinish || a.name.localeCompare(b.name));
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    if (!prev || !(r.pts === prev.pts && r.gd === prev.gd && r.gf === prev.gf && r.bestFinish === prev.bestFinish)) {
      rank = i + 1;
    }
    r.rank = rank; prev = r;
  });
  return rows;
}

/* ---------- status bar ---------- */
function renderStatusBar() {
  const bar = document.getElementById("statusBar");
  if (!SCORER) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const dirty = isDirty();
  bar.className = "status-bar " + (dirty ? "dirty" : "clean");
  if (dirty) {
    bar.innerHTML =
      '<span>You have local changes that are not published. ' +
      'Export the file and commit it to publish for everyone.</span>' +
      '<span class="row-actions" style="margin:0">' +
      '<button class="btn" id="btnExport">Export config2026.json</button>' +
      '<button class="btn secondary" id="btnRevert">Discard local changes</button>' +
      '</span>';
    bar.querySelector("#btnExport").onclick = exportConfig;
    bar.querySelector("#btnRevert").onclick = () => {
      if (confirm("Discard your local changes and revert to the published data?")) {
        CFG = migrate(deepCopy(PUBLISHED));
        CURRENT_SWEEP = Math.min(CURRENT_SWEEP, CFG.sweeps.length - 1);
        localStorage.removeItem(LS_CONFIG);
        renderAll();
      }
    };
  } else {
    bar.innerHTML =
      '<span>Admin mode on. Local data matches the published file.</span>' +
      '<span class="row-actions" style="margin:0">' +
      '<button class="btn secondary" id="btnImport">Import config2026.json</button>' +
      '</span>';
    bar.querySelector("#btnImport").onclick = importConfig;
  }
}

function exportConfig() {
  CFG.lastUpdated = new Date().toISOString();
  const blob = new Blob([JSON.stringify(CFG, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "config2026.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
function importConfig() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "application/json";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        CFG = migrate(JSON.parse(reader.result));
        CURRENT_SWEEP = Math.min(CURRENT_SWEEP, CFG.sweeps.length - 1);
        saveLocal(); renderAll();
        alert("Imported.");
      } catch (e) { alert("Could not read that file: " + e.message); }
    };
    reader.readAsText(f);
  };
  inp.click();
}

/* ---------- Live Ladder ---------- */
function renderLadder() {
  const teams = computeTeams();
  const sweep = getSweep();
  const players = getPlayers();
  const rows = computePlayers(teams, players);
  const hasTeams = allTeams().length > 0;
  const setupDone = players.some(p => p.nations.filter(Boolean).length > 0);
  const sweepLabel = sweep ? sweep.name : "—";
  const updated = CFG.lastUpdated
    ? new Date(CFG.lastUpdated).toLocaleString()
    : "not yet updated";

  let body;
  if (!hasTeams || !setupDone) {
    body = '<p class="empty-note">No players or nations set up yet for this sweep. ' +
      'Turn on <strong>Admin mode</strong> and open the <strong>Setup</strong> tab to add players.</p>';
  } else {
    body = rows.map(r => {
      const chips = r.nations.map(n => {
        if (!n) return '<span class="chip">—</span>';
        const t = teams[n];
        if (!t) return '<span class="chip">' + esc(n) + "</span>";
        const cls = t.status === "OUT" ? "chip out" : "chip";
        return '<span class="' + cls + '">' + esc(n) +
          '<span class="chip-pts">' + t.total + "</span></span>";
      }).join("");
      const tag = r.status === "IN"
        ? '<span class="tag-in">IN</span>' : '<span class="tag-out">OUT</span>';
      return (
        '<tr class="rank-' + r.rank + '">' +
        '<td class="num"><span class="rank-badge">' + r.rank + "</span></td>" +
        '<td><div class="player-name">' + esc(r.name) + "</div>" +
        '<div class="team-chips">' + chips + "</div></td>" +
        '<td class="num pts-big">' + r.pts + "</td>" +
        '<td class="num">' + (r.gd > 0 ? "+" : "") + r.gd + "</td>" +
        '<td class="num col-gf">' + r.gf + "</td>" +
        '<td class="num">' + tag + "</td>" +
        "</tr>"
      );
    }).join("");
    body =
      '<table class="ladder"><thead><tr>' +
      '<th class="num">#</th><th>Player &amp; nations</th>' +
      '<th class="num">Pts</th><th class="num">GD</th>' +
      '<th class="num col-gf">GF</th><th class="num">Status</th>' +
      "</tr></thead><tbody>" + body + "</tbody></table>";
  }

  document.getElementById("view-ladder").innerHTML =
    '<div class="row-actions">' +
    '<button class="btn" id="btnShot">📸 Download ladder screenshot</button>' +
    "</div>" +
    '<div id="ladderCapture" class="ladder-capture">' +
    '<div class="ladder-head"><h2>World Cup 2026 — ' + esc(sweepLabel) + "</h2>" +
    '<span class="ladder-updated">Updated: ' + esc(updated) + "</span></div>" +
    body +
    "</div>" +
    '<p class="section-sub" style="margin-top:12px">Tiebreakers: points, then goal difference, ' +
    "then goals for, then best individual team finish.</p>";

  document.getElementById("btnShot").onclick = screenshotLadder;
}

function screenshotLadder() {
  const node = document.getElementById("ladderCapture");
  if (typeof html2canvas !== "function") {
    alert("Screenshot library not loaded (needs an internet connection on first load).");
    return;
  }
  html2canvas(node, { backgroundColor: null, scale: 2 }).then(canvas => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    const sweep = getSweep();
    const slug = sweep ? slugify(sweep.name) : "ladder";
    a.download = "wc2026-" + slug + "-" + new Date().toISOString().slice(0, 10) + ".png";
    a.click();
  }).catch(e => alert("Screenshot failed: " + e.message));
}

/* ---------- Results ---------- */
function renderResults() {
  const view = document.getElementById("view-results");
  const teams = computeTeams();
  const ro = !SCORER;
  if (allTeams().length === 0) {
    view.innerHTML = '<p class="empty-note">Enter the teams and groups in the <strong>Setup</strong> tab first.</p>';
    return;
  }
  const dis = ro ? " disabled" : "";

  // group fixtures
  let groupsHtml = "";
  for (const g of Object.keys(CFG.groups)) {
    const gteams = CFG.groups[g];
    if (gteams.filter(Boolean).length < 4) continue;
    let matches = "";
    FIXTURES.forEach((pair, mi) => {
      const id = g + "-" + mi;
      const res = CFG.groupResults[id] || {};
      matches +=
        '<div class="match-row">' +
        '<span class="t-home">' + esc(gteams[pair[0]]) + "</span>" +
        '<input type="number" min="0" data-gr="' + id + '" data-side="a" value="' +
        (res.a != null ? res.a : "") + '"' + dis + ">" +
        '<span class="vs">v</span>' +
        '<input type="number" min="0" data-gr="' + id + '" data-side="b" value="' +
        (res.b != null ? res.b : "") + '"' + dis + ">" +
        '<span class="t-away">' + esc(gteams[pair[1]]) + "</span>" +
        "</div>";
    });
    // mini standings
    const gt = Object.values(teams).filter(t => t.group === g).sort(cmpGroup);
    let standRows = "";
    gt.forEach((t, i) => {
      const cls = i < 2 ? "adv" : (i === 2 ? "adv3" : "");
      standRows +=
        '<tr class="' + cls + '"><td class="team-cell">' + (i + 1) + ". " + esc(t.name) + "</td>" +
        "<td>" + t.played + "</td><td>" + t.w + "</td><td>" + t.d + "</td><td>" + t.l + "</td>" +
        "<td>" + (t.gGd > 0 ? "+" : "") + t.gGd + "</td><td><strong>" + t.groupPts + "</strong></td></tr>";
    });
    groupsHtml +=
      '<div class="group-block"><div class="group-title">Group ' + g + "</div>" +
      '<div class="group-body">' + matches +
      '<table class="mini-standings"><thead><tr>' +
      "<th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>" +
      "</tr></thead><tbody>" + standRows + "</tbody></table></div></div>";
  }

  // knockout matches
  const teamOpts = ['<option value="">— team —</option>']
    .concat(allTeams().sort().map(t => '<option value="' + esc(t) + '">' + esc(t) + "</option>"))
    .join("");
  let koHtml = CFG.knockoutMatches.map((m, i) => {
    const roundOpts = KO_ROUNDS.map(r =>
      '<option value="' + r + '"' + (m.round === r ? " selected" : "") + ">" + r + "</option>").join("");
    const selA = teamOpts.replace('value="' + esc(m.teamA) + '"', 'value="' + esc(m.teamA) + '" selected');
    const selB = teamOpts.replace('value="' + esc(m.teamB) + '"', 'value="' + esc(m.teamB) + '" selected');
    return (
      '<div class="ko-match">' +
      '<select data-ko="' + i + '" data-f="round"' + dis + ">" + roundOpts + "</select>" +
      '<select data-ko="' + i + '" data-f="teamA"' + dis + ">" + selA + "</select>" +
      '<input type="number" min="0" data-ko="' + i + '" data-f="scoreA" value="' +
      (m.scoreA != null ? m.scoreA : "") + '"' + dis + ">" +
      '<span class="vs">v</span>' +
      '<input type="number" min="0" data-ko="' + i + '" data-f="scoreB" value="' +
      (m.scoreB != null ? m.scoreB : "") + '"' + dis + ">" +
      '<select data-ko="' + i + '" data-f="teamB"' + dis + ">" + selB + "</select>" +
      '<span class="pens">pens ' +
      '<input type="number" min="0" style="width:30px" data-ko="' + i + '" data-f="pensA" value="' +
      (m.pensA != null ? m.pensA : "") + '"' + dis + ">-" +
      '<input type="number" min="0" style="width:30px" data-ko="' + i + '" data-f="pensB" value="' +
      (m.pensB != null ? m.pensB : "") + '"' + dis + "></span>" +
      (ro ? "<span></span>" : '<button class="btn danger" data-kodel="' + i + '">✕</button>') +
      "</div>"
    );
  }).join("");
  if (!koHtml) koHtml = '<p class="section-sub">No knockout matches added yet.</p>';

  view.innerHTML =
    "<h2>Match results</h2>" +
    '<p class="section-sub">' +
    (ro ? "Read-only. Turn on Scorer mode to edit." : "Enter scores below — the ladder updates live.") +
    "</p>" +
    '<div class="card"><h2>Group stage</h2>' + (groupsHtml || '<p class="section-sub">Complete all four teams in a group to see its fixtures.</p>') + "</div>" +
    '<div class="card"><h2>Knockout stage</h2>' +
    '<p class="ko-legend">Add each knockout match, pick the two teams and enter the score. ' +
    "For a draw, enter the penalty shoot-out result. Rounds: R32 → R16 → QF → SF → 3P (3rd place) → F (final).</p>" +
    koHtml +
    (ro ? "" : '<div class="row-actions" style="margin-top:12px">' +
      '<button class="btn" id="btnAddKo">+ Add knockout match</button></div>') +
    "</div>";

  if (!ro) {
    view.querySelectorAll("input, select").forEach(elm => {
      const ev = elm.tagName === "SELECT" ? "change" : "input";
      elm.addEventListener(ev, onResultEdit);
    });
    view.querySelectorAll("[data-kodel]").forEach(b => {
      b.onclick = () => {
        CFG.knockoutMatches.splice(+b.dataset.kodel, 1);
        saveLocal(); renderResults(); renderLadder();
      };
    });
    const add = view.querySelector("#btnAddKo");
    if (add) add.onclick = () => {
      CFG.knockoutMatches.push({ round: "R32", teamA: "", teamB: "", scoreA: null, scoreB: null, pensA: null, pensB: null });
      saveLocal(); renderResults();
    };
  }
}

function onResultEdit(e) {
  const t = e.target;
  if (t.dataset.gr != null) {
    const id = t.dataset.gr;
    CFG.groupResults[id] = CFG.groupResults[id] || { a: null, b: null };
    CFG.groupResults[id][t.dataset.side] = t.value === "" ? null : t.value;
  } else if (t.dataset.ko != null) {
    const m = CFG.knockoutMatches[+t.dataset.ko];
    m[t.dataset.f] = t.value === "" ? null : t.value;
  }
  saveLocal();
  renderLadder();
}

/* ---------- Draw view ---------- */
function renderDraw() {
  const view = document.getElementById("view-draw");
  const sweep = getSweep();
  if (!sweep || sweep.players.length === 0) {
    view.innerHTML = '<p class="empty-note">No players in this sweep yet. ' +
      'Add some in <strong>Setup</strong> (Admin mode).</p>';
    return;
  }
  const tg = teamGroupMap();
  const ranks = CFG.teamRanks || {};
  const maxN = sweep.players.reduce((m, p) => Math.max(m, p.nations.length), 0);

  const allRanked = sweep.players.every(p =>
    p.nations.filter(Boolean).every(n => ranks[n] != null));
  const anyPicks = sweep.players.some(p => p.nations.filter(Boolean).length > 0);

  // table head
  let head = "<th>Player</th>";
  for (let i = 0; i < maxN; i++) head += "<th>Pick " + (i + 1) + "</th>";

  // rows
  const rowsHtml = sweep.players.map(p => {
    let cells = "";
    for (let i = 0; i < maxN; i++) {
      const n = p.nations[i];
      if (!n) { cells += '<td class="pick"><div class="chip empty">—</div></td>'; continue; }
      const g = tg[n] || "";
      const r = ranks[n];
      cells += '<td class="pick"><div class="chip"' +
        (g ? ' style="--gc:var(--gC-' + g + ')"' : '') + ">" +
        '<div class="team">' + esc(n) + "</div>" +
        '<div class="meta">' +
        (g ? '<span class="grp">Grp ' + g + "</span>" : '') +
        (r != null ? '<span class="rank">FIFA <b>#' + r + "</b></span>" : '') +
        "</div></div></td>";
    }
    return '<tr><td class="name-cell">' + esc(p.name) + "</td>" + cells + "</tr>";
  }).join("");

  // draw strength (only when all picks have ranks)
  let standingsHtml = "";
  if (allRanked && anyPicks) {
    const totals = sweep.players.map(p => {
      const ranked = p.nations.filter(n => n && ranks[n] != null);
      const s = ranked.reduce((a, n) => a + ranks[n], 0);
      return { name: p.name, sum: s, count: ranked.length };
    }).filter(t => t.count > 0).sort((a, b) => a.sum - b.sum);
    if (totals.length > 1) {
      const max = Math.max(...totals.map(t => t.sum));
      const min = Math.min(...totals.map(t => t.sum));
      const range = max - min || 1;
      standingsHtml =
        '<h2 class="section-title">Draw Strength</h2>' +
        '<p class="section-note">Sum of FIFA rankings — the lower the total, the stronger the squad drawn. Best draw highlighted in gold.</p>' +
        '<div class="standings">' +
        totals.map((t, i) => {
          const pct = 8 + 88 * (max - t.sum) / range;
          const avg = (t.sum / t.count).toFixed(1);
          return '<div class="scard' + (i === 0 ? " lead" : "") + '">' +
            '<div class="top"><span class="pos">' + (i + 1) + "</span>" +
            '<span class="who">' + esc(t.name) + "</span></div>" +
            '<div class="stat"><span class="big">' + t.sum + "</span>" +
            '<span class="avg">avg #' + avg + "</span></div>" +
            '<div class="lab">Combined FIFA rank</div>' +
            '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
        }).join("") +
        "</div>";
    }
  }

  // legend
  const tg2 = teamGroupMap();
  const byGroup = {};
  for (const g of Object.keys(CFG.groups)) {
    byGroup[g] = CFG.groups[g].filter(Boolean);
  }
  const legendHtml =
    '<div class="legend">' +
    Object.keys(byGroup).map(g =>
      '<div class="lg" style="--gc:var(--gC-' + g + ')">' +
      '<span class="dot"></span><b>' + g + "</b>&nbsp;" +
      esc(byGroup[g].join(" / ")) + "</div>").join("") +
    "</div>";

  view.innerHTML =
    '<div class="draw-wrap">' +
    "<h2>The Draw — " + esc(sweep.name) + "</h2>" +
    '<p class="section-sub">Every pick mapped to its group A → L' +
    (Object.keys(ranks).length ? " and FIFA World Ranking" : "") + ".</p>" +
    '<div class="draw-scroller"><table class="draw-table"><thead><tr>' +
    head + "</tr></thead><tbody>" + rowsHtml + "</tbody></table></div>" +
    standingsHtml +
    legendHtml +
    "</div>";
}

/* ---------- Setup ---------- */
function renderSetup() {
  const view = document.getElementById("view-setup");
  const ro = !SCORER;
  const dis = ro ? " disabled" : "";

  // groups
  let groupsHtml = "";
  for (const g of Object.keys(CFG.groups)) {
    let slots = "";
    CFG.groups[g].forEach((name, slot) => {
      slots += '<input type="text" placeholder="Team ' + (slot + 1) + '" ' +
        'data-grp="' + g + '" data-slot="' + slot + '" value="' + esc(name) + '"' + dis + ">";
    });
    groupsHtml +=
      '<div class="setup-group"><div class="group-title">Group ' + g + "</div>" +
      '<div class="group-body">' + slots + "</div></div>";
  }

  const teamOpts = allTeams().sort();

  // sweeps
  let sweepsHtml = "";
  CFG.sweeps.forEach((sw, si) => {
    const isCur = si === CURRENT_SWEEP;
    const assigned = {};
    sw.players.forEach(p => p.nations.forEach(n => { if (n) assigned[n] = (assigned[n] || 0) + 1; }));
    const dups = Object.keys(assigned).filter(k => assigned[k] > 1);
    const totalPicks = sum(sw.players.map(p => p.nations.filter(Boolean).length));

    let playersHtml = "";
    sw.players.forEach((p, pi) => {
      let picks = "";
      p.nations.forEach((n, ni) => {
        const opts = ['<option value="">— pick nation —</option>']
          .concat(teamOpts.map(t =>
            '<option value="' + esc(t) + '"' + (t === n ? " selected" : "") + ">" +
            esc(t) + (assigned[t] > 1 && t === n ? " ⚠" : "") + "</option>")).join("");
        picks +=
          '<div class="nation-pick">' +
          '<select data-sw="' + si + '" data-pl="' + pi + '" data-nat="' + ni + '"' + dis + ">" + opts + "</select>" +
          (ro ? "" : '<button class="btn-x" data-rmnat="' + si + ":" + pi + ":" + ni + '" title="Remove pick">✕</button>') +
          "</div>";
      });
      playersHtml +=
        '<div class="player-setup">' +
        '<div class="player-head">' +
        '<input type="text" data-pl-name="' + si + ":" + pi + '" value="' + esc(p.name) + '" placeholder="Player name"' + dis + ">" +
        '<span class="section-sub" style="margin:0">' + p.nations.filter(Boolean).length + " nations</span>" +
        (ro ? "" :
          '<button class="btn-x" data-addnat="' + si + ":" + pi + '" title="Add a pick slot">+ pick</button>' +
          '<button class="btn-x danger" data-rmpl="' + si + ":" + pi + '" title="Remove player">✕</button>') +
        "</div>" +
        '<div class="nation-picks">' + picks + "</div></div>";
    });

    let summary = '<div class="assign-summary">' +
      sw.players.length + " players · " + totalPicks + " picks · " +
      Object.keys(assigned).length + " distinct nations chosen";
    if (dups.length) summary += ' · <span class="warn">Duplicates: ' + esc(dups.join(", ")) + "</span>";
    else if (totalPicks > 0 && totalPicks === Object.keys(assigned).length)
      summary += ' · <span class="ok">No duplicates ✓</span>';
    summary += "</div>";

    sweepsHtml +=
      '<div class="sweep-block' + (isCur ? " current" : "") + '">' +
      '<div class="sweep-block-head">' +
      '<input type="text" class="sweep-rename" data-swname="' + si + '" value="' + esc(sw.name) + '"' + dis + ">" +
      (isCur
        ? '<span class="tag-current">Currently viewing</span>'
        : '<button class="btn secondary" data-swselect="' + si + '">View this sweep</button>') +
      (ro || CFG.sweeps.length <= 1 ? "" :
        '<button class="btn danger" data-delsw="' + si + '">Delete sweep</button>') +
      "</div>" +
      summary +
      '<div class="sweep-players">' + playersHtml + "</div>" +
      (ro ? "" :
        '<div class="row-actions" style="margin-top:8px">' +
        '<button class="btn secondary" data-addpl="' + si + '">+ Add player</button></div>') +
      "</div>";
  });

  // header / intro
  view.innerHTML =
    "<h2>Setup</h2>" +
    '<p class="section-sub">' +
    (ro ? "Read-only. Turn on Admin mode to edit."
        : "Manage the shared draw (groups) and one or more sweeps. Match results live on the Results tab and apply to every sweep at once.") +
    "</p>" +
    '<div class="card"><h2>Groups &amp; draw <span class="section-sub" style="display:inline">· shared across all sweeps</span></h2>' +
    '<div class="setup-grid">' + groupsHtml + "</div></div>" +
    '<div class="card"><h2>Sweeps</h2>' + sweepsHtml +
    (ro ? "" :
      '<div class="row-actions" style="margin-top:14px">' +
      '<button class="btn" id="addSweep">+ Add new sweep</button></div>') +
    "</div>";

  if (ro) return;

  // ---- handlers ----
  view.querySelectorAll("input[data-grp]").forEach(inp => {
    inp.addEventListener("change", () => {
      CFG.groups[inp.dataset.grp][+inp.dataset.slot] = inp.value.trim();
      saveLocal(); renderAll();
    });
  });
  view.querySelectorAll("[data-swname]").forEach(inp => {
    inp.addEventListener("change", () => {
      CFG.sweeps[+inp.dataset.swname].name = inp.value.trim() || "Sweep";
      saveLocal(); renderAll();
    });
  });
  view.querySelectorAll("[data-swselect]").forEach(btn => {
    btn.onclick = () => {
      CURRENT_SWEEP = +btn.dataset.swselect;
      localStorage.setItem(LS_CURSWEEP, String(CURRENT_SWEEP));
      ACTIVE_VIEW = "ladder";
      renderAll();
    };
  });
  view.querySelectorAll("[data-delsw]").forEach(btn => {
    btn.onclick = () => {
      const i = +btn.dataset.delsw;
      const nm = CFG.sweeps[i].name;
      if (CFG.sweeps.length <= 1) { alert("Cannot delete the last sweep."); return; }
      if (!confirm('Delete sweep "' + nm + '"? This removes all its players.')) return;
      CFG.sweeps.splice(i, 1);
      if (CURRENT_SWEEP >= CFG.sweeps.length) CURRENT_SWEEP = CFG.sweeps.length - 1;
      localStorage.setItem(LS_CURSWEEP, String(CURRENT_SWEEP));
      saveLocal(); renderAll();
    };
  });
  view.querySelectorAll("[data-pl-name]").forEach(inp => {
    inp.addEventListener("change", () => {
      const [si, pi] = inp.dataset.plName.split(":").map(Number);
      CFG.sweeps[si].players[pi].name = inp.value.trim();
      saveLocal(); renderAll();
    });
  });
  view.querySelectorAll("[data-sw][data-pl][data-nat]").forEach(sel => {
    sel.addEventListener("change", () => {
      const si = +sel.dataset.sw, pi = +sel.dataset.pl, ni = +sel.dataset.nat;
      CFG.sweeps[si].players[pi].nations[ni] = sel.value;
      saveLocal(); renderAll();
    });
  });
  view.querySelectorAll("[data-rmnat]").forEach(btn => {
    btn.onclick = () => {
      const [si, pi, ni] = btn.dataset.rmnat.split(":").map(Number);
      CFG.sweeps[si].players[pi].nations.splice(ni, 1);
      saveLocal(); renderAll();
    };
  });
  view.querySelectorAll("[data-addnat]").forEach(btn => {
    btn.onclick = () => {
      const [si, pi] = btn.dataset.addnat.split(":").map(Number);
      CFG.sweeps[si].players[pi].nations.push("");
      saveLocal(); renderAll();
    };
  });
  view.querySelectorAll("[data-rmpl]").forEach(btn => {
    btn.onclick = () => {
      const [si, pi] = btn.dataset.rmpl.split(":").map(Number);
      const nm = CFG.sweeps[si].players[pi].name || "this player";
      if (!confirm("Remove " + nm + "?")) return;
      CFG.sweeps[si].players.splice(pi, 1);
      saveLocal(); renderAll();
    };
  });
  view.querySelectorAll("[data-addpl]").forEach(btn => {
    btn.onclick = () => {
      const si = +btn.dataset.addpl;
      const n = CFG.sweeps[si].players[0] ? CFG.sweeps[si].players[0].nations.length : 6;
      CFG.sweeps[si].players.push({ name: "New player", nations: new Array(n).fill("") });
      saveLocal(); renderAll();
    };
  });
  const add = view.querySelector("#addSweep");
  if (add) add.onclick = () => {
    const nm = (prompt("Name for the new sweep:", "New Sweep") || "").trim();
    if (!nm) return;
    const ppl = parseInt(prompt("How many players?", "8"), 10);
    const nat = parseInt(prompt("Nations per player?", "6"), 10);
    if (!ppl || !nat || ppl < 1 || nat < 1) return;
    const players = [];
    for (let i = 0; i < ppl; i++) players.push({ name: "Player " + (i + 1), nations: new Array(nat).fill("") });
    CFG.sweeps.push({ id: slugify(nm) + "-" + Date.now().toString(36), name: nm, players });
    CURRENT_SWEEP = CFG.sweeps.length - 1;
    localStorage.setItem(LS_CURSWEEP, String(CURRENT_SWEEP));
    saveLocal(); renderAll();
  };
}

/* ---------- Archive ---------- */
function renderArchive() {
  const view = document.getElementById("view-archive");
  const ts = HIST.tournaments;
  const tabs =
    '<button class="archive-tab' + (ARCHIVE_SEL === -1 ? " active" : "") +
    '" data-arch="-1">🏆 Overall</button>' +
    ts.map((t, i) =>
      '<button class="archive-tab' + (i === ARCHIVE_SEL ? " active" : "") +
      '" data-arch="' + i + '">' + esc(t.name) + "</button>").join("");

  let body;
  if (ARCHIVE_SEL === -1) {
    body = renderHonours(ts);
  } else {
    body = renderTournament(ts[ARCHIVE_SEL]);
  }

  view.innerHTML =
    "<h2>Overall - " + esc(CFG.brand || "Banterade") + "</h2>" +
    '<p class="section-sub">Honours board, most-picked nations, and the full record from every past sweepstake.</p>' +
    '<div class="archive-tabs">' + tabs + "</div>" + body;

  view.querySelectorAll("[data-arch]").forEach(b => {
    b.onclick = () => { ARCHIVE_SEL = +b.dataset.arch; renderArchive(); };
  });
}

function renderTournament(t) {
  const showGd = t.standings.some(s => s.gd != null);
  const showGp = t.standings.some(s => s.gp != null);
  let head = "<th>#</th><th>Player</th><th>Nations</th><th>Pts</th>";
  if (showGp) head += "<th>GP</th>";
  if (showGd) head += "<th>GD</th>";
  const rows = t.standings.map(s => {
    const champ = t.champions.includes(s.player);
    const nats = s.nations.map(n => {
      let extra = "";
      if (n.total != null) extra = " (" + n.total + ")";
      else if (n.groupPts != null) extra = " (" + n.groupPts + ")";
      return esc(n.team) + extra;
    }).join(", ");
    let r = '<tr class="' + (champ ? "champ" : "") + '">' +
      '<td class="num">' + s.rank + (champ ? " 🏆" : "") + "</td>" +
      "<td><strong>" + esc(firstName(s.player)) + "</strong></td>" +
      '<td class="hist-nations">' + nats + "</td>" +
      '<td class="num"><strong>' + s.pts + "</strong></td>";
    if (showGp) r += '<td class="num">' + (s.gp != null ? s.gp : "—") + "</td>";
    if (showGd) r += '<td class="num">' + (s.gd != null ? (s.gd > 0 ? "+" : "") + s.gd : "—") + "</td>";
    return r + "</tr>";
  }).join("");
  return (
    '<div class="card">' +
    "<h2>" + esc(t.name) + ' <span class="section-sub" style="display:inline">· ' +
    esc(t.host) + "</span></h2>" +
    '<p class="section-sub">' + esc(t.format) + " · Champion: " +
    esc(t.champions.map(firstName).join(" & ")) + (t.notes ? " · " + esc(t.notes) : "") + "</p>" +
    '<table class="hist"><thead><tr>' + head + "</tr></thead><tbody>" +
    rows + "</tbody></table>" +
    '<p class="section-sub" style="margin-top:8px">Number after each nation = points it scored for that player.</p>' +
    "</div>"
  );
}

function renderHonours(ts) {
  const stat = {};
  const nationCounts = {}; // keyed by first name so historical + 2026 picks merge
  ts.forEach(t => {
    t.standings.forEach(s => {
      const k = s.player;
      stat[k] = stat[k] || { player: k, played: 0, titles: 0, podiums: 0, best: 99, points: 0 };
      stat[k].played++;
      stat[k].points += s.pts;
      if (t.champions.includes(k)) stat[k].titles++;
      if (s.rank <= 3) stat[k].podiums++;
      stat[k].best = Math.min(stat[k].best, s.rank);
      const nk = firstName(s.player);
      nationCounts[nk] = nationCounts[nk] || {};
      s.nations.forEach(nat => {
        nationCounts[nk][nat.team] = (nationCounts[nk][nat.team] || 0) + 1;
      });
    });
  });
  // Include picks from every current 2026 sweep
  (CFG.sweeps || []).forEach(sw => {
    sw.players.forEach(p => {
      const nk = firstName(p.name);
      if (!nk) return;
      nationCounts[nk] = nationCounts[nk] || {};
      p.nations.forEach(team => {
        if (team) nationCounts[nk][team] = (nationCounts[nk][team] || 0) + 1;
      });
    });
  });
  const ordered = Object.values(stat).sort((a, b) =>
    b.titles - a.titles || b.podiums - a.podiums || a.best - b.best || b.points - a.points);

  const honoursRows = ordered.map(s =>
    "<tr><td><strong>" + esc(firstName(s.player)) + "</strong></td>" +
    '<td class="num">' + s.played + "</td>" +
    '<td class="num">' + (s.titles ? "🏆".repeat(s.titles) + " " + s.titles : "—") + "</td>" +
    '<td class="num">' + s.podiums + "</td>" +
    '<td class="num">' + s.best + "</td>" +
    '<td class="num">' + s.points + "</td></tr>"
  ).join("");

  const nationRows = ordered.map(s => {
    const list = Object.entries(nationCounts[firstName(s.player)] || {})
      .filter(([, c]) => c > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([team, c]) => esc(team) + " <strong>×" + c + "</strong>")
      .join(", ");
    return "<tr><td><strong>" + esc(firstName(s.player)) + "</strong></td>" +
      '<td class="hist-nations">' + (list || "—") + "</td></tr>";
  }).join("");

  return (
    '<div class="card"><h2>Honours board</h2>' +
    '<p class="section-sub">Across all four archived tournaments. ' +
    "World Cup 2018 had joint champions.</p>" +
    '<table class="hist honours-board"><thead><tr>' +
    "<th>Player</th><th>Played</th><th>Titles</th><th>Podiums</th>" +
    "<th>Best finish</th><th>Total pts</th>" +
    "</tr></thead><tbody>" + honoursRows + "</tbody></table></div>" +
    '<div class="card"><h2>Most-picked nations</h2>' +
    '<p class="section-sub">Nations a player has drawn more than once, across past sweeps and the current 2026 sweep. ' +
    'Players with no repeats show "—".</p>' +
    '<table class="hist"><thead><tr>' +
    "<th>Player</th><th>Top nations</th>" +
    "</tr></thead><tbody>" + nationRows + "</tbody></table></div>"
  );
}

document.addEventListener("DOMContentLoaded", boot);
