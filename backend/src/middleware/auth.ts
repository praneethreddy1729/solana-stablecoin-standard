import { FastifyRequest, FastifyReply } from "fastify";

const API_KEY = process.env.API_KEY;

// Routes that do NOT require authentication
const PUBLIC_ROUTES = new Set(["/health", "/status", "/events"]);

/**
 * API key authentication middleware.
 * Checks `Authorization: Bearer <key>` header on protected routes.
 * If API_KEY is not configured, all requests are allowed (dev mode) with a warning logged once.
 */
let devModeWarned = false;

export async function apiKeyAuth(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Allow preflight and public routes through
  if (req.method === "OPTIONS") return;
  if (PUBLIC_ROUTES.has(req.url.split("?")[0])) return;

  if (!API_KEY) {
    if (!devModeWarned) {
      req.log.warn(
        "API_KEY not set — all requests allowed (dev mode). Set API_KEY in production."
      );
      devModeWarned = true;
    }
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== API_KEY) {
    reply.status(401).send({ error: "Invalid API key" });
    return;
  }
}
