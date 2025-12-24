import { NextResponse } from "next/server";
import { config, validateConfig, isCronAuthorized } from "@/app/lib/config.js";
import { getRecentPosts, savePostToHistory } from "@/app/lib/redisMemory.js";
import { buildDailyPrompt } from "@/app/lib/prompt.js";
import { generateText } from "@/app/lib/llm.js";
import { cleanText, prependChannelMention } from "@/app/lib/textFormat.js";
import { jaccardSimilarity } from "@/app/lib/similarity.js";
import { postSlackMessage } from "@/app/lib/slack.js";
import { getSummaryText, updateSummaryWithNewPost } from "@/app/lib/summaryMemory.js";

export const runtime = "nodejs";

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

    const recentPosts = await getRecentPosts(30);
    const lastPost = recentPosts?.[0] || "";
    const summaryText = await getSummaryText();
    const prompt = buildDailyPrompt(summaryText);
    const similarityThreshold = 0.35;
    const maxAttempts = 3;
    let finalMessage = "";
    let similarityScore = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const raw = await generateText(prompt);
      finalMessage = prependChannelMention(cleanText(raw));
      similarityScore = jaccardSimilarity(lastPost, finalMessage);
      if (finalMessage.length > 20 && similarityScore < similarityThreshold) break;
    }

    await savePostToHistory(finalMessage);
    let summaryUpdated = false;
    let updatedSummary = "";
    let summaryError;
    try {
      updatedSummary = await updateSummaryWithNewPost(finalMessage);
      summaryUpdated = true;
    } catch (e) {
      console.error("savePostAndRefreshSummary failed:", e, "cause:", e?.cause);
      summaryError = e?.message || "summary_failed";
    }

    if (config.sendToSlack) {
      const slackResult = await postSlackMessage(finalMessage);

      return NextResponse.json({
        ok: true,
        sent: true,
        ts: slackResult.ts,
        similarity: Number(similarityScore.toFixed(2)),
        preview: finalMessage,
        summaryUpdated,
        updatedSummaryPreview: updatedSummary ? updatedSummary.slice(0, 220) : "",
      });
    }

    return NextResponse.json({
      ok: true,
      sent: false,
      similarity: Number(similarityScore.toFixed(2)),
      preview: finalMessage,
      summaryUpdated,
      summaryError,
      updatedSummaryPreview: updatedSummary ? updatedSummary.slice(0, 220) : "",
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
