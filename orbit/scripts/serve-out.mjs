import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "out");
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    let filePath = normalize(join(root, pathname));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    let info;
    try {
      info = await stat(filePath);
    } catch {
      info = null;
    }
    if (info?.isDirectory()) filePath = join(filePath, "index.html");
    if (!info || (pathname !== "/" && !extname(filePath))) {
      const html = filePath + ".html";
      try {
        await stat(html);
        filePath = html;
      } catch {
        filePath = join(root, "404.html");
      }
    }
    const data = await readFile(filePath).catch(() => readFile(join(root, "404.html")).catch(() => Buffer.from("Not found")));
    const ext = extname(filePath);
    res.writeHead(filePath.includes("404") && data.toString() === "Not found" ? 404 : 200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

server.listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
