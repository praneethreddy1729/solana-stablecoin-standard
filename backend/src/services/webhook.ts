import pino from "pino";

const logger = pino({ name: "webhook-service" });

const WEBHOOK_URL = process.env.WEBHOOK_URL;

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

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
