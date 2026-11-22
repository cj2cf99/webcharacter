// Keep the established pair:option format for IDs without a colon.
export function pairChoice(pair, option) {
  return pair.includes(":") || option.includes(":")
    ? "::" + JSON.stringify([pair, option])
    : pair + ":" + option;
}

export function splitPairChoice(value) {
  if (typeof value !== "string") return [];
  if (value.startsWith("::")) {
    try {
      const ids = JSON.parse(value.slice(2));
      if (Array.isArray(ids) && ids.length === 2 && ids.every((id) => typeof id === "string" && id.length)
        && pairChoice(...ids) === value) return ids;
    } catch {}
    return [];
  }
  const separator = value.indexOf(":");
  return separator > 0 && separator < value.length - 1 && separator === value.lastIndexOf(":")
    ? [value.slice(0, separator), value.slice(separator + 1)]
    : [];
}
