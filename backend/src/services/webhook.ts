import * as crypto from "crypto";
import pino from "pino";

const logger = pino({ name: "webhook-service" });

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Posts an event to the configured webhook URL.
 * Retries up to `retries` times with exponential backoff (1s, 2s, 4s).
 * If WEBHOOK_URL is not set, logs a message and returns.
 */
export async function sendWebhook(
  event: string,
  data: object,
  retries = 3
): Promise<void> {
  if (!WEBHOOK_URL) {
    logger.info({ event }, "No WEBHOOK_URL configured, skipping webhook");
    return;
  }

  const payload = { event, data, timestamp: new Date().toISOString() };
  const body = JSON.stringify(payload);

  // Compute HMAC-SHA256 signature if WEBHOOK_SECRET is configured.
  // Recipients should verify by computing HMAC-SHA256(raw_body, secret) and
  // comparing with the X-Webhook-Signature header using a timing-safe comparison.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (WEBHOOK_SECRET) {
    const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    headers["X-Webhook-Signature"] = signature;
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers,
        body,
      });

      if (res.ok) {
        logger.info({ event, status: res.status }, "Webhook delivered");
        return;
      }

      logger.error(
        { status: res.status, event, attempt: attempt + 1 },
        "Webhook request returned non-OK status"
      );
    } catch (err) {
      if (attempt === retries - 1) {
        logger.error(
          { err, event },
          "Webhook delivery failed after retries"
        );
        return;
      }
      logger.warn(
        { err, event, attempt: attempt + 1 },
        "Webhook delivery attempt failed, retrying"
      );
    }

    if (attempt < retries - 1) {
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
}
