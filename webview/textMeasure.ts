export function estimateTextWidth(
  text: string,
  fontSize = 13,
  fontWeight: 400 | 600 | 700 = 400,
): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === ' ') units += 0.35;
    else if (code < 0x80) units += /[ilI.,'|]/.test(ch) ? 0.35 : 0.62;
    else if (
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      units += 1;
    } else {
      units += 0.75;
    }
  }

  const weightFactor = fontWeight >= 600 ? 1.08 : 1;
  return Math.ceil(units * fontSize * weightFactor);
}
