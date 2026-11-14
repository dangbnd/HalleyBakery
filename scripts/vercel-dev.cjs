const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");
const fs = require("fs/promises");

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";

function attachResponseHelpers(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function json(body) {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = function send(body) {
    if (Buffer.isBuffer(body) || typeof body === "string") res.end(body);
    else res.json(body);
    return res;
  };
}

async function loadApiHandler(name) {
  if (!/^[a-z0-9_-]+$/i.test(name)) return null;
  const file = path.join(root, "api", `${name}.js`);
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) return null;
  const moduleUrl = `${pathToFileURL(file).href}?mtime=${stat.mtimeMs}`;
  const loaded = await import(moduleUrl);
  return typeof loaded.default === "function" ? loaded.default : null;
}

(async () => {
  const vite = await import("vite");
  const mode = process.env.NODE_ENV || "development";
  const env = vite.loadEnv(mode, root, "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  process.env.VERCEL_DEV = "1";

  const viteServer = await vite.createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const match = url.pathname.match(/^\/api\/([a-z0-9_-]+)\/?$/i);
      if (!match) return viteServer.middlewares(req, res);

      const handler = await loadApiHandler(match[1]);
      if (!handler) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "API route not found" }));
        return;
      }

      req.query = Object.fromEntries(url.searchParams.entries());
      attachResponseHelpers(res);
      await handler(req, res);
      if (!res.writableEnded) res.end();
    } catch (error) {
      if (res.writableEnded) return;
      res.statusCode = Number(error?.statusCode) || 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: error?.message || "Local API error" }));
    }
  });

  server.listen(port, host, () => {
    console.log(`Halley Bakery local: http://localhost:${port}`);
  });

  const shutdown = async () => {
    await viteServer.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
