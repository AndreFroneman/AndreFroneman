import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./dist/server/index.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist", "client");
const port = Number(process.env.PORT || 8080);
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".json":"application/json" };

async function assetFetch(request) {
  const url = new URL(request.url);
  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\//, "");
  const target = join(root, safePath);
  try {
    if (!(await stat(target)).isFile()) throw new Error("not a file");
    const data = await readFile(target);
    return new Response(data, { status:200, headers:{ "Content-Type":mime[extname(target)] || "application/octet-stream", "Cache-Control":"public, max-age=31536000, immutable" } });
  } catch { return new Response("Not found", { status:404 }); }
}

const server = createServer(async (nodeRequest, nodeResponse) => {
  const url = new URL(nodeRequest.url || "/", `http://${nodeRequest.headers.host || "localhost"}`);
  if (url.pathname === "/api/health") return sendJson(nodeResponse, 200, { status:"healthy", service:"plc-changeops", version:"0.1.0", timestamp:new Date().toISOString() });
  if (url.pathname === "/api/integrations") return sendJson(nodeResponse, 200, { connectors:["nautilus","git","sparkplug-b","ethernet-ip","ignition"], webhook:"/api/hooks/change-event" });
  if (url.pathname === "/api/hooks/change-event" && nodeRequest.method === "POST") return sendJson(nodeResponse, 202, { accepted:true, correlationId:crypto.randomUUID() });
  try {
    if (url.pathname.startsWith("/_next/") || url.pathname === "/favicon.svg") {
      const assetResponse = await assetFetch(new Request(url));
      return sendWebResponse(nodeResponse, assetResponse, nodeRequest.method);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(nodeRequest.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    const request = new Request(url, { method:nodeRequest.method, headers });
    const response = await worker.fetch(request, { ASSETS:{ fetch:assetFetch } }, { waitUntil:promise => Promise.resolve(promise).catch(console.error) });
    return sendWebResponse(nodeResponse, response, nodeRequest.method);
  } catch (error) {
    console.error(error);
    sendJson(nodeResponse, 500, { error:"internal_error" });
  }
});

function sendJson(response, status, body) { response.writeHead(status, { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" }); response.end(JSON.stringify(body)); }
async function sendWebResponse(nodeResponse, response, method) {
  const outHeaders = Object.fromEntries(response.headers.entries());
  outHeaders["x-content-type-options"] = "nosniff";
  outHeaders["x-frame-options"] = "SAMEORIGIN";
  outHeaders["referrer-policy"] = "same-origin";
  nodeResponse.writeHead(response.status, outHeaders);
  if (!response.body || method === "HEAD") return nodeResponse.end();
  for await (const chunk of response.body) nodeResponse.write(chunk);
  nodeResponse.end();
}
server.listen(port, "0.0.0.0", () => console.log(`PLC ChangeOps listening on ${port}`));
