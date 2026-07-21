import { sniffImage } from "@maliang/codex-gateway";
import type { DialogueOverlay } from "@maliang/render-compiler";

export interface ComposePanelInput {
  artBytes: Buffer;
  width?: number;
  height?: number;
  dialogue: readonly DialogueOverlay[];
  focusLabel?: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapDialogue(value: string, maxCharacters = 24): string[] {
  const words = value.trim().split(/\s+/u);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function bubbleSvg(
  overlay: DialogueOverlay,
  index: number,
  width: number
): string {
  const lines = wrapDialogue(overlay.exactText);
  const bubbleWidth = Math.min(width * 0.7, 80 + Math.max(...lines.map((line) => line.length), 1) * 10);
  const bubbleHeight = 38 + lines.length * 24;
  const x = index % 2 === 0 ? 22 : width - bubbleWidth - 22;
  const y = 18 + Math.floor(index / 2) * (bubbleHeight + 12);
  const text = lines.map(
    (line, lineIndex) =>
      `<text x="${x + bubbleWidth / 2}" y="${y + 34 + lineIndex * 23}" text-anchor="middle" font-family="Patrick Hand, Comic Sans MS, cursive" font-size="21" font-weight="700" fill="#1c1c2e">${escapeXml(line)}</text>`
  ).join("");
  const tailX = x + Math.min(70, bubbleWidth * 0.35);
  return [
    `<g data-dialogue-index="${index}">`,
    `<rect x="${x}" y="${y}" width="${bubbleWidth}" height="${bubbleHeight}" rx="18" fill="#fff" stroke="#1c1c2e" stroke-width="4"/>`,
    `<path d="M ${tailX} ${y + bubbleHeight - 2} L ${tailX + 18} ${y + bubbleHeight - 2} L ${tailX - 4} ${y + bubbleHeight + 24} Z" fill="#fff" stroke="#1c1c2e" stroke-width="4" stroke-linejoin="round"/>`,
    `<rect x="${tailX - 2}" y="${y + bubbleHeight - 5}" width="25" height="8" fill="#fff"/>`,
    text,
    "</g>"
  ].join("");
}

/**
 * Composes exact local dialogue over a fixed-ratio art image. SVG is used as
 * the lossless composed artifact; Electron prints or rasterizes it locally.
 */
export function composePanelSvg(input: ComposePanelInput): Buffer {
  const mime = sniffImage(input.artBytes);
  if (!mime) throw new Error("INVALID_ARTIFACT");
  const width = input.width ?? 800;
  const height = input.height ?? 600;
  const art = input.artBytes.toString("base64");
  const bubbles = input.dialogue.map((dialogue, index) =>
    bubbleSvg(dialogue, index, width)
  ).join("");
  const focus = input.focusLabel
    ? `<text x="${width - 16}" y="${height - 16}" text-anchor="end" font-family="Patrick Hand, cursive" font-size="16" fill="#8a8a99">${escapeXml(input.focusLabel)}</text>`
    : "";
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="data:${mime};base64,${art}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`,
    bubbles,
    focus,
    `<rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#1c1c2e" stroke-width="4"/>`,
    "</svg>"
  ].join("");
  return Buffer.from(svg, "utf8");
}
