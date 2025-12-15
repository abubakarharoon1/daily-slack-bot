export function transformForSlack(text) {
  if (!text) return "";

  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/(^|\n)Use cases:\s*/i, "$1*Use cases:*\n");
  text = text.replace(/(^|\n)References:\s*/i, "$1*References:*\n");
  text = text.replace(/^\s*\*(.+?)\*:(.*)$/gm, "• *$1*:$2");

  text = text.replace(/^\s*\[(.+?)\][^\n]*?(https?:\/\/\S+)/gm, "• $1: <$2>");
  text = text.replace(/[ \t]+$/gm, "");
  return text;
}

export function cleanText(text) {
  if (!text) return "";

  const transformed = transformForSlack(text);

  return transformed
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function prependChannelMention(text) {
  if (!text) return "";
  const trimmed = text.trim();
  return trimmed.startsWith("<!channel>") ? trimmed : `<!channel>\n${trimmed}`;
}
