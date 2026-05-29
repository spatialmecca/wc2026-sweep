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

let HIST = null;       // historical.json
let PUBLISHED = null;  // pristine config2026.json from the repo
let CFG = null;        // working config (may be a local edited copy)
let SCORER = false;
let ARCHIVE_SEL = -1;

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
  const local = localStorage.getItem(LS_CONFIG);
  CFG = local ? JSON.parse(local) : deepCopy(PUBLISHED);
  SCORER = localStorage.getItem(LS_SCORER) === "1";

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
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById("view-" + t.dataset.view).classList.remove("hidden");
  });

  renderAll();
}

function renderAll() {
  renderStatusBar();
  renderLadder();
  renderResults();
  renderSetup();
  renderArchive();
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
function isDirty() { return JSON.stringify(CFG) !== JSON.stringify(PUBLISHED); }

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
  // best 8 of the 12 third-placed teams advance
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

function computePlayers(teams) {
  const rows = CFG.players.map(p => {
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
        CFG = deepCopy(PUBLISHED);
        localStorage.removeItem(LS_CONFIG);
        renderAll();
      }
    };
  } else {
    bar.innerHTML =
      '<span>Scorer mode on. Local data matches the published file.</span>' +
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
        CFG = JSON.parse(reader.result);
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
  const rows = computePlayers(teams);
  const hasTeams = allTeams().length > 0;
  const setupDone = CFG.players.some(p => p.nations.filter(Boolean).length > 0);
  const updated = CFG.lastUpdated
    ? new Date(CFG.lastUpdated).toLocaleString()
    : "not yet updated";

  let body;
  if (!hasTeams || !setupDone) {
    body = '<p class="empty-note">No players or nations set up yet. ' +
      'Turn on <strong>Scorer mode</strong> and open the <strong>Setup</strong> tab to enter the teams and draw.</p>';
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
    '<div class="ladder-head"><h2>World Cup 2026 — Sweepstake Ladder</h2>' +
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
    a.download = "wc2026-ladder-" + new Date().toISOString().slice(0, 10) + ".png";
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

  // players + nation picks
  const teamOpts = allTeams().sort();
  const assigned = {};
  CFG.players.forEach(p => p.nations.forEach(n => { if (n) assigned[n] = (assigned[n] || 0) + 1; }));

  let playersHtml = "";
  CFG.players.forEach((p, pi) => {
    let picks = "";
    p.nations.forEach((n, ni) => {
      const opts = ['<option value="">— pick nation —</option>']
        .concat(teamOpts.map(t => {
          const dup = assigned[t] > 1 && t === n;
          return '<option value="' + esc(t) + '"' + (t === n ? " selected" : "") + ">" +
            esc(t) + (dup ? " ⚠" : "") + "</option>";
        })).join("");
      picks += '<select data-pl="' + pi + '" data-nat="' + ni + '"' + dis + ">" + opts + "</select>";
    });
    playersHtml +=
      '<div class="player-setup card"><div class="player-head">' +
      '<input type="text" data-pl="' + pi + '" data-f="name" value="' + esc(p.name) + '"' + dis + ">" +
      '<span class="section-sub" style="margin:0">' + p.nations.filter(Boolean).length + " / 6 nations</span></div>" +
      '<div class="nation-picks">' + picks + "</div></div>";
  });

  // assignment summary
  const teamsCount = teamOpts.length;
  const picked = Object.keys(assigned).length;
  const dups = Object.keys(assigned).filter(k => assigned[k] > 1);
  const totalPicks = sum(CFG.players.map(p => p.nations.filter(Boolean).length));
  let summary = '<div class="assign-summary">' +
    teamsCount + " teams entered · " + totalPicks + " nation picks made · " +
    picked + " distinct teams assigned. ";
  if (dups.length) summary += '<span class="warn">Duplicates: ' + esc(dups.join(", ")) + "</span>";
  else if (teamsCount === 48 && totalPicks === 48 && picked === 48)
    summary += '<span class="ok">All 48 teams assigned, one per slot. ✓</span>';
  summary += "</div>";

  view.innerHTML =
    "<h2>Setup</h2>" +
    '<p class="section-sub">' +
    (ro ? "Read-only. Turn on Scorer mode to edit." :
      "Enter the 12 groups (4 teams each), then assign 6 nations to each of the 8 players.") +
    "</p>" +
    '<div class="card"><h2>Groups &amp; draw</h2>' +
    '<div class="setup-grid">' + groupsHtml + "</div></div>" +
    '<div class="card"><h2>Players &amp; nations</h2>' + summary +
    '<div style="margin-top:12px">' + playersHtml + "</div></div>";

  if (!ro) {
    view.querySelectorAll("input[data-grp]").forEach(inp => {
      inp.addEventListener("change", () => {
        CFG.groups[inp.dataset.grp][+inp.dataset.slot] = inp.value.trim();
        saveLocal(); renderAll();
      });
    });
    view.querySelectorAll('input[data-f="name"]').forEach(inp => {
      inp.addEventListener("change", () => {
        CFG.players[+inp.dataset.pl].name = inp.value.trim();
        saveLocal(); renderAll();
      });
    });
    view.querySelectorAll("select[data-pl]").forEach(sel => {
      sel.addEventListener("change", () => {
        CFG.players[+sel.dataset.pl].nations[+sel.dataset.nat] = sel.value;
        saveLocal(); renderAll();
      });
    });
  }
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
    "<h2>Overall Stats</h2>" +
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
      "<td><strong>" + esc(s.player) + "</strong></td>" +
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
    esc(t.champions.join(" &amp; ")) + (t.notes ? " · " + esc(t.notes) : "") + "</p>" +
    '<table class="hist"><thead><tr>' + head + "</tr></thead><tbody>" +
    rows + "</tbody></table>" +
    '<p class="section-sub" style="margin-top:8px">Number after each nation = points it scored for that player.</p>' +
    "</div>"
  );
}

function renderHonours(ts) {
  const stat = {};
  const nationCounts = {};
  ts.forEach(t => {
    t.standings.forEach(s => {
      const k = s.player;
      stat[k] = stat[k] || { player: k, played: 0, titles: 0, podiums: 0, best: 99, points: 0 };
      stat[k].played++;
      stat[k].points += s.pts;
      if (t.champions.includes(k)) stat[k].titles++;
      if (s.rank <= 3) stat[k].podiums++;
      stat[k].best = Math.min(stat[k].best, s.rank);
      nationCounts[k] = nationCounts[k] || {};
      s.nations.forEach(nat => {
        nationCounts[k][nat.team] = (nationCounts[k][nat.team] || 0) + 1;
      });
    });
  });
  const ordered = Object.values(stat).sort((a, b) =>
    b.titles - a.titles || b.podiums - a.podiums || a.best - b.best || b.points - a.points);

  const honoursRows = ordered.map(s =>
    "<tr><td><strong>" + esc(s.player) + "</strong></td>" +
    '<td class="num">' + s.played + "</td>" +
    '<td class="num">' + (s.titles ? "🏆".repeat(s.titles) + " " + s.titles : "—") + "</td>" +
    '<td class="num">' + s.podiums + "</td>" +
    '<td class="num">' + s.best + "</td>" +
    '<td class="num">' + s.points + "</td></tr>"
  ).join("");

  const nationRows = ordered.map(s => {
    const list = Object.entries(nationCounts[s.player] || {})
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([team, c]) => esc(team) + (c > 1 ? " <strong>×" + c + "</strong>" : ""))
      .join(", ");
    return "<tr><td><strong>" + esc(s.player) + "</strong></td>" +
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
    '<p class="section-sub">Each player\'s five most frequently drawn nations across past sweeps. ' +
    "A count is shown when a nation has been picked more than once.</p>" +
    '<table class="hist"><thead><tr>' +
    "<th>Player</th><th>Top nations</th>" +
    "</tr></thead><tbody>" + nationRows + "</tbody></table></div>"
  );
}

document.addEventListener("DOMContentLoaded", boot);
