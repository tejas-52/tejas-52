// Interactive profile engine: tic-tac-toe, guestbook, poll (driven by issues)
// and an auto-updating activity feed (driven by a schedule).
//
//   node scripts/interactive.mjs issues    apply every open game/guestbook/vote issue
//   node scripts/interactive.mjs reply     comment on and close the issues just applied
//   node scripts/interactive.mjs activity  refresh the recent-activity section
//
// Visitor text never reaches a shell: issues are read as JSON through `gh`, and
// everything shown in the README goes through clean().

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = process.env.GITHUB_REPOSITORY || "tejas-52/tejas-52";
const OWNER = REPO.split("/")[0];
const STATE_FILE = "data/state.json";
const README_FILE = "README.md";
const REPLIES_FILE = path.join(process.env.RUNNER_TEMP || os.tmpdir(), "profile-replies.json");
const PROFILE_URL = `https://github.com/${OWNER}`;

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });
const readState = () => JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
const writeState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
const today = () => new Date().toISOString().slice(0, 10);

function issueUrl(title, body) {
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

// Keep letters, numbers, emoji and light punctuation; drop links, HTML, markdown and @.
function clean(text, max = 100) {
  const s = (text || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/[^\p{L}\p{M}\p{N}\p{Extended_Pictographic}‍️ .,!?'":;()\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(s).slice(0, max).join("").trim();
}

function replaceSection(readme, name, content) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const i = readme.indexOf(start);
  const j = readme.indexOf(end);
  if (i < 0 || j < i) throw new Error(`README is missing the ${name} markers`);
  return readme.slice(0, i + start.length) + "\n" + content + "\n" + readme.slice(j);
}

// ---------- tic-tac-toe ----------
const CELLS = ["A1", "B1", "C1", "A2", "B2", "C2", "A3", "B3", "C3"]; // column letter, row number
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner = (b) => {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? "draw" : null;
};

function minimax(b, turn) {
  const w = winner(b);
  if (w === "O") return { score: 1 };
  if (w === "X") return { score: -1 };
  if (w === "draw") return { score: 0 };
  let best = { score: turn === "O" ? -2 : 2 };
  b.forEach((v, i) => {
    if (v) return;
    b[i] = turn;
    const { score } = minimax(b, turn === "O" ? "X" : "O");
    b[i] = "";
    if (turn === "O" ? score > best.score : score < best.score) best = { score, move: i };
  });
  return best;
}

function botMove(b) {
  const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  // Beatable on purpose: plays the perfect move 70% of the time.
  if (Math.random() < 0.7) return minimax([...b], "O").move;
  return free[Math.floor(Math.random() * free.length)];
}

function playTtt(state, user, cellRaw) {
  const t = state.ttt;
  const cell = (cellRaw || "").toUpperCase().trim();
  const idx = CELLS.indexOf(cell);
  if (idx < 0) return `That isn't a square on the board. Pick one from the [board on my profile](${PROFILE_URL}).`;
  if (t.board[idx]) return `Square **${cell}** is already taken. Pick an empty one on the [board](${PROFILE_URL}).`;

  t.board[idx] = "X";
  let msg = `You played **${cell}**.`;
  let end = winner(t.board);
  let botCell = null;
  if (!end) {
    const m = botMove(t.board);
    t.board[m] = "O";
    botCell = CELLS[m];
    msg += ` I answered with **${botCell}**.`;
    end = winner(t.board);
  }
  t.recent.unshift({ user, cell, bot: botCell });
  t.recent = t.recent.slice(0, 5);

  if (end) {
    if (end === "X") { t.score.humans++; t.lastResult = `🎉 @${user} beat the bot!`; msg += " **You won!** 🎉"; }
    else if (end === "O") { t.score.bot++; t.lastResult = `🤖 The bot won against @${user}.`; msg += " **The bot won this one.** 🤖"; }
    else { t.score.draws++; t.lastResult = `🤝 Draw, finished by @${user}.`; msg += " **It's a draw.** 🤝"; }
    t.board = Array(9).fill("");
    msg += " A new game has started.";
  }
  return msg + ` [Back to the board](${PROFILE_URL})`;
}

function renderTtt(state) {
  const t = state.ttt;
  const sym = (v, i) => {
    if (v === "X") return "❌";
    if (v === "O") return "⭕";
    return `[⬜](${issueUrl(`ttt|move|${CELLS[i]}`, "Just click **Create** to play this move. You don't need to write anything.\n\nThe bot replies within about a minute.")})`;
  };
  const rows = [0, 1, 2].map((r) =>
    `| **${r + 1}** | ${[0, 1, 2].map((c) => sym(t.board[r * 3 + c], r * 3 + c)).join(" | ")} |`);
  const recent = t.recent.length
    ? t.recent.map((m) => `@${m.user} → ${m.cell}${m.bot ? ` (bot → ${m.bot})` : ""}`).join(" · ")
    : "No moves yet. Be the first!";
  return [
    "<div align=\"center\">",
    "",
    "| | A | B | C |",
    "|:-:|:-:|:-:|:-:|",
    ...rows,
    "",
    "You're ❌. **Click any ⬜ to play**, and the bot (⭕) answers within about a minute.",
    "",
    `**Score:** Visitors ${t.score.humans} · Bot ${t.score.bot} · Draws ${t.score.draws}`,
    t.lastResult ? `<br/>Last game: ${t.lastResult}` : "",
    "",
    `<sub>Recent moves: ${recent}</sub>`,
    "",
    "</div>",
  ].join("\n");
}

// ---------- guestbook ----------
function signGuestbook(state, user, body) {
  const msg = clean(body, 100);
  if (!msg) return `Your message was empty after removing links and formatting. [Try again](${PROFILE_URL}) with plain text.`;
  state.guestbook = state.guestbook.filter((e) => e.user !== user);
  state.guestbook.unshift({ user, msg, date: today() });
  state.guestbook = state.guestbook.slice(0, 50);
  return `Thanks for signing the guestbook! Your message is now on my [profile](${PROFILE_URL}). ✍️`;
}

function renderGuestbook(state) {
  const link = issueUrl("guestbook|sign", "<!-- Write your message below (up to 100 characters, plain text). Then click Create. -->\n\n");
  const entries = state.guestbook.slice(0, 5)
    .map((e) => `- **[@${e.user}](https://github.com/${e.user})**: ${e.msg} <sub>${e.date}</sub>`);
  return [
    `<p align="center"><a href="${link}"><img src="https://img.shields.io/badge/✍️_Sign_the_guestbook-2EA043?style=for-the-badge" alt="Sign the guestbook" /></a></p>`,
    "",
    ...(entries.length ? entries : ["- No messages yet. Be the first to sign!"]),
  ].join("\n");
}

// ---------- poll ----------
function vote(state, user, optionId) {
  const p = state.poll;
  const opt = p.options.find((o) => o.id === (optionId || "").toLowerCase().trim());
  if (!opt) return `That isn't one of the poll options. Vote from my [profile](${PROFILE_URL}).`;
  const changed = p.votes[user] && p.votes[user] !== opt.id;
  p.votes[user] = opt.id;
  return `${changed ? "Vote changed" : "Vote counted"}: **${opt.label}**. Thanks! See the live results on my [profile](${PROFILE_URL}). 🗳️`;
}

function renderPoll(state) {
  const p = state.poll;
  const counts = Object.fromEntries(p.options.map((o) => [o.id, 0]));
  for (const id of Object.values(p.votes)) if (id in counts) counts[id]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const rows = p.options.map((o) => {
    const n = counts[o.id];
    const filled = total ? Math.round((n / total) * 12) : 0;
    const url = issueUrl(`vote|${o.id}`, `Just click **Create** to vote for: ${o.label}`);
    return `| ${o.label} | \`${"█".repeat(filled)}${"░".repeat(12 - filled)}\` ${n} | [Vote](${url}) |`;
  });
  return [
    `**${p.question}**`,
    "",
    "| Idea | Votes | |",
    "|:--|:--|:-:|",
    ...rows,
    "",
    `<sub>${total} vote${total === 1 ? "" : "s"} so far · one vote per person, and voting again changes your vote</sub>`,
  ].join("\n");
}

// ---------- activity ----------
function renderActivity() {
  const events = JSON.parse(gh(["api", `users/${OWNER}/events/public?per_page=60`]));
  const lines = [];
  const seen = new Set();
  for (const e of events) {
    const repo = e.repo.name;
    if (repo === REPO) continue; // skip this profile repo's own updates
    const link = `[${repo.split("/")[1]}](https://github.com/${repo})`;
    let text = null;
    if (e.type === "PushEvent") {
      const n = e.payload.size ?? e.payload.commits?.length ?? 0;
      text = `🚀 Pushed ${n || "new"} commit${n === 1 ? "" : "s"} to ${link}`;
    } else if (e.type === "CreateEvent" && e.payload.ref_type === "repository") text = `✨ Created ${link}`;
    else if (e.type === "PullRequestEvent" && e.payload.action === "closed" && e.payload.pull_request?.merged) text = `🔀 Merged a pull request in ${link}`;
    else if (e.type === "PullRequestEvent" && e.payload.action === "opened") text = `📬 Opened a pull request in ${link}`;
    else if (e.type === "ReleaseEvent") text = `🏷️ Published a release in ${link}`;
    else if (e.type === "WatchEvent") text = `⭐ Starred ${link}`;
    if (!text || seen.has(text)) continue;
    seen.add(text);
    lines.push(`- ${text} <sub>${e.created_at.slice(0, 10)}</sub>`);
    if (lines.length === 5) break;
  }
  return (lines.length ? lines : ["- Quiet week. Check back soon!"]).join("\n") +
    `\n\n<sub>Updated automatically every day · last refresh ${today()}</sub>`;
}

// ---------- main ----------
function renderAll(state, readme) {
  readme = replaceSection(readme, "TTT", renderTtt(state));
  readme = replaceSection(readme, "POLL", renderPoll(state));
  readme = replaceSection(readme, "GUESTBOOK", renderGuestbook(state));
  return readme;
}

const mode = process.argv[2];

if (mode === "issues") {
  const state = readState();
  const issues = JSON.parse(gh(["issue", "list", "--repo", REPO, "--state", "open", "--limit", "100",
    "--json", "number,title,body,author,createdAt"]))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const replies = [];
  for (const issue of issues) {
    const [kind, ...rest] = issue.title.trim().split("|");
    const user = issue.author?.login;
    if (!user || issue.author?.is_bot) continue;
    let reply;
    switch (kind.toLowerCase()) {
      case "ttt": reply = playTtt(state, user, rest[1]); break;
      case "guestbook": reply = signGuestbook(state, user, issue.body); break;
      case "vote": reply = vote(state, user, rest[0]); break;
      default: continue; // an ordinary issue: leave it alone
    }
    replies.push({ number: issue.number, body: `Hi @${user}! ${reply}` });
  }
  writeState(state);
  fs.writeFileSync(README_FILE, renderAll(state, fs.readFileSync(README_FILE, "utf8")));
  fs.writeFileSync(REPLIES_FILE, JSON.stringify(replies));
  console.log(`Applied ${replies.length} interactive issue(s).`);
} else if (mode === "reply") {
  const replies = fs.existsSync(REPLIES_FILE) ? JSON.parse(fs.readFileSync(REPLIES_FILE, "utf8")) : [];
  for (const r of replies) {
    gh(["issue", "close", String(r.number), "--repo", REPO, "--comment", r.body]);
  }
  console.log(`Replied to ${replies.length} issue(s).`);
} else if (mode === "activity") {
  fs.writeFileSync(README_FILE, replaceSection(fs.readFileSync(README_FILE, "utf8"), "ACTIVITY", renderActivity()));
  console.log("Activity refreshed.");
} else if (mode === "render") {
  fs.writeFileSync(README_FILE, renderAll(readState(), fs.readFileSync(README_FILE, "utf8")));
  console.log("README re-rendered from state.");
} else {
  console.error("Usage: node scripts/interactive.mjs issues|reply|activity|render");
  process.exit(1);
}
