/**
 * Heading anchors for kramdown's GFM input, the parser Jekyll uses by default
 * and Just the Docs does not replace.
 *
 * The id is assigned while kramdown parses, in
 * `kramdown-parser-gfm`'s `generate_gfm_header_id`. Just the Docs only copies
 * that id onto the heading permalink. This module reproduces the id.
 */

const WORD = /[\p{L}\p{M}\p{N}\p{Pc}]/u;

const TYPOGRAPHIC = [
  ["---", "\u2014"],
  ["--", "\u2013"],
  ["<< ", "\u00ab\u00a0"],
  [" >>", "\u00a0\u00bb"],
];

const IMAGE = /!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g;
const LINK = /\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g;
const HTML_TAG = /<\/?[A-Za-z][^>]*>/g;
const BOLD_UNDER = /__([^_]+?)__/;
const ITALIC_UNDER = /(?<![\p{L}\p{N}_])_([^_\s][^_]*?)_(?![\p{L}\p{N}_])/u;
const HEADER_ID = /[ \t]\{#([A-Za-z_:][\w:.-]*)\}[ \t]*$/;
const TRAILING_HASHES = /(?<!\\)#+[ \t]*$/;
const ATX = /^( {0,3})(#{1,6})(?:[ \t]+(.*))?$/;

function isWordChar(char) {
  return WORD.test(char);
}

/** Character filter from `generate_gfm_header_id`, without the duplicate suffix. */
export function gfmAnchor(text) {
  let kept = "";
  for (const char of text.toLowerCase()) {
    if (char === " " || char === "\t" || char === "-" || isWordChar(char)) {
      kept += char;
    }
  }
  return kept.replaceAll(" ", "-").replaceAll("\t", "-");
}

function applyTypography(text) {
  let index = 0;
  let result = "";
  while (index < text.length) {
    let matched = false;
    for (const [source, replacement] of TYPOGRAPHIC) {
      if (text.startsWith(source, index)) {
        result += replacement;
        index += source.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result += text[index];
      index += 1;
    }
  }
  return result;
}

function stripEmphasis(text) {
  let previous;
  while (previous !== text) {
    previous = text;
    text = text.replace(BOLD_UNDER, "$1").replace(ITALIC_UNDER, "$1");
  }
  return text;
}

function splitCodeSpans(text) {
  const parts = [];
  let buffer = "";
  let index = 0;
  const flush = (isCode) => {
    if (buffer) {
      parts.push([isCode, buffer]);
      buffer = "";
    }
  };
  while (index < text.length) {
    if (text[index] === "`" && (index === 0 || text[index - 1] !== "\\")) {
      let end = index;
      while (end < text.length && text[end] === "`") end += 1;
      const ticks = text.slice(index, end);
      const close = text.indexOf(ticks, end);
      if (close !== -1) {
        flush(false);
        parts.push([true, text.slice(end, close)]);
        index = close + ticks.length;
        continue;
      }
    }
    buffer += text[index];
    index += 1;
  }
  flush(false);
  return parts;
}

function reduceInline(raw, { typography }) {
  let result = "";
  for (const [isCode, content] of splitCodeSpans(raw)) {
    if (isCode) {
      result += content;
      continue;
    }
    let plain = content.replace(IMAGE, "").replace(LINK, "$1").replace(HTML_TAG, "");
    plain = stripEmphasis(plain);
    result += typography ? applyTypography(plain) : plain;
  }
  return result;
}

/** Heading text kramdown stores before building the id. */
export function headingIdText(raw) {
  return reduceInline(raw, { typography: true });
}

/** Visible heading text, used as a link label when a wiki link has no alias. */
export function headingPlainText(raw) {
  return reduceInline(raw, { typography: false }).trim();
}

/**
 * Anchor for one heading, with no duplicate suffix.
 * `text` is the heading contents, markers and all.
 */
export function anchorForHeadingText(text, { autoIdPrefix = "" } = {}) {
  return autoIdPrefix + gfmAnchor(headingIdText(text));
}

function headingContents(line) {
  const stripped = line.replace(/\r?\n$/, "");
  const match = ATX.exec(stripped);
  if (!match || match[3] == null) return null;
  let text = match[3].replace(TRAILING_HASHES, "").trimEnd();
  if (!text) return null;
  const idMatch = HEADER_ID.exec(text);
  let explicitId = null;
  if (idMatch) {
    explicitId = idMatch[1];
    text = text.slice(0, idMatch.index).trimEnd();
  }
  if (!text) return null;
  return { text, explicitId };
}

function countNewlines(text) {
  return text.match(/\n/g)?.length ?? 0;
}

function splitLinesKeep(text) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lines.push(text.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

function splitFencedBlocks(text) {
  const chunks = [];
  let buffer = "";
  let inCode = false;
  let fenceChar = "";
  let fenceLen = 0;
  const flush = (isCode) => {
    if (buffer) {
      chunks.push([isCode, buffer]);
      buffer = "";
    }
  };
  for (const line of splitLinesKeep(text)) {
    if (!inCode) {
      const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (match) {
        flush(false);
        inCode = true;
        fenceChar = match[1][0];
        fenceLen = match[1].length;
      }
      buffer += line;
    } else {
      buffer += line;
      const closer = new RegExp(
        `^ {0,3}${fenceChar}{${fenceLen},}[ \\t]*\\r?\\n?$`,
      );
      if (closer.test(line)) {
        flush(true);
        inCode = false;
      }
    }
  }
  flush(inCode);
  return chunks;
}

/** Split a leading YAML front matter block off a Markdown string. */
export function splitFrontMatter(text) {
  const newline = text.startsWith("---\r\n") ? "\r\n" : text.startsWith("---\n") ? "\n" : null;
  if (!newline) return { front: "", body: text };
  const rest = text.slice("---".length + newline.length);
  const closing = `${newline}---${newline}`;
  const index = rest.indexOf(closing);
  if (index === -1) {
    if (rest.endsWith(`${newline}---`) || rest === "---") return { front: text, body: "" };
    return { front: "", body: text };
  }
  const end = "---".length + newline.length + index + closing.length;
  return { front: text.slice(0, end), body: text.slice(end) };
}

function fold(text) {
  let folded = text.normalize("NFC").trim().toLowerCase();
  folded = folded
    .replaceAll("\u2019", "'")
    .replaceAll("\u2018", "'")
    .replaceAll("\u2032", "'")
    .replaceAll("\u201c", '"')
    .replaceAll("\u201d", '"');
  return folded.replace(/\s+/g, " ");
}

/**
 * ATX headings outside fenced code and front matter, in document order.
 * Each entry is `{ text, anchor, line, explicit }`.
 * Repeated generated ids get `-1`, `-2`, matching kramdown's counter.
 * An explicit `{#id}` is kept as written and does not advance that counter.
 */
export function headingAnchors(markdown, { autoIdPrefix = "" } = {}) {
  const { front, body } = splitFrontMatter(markdown);
  const found = [];
  let lineNo = countNewlines(front) + 1;
  for (const [isCode, chunk] of splitFencedBlocks(body)) {
    if (!isCode) {
      for (const line of splitLinesKeep(chunk)) {
        const parsed = headingContents(line);
        if (parsed) found.push({ ...parsed, line: lineNo });
        lineNo += countNewlines(line);
      }
    } else {
      lineNo += countNewlines(chunk);
    }
  }

  const seen = new Map();
  return found.map((heading) => {
    if (heading.explicitId) {
      return {
        text: heading.text,
        anchor: heading.explicitId,
        line: heading.line,
        explicit: true,
      };
    }
    const base = gfmAnchor(headingIdText(heading.text));
    const count = (seen.get(base) ?? -1) + 1;
    seen.set(base, count);
    const id = count === 0 ? base : `${base}-${count}`;
    return {
      text: heading.text,
      anchor: autoIdPrefix + id,
      line: heading.line,
      explicit: false,
    };
  });
}

/** Map folded heading text to the first heading with that text. */
export function indexHeadings(headings) {
  const index = new Map();
  for (const heading of headings) {
    for (const key of [fold(heading.text), fold(headingPlainText(heading.text))]) {
      if (!index.has(key)) index.set(key, heading);
    }
  }
  return index;
}

/** First heading whose text matches an Obsidian heading target. */
export function findHeading(index, heading) {
  const candidates = [fold(heading)];
  const plain = fold(headingPlainText(heading));
  if (!candidates.includes(plain)) candidates.push(plain);
  if (heading.includes("#")) candidates.push(fold(heading.slice(heading.lastIndexOf("#") + 1)));
  for (const key of candidates) {
    const found = index.get(key);
    if (found) return found;
  }
  return null;
}
