// Creative Dock landing site: serves the page, saves early-access requests,
// and gives the team a password-protected inbox at /admin.
// No dependencies. Node 20+.

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || "/data";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TRUST_PROXY = process.env.TRUST_PROXY !== "false";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DB_FILE = path.join(DATA_DIR, "requests.jsonl");
const STATUS_FILE = path.join(DATA_DIR, "status.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!ADMIN_PASSWORD)
  console.warn("ADMIN_PASSWORD is not set: /admin is disabled until you set it.");

const INDEX = fs.readFileSync(path.join(PUBLIC, "index.html"));

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'self'",
};

/* ---------- storage ---------- */
function readRequests() {
  if (!fs.existsSync(DB_FILE)) return [];
  return fs
    .readFileSync(DB_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeStatus(s) {
  const tmp = STATUS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, STATUS_FILE);
}

/* ---------- helpers ---------- */
const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { ...SECURITY, ...headers });
  res.end(body);
};
const json = (res, code, obj) =>
  send(res, code, JSON.stringify(obj), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
// Drops control characters (keeps tabs and line breaks) and trims to a maximum length.
const clean = (v, max) =>
  Array.from(String(v ?? ""))
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 || c === 9 || c === 10 || c === 13;
    })
    .join("")
    .trim()
    .slice(0, max);

function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = req.headers["x-forwarded-for"];
    if (xf) return String(xf).split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function readBody(req, limit = 20_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too_large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// 5 requests per IP per 10 minutes
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(),
    win = 10 * 60_000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000)
    for (const [k, v] of hits) if (!v.some((t) => now - t < win)) hits.delete(k);
  return list.length > 5;
}

function authorized(req) {
  if (!ADMIN_PASSWORD) return false;
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const [u, ...p] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  const given = Buffer.from(`${u}:${p.join(":")}`);
  const want = Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
const askAuth = (res) =>
  send(res, 401, "Sign in to see Creative Dock requests.", {
    "WWW-Authenticate": 'Basic realm="Creative Dock admin", charset="UTF-8"',
    "Content-Type": "text/plain; charset=utf-8",
  });

const TYPES = ["Agency", "Brand", "Freelancer"];
const NEEDS = ["Client review", "Approvals", "Sharing files", "Tracking work", "Team access"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- routes ---------- */
async function handleRequest(req, res) {
  const ip = clientIp(req);
  if (rateLimited(ip))
    return json(res, 429, { error: "Too many requests. Try again in a few minutes." });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: "Send the form as JSON." });
  }

  if (body.website) return json(res, 200, { ok: true }); // honeypot: bots fill it, people never see it

  const rec = {
    id: crypto.randomUUID(),
    name: clean(body.name, 120),
    company: clean(body.company, 160),
    email: clean(body.email, 200).toLowerCase(),
    phone: clean(body.phone, 40),
    type: TYPES.includes(body.type) ? body.type : "Agency",
    team: clean(body.team, 40),
    volume: clean(body.volume, 40),
    needs: Array.isArray(body.needs) ? body.needs.filter((n) => NEEDS.includes(n)) : [],
    requirements: clean(body.requirements, 4000),
    submittedAt: new Date().toISOString(),
    ip,
  };
  if (!rec.name || !rec.company || !rec.requirements)
    return json(res, 400, { error: "Name, agency or brand, and requirements are required." });
  if (!EMAIL.test(rec.email)) return json(res, 400, { error: "Enter a valid email." });

  fs.appendFileSync(DB_FILE, JSON.stringify(rec) + "\n");
  console.log(`New request: ${rec.company} <${rec.email}>`);
  return json(res, 201, { ok: true });
}

function adminPage(rows, status) {
  const open = rows.filter((r) => status[r.id] !== "contacted").length;
  const items = rows
    .map((r) => {
      const done = status[r.id] === "contacted";
      const when = new Date(r.submittedAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const tags = [r.type, r.team, r.volume && r.volume + "/mo", ...(r.needs || [])]
        .filter(Boolean)
        .map((t) => `<span class="tag">${esc(t)}</span>`)
        .join("");
      return `<div class="req${done ? " done" : ""}">
      <div class="who"><b>${esc(r.name)}</b><span>${esc(r.company)}</span><span><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></span>${r.phone ? `<span>${esc(r.phone)}</span>` : ""}<div class="when">${esc(when)} IST</div></div>
      <div><div class="tags">${tags}</div><div class="what">${esc(r.requirements)}</div></div>
      <form method="post" action="/admin/status"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="to" value="${done ? "new" : "contacted"}"><button class="state${done ? " on" : ""}">${done ? "Contacted" : "Mark contacted"}</button></form>
    </div>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Creative Dock requests</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono&display=swap">
<style>
:root{color-scheme:dark;--bg:#000;--line:#1d1f25;--ink:#f4f5f7;--ink2:#c9ccd3;--muted:#7f8592;--blue:#5b9bff}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 Geist,"Helvetica Neue",Arial,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:48px max(16px,env(safe-area-inset-left))}
.head{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:16px;margin-bottom:28px}
h1{font-size:32px;letter-spacing:-.03em;margin:0;font-weight:600}
.count{font-family:"Geist Mono",monospace;color:var(--muted);font-size:13px}
a{color:var(--blue)}
.btn{color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:8px 14px;text-decoration:none;font-size:13px}
.req{border-top:1px solid var(--line);padding:22px 0;display:grid;grid-template-columns:minmax(0,3fr) minmax(0,5fr) auto;gap:24px;align-items:start}
.req.done{opacity:.55}
.who b{display:block;font-weight:600}.who span{display:block;color:var(--ink2);font-size:14px;overflow-wrap:anywhere}
.when{font-family:"Geist Mono",monospace;font-size:12px;color:var(--muted);margin-top:6px}
.what{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink2)}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.tag{font-family:"Geist Mono",monospace;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border-radius:6px;background:rgba(47,123,255,.14);color:var(--blue)}
.state{font:inherit;font-size:12px;padding:6px 12px;border-radius:999px;border:1px solid #2a2d35;background:transparent;color:var(--ink2);cursor:pointer;white-space:nowrap}
.state.on{background:var(--ink);color:#000}
.empty{color:var(--muted);border:1px dashed #2a2d35;border-radius:12px;padding:28px}
@media(max-width:760px){.req{grid-template-columns:1fr;gap:10px}}
</style></head><body><div class="wrap">
<div class="head"><h1>Creative Dock requests</h1><span class="count">${rows.length} total · ${open} to contact</span><a class="btn" href="/admin/requests.csv">Download CSV</a></div>
${items || '<div class="empty">No requests yet. They show up here as soon as someone sends the form.</div>'}
</div></body></html>`;
}

function csv(rows, status) {
  const cols = [
    "submittedAt",
    "name",
    "company",
    "email",
    "phone",
    "type",
    "team",
    "volume",
    "needs",
    "requirements",
    "status",
  ];
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return (
    "﻿" +
    [
      cols.join(","),
      ...rows.map((r) =>
        cols
          .map((c) =>
            cell(
              c === "needs"
                ? (r.needs || []).join("; ")
                : c === "status"
                  ? status[r.id] || "new"
                  : r[c],
            ),
          )
          .join(","),
      ),
    ].join("\r\n")
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p === "/healthz") return send(res, 200, "ok", { "Content-Type": "text/plain" });

    if (p === "/api/request") {
      if (req.method !== "POST") return json(res, 405, { error: "Use POST." });
      return await handleRequest(req, res);
    }

    if (p === "/admin" || p.startsWith("/admin/")) {
      if (!authorized(req)) return askAuth(res);
      const rows = readRequests().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      const status = readStatus();
      if (p === "/admin" && req.method === "GET")
        return send(res, 200, adminPage(rows, status), {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
      if (p === "/admin/requests.csv")
        return send(res, 200, csv(rows, status), {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="creative-dock-requests-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        });
      if (p === "/admin/status" && req.method === "POST") {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, "Forbidden");
        const form = new URLSearchParams(await readBody(req, 2000));
        const id = form.get("id"),
          to = form.get("to");
        if (id && rows.some((r) => r.id === id) && (to === "new" || to === "contacted")) {
          if (to === "new") delete status[id];
          else status[id] = to;
          writeStatus(status);
        }
        return send(res, 303, "", { Location: "/admin" });
      }
      return send(res, 404, "Not found");
    }

    if (req.method === "GET" || req.method === "HEAD") {
      if (p === "/" || p === "/index.html")
        return send(res, 200, req.method === "HEAD" ? "" : INDEX, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        });
      if (p === "/robots.txt")
        return send(res, 200, "User-agent: *\nDisallow: /admin\n", {
          "Content-Type": "text/plain",
        });
      return send(res, 302, "", { Location: "/" });
    }
    return send(res, 405, "Method not allowed");
  } catch (err) {
    console.error(err);
    if (err.message === "too_large") return json(res, 413, { error: "That request is too long." });
    return json(res, 500, { error: "Something went wrong. Try again." });
  }
});

server.listen(PORT, () => console.log(`Creative Dock site on :${PORT}`));
