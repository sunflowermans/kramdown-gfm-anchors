# kramdown-gfm-anchors

Heading anchors that match [kramdown](https://kramdown.gettalong.org/) with GFM input, the Markdown setup Jekyll uses by default. Just the Docs copies those ids onto heading permalinks. It does not compute them.

`## 5C. Pat’s Desk` becomes `5c-pats-desk`. Repeated headings in one document get `-1`, `-2`, and so on. An explicit `{#custom-id}` is kept as written.

Requires Node 20 or newer.

## Install

```bash
npm install kramdown-gfm-anchors
```

## Use

```js
import { anchorForHeadingText, headingAnchors } from "kramdown-gfm-anchors";

anchorForHeadingText("5C. Pat’s Desk");
// "5c-pats-desk"

headingAnchors("# Section\n\n# Section {#custom-section}\n\n# Section\n");
// [
//   { text: "Section", anchor: "section", line: 1, explicit: false },
//   { text: "Section", anchor: "custom-section", line: 3, explicit: true },
//   { text: "Section", anchor: "section-1", line: 5, explicit: false },
// ]
```

`headingAnchors` walks the document in order. Fenced code blocks and a leading YAML front matter block are skipped. `autoIdPrefix` is prepended to generated ids only:

```js
headingAnchors("# Section\n", { autoIdPrefix: "doc-" });
// [{ text: "Section", anchor: "doc-section", line: 1, explicit: false }]
```

Other exports:

| Function | Purpose |
| --- | --- |
| `gfmAnchor(text)` | Character filter from kramdown's `generate_gfm_header_id`, with no duplicate suffix |
| `headingIdText(raw)` | Heading contents reduced to the string kramdown hashes |
| `headingPlainText(raw)` | Visible heading text, for link labels |
| `splitFrontMatter(text)` | `{ front, body }` for a leading `---` block |
| `indexHeadings(headings)` | Map of folded heading text to the first match |
| `findHeading(index, target)` | Resolve an Obsidian-style heading target |

## Test

```bash
npm test
```

When kramdown and `kramdown-parser-gfm` are installed, one test parses the fixture document with Ruby and compares every id.

## Publish

```bash
npm test
npm publish
```

The published tarball contains `src/index.js`, `package.json`, and `LICENSE`.
