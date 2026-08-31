import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getNifty, status } from "./server/nifty.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const PORT = Number(process.env.PORT) || 8787;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(dist, urlPath));
  if (!file.startsWith(dist)) {
    send(res, 403, "forbidden", "text/plain");
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const fallback = path.join(dist, "index.html");
    if (fs.existsSync(fallback)) {
      send(res, 200, fs.readFileSync(fallback), TYPES[".html"]);
      return;
    }
    send(res, 404, "not found", "text/plain");
    return;
  }
  const ext = path.extname(file);
  send(res, 200, fs.readFileSync(file), TYPES[ext] || "application/octet-stream");
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  try {
    if (url.startsWith("/health.txt")) {
      send(res, 200, "ok\n", "text/plain; charset=utf-8");
      return;
    }
    if (url.startsWith("/api/health")) {
      send(res, 200, JSON.stringify(status()));
      return;
    }
    if (url.startsWith("/api/nifty")) {
      const q = await getNifty();
      send(res, 200, JSON.stringify(q));
      return;
    }
    serveStatic(req, res);
  } catch {
    send(res, 502, JSON.stringify({ error: "feed_unavailable" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`nifty-session-cop listening on ${PORT}`);
});
