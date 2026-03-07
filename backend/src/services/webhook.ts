import pino from "pino";

const logger = pino({ name: "webhook-service" });

const WEBHOOK_URL = process.env.WEBHOOK_URL;

/**
 * Posts an event to the configured webhook URL.
 * If WEBHOOK_URL is not set, logs a message and returns.
 */
export async function sendWebhook(event: string, data: object): Promise<void> {
  if (!WEBHOOK_URL) {
    logger.info({ event }, "No WEBHOOK_URL configured, skipping webhook");
    return;
  }

  try {
    const payload = { event, data, timestamp: new Date().toISOString() };
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.error(
        { status: res.status, event },
        "Webhook request returned non-OK status"
      );
    } else {
      logger.info({ event, status: res.status }, "Webhook delivered");
    }
  } catch (err) {
    logger.error({ err, event }, "Failed to send webhook");
  }
}
