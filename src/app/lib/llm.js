import { ChatOpenAI } from "@langchain/openai";
import { config } from "./config.js";

const llm = new ChatOpenAI({
  model: config.model,
  temperature: config.temperature,
  apiKey: config.openaiApiKey,
});

export async function generateText(prompt) {
  const response = await llm.invoke(prompt);

  if (!response) return "";
  if (typeof response.content === "string") return response.content;

  return response.content?.[0]?.text || "";
}
