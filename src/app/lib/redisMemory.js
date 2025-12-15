import { Redis } from "@upstash/redis";
import { config } from "./config.js";

const redis = new Redis({
  url: config.upstashRestUrl,
  token: config.upstashRestToken,
});

export async function getRecentPosts() {
  return (await redis.lrange(config.historyKey, 0, config.historyLimit - 1)) || [];
}

export async function savePostToHistory(text) {
  await redis.lpush(config.historyKey, text);
  await redis.ltrim(config.historyKey, 0, config.historyLimit - 1);
}
