import { NextResponse } from "next/server";
import { config, validateConfig, isCronAuthorized } from "@/app/lib/config.js";
import { getLastPost, setLastPost } from "@/app/lib/redisMemory.js";
import { buildDailyPrompt } from "@/app/lib/prompt.js";
import { generateText } from "@/app/lib/llm.js";
import { cleanText, prependChannelMention } from "@/app/lib/textFormat.js";
import { jaccardSimilarity } from "@/app/lib/similarity.js";
import { postSlackMessage } from "@/app/lib/slack.js";
import { getSummaryText, updateSummaryWithNewPost } from "@/app/lib/summaryMemory.js";

export const runtime = "nodejs";
const NS = "daily-slack";
const similarityThreshold = 0.35;
const maxAttempts = 3;

export async function GET(request) {
  try {

    if (!isCronAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const missing = validateConfig();
    if (missing.length) {
      return NextResponse.json(
        { ok: false, error: "Missing environment variables", missing },
        { status: 500 }
      );
    }

    const lastPost = await getLastPost(NS);
    const summaryText = await getSummaryText(NS);

    const prompt = buildDailyPrompt(summaryText);

    let finalMessage = "";
    let similarityScore = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const raw = await generateText(prompt);
      finalMessage = prependChannelMention(cleanText(raw));
      similarityScore = jaccardSimilarity(lastPost, finalMessage);
      if (finalMessage.length > 20 && similarityScore < similarityThreshold) break;
    }

    if (finalMessage.length <= 20) {
      throw new Error("Generated message too short");
    }
    let slackTs;
    if (config.sendToSlack) {
      const slackResult = await postSlackMessage(finalMessage);
      slackTs = slackResult.ts;
    }
    await setLastPost(finalMessage, NS);
    let summaryUpdated = false;
    let updatedSummary = "";
    let summaryError;

    const shouldCommit = config.sendToSlack ? Boolean(slackTs) : true;

    if (shouldCommit) {
      try {
        updatedSummary = await updateSummaryWithNewPost(finalMessage, NS);
        summaryUpdated = true;
      } catch (e) {
        console.error("updateSummaryWithNewPost failed:", e, "cause:", e?.cause);
        summaryError = e?.message || "summary_failed";
      }
    }

    if (config.sendToSlack) {
      return NextResponse.json({
        ok: true,
        sent: true,
        ts: slackTs,
        similarity: Number(similarityScore.toFixed(2)),
        preview: finalMessage,
        summaryUpdated,
        updatedSummaryPreview: updatedSummary ? updatedSummary : "",
      });
    }

    return NextResponse.json({
      ok: true,
      sent: false,
      similarity: Number(similarityScore.toFixed(2)),
      preview: finalMessage,
      summaryUpdated,
      summaryError,
      summaryUsedInPrompt: summaryText,
      updatedSummaryPreview: updatedSummary || "",
      note: "SEND_TO_SLACK=false so message was not posted",
    });
  } catch (error) {
    console.error("cron failed:", error, "cause:", error?.cause);
    return NextResponse.json(
      { ok: false, error: error?.message || "unknown_error" },
      { status: 500 }
    );
  }
}
