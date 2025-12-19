import { Redis } from "@upstash/redis";
import { ChatOpenAI } from "@langchain/openai";
import { config } from "./config.js";

const redis = new Redis({ url: config.upstashRestUrl, token: config.upstashRestToken });
const llm = new ChatOpenAI({ model: config.model, temperature: 0, openAIApiKey: config.openaiApiKey });

const MAX_POSTS = 30;
const SUMMARY_KEY = "daily-slack:summary";

export async function getSummaryMemory() {
  return (await redis.get(SUMMARY_KEY)) || "";
}

export async function updateSummaryMemory(newPost) {
  const posts = await redis.lrange("daily-slack:history", 0, MAX_POSTS - 1);

  const prompt = `
You are an AI assistant maintaining a concise memory summary of recent Slack posts.

Rules:
- Keep it under 120 words.
- Only extract: title, key points, topics, tools, and themes.
- Do NOT reuse sentences from the original posts.
- No formatting, no emojis.

Previous posts:
${posts.join("\n")}

New post:
${newPost}

Updated concise summary:
`;

  const response = await llm.invoke(prompt);
  const updatedSummary = typeof response === "string" ? response.trim() : response.output_text?.trim() || "";

  if (updatedSummary) await redis.set(SUMMARY_KEY, updatedSummary);
  return updatedSummary;
}
