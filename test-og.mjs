// test-og.mjs — Test api/og.js local
// Chạy: node test-og.mjs
// Test: http://localhost:3099/api/test-crawler?cat=Nam

import http from "http";

const { default: handler } = await import("./api/og.js");

const PORT = 3099;

const server = http.createServer(async (req, res) => {
    let url = req.url;
    let headers = { ...req.headers };

    // /api/test-crawler?... → giả lập crawler UA
    if (url.startsWith("/api/test-crawler")) {
        url = url.replace("/api/test-crawler", "/") || "/";
        headers["user-agent"] = "facebookexternalhit/1.1";
    }

    const mockRes = {
        statusCode: 200,
        setHeader(k, v) { res.setHeader(k, v); },
        writeHead(code, h) { res.writeHead(code, h); },
        end(body) { res.end(body); },
        status(code) { this.statusCode = code; return this; },
        send(body) { res.writeHead(this.statusCode); res.end(body); },
    };

    try {
        await handler({ url, headers }, mockRes);
    } catch (e) {
        console.error("Error:", e);
        res.writeHead(500);
        res.end("Error: " + e.message);
    }
});

server.listen(PORT, () => {
    console.log(`
  🧪 OG Test Server: http://localhost:${PORT}

  Test crawler (giả lập Facebook):
    http://localhost:${PORT}/api/test-crawler?cat=Nam
    http://localhost:${PORT}/api/test-crawler?cat=Nu
    http://localhost:${PORT}/api/test-crawler
    http://localhost:${PORT}/api/test-crawler?q=fondant

  Test user thường:
    http://localhost:${PORT}/
  `);
});
