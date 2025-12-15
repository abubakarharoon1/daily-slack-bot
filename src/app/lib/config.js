export const config = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  slackToken: process.env.SLACK_TOKEN,
  slackChannelId: process.env.SLACK_CHANNEL_ID,

  upstashRestUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashRestToken: process.env.UPSTASH_REDIS_REST_TOKEN,

  sendToSlack: (process.env.SEND_TO_SLACK || "false").toLowerCase() === "true",
  cronSecret: process.env.CRON_SECRET || "",

  historyKey: "daily-slack:history",
  historyLimit: 5,

  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature: Number(process.env.OPENAI_TEMPERATURE || 0.8),
};

export function validateConfig() {
  const missing = [];
  if (!config.openaiApiKey) missing.push("OPENAI_API_KEY");
  if (!config.slackToken) missing.push("SLACK_TOKEN");
  if (!config.slackChannelId) missing.push("SLACK_CHANNEL_ID");
  if (!config.upstashRestUrl) missing.push("UPSTASH_REDIS_REST_URL");
  if (!config.upstashRestToken) missing.push("UPSTASH_REDIS_REST_TOKEN");

  return missing;
}

export function isCronAuthorized(request) {
  
  if (!config.cronSecret) return true;

  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${config.cronSecret}`;
}
