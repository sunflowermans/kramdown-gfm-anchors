import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  anchorForHeadingText,
  headingAnchors,
} from "../src/index.js";

const CASES = {
  "1A. Alpha Block": "1a-alpha-block",
  "1. First Topic": "1-first-topic",
  "10. Owner's Room": "10-owners-room",
  "9. River’s Edge": "9-rivers-edge",
  "5C. Pat’s Desk": "5c-pats-desk",
  "–1A. Lower Level": "1a-lower-level",
  "Name with ~~Old~~ New Text": "name-with-old-new-text",
  "Bird’s Call": "birds-call",
  "What’s New Today?": "whats-new-today",
  "Tool (spare part +2)": "tool-spare-part-2",
  "2. Guest’s Room": "2-guests-room",
  "12. Annex": "12-annex",
  "Field Guide": "field-guide",
  "A & B": "a--b",
  "Hello  World": "hello--world",
  "foo---bar": "foobar",
  "foo --- bar": "foo--bar",
  "foo--bar": "foobar",
  "*italic heading*": "italic-heading",
  "**bold**": "bold",
  "`code`": "code",
  "[link](http://x.com)": "link",
  "Café Menu": "café-menu",
  "Level -1": "level--1",
  "# hash": "-hash",
  "foo `---` bar": "foo-----bar",
  "Rock & Roll": "rock--roll",
  "100%": "100",
  "A.B.C": "abc",
  "test_with_underscores": "test_with_underscores",
  "— already em": "-already-em",
  "__bold__": "bold",
  "_italic_": "italic",
  "keep_underscores": "keep_underscores",
  "*foo--bar*": "foobar",
  "~~strike~~": "strike",
  "See [this](http://example.com/a) now": "see-this-now",
  "img ![a](b.png) end": "img--end",
  "Hello <em>there</em>": "hello-there",
  "A << B >> C": "a-b-c",
  "wait...": "wait",
  "wait ...": "wait-",
  "3b. Side Door": "3b-side-door",
  "Review Notes": "review-notes",
};

test("anchorForHeadingText matches the kramdown GFM fixtures", () => {
  for (const [raw, expected] of Object.entries(CASES)) {
    assert.equal(anchorForHeadingText(raw), expected, raw);
  }
});

test("duplicate headings and explicit ids follow kramdown's counter", () => {
  const markdown = ["# Section", "", "# Section {#custom-section}", "", "# Section", ""].join("\n");
  assert.deepEqual(
    headingAnchors(markdown).map((heading) => heading.anchor),
    ["section", "custom-section", "section-1"],
  );
});

test("fenced code and front matter are not headings", () => {
  const markdown = [
    "---",
    "# Inside",
    "---",
    "",
    "```",
    "# Not a heading",
    "```",
    "",
    "# Real",
    "",
  ].join("\n");
  assert.deepEqual(
    headingAnchors(markdown).map((heading) => heading.anchor),
    ["real"],
  );
});

test("autoIdPrefix is prepended to generated ids only", () => {
  const markdown = "# Section\n\n# Section {#custom-section}\n";
  assert.deepEqual(
    headingAnchors(markdown, { autoIdPrefix: "doc-" }).map((heading) => heading.anchor),
    ["doc-section", "custom-section"],
  );
});

function kramdownIds(markdown) {
  const script = `
    require "kramdown"
    require "kramdown-parser-gfm"
    require "json"
    text = STDIN.read
    doc = Kramdown::Document.new(text, input: "GFM")
    ids = []
    walk = lambda do |el|
      ids << el.attr["id"] if el.type == :header
      el.children&.each { |child| walk.call(child) }
    end
    walk.call(doc.root)
    puts JSON.generate(ids)
  `;
  return JSON.parse(execFileSync("ruby", ["-e", script], { input: markdown, encoding: "utf8" }));
}

test("headingAnchors matches a live kramdown GFM parse", { skip: !rubyKramdown() && "kramdown is not installed" }, () => {
  const bodies = Object.keys(CASES).map((heading) => `# ${heading}`);
  const markdown = `${bodies.join("\n\n")}\n\n# Section\n\n# Section {#custom-section}\n\n# Section\n`;
  const expected = kramdownIds(markdown);
  const actual = headingAnchors(markdown).map((heading) => heading.anchor);
  assert.deepEqual(actual, expected);
});

function rubyKramdown() {
  try {
    execFileSync("ruby", ["-e", "require 'kramdown'; require 'kramdown-parser-gfm'"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
