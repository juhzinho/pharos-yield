import { scanRequest } from "../lib/scan.js";

async function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  const send = (out) =>
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(out));
  if (req.method !== "POST") return send({ ok: false, reason: "The compare is a POST." });
  try {
    const body = await bodyOf(req);
    const out = await scanRequest({
      amount: body.amount,
      days: body.days,
      from: body.from,
      lang: body.lang === "pt" ? "pt" : "en",
    });
    send(out);
  } catch {
    send({ ok: false, reason: "The vaults could not be read." });
  }
}
