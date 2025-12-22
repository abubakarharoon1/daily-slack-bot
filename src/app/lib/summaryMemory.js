import { Redis } from "@upstash/redis";
import { ChatOpenAI } from "@langchain/openai";
import { config } from "./config.js";

const redis = new Redis({ url: config.upstashRestUrl, token: config.upstashRestToken });
const llm = new ChatOpenAI({ model: config.model, temperature: 0, openAIApiKey: config.openaiApiKey });

export const HISTORY_KEY = "daily-slack:history";
const SUMMARY_KEY = "daily-slack:summary";
const MAX_POSTS_TO_SUMMARIZE_FROM = 30;     
const MAX_CONTEXT_POSTS = 12;              
const MAX_POST_CHARS = 280;                 
const MAX_PROMPT_CHARS = 3500;            

function normalizePost(p) {
  return String(p || "").replace(/\s+/g, " ").trim();
}

function clampTo120Words(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 120) return words.join(" ");
  return words.slice(0, 120).join(" ");
}

export async function getSummaryMemory() {
  return (await redis.get(SUMMARY_KEY)) || "";
}

export async function updateSummaryMemory(newPost) {
  const postsRaw = await redis.lrange(HISTORY_KEY, 0, MAX_POSTS_TO_SUMMARIZE_FROM - 1);
  let contextPosts = postsRaw
    .slice(0, MAX_CONTEXT_POSTS)
    .map((p) => normalizePost(p).slice(0, MAX_POST_CHARS));
  while (contextPosts.join("\n").length > MAX_PROMPT_CHARS && contextPosts.length > 4) {
    contextPosts = contextPosts.slice(0, Math.ceil(contextPosts.length / 2));
  }

  const prompt = `
You are an AI assistant maintaining a concise memory summary of recent Slack posts.

Rules:
- Keep it under 120 words.
- Only extract: title, key points, topics, tools, and themes.
- Do NOT reuse sentences from the original posts.
- No formatting, no emojis.

Previous posts:
${contextPosts.join("\n")}

New post:
${normalizePost(newPost).slice(0, 600)}

Updated concise summary:
`.trim();

  const response = await llm.invoke(prompt);
  const updatedSummaryRaw = (typeof response === "string" ? response : response?.content) || "";
  const updatedSummary = clampTo120Words(updatedSummaryRaw);

  if (updatedSummary) {
    await redis.set(SUMMARY_KEY, updatedSummary);
  }

  return updatedSummary;
}
