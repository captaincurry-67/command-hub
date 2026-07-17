import DEFAULT_HIERARCHY from "./seed-hierarchy.json";

const SESSION_COOKIE = "session";
const SESSION_DAYS = 14;
const VALID_TIERS = ["regimental_command", "battalion_command", "company_command"];
const PUBLIC_PAGES = ["/login.html", "/setup.html", "/reset-password.html"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      return handleApi(request, env, path).catch((err) => {
        console.error(err);
        return jsonResponse({ error: "Server error" }, 500);
      });
    }

    if (path.startsWith("/assets/") || PUBLIC_PAGES.includes(path)) {
      return serveAsset(request, env, url);
    }

    const officer = await getSessionOfficer(request, env);
    if (!officer) {
      return Response.redirect(`${url.origin}/login.html?next=${encodeURIComponent(path)}`, 302);
    }
    if (path === "/admin.html" && officer.tier !== "regimental_command") {
      return Response.redirect(`${url.origin}/chain-of-command.html`, 302);
    }

    return serveAsset(request, env, url);
  },
};

async function serveAsset(request, env, url) {
  // html_handling is set to "none" (so /login.html etc. don't get redirected to
  // extensionless URLs, which would bypass our path-based gating above) — but that
  // also disables the default "/" -> "/index.html" resolution, so do it ourselves.
  if (url.pathname === "/") {
    const rewritten = new URL(url);
    rewritten.pathname = "/index.html";
    request = new Request(rewritten.toString(), request);
  }
  return env.ASSETS.fetch(request);
}

async function handleApi(request, env, path) {
  const method = request.method;

  if (path === "/api/setup-status" && method === "GET") return apiSetupStatus(env);
  if (path === "/api/setup" && method === "POST") return apiSetup(request, env);
  if (path === "/api/login" && method === "POST") return apiLogin(request, env);
  if (path === "/api/logout" && method === "POST") return apiLogout(request, env);
  if (path === "/api/me" && method === "GET") return apiMe(request, env);
  if (path === "/api/hierarchy" && method === "GET") return apiGetHierarchy(request, env);
  if (path === "/api/hierarchy" && method === "PUT") return apiPutHierarchy(request, env);
  if (path === "/api/request-reset" && method === "POST") return apiRequestReset(request, env);
  if (path === "/api/reset-password" && method === "POST") return apiResetPassword(request, env);
  if (path === "/api/officers" && method === "GET") return apiListOfficers(request, env);
  if (path === "/api/officers" && method === "POST") return apiCreateOfficer(request, env);
  if (path.startsWith("/api/officers/") && method === "DELETE") return apiDeleteOfficer(request, env, path);

  return jsonResponse({ error: "Not found" }, 404);
}

/* ---------------- setup / auth ---------------- */

async function apiSetupStatus(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM officers").first();
  return jsonResponse({ needsSetup: row.c === 0 });
}

async function apiSetup(request, env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM officers").first();
  if (row.c > 0) return jsonResponse({ error: "Setup has already been completed" }, 403);

  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: "Invalid request body" }, 400);
  const { username, email, password } = body;
  if (!isValidUsername(username) || !isValidEmail(email) || !isValidPassword(password)) {
    return jsonResponse({ error: "A valid username, email, and password (8+ characters) are required" }, 400);
  }

  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);

  let officerId;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO officers (username, email, password_hash, password_salt, tier) VALUES (?, ?, ?, ?, 'regimental_command')`
    )
      .bind(username, email, hash, salt)
      .run();
    officerId = result.meta.last_row_id;
  } catch {
    return jsonResponse({ error: "That username or email is already taken" }, 409);
  }

  await env.DB.prepare(`INSERT INTO hierarchy (id, data, updated_by) VALUES (1, ?, ?)`)
    .bind(JSON.stringify(DEFAULT_HIERARCHY), officerId)
    .run();

  return withSession(env, officerId, request, { ok: true });
}

async function apiLogin(request, env) {
  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: "Invalid request body" }, 400);
  const { username, password } = body;
  if (!username || !password) return jsonResponse({ error: "Username and password are required" }, 400);

  const officer = await env.DB.prepare("SELECT * FROM officers WHERE username = ?").bind(username).first();
  if (!officer) return jsonResponse({ error: "Invalid username or password" }, 401);

  const hash = await hashPassword(password, officer.password_salt);
  if (!timingSafeEqual(hash, officer.password_hash)) {
    return jsonResponse({ error: "Invalid username or password" }, 401);
  }

  return withSession(env, officer.id, request, {
    ok: true,
    tier: officer.tier,
    mustResetPassword: !!officer.must_reset_password,
  });
}

async function apiLogout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookieHeader(request, "", 0) },
  });
}

async function apiMe(request, env) {
  const officer = await getSessionOfficer(request, env);
  if (!officer) return jsonResponse({ error: "Not authenticated" }, 401);
  return jsonResponse({
    username: officer.username,
    tier: officer.tier,
    mustResetPassword: !!officer.must_reset_password,
  });
}

/* ---------------- hierarchy ---------------- */

async function apiGetHierarchy(request, env) {
  const officer = await getSessionOfficer(request, env);
  if (!officer) return jsonResponse({ error: "Not authenticated" }, 401);
  const row = await env.DB.prepare("SELECT data FROM hierarchy WHERE id = 1").first();
  return new Response(row ? row.data : "{}", { headers: { "Content-Type": "application/json" } });
}

async function apiPutHierarchy(request, env) {
  const officer = await getSessionOfficer(request, env);
  if (!officer) return jsonResponse({ error: "Not authenticated" }, 401);
  if (officer.tier !== "regimental_command") return jsonResponse({ error: "Forbidden" }, 403);

  const body = await parseJsonBody(request);
  if (!body || typeof body.hierarchy !== "object") {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  const dataStr = JSON.stringify(body.hierarchy);
  const summary = String(body.summary || "").slice(0, 200);

  await env.DB.batch([
    env.DB
      .prepare("UPDATE hierarchy SET data = ?, updated_at = datetime('now'), updated_by = ? WHERE id = 1")
      .bind(dataStr, officer.id),
    env.DB
      .prepare("INSERT INTO hierarchy_history (data, changed_by, change_summary) VALUES (?, ?, ?)")
      .bind(dataStr, officer.id, summary),
  ]);

  return jsonResponse({ ok: true });
}

/* ---------------- officers ---------------- */

async function apiListOfficers(request, env) {
  const officer = await getSessionOfficer(request, env);
  if (!officer) return jsonResponse({ error: "Not authenticated" }, 401);
  if (officer.tier !== "regimental_command") return jsonResponse({ error: "Forbidden" }, 403);

  const { results } = await env.DB
    .prepare("SELECT id, username, email, tier, created_at FROM officers ORDER BY created_at")
    .all();
  return jsonResponse({ officers: results });
}

async function apiCreateOfficer(request, env) {
  const officer = await getSessionOfficer(request, env);
  if (!officer) return jsonResponse({ error: "Not authenticated" }, 401);
  if (officer.tier !== "regimental_command") return jsonResponse({ error: "Forbidden" }, 403);

  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: "Invalid request body" }, 400);
  const { username, email, tier } = body;
  if (!isValidUsername(username) || !isValidEmail(email) || !VALID_TIERS.includes(tier)) {
    return jsonResponse({ error: "A valid username, email, and tier are required" }, 400);
  }

  const tempPassword = generateTempPassword();
  const salt = randomHex(16);
  const hash = await hashPassword(tempPassword, salt);

  try {
    await env.DB.prepare(
      `INSERT INTO officers (username, email, password_hash, password_salt, tier, must_reset_password) VALUES (?, ?, ?, ?, ?, 1)`
    )
      .bind(username, email, hash, salt, tier)
      .run();
  } catch {
    return jsonResponse({ error: "That username or email is already taken" }, 409);
  }

  return jsonResponse({ ok: true, tempPassword });
}

async function apiDeleteOfficer(request, env, path) {
  const officer = await getSessionOfficer(request, env);
  if (!officer) return jsonResponse({ error: "Not authenticated" }, 401);
  if (officer.tier !== "regimental_command") return jsonResponse({ error: "Forbidden" }, 403);

  const id = path.split("/").pop();
  if (String(officer.id) === String(id)) {
    return jsonResponse({ error: "You can't remove your own account" }, 400);
  }
  await env.DB.prepare("DELETE FROM officers WHERE id = ?").bind(id).run();
  return jsonResponse({ ok: true });
}

/* ---------------- password reset ---------------- */

async function apiRequestReset(request, env) {
  const body = await parseJsonBody(request);
  if (!body || !isValidEmail(body.email)) return jsonResponse({ error: "A valid email is required" }, 400);

  const officer = await env.DB.prepare("SELECT * FROM officers WHERE email = ?").bind(body.email).first();
  if (officer) {
    const token = randomHex(32);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await env.DB
      .prepare("INSERT INTO password_resets (token, officer_id, expires_at) VALUES (?, ?, ?)")
      .bind(token, officer.id, expiresAt)
      .run();

    const url = new URL(request.url);
    const resetLink = `${url.origin}/reset-password.html?token=${token}`;
    await sendResetEmail(env, officer.email, resetLink);
  }

  // Always the same response, whether or not the email matched, so we don't reveal who's registered.
  return jsonResponse({ ok: true, message: "If that email is registered, a reset link has been sent." });
}

async function apiResetPassword(request, env) {
  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: "Invalid request body" }, 400);
  const { token, newPassword } = body;
  if (!token || !isValidPassword(newPassword)) {
    return jsonResponse({ error: "A reset token and a password of at least 8 characters are required" }, 400);
  }

  const reset = await env.DB
    .prepare("SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')")
    .bind(token)
    .first();
  if (!reset) return jsonResponse({ error: "That reset link is invalid or has expired" }, 400);

  const salt = randomHex(16);
  const hash = await hashPassword(newPassword, salt);

  await env.DB.batch([
    env.DB
      .prepare("UPDATE officers SET password_hash = ?, password_salt = ?, must_reset_password = 0 WHERE id = ?")
      .bind(hash, salt, reset.officer_id),
    env.DB.prepare("UPDATE password_resets SET used = 1 WHERE token = ?").bind(token),
    env.DB.prepare("DELETE FROM sessions WHERE officer_id = ?").bind(reset.officer_id),
  ]);

  return jsonResponse({ ok: true });
}

async function sendResetEmail(env, toEmail, resetLink) {
  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set — skipping password reset email send");
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "5th Marine Regiment Command Hub <onboarding@resend.dev>",
      to: [toEmail],
      subject: "Reset your Command Hub password",
      html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    }),
  });
}

/* ---------------- sessions / cookies ---------------- */

async function getSessionOfficer(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB
    .prepare(
      `SELECT officers.* FROM sessions JOIN officers ON officers.id = sessions.officer_id
       WHERE sessions.token = ? AND sessions.expires_at > datetime('now')`
    )
    .bind(token)
    .first();
}

async function withSession(env, officerId, request, responseBody) {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB
    .prepare("INSERT INTO sessions (token, officer_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, officerId, expiresAt)
    .run();

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieHeader(request, token, SESSION_DAYS * 24 * 60 * 60),
    },
  });
}

function cookieHeader(request, token, maxAgeSeconds) {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/* ---------------- crypto / validation helpers ---------------- */

async function hashPassword(password, saltHex) {
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function isValidUsername(v) {
  return typeof v === "string" && /^[a-zA-Z0-9_.-]{3,32}$/.test(v);
}

function isValidEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidPassword(v) {
  return typeof v === "string" && v.length >= 8;
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
