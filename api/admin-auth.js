import {
  authenticateGoogle,
  authenticatePassword,
  clearAdminSession,
  readAdminSession,
  setAdminSession,
} from "./_admin-auth.js";
import { enforceRateLimit, json, readJsonBody } from "./_http.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { ok: false, authenticated: false });
    return json(res, 200, {
      ok: true,
      authenticated: true,
      user: session.user,
      expiresAt: session.expiresAt,
    });
  }

  if (req.method === "DELETE") {
    clearAdminSession(res);
    return json(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }
  if (!enforceRateLimit(req, res, { scope: "admin-login", limit: 12, windowMs: 15 * 60_000 })) {
    return;
  }

  try {
    const body = await readJsonBody(req, { maxBytes: 24 * 1024 });
    const provider = String(body.provider || "password").toLowerCase();
    const user = provider === "google"
      ? await authenticateGoogle(body.accessToken)
      : await authenticatePassword(body.username, body.password);
    if (!user) return json(res, 401, { ok: false, error: "Sai thông tin đăng nhập hoặc tài khoản đã bị khóa" });

    setAdminSession(res, user);
    return json(res, 200, { ok: true, user });
  } catch (error) {
    return json(res, error?.statusCode || 500, {
      ok: false,
      error: error?.message || "Authentication failed",
    });
  }
}
