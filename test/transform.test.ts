// What target programs typically do to text – and whether the signature survives it.
// Known limits are recorded as separate tests: if the behaviour changes, it shows up here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { markResponse, verify, SIGNATURE_RE } from "../src/cpmark.ts";
import { SAMPLES } from "../demo/samples.ts";

const A = { id: 101, key: "customer-a-secret" };
const CUSTOMERS = [A];
const signed = SAMPLES.map((s) => ({ id: s.id, ...markResponse(s.text, { key: A.key, signature: { customerId: A.id } }) }));

const htmlEscape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const htmlUnescape = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

const SURVIVES: [string, (t: string) => string][] = [
  ["Unicode NFC", (t) => t.normalize("NFC")],
  ["Unicode NFD", (t) => t.normalize("NFD")],
  ["Unicode NFKC", (t) => t.normalize("NFKC")],
  ["Unicode NFKD", (t) => t.normalize("NFKD")],
  ["Windows line endings", (t) => t.replace(/\n/g, "\r\n")],
  ["blank lines collapsed", (t) => t.replace(/\n{2,}/g, "\n")],
  ["spaces collapsed", (t) => t.replace(/[ \t]+/g, " ")],
  ["no-break spaces → regular (browser copy)", (t) => t.replace(/[  ]/g, " ")],
  ["lines trimmed", (t) => t.split("\n").map((l) => l.trim()).join("\n")],
  ["HTML escape round trip", (t) => htmlUnescape(htmlEscape(t))],
  ["HTML paragraphs and back to text", (t) => htmlUnescape(t.split("\n\n").map((p) => `<p>${htmlEscape(p)}</p>`).join("").replace(/<\/p><p>/g, "\n\n").replace(/<\/?p>/g, ""))],
  ["URL encoding round trip", (t) => decodeURIComponent(encodeURIComponent(t))],
  ["UTF-8 round trip", (t) => Buffer.from(t, "utf8").toString("utf8")],
  ["JSON round trip", (t) => JSON.parse(JSON.stringify(t))],
  ["JSON with \\u escapes", (t) => JSON.parse(JSON.stringify(t).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")))],
  ["control characters removed", (t) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")],
  ["typographic quotes → straight", (t) => t.replace(/[„“”»«]/g, '"')],
  ["dash → hyphen", (t) => t.replace(/[–—]/g, "-")],
  ["Markdown bold removed", (t) => t.replace(/\*\*/g, "")],
  // Measured with the run test of the test page: Gmail removes runs of 8+ variation selectors and CGJ runs,
  // Outlook Web removes VS17–VS256. The carriers ZWNJ/ZWJ/Word Joiner are not affected.
  ["all variation selectors removed", (t) => t.replace(/[\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/gu, "")],
  ["ZWSP and CGJ removed (Gmail)", (t) => t.replace(/[​͏]/g, "")],
  ["characters outside the BMP removed (MySQL utf8mb3)", (t) => t.replace(/[\u{10000}-\u{10FFFF}]/gu, "")],
  ["characters outside the BMP replaced by U+FFFD", (t) => t.replace(/[\u{10000}-\u{10FFFF}]/gu, "�")],
];

for (const [name, fn] of SURVIVES)
  test(`survives: ${name}`, () => {
    for (const s of signed) {
      const v = verify(fn(s.text), CUSTOMERS);
      assert.equal(v.verdict, "signed", s.id);
      assert.equal(v.signature.responseId, s.responseId, s.id);
    }
  });

// Known limits: the signature is lost.
const BREAKS: [string, (t: string) => string][] = [
  ["zero-width characters removed (ZWNJ, ZWJ, Word Joiner)", (t) => t.replace(/[​-‍⁠﻿]/g, "")],
  ["default-ignorable characters removed", (t) => t.replace(/\p{Default_Ignorable_Code_Point}/gu, "")],
  ["ASCII/Latin-1 only", (t) => Buffer.from(t, "latin1").toString("latin1")],
];

for (const [name, fn] of BREAKS)
  test(`known limit: ${name}`, () => {
    for (const s of signed) assert.equal(verify(fn(s.text), CUSTOMERS).signature.signed, false, s.id);
  });

test("partial copy: from a sentence start to a sentence end in the middle of the text", () => {
  for (const s of signed) {
    const runs = [...s.text.matchAll(SIGNATURE_RE)];
    if (runs.length < 3) continue;
    const start = runs[0].index! + runs[0][0].length;
    const end = runs[2].index! + runs[2][0].length;
    assert.equal(verify(s.text.slice(start, end), CUSTOMERS).verdict, "signed", s.id);
  }
});

test("partial copy: signature cut off at the end → the sentence before is enough", () => {
  for (const s of signed) {
    const runs = [...s.text.matchAll(SIGNATURE_RE)];
    if (runs.length < 2) continue;
    // selection ends in the middle of the second signature (e.g. selected up to the period)
    const cut = runs[1].index! + 5;
    const v = verify(s.text.slice(0, cut), CUSTOMERS);
    assert.equal(v.verdict, "signed", s.id);
    assert.equal(v.signature.found, 1, s.id);
  }
});
