import { Redis } from "@upstash/redis";
import { config } from "./config.js";

const redis = new Redis({
  url: config.upstashRestUrl,
  token: config.upstashRestToken,
});

const summaryKey = (ns) => `${ns}:summary`;
const lastPostKey = (ns) => `${ns}:lastPost`;

export async function getLastSummary(ns = "daily-slack") {
  return (await redis.get(summaryKey(ns))) || "";
}

export async function setLastSummary(text, ns = "daily-slack") {
  await redis.set(summaryKey(ns), text || "");
}

export async function getLastPost(ns = "daily-slack") {
  return (await redis.get(lastPostKey(ns))) || "";
}

export async function setLastPost(text, ns = "daily-slack") {
  await redis.set(lastPostKey(ns), text || "");
}
