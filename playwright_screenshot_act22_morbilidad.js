const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8100;
const ROOT = __dirname;
const BASE = `http://127.0.0.1:${PORT}`;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const filePath = path.join(ROOT, urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const CDN_LOCAL = {
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js": "node_modules/chart.js/dist/chart.umd.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js": "node_modules/jspdf/dist/jspdf.umd.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js": "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.js",
};

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  for (const [url, localPath] of Object.entries(CDN_LOCAL)) {
    await page.route(url, (route) => route.fulfill({ path: localPath }));
  }
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "/* fuentes deshabilitadas */" })
  );
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.evaluate(() => window.SNSP_AUTH.login("soraya.sanchez@snsp.qro.gob.mx", "SNSP2025"));
  await page.goto(BASE + "/pages/morbilidad.html", { waitUntil: "load" });
  await page.waitForTimeout(600);
  await page.click("#btn-morb-abrir-pdf");
  await page.waitForTimeout(200);
  await page.click("#btn-morb-pdf-generar");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ROOT, "act22_morbilidad_vista_previa_captura.png"), fullPage: false });
  await browser.close();
  server.close();
})();
