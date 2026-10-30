/**
 * A meta description from longer copy, for pages whose description comes from
 * data (e.g. a demo video's description on its /demos/<slug>/ page).
 *
 * Text at or under the limit is returned exactly as written. Longer text is cut
 * at the last whole word that fits, trailing punctuation dropped, and closed with
 * three ASCII periods (never the single ellipsis character), so the result is at
 * most `limit` characters.
 */
export function clampDescription(text: string, limit = 160): string {
  if (text.length <= limit) return text;
  // limit - 2 characters: a space at the last index still leaves room for "...".
  const room = text.slice(0, limit - 2);
  const lastSpace = room.lastIndexOf(' ');
  const cut = lastSpace > 0 ? room.slice(0, lastSpace) : text.slice(0, limit - 3);
  return `${cut.replace(/[\s.,;:]+$/, '')}...`;
}
