export function jaccardSimilarity(textA, textB) {
  const tokenize = (value) =>
    new Set(
      (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
    );

  const setA = tokenize(textA);
  const setB = tokenize(textB);

  if (!setA.size || !setB.size) return 0;

  let intersectionCount = 0;
  for (const word of setA) {
    if (setB.has(word)) intersectionCount++;
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount ? intersectionCount / unionCount : 0;
}
