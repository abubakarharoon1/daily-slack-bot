import { NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { ChatOpenAI } from "@langchain/openai";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs"; // needed for Slack SDK

// ---------- ENV ----------
const {
  OPENAI_API_KEY,
  SLACK_TOKEN,
  SLACK_CHANNEL_ID,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  SEND_TO_SLACK = "false",
  CRON_SECRET,
} = process.env;

const SEND_ENABLED = SEND_TO_SLACK.toLowerCase() === "true";

// ---------- Clients ----------
const slack = new WebClient(SLACK_TOKEN);

const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0.8,
  apiKey: OPENAI_API_KEY,
});

const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

// ---------- Memory config ----------
const KEY_HISTORY = "daily-slack:history"; // list of last posts
const HISTORY_LIMIT = 5;

// ---------- Helpers ----------
function isAuthorized(req) {
  if (!CRON_SECRET) return true;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${CRON_SECRET}`;
}

function extractContent(msg) {
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  return msg.content?.[0]?.text || "";
}

function transformForSlack(text) {
  if (!text) return "";

  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/(^|\n)Use cases:\s*/i, "$1*Use cases:*\n");
  text = text.replace(/(^|\n)References:\s*/i, "$1*References:*\n");
  text = text.replace(/^\s*\*(.+?)\*:(.*)$/gm, "• *$1*:$2");
  text = text.replace(/^\s*\[(.+?)\][^\n]*?(https?:\/\/\S+)/gm, "• $1: <$2>");
  text = text.replace(/[ \t]+$/gm, "");
  return text;
}

function cleanText(text) {
  if (!text) return "";
  text = transformForSlack(text);

  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function addChannelMentionFirst(text) {
  if (!text) return "";
  const t = text.trim();
  return t.startsWith("<!channel>") ? t : `<!channel>\n${t}`;
}

function jaccardSimilarity(a, b) {
  const tokenize = (s) =>
    new Set(
      (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
    );

  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return 0;

  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function buildPrompt(previousPosts = []) {
  const prevBlock = previousPosts
    .map((t, i) => `--- Previous Post ${i + 1} (do not copy) ---\n${t}\n`)
    .join("\n");

  return `
You are a senior AI + MERN-stack developer writing ONE short daily informational Slack post for MERN/AI/Web3 developers.

Audience interests:
- MERN stack (MongoDB, Express, React, Node), Next.js, TypeScript, testing, performance, architecture, DevOps
- AI/LLMs (agents, RAG, evals, vector DBs, guardrails, MLOps)
- Blockchain/Web3 (smart contracts, DeFi, infra, security)

CRITICAL novelty rule:
- The new post MUST be clearly DIFFERENT from the previous posts below.
- Do NOT reuse the same main topic/tool/library, angles, titles, wording, or reference links.

Previous posts (do not copy or paraphrase closely):
${prevBlock || "(none)"}

Slack formatting rules:
- Use Slack bold with *single asterisks* only. NEVER use **double asterisks**.
- Do NOT use code fences. Do NOT use inline backticks.
- Use 1–3 emojis inside the message (not at the beginning).
- Use emojis for use-case bullets (🔹, 🤖, ⚙️, 🔁).

Structure must be EXACTLY:

*Your bold title here*
Intro line…
Explanation line…
Explanation line…

Use cases:

🔹 *Bold use case name:* short explanation…

🔹 *Bold use case name:* short explanation…

References:

[Type] Short title – URL
[Type] Short title – URL
[Type] Short title – URL (optional)
[Type] Short title – URL (optional)

Additional constraints:
- Total words from title through last use-case bullet MUST be 60–120 words.
- Use only real, verifiable URLs (official docs, GitHub, reputable blog/video).
- If you mention a tool/library, include at least one reference directly about it.

Output:
Plain Slack message only. No quotes. No extra commentary.
`;
}

// ---------- Main handler ----------
export async function GET(req) {
  try {
    // 1) Optional auth
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    if (!OPENAI_API_KEY || !SLACK_TOKEN || !SLACK_CHANNEL_ID) {
      return NextResponse.json(
        { ok: false, error: "Missing required env vars" },
        { status: 500 }
      );
    }

    // 2) Load history from Upstash
    const history = (await redis.lrange(KEY_HISTORY, 0, HISTORY_LIMIT - 1)) || [];
    const lastPost = history?.[0] || "";

    const prompt = buildPrompt(history);

    // 3) Generate with similarity guard
    let finalText = "";
    for (let tries = 1; tries <= 3; tries++) {
      const msg = await llm.invoke(prompt);
      const raw = extractContent(msg);

      finalText = addChannelMentionFirst(cleanText(raw));
      const sim = jaccardSimilarity(lastPost, finalText);

      if (finalText.length > 20 && sim < 0.35) break;
      console.log(`Regenerating (try ${tries}) similarity=${sim.toFixed(2)}`);
    }

    // 4) Save new post in memory
    await redis.lpush(KEY_HISTORY, finalText);
    await redis.ltrim(KEY_HISTORY, 0, HISTORY_LIMIT - 1);

    // 5) Send or just preview
    if (SEND_ENABLED) {
      const res = await slack.chat.postMessage({
        channel: SLACK_CHANNEL_ID,
        text: finalText,
      });

      return NextResponse.json({
        ok: true,
        sent: true,
        ts: res.ts,
        preview: finalText,
      });
    }

    return NextResponse.json({
      ok: true,
      sent: false,
      preview: finalText,
      note: "SEND_TO_SLACK=false so message was not posted",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown_error" },
      { status: 500 }
    );
  }
}
