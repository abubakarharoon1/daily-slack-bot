import { Redis } from "@upstash/redis";
import { ChatOpenAI } from "@langchain/openai";
import { ConversationSummaryBufferMemory } from "langchain/memory";
import { UpstashRedisChatMessageHistory } from "@langchain/community/stores/message/upstash_redis";
import { config } from "./config.js";

const upstash = new Redis({
  url: config.upstashRestUrl,
  token: config.upstashRestToken,
});

const SUMMARY_KEY = "daily-slack:summary";
const llm = new ChatOpenAI({
  model: config.model,
  temperature: 0,
  openAIApiKey: config.openaiApiKey,
});
function clampWords(text, maxWords = 140) {
  return String(text || "")
    .split(/\s+/)
    .slice(0, maxWords)
    .join(" ");
}
export async function getSummaryText() {
  return (await upstash.get(SUMMARY_KEY)) || "";
}

export async function updateSummaryWithNewPost(newPost, sessionId = "daily-slack") {
  const oldSummary = await getSummaryText();
  const prompt = `
You maintain a rolling topic memory for a Slack bot.

Rules:
- Produce a concise UPDATED summary using OLD SUMMARY + NEW POST
- minimum size very minimum
- Capture topics, tools, and themes
- Do NOT copy sentences
- No emojis, no markdown, no "Human/AI" labels

OLD SUMMARY:
${oldSummary || "(none)"}

NEW POST:
${newPost}

UPDATED SUMMARY:
`.trim();

  const res = await llm.invoke(prompt);
  const updatedSummary = clampWords(res.content || "", 140);
  await upstash.set(SUMMARY_KEY, updatedSummary);
  const chatHistory = new UpstashRedisChatMessageHistory({
    sessionId,
    client: upstash,
  });

  const memory = new ConversationSummaryBufferMemory({
    llm,
    chatHistory,
    maxTokenLimit: 1200,
  });

  await memory.saveContext(
    { input: "Daily Slack Post" },
    { output: newPost }
  );

  return updatedSummary;
}
