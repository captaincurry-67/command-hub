# 5th Marine Regimental Command Hub — Beginner's Guide

This guide assumes you've never built or deployed a website before. Follow it top to bottom the first time; after that, you'll mostly only need **Part 3** (editing the roster) and the last step of **Part 6** (pushing an update).

---

## What's in this project

```
command-hub/
├── index.html                     Home page
├── chain-of-command.html          The org-chart page
├── assets/
│   ├── css/                       All styling (colors, fonts, layout)
│   ├── js/chain-of-command.js     Reads the JSON below and builds the page
│   └── img/                       Rank insignia + background image
├── data/
│   └── chain-of-command.json      <-- THE FILE YOU'LL EDIT MOST OFTEN
├── GUIDE.md                       This file
└── README.md                      Short project overview
```

You almost never need to touch the `.html`, `.css`, or `.js` files to update the roster — everything about *who holds what position* lives in `data/chain-of-command.json`.

---

## Part 1 — Install two free programs

1. **Git** — lets you save and upload your code. Download from [git-scm.com/downloads](https://git-scm.com/downloads) and install with default options.
2. **VS Code** (recommended, optional) — a free code editor that makes editing the JSON file much easier (it highlights syntax errors for you). Download from [code.visualstudio.com](https://code.visualstudio.com/).

You already have **Python** installed, which we'll use to preview the site locally.

---

## Part 2 — Preview the site on your own computer

Before publishing anything, you can open the site locally to see your changes.

1. Open a terminal (PowerShell) in the `command-hub` folder.
2. Run:
   ```
   python -m http.server 8080
   ```
3. Open your browser to **http://localhost:8080** — you should see the home page. Click "Chain of Command" to see the roster.
4. Leave that terminal window open while you preview. Press `Ctrl+C` in the terminal to stop the server when you're done.

Any time you edit `data/chain-of-command.json`, just refresh the browser tab to see the change — no restart needed.

---

## Part 3 — Editing the roster (`data/chain-of-command.json`)

Open `data/chain-of-command.json` in VS Code (or Notepad). It's a list of positions grouped by unit. Each position looks like this:

```json
{ "rank": "O-3", "title": "Captain", "name": "Capt Alex", "status": "filled" }
```

- `"status": "filled"` → shows the person's name
- `"status": "vacant"` → shows a red **OPEN** tag (position exists, nobody's in it)
- `"status": "closed"` → shows a red **CLOSED** tag (position doesn't currently exist)
- Leave out `"name"` entirely when the status isn't `"filled"`

### To rename someone or fill a vacant slot
Find their row and change `"name"` and set `"status": "filled"`.

### To add a brand-new Battalion
Find the `"battalions": [ ... ]` list near the top and add a new block (copy an existing one and edit it — commas matter, see the troubleshooting note below):

```json
{
  "id": "bn-3",
  "label": "Battalion III",
  "positions": [
    { "rank": "O-5", "title": "Lieutenant Colonel", "status": "vacant" },
    { "rank": "O-4", "title": "Major", "status": "vacant" }
  ],
  "companies": []
}
```
Give it a unique `"id"` (nothing else uses that id).

### To add a Company under a Battalion
Find the battalion's `"companies": [ ... ]` list and add:

```json
{
  "id": "bn3-co-1",
  "label": "Company V",
  "positions": [
    { "rank": "O-3", "title": "Captain", "status": "vacant" },
    { "rank": "O-2", "title": "1st Lieutenant", "status": "vacant" },
    { "rank": "O-1", "title": "2nd Lieutenant", "status": "vacant" }
  ]
}
```

### To add a Warrant Officer or Reserve
- Warrant Officers live in `"warrantOfficers": { "positions": [...] }` — same row format as above.
- Reserves live in `"reserves": { "members": [...] }` — just a plain list of names:
  ```json
  "members": ["LCpl Smith", "Sgt Jones"]
  ```

### Avoiding JSON errors
JSON is picky about commas and quotes. The most common mistakes:
- Forgetting a comma between two `{ ... }` blocks in a list
- Leaving a trailing comma after the *last* item in a list
- Using curly `“ ”` quotes instead of straight `" "` quotes (happens if you paste from Word)

If the page stops showing the roster after an edit, open the browser preview, right-click → **Inspect** → **Console** tab, and look for a red error — it will usually tell you the exact line with the problem. VS Code will also underline JSON syntax errors in red as you type, which is why it's worth installing.

---

## Part 4 — Get the code onto GitHub

GitHub is where your code lives online — Cloudflare will watch it and auto-publish every time you save a change there.

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Create a new repository:
   - Click the **+** icon (top right) → **New repository**
   - Name it `command-hub` (or anything you like)
   - Leave it **Public** (required for Cloudflare's free tier to connect easily) or **Private** (also works, just one extra click later)
   - Don't check "Add a README" — we already have one
   - Click **Create repository**
3. GitHub will show you a page with commands under "…or push an existing repository from the command line." Keep that page open — you'll need the URL that looks like `https://github.com/your-username/command-hub.git`.

Back in your terminal, in the `command-hub` folder:
```
git init
git add .
git commit -m "Initial site: chain of command page"
git branch -M main
git remote add origin https://github.com/your-username/command-hub.git
git push -u origin main
```
(Replace the URL with your actual repo URL from step 3. Git may open a browser window asking you to sign in the first time — that's normal.)

Refresh your GitHub repo page — you should see all your files there.

---

## Part 5 — Deploy to Cloudflare Pages (free)

1. Create a free account at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. In the Cloudflare dashboard, go to **Workers & Pages** in the left sidebar.
3. Click **Create** → **Pages** tab → **Connect to Git**.
4. Authorize Cloudflare to access your GitHub account, then select your `command-hub` repository.
5. On the build settings screen:
   - **Framework preset**: `None`
   - **Build command**: leave empty
   - **Build output directory**: `/`
6. Click **Save and Deploy**. Cloudflare will publish the site within about a minute.
7. You'll get a live URL like `https://command-hub-xyz.pages.dev` — that's your free public website.

---

## Part 6 — The ongoing workflow (how you'll actually use this day-to-day)

Once deployed, you don't need your terminal or git commands for routine roster updates:

1. Go to your repo on GitHub.com, navigate to `data/chain-of-command.json`.
2. Click the pencil (✏️) icon to edit it directly in the browser.
3. Make your change (add a battalion, fill a vacancy, etc).
4. Scroll down, add a short commit message like "Fill Battalion II command", click **Commit changes**.
5. Cloudflare automatically notices the change and redeploys — refresh your live site in about 30–60 seconds.

If you'd rather edit locally in VS Code and push from your terminal instead, just repeat:
```
git add .
git commit -m "describe what changed"
git push
```

---

## Part 7 — Troubleshooting

| Problem | Likely cause |
|---|---|
| Roster section is blank / error message shown | Invalid JSON — check for missing/extra commas (see Part 3) |
| Rank icon shows a dashed circle instead of an image | No insignia image mapped for that rank (currently true for all Warrant Officer ranks — drop PNGs into `assets/img/ranks/` and add them to `RANK_ICONS` in `assets/js/chain-of-command.js` to fix) |
| Cloudflare deploy fails | Double-check build output directory is `/` and build command is empty |
| Local preview shows old data after editing JSON | Hard-refresh the browser (`Ctrl+Shift+R`) — browsers sometimes cache JSON files |

---

## What's next

This is the first page of the site. When you're ready to add the next page (roster, events, rules, whatever it is), the same pattern applies: a new `.html` file, its own data file if needed, reusing `assets/css/variables.css`, `base.css`, and `layout.css` so it matches this page's look automatically.
