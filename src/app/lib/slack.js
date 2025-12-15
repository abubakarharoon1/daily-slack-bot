import { WebClient } from "@slack/web-api";
import { config } from "./config.js";

const slackClient = new WebClient(config.slackToken);

export async function postSlackMessage(text) {
  return slackClient.chat.postMessage({
    channel: config.slackChannelId,
    text,
  });
}
