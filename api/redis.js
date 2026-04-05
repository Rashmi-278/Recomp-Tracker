// Server-side Redis proxy — keeps Upstash credentials out of the client bundle.
// Vercel invokes this at /api/redis on every request that reaches the function.

const ALLOWED_COMMANDS = new Set(["get", "set", "setnx", "del"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { command, key, value } = req.body ?? {};

  // Validate key — only allow recomp-* keys so this proxy can't be used as a
  // general-purpose Redis gateway.
  if (typeof key !== "string" || !key.startsWith("recomp-")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!ALLOWED_COMMANDS.has(command)) {
    return res.status(400).json({ error: "Invalid command" });
  }

  const UPSTASH_URL = process.env.UPSTASH_URL;
  const UPSTASH_TOKEN = process.env.UPSTASH_TOKEN;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(503).json({ error: "Redis not configured" });
  }

  try {
    const isRead = command === "get";
    const upstashRes = await fetch(
      `${UPSTASH_URL}/${command}/${encodeURIComponent(key)}`,
      {
        method: isRead ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
        },
        // Pass the value as a raw string body for set/setnx — Upstash REST API
        // expects the value in the body, not as JSON.
        ...(value != null ? { body: String(value) } : {}),
      }
    );

    const data = await upstashRes.json();
    return res.status(upstashRes.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: "Redis proxy error" });
  }
}
