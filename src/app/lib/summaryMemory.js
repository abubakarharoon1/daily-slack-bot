import { ChatOpenAI } from "@langchain/openai";
import { ConversationSummaryBufferMemory } from "langchain/memory";
import { getLastSummary, setLastSummary } from "./redisMemory.js";

const memory = new ConversationSummaryBufferMemory({
  llm: new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
  }),
});

export async function getSummaryText(ns = "daily-slack") {
  return await getLastSummary(ns);
}

export async function updateSummaryWithNewPost(post, ns = "daily-slack") {
  const existing = await getLastSummary(ns);

const updated = await memory.predictNewSummary([post], existing);

  await setLastSummary(updated, ns);
  return updated;
}
