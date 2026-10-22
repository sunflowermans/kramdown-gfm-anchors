/**
 * Heading anchors for kramdown's GFM input, the parser Jekyll uses by default
 * and Just the Docs does not replace.
 *
 * The id is assigned while kramdown parses, in
 * `kramdown-parser-gfm`'s `generate_gfm_header_id`. Just the Docs only copies
 * that id onto the heading permalink. This module reproduces the id.
 *
 * One heading moves through the file in this order:
 *
 * 1. `splitFrontMatter` lifts off a leading `---` block. `splitFencedBlocks`
 *    then marks fenced regions. `#` in either place is not a heading, but
 *    those lines still count so `line` stays pointed at the source.
 * 2. `headingContents` reads each remaining ATX line, drops a closing run
 *    of `#`, and peels a trailing `{#custom-id}` when one is present.
 * 3. A generated id starts in `headingIdText`. Code spans stay literal.
 *    Images are removed, links keep their label, HTML tags come off, and
 *    underscore emphasis is unwrapped. `---`, `--`, `<< `, and ` >>` are
 *    turned into the characters kramdown inserts before it filters.
 * 4. `gfmAnchor` lowercases that string, keeps letters, marks, numbers,
 *    connector punctuation, spaces, tabs, and hyphens, drops the rest, and
 *    turns the spaces and tabs into `-`.
 * 5. `headingAnchors` uses that base as-is the first time. The next copy
 *    gets `-1`, then `-2`. An explicit `{#id}` is stored unchanged and does
 *    not take a number. `autoIdPrefix` is added only to generated ids.
 *
 * Finding a heading again is a separate path. `fold` flattens case and
 * quotes, `indexHeadings` stores the first match under both the raw
 * contents and the visible text, and `findHeading` tries the query, that
 * visible form, and the text after a final `#`.
 */

// Letters, marks, numbers, and connector punctuation (underscore). Asterisks,
// periods, apostrophes, and similar marks fail this test and disappear later.
const WORD = /[\p{L}\p{M}\p{N}\p{Pc}]/u;

// Longer sequences are listed first. `---` must win over `--`.
const TYPOGRAPHIC = [
  ["---", "\u2014"],
  ["--", "\u2013"],
  ["<< ", "\u00ab\u00a0"],
  [" >>", "\u00a0\u00bb"],
];

const IMAGE = /!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g;
const LINK = /\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g;
const HTML_TAG = /<\/?[A-Za-z][^>]*>/g;
// Underscore is a word character, so these wrappers have to come off before
// the character filter. `*` and `~` are dropped by the filter on their own.
const BOLD_UNDER = /__([^_]+?)__/;
const ITALIC_UNDER = /(?<![\p{L}\p{N}_])_([^_\s][^_]*?)_(?![\p{L}\p{N}_])/u;
const HEADER_ID = /[ \t]\{#([A-Za-z_:][\w:.-]*)\}[ \t]*$/;
const TRAILING_HASHES = /(?<!\\)#+[ \t]*$/;
const ATX = /^( {0,3})(#{1,6})(?:[ \t]+(.*))?$/;

function isWordChar(char) {
  return WORD.test(char);
}

/**
 * Step 4. Character filter from `generate_gfm_header_id`, with no duplicate
 * suffix yet. "5C. Pat's Desk" becomes "5c-pats-desk": the period and
 * apostrophe drop out, and the spaces become hyphens.
 */
export function gfmAnchor(text) {
  let kept = "";
  for (const char of text.toLowerCase()) {
    if (char === " " || char === "\t" || char === "-" || isWordChar(char)) {
      kept += char;
    }
  }
  return kept.replaceAll(" ", "-").replaceAll("\t", "-");
}

// Step 3, last. Run before the filter so an em dash or en dash is discarded
// instead of leaving the hyphens that spelled it. "foo---bar" becomes
// "foobar"; "foo --- bar" keeps the two spaces and becomes "foo--bar".
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

// One pair per replacement, so nested or neighboring pairs need another pass.
function stripEmphasis(text) {
  let previous;
  while (previous !== text) {
    previous = text;
    text = text.replace(BOLD_UNDER, "$1").replace(ITALIC_UNDER, "$1");
  }
  return text;
}

// Step 3, first. A closed run of backticks is code and is not rewritten.
// An escaped or unclosed backtick stays in the prose half.
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

// Step 3. Code is copied through, which is why "`---`" keeps three hyphens.
// Prose loses images, keeps link labels, drops tags, unwraps `_emphasis_`,
// and then optionally receives the typographic substitutions.
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

/** Heading contents reduced to the string kramdown hashes. */
export function headingIdText(raw) {
  return reduceInline(raw, { typography: true });
}

/** Visible heading text, for a link label. Typography stays as typed. */
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

// Step 2. `## Title ## {#custom}` yields text "Title" and explicitId "custom".
// A line that is only hashes, or whose text was only the id, is not a heading.
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

// Keep the newline on each line so the caller can advance the line counter.
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

// Step 1, fences. The closing fence must repeat the same character at least
// as many times. A fence that never closes runs to the end of the chunk.
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

/**
 * Step 1, front matter. A document that opens with `---` returns that block
 * separately. Anything else, including a `---` that never closes, stays in
 * `body` so its headings are still read.
 */
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

// Lookup only. NFC, case, curly quotes, and repeated spaces are flattened
// so a typed target can meet the heading it names.
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
 * Steps 1, 2, and 5. ATX headings outside fenced code and front matter, in
 * document order. Each entry is `{ text, anchor, line, explicit }`.
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

  // The map starts each base at -1, so the first sighting lands on 0 and
  // keeps the bare id. Explicit ids are returned before that update.
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

/** First heading for each folded form of its raw text and its visible text. */
export function indexHeadings(headings) {
  const index = new Map();
  for (const heading of headings) {
    for (const key of [fold(heading.text), fold(headingPlainText(heading.text))]) {
      if (!index.has(key)) index.set(key, heading);
    }
  }
  return index;
}

/**
 * First heading that matches an Obsidian-style target. The query is tried
 * as written, then as visible text, then as the slice after its last `#`.
 */
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
