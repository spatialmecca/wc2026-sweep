# World Cup 2026 Sweepstake

A static web app for the annual football sweepstake: a **live ladder** for the 2026
FIFA World Cup, plus an **archive** of the four previous tournaments (WC 2018, Euro
2020, WC 2022, Euro 2024).

No build step, no server, no database — just HTML, CSS and JavaScript. Hosts free on
GitHub Pages.

## Features

- **Multiple sweeps in one app** — run an Office Sweep, a Family Sweep, etc. side
  by side. One admin enters match results once and every sweep's ladder updates.
- **Live Ladder** — player standings with live scoring, status (IN/OUT) and a
  one-click PNG screenshot for sharing in the group chat.
- **Draw** — colour-coded visual of every player's picks, plus a "Draw Strength"
  ranking (when FIFA team rankings are supplied) showing whose squad is strongest.
- **Results** — enter group-stage and knockout scores; ladders update instantly.
- **Setup** — manage the shared 48-team draw and edit each sweep's players and
  their nation picks (flexible player counts and picks-per-player).
- **Overall Stats** — honours board and most-picked nations across the four past
  sweepstakes (2018, 2020, 2022, 2024).
- **Admin mode** — one nominated person edits; everyone else sees read-only views.

## Running it locally

The app loads JSON files with `fetch`, so it must be served over HTTP (opening
`index.html` directly with `file://` will not work).

```bash
cd wc2026-sweep
python3 -m http.server 8000
# then open http://localhost:8000
```

## Hosting on GitHub Pages (free)

1. Create a new GitHub repository and push the contents of this folder to it.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, pick `main` / `(root)`, **Save**.
3. After a minute the site is live at
   `https://<your-username>.github.io/<repo-name>/`.

Share that link with the group. No accounts, no cost.

## How the shared data works

All 2026 data — the draw, the player assignments and every result — lives in one
file: **`data/config2026.json`**. Whatever is committed to the repo is what every
viewer sees.

The **nominated scorer** workflow:

1. Open the site, turn on **Admin mode** (top right).
2. Edit in the **Setup** and **Results** tabs. Changes are saved in your browser
   immediately (so you cannot lose them), but they are *local to your browser only*.
3. A yellow bar appears: **Export config2026.json**. Click it to download the file.
4. Replace `data/config2026.json` in the repo with the downloaded file and commit it
   (the GitHub website's drag-and-drop upload works fine).
5. Everyone else reloads the page and sees the update.

The **Import config2026.json** button does the reverse — load a file someone sent
you. Viewers can toggle Admin mode and experiment, but their changes never affect
anyone else: only the committed file is shared.

> Tip: the **Discard local changes** button reverts your browser back to the
> published file.

## Scoring rules (WC 2026)

Each nation earns points; a player's score is the sum of their 6 nations.

| Event | Points |
|---|---|
| Group-stage win | 3 |
| Group-stage draw | 1 |
| Finish group 4th | 0 |
| Finish group 3rd *(eliminated only)* | +1 |
| Lose in Round of 32 | 3 |
| Lose in Round of 16 | 4 |
| Lose in Quarter-final | 6 |
| 4th place | 8 |
| 3rd place | 9 |
| Runner-up | 11 |
| Winner | 14 |

Note: a 3rd-placed group team that *advances* (8 of the 12 do) does not get the +2 —
it earns its knockout-exit value instead. R32 losers score **3** (set during setup;
edit `pointsRules` in `config2026.json` if the format changes).

**Player tiebreakers**, in order: points → goal difference → goals for → best
individual team finish.

## Files

```
wc2026-sweep/
  index.html            App shell
  styles.css            Styling
  app.js                Scoring engine + all views
  data/
    config2026.json     The live 2026 data (committed = shared state)
    historical.json     Archived results for 2018 / 2020 / 2022 / 2024
  README.md
```

## Updating during the tournament

1. After each matchday, the scorer enters scores in **Results**.
2. For knockout games, click **+ Add knockout match**, pick the round and the two
   teams, and enter the score (plus the penalty result for any draw).
3. Export `config2026.json`, commit it, done.
4. Use **📸 Download ladder screenshot** any time to post the standings.
