import { Redis } from "@upstash/redis";
import { ChatOpenAI } from "@langchain/openai";
import { ConversationSummaryBufferMemory } from "langchain/memory";
import { UpstashRedisChatMessageHistory } from "@langchain/community/stores/message/upstash_redis";
import { config } from "./config.js";

const upstash = new Redis({
  url: config.upstashRestUrl,
  token: config.upstashRestToken,
});

export function getSummaryMemory(sessionId = "daily-slack") {
  const chatHistory = new UpstashRedisChatMessageHistory({
    sessionId,
    client: upstash,
  });

  return new ConversationSummaryBufferMemory({
    llm: new ChatOpenAI({
      model: config.model,
      temperature: 0,
      openAIApiKey: config.openaiApiKey,
    }),
    chatHistory,
    maxTokenLimit: 1200,
    returnMessages: false,
  });
}
