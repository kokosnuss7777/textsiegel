// Rendering and copy-paste of the test page in Chromium, Firefox and WebKit.
// The page renders responses like the chat widget (streamed, Markdown); verification uses the real service.

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Signature/marker: run of ZWNJ/ZWJ/Word Joiner (as in src/signature.ts).
const VS_RUN = /[‌‍⁠]{8,}/gu;
const COPY_ANSWERS = ["delivery", "markdown"];
const DIAGNOSTIC_TESTS = ["character-test", "run-test", "carrier-test"];

interface Pasted { plain: string; html: string }

async function answers(request: APIRequestContext): Promise<string[]> {
  return (await request.get("/api/answers")).json();
}

async function check(request: APIRequestContext, text: string) {
  return (await request.post("/api/check", { data: { text } })).json();
}

/** Play a response like the widget (without streaming delay). */
async function play(page: Page, id: string, mode: "internal" | "public" = "internal") {
  await page.goto("/");
  await page.waitForFunction(() => document.querySelectorAll("#answer option").length > 0);
  await page.evaluate(async ([id, mode]) => {
    ($("slow") as HTMLInputElement).checked = false;
    ($("mode") as HTMLSelectElement).value = mode;
    ($("answer") as HTMLSelectElement).value = id;
    await play();
  }, [id, mode]);
  return page.evaluate(() => ({ text: current.text as string, responseId: current.responseId as string }));
}

/** Read the clipboard through a real paste (Ctrl/Cmd+V) – works in all three engines. */
async function pasteClipboard(page: Page): Promise<Pasted> {
  await page.evaluate(() => {
    const ta = document.createElement("textarea");
    ta.id = "e2e-paste";
    document.body.append(ta);
    ta.addEventListener("paste", (e) => {
      e.preventDefault();
      (window as any).__pasted = { plain: e.clipboardData!.getData("text/plain"), html: e.clipboardData!.getData("text/html") };
    });
  });
  await page.focus("#e2e-paste");
  await page.keyboard.press("ControlOrMeta+V");
  await page.waitForFunction(() => (window as any).__pasted);
  return page.evaluate(() => (window as any).__pasted);
}

function htmlToText(page: Page, html: string) {
  return page.evaluate((html) => htmlText(html), html);
}

const count = (t: string, re: RegExp) => (t.match(re) ?? []).length;

test.beforeEach(async ({ context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

/**
 * Bubble of the same width outside the scrolling chat window – long answers would otherwise be only
 * partly visible and the screenshot would depend on the scroll position.
 */
async function standaloneBubble(page: Page) {
  await page.evaluate(() => {
    const width = $("bubble").getBoundingClientRect().width;
    const msg = document.createElement("div");
    msg.className = "msg bot";
    msg.innerHTML = `<div class="bubble" id="e2e-bubble" style="width:${width}px;max-width:none"></div>`;
    document.body.prepend(msg);
    window.scrollTo(0, 0);
  });
  return page.locator("#e2e-bubble");
}

/** Line boxes of the answer relative to the bubble: [left, top, width, height]. */
function lineBoxes(page: Page) {
  return page.evaluate(() => {
    const r = document.createRange();
    r.selectNodeContents($("e2e-bubble"));
    const o = $("e2e-bubble").getBoundingClientRect();
    return [...r.getClientRects()].map((x) => [x.left - o.left, x.top - o.top, x.width, x.height]);
  });
}

/** Number of differing pixels of two PNGs of the same size (decoded in the browser). */
function pixelDiff(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(async ([a, b]) => {
    const load = (s: string) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    if (A.width !== B.width || A.height !== B.height) return Infinity;
    const data = (img: HTMLImageElement) => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, img.width, img.height).data;
    };
    const da = data(A), db = data(B);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) n++;
    return n;
  }, [a, b].map((x) => "data:image/png;base64," + x.toString("base64")));
}

// Not necessarily pixel-identical, but invisible: invisible characters can affect kerning before a punctuation
// mark (≈1 px). Checked: same lines, ≤ 1.5 px per line, and with identical geometry ≤ 12 differing pixels per
// signature. Boxes, gaps or line breaks would show up.
test("rendering: the signature is invisible", async ({ page, request }, info) => {
  for (const id of (await answers(request)).filter((a) => !DIAGNOSTIC_TESTS.includes(a))) {
    const { text } = await play(page, id);
    const signatures = count(text, VS_RUN);
    expect(signatures, id).toBeGreaterThan(0);
    const bubble = await standaloneBubble(page);
    const capture = async (t: string) => {
      await page.evaluate((t) => ($("e2e-bubble").innerHTML = render(t)), t);
      return { lines: await lineBoxes(page), png: await bubble.screenshot({ animations: "disabled", caret: "hide" }) };
    };
    const withSig = await capture(text);
    const withoutSig = await capture(text.replace(VS_RUN, ""));

    expect(withSig.lines.length, `${id}: line count`).toBe(withoutSig.lines.length);
    const shift = Math.max(...withSig.lines.map((l, i) => Math.max(...l.map((v, k) => Math.abs(v - withoutSig.lines[i][k])))));
    const pixels = await pixelDiff(page, withSig.png, withoutSig.png);
    if (pixels > 0) {
      info.annotations.push({ type: "pixel difference", description: `${id}: ${pixels} pixels, lines up to ${shift.toFixed(2)} px` });
      await info.attach(`${id}-with-signature.png`, { body: withSig.png, contentType: "image/png" });
      await info.attach(`${id}-without-signature.png`, { body: withoutSig.png, contentType: "image/png" });
    }
    expect(shift, `${id}: lines shifted`).toBeLessThanOrEqual(1.5);
    // Even sub-pixel shifts change the anti-aliasing of a whole line; pixels only count with identical geometry.
    if (shift === 0) expect(pixels, `${id}: differing pixels`).toBeLessThanOrEqual(12 * signatures);
  }
});

// Screen readers read from the accessibility tree. Checked: the answer arrives there as text, no element around
// the answer carries its own name (a click would read the name instead of the text) and the chat is no longer
// "busy" after streaming. Whether the tree contains the signature characters is only recorded – what a screen
// reader makes of them is a manual test.
test("screen reader: answer in the accessibility tree", async ({ page }, info) => {
  const { text } = await play(page, "delivery");
  await expect(page.locator("#chat")).toHaveAttribute("aria-busy", "false");
  const named = await page.evaluate(() => {
    const out: string[] = [];
    for (let el: Element | null = $("bubble"); el && el !== document.body; el = el.parentElement)
      if (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") || el.hasAttribute("role")) out.push(el.outerHTML.slice(0, 80));
    return out;
  });
  expect(named, "elements with a name or role around the answer").toEqual([]);
  const snapshot = await page.locator("#bubble").ariaSnapshot();
  const visible = text.replace(VS_RUN, "").replace(/\s+/g, " ");
  // parts without choice points (Choice-Point-Mark may change words like „Gerne“ ↔ „Gern“)
  for (const sentence of ["erkläre ich Ihnen, wie die Lieferung bei der Gärtnerei Lindenhof abläuft.", "Die Ware liegt dann 5"])
    expect(visible.includes(sentence) && snapshot.replace(VS_RUN, "").replace(/\s+/g, " ").includes(sentence), sentence).toBe(true);
  info.annotations.push({ type: "signatures in the accessibility tree", description: String(count(snapshot, VS_RUN)) });
});

for (const id of COPY_ANSWERS) {
  test(`select + copy: ${id}`, async ({ page, request }, info) => {
    const { text, responseId } = await play(page, id);
    await page.evaluate(() => getSelection()!.selectAllChildren($("bubble")));
    await page.keyboard.press("ControlOrMeta+C");
    const pasted = await pasteClipboard(page);

    const plain = await check(request, pasted.plain);
    expect(plain.verdict, "plain text").toBe("signed");
    expect(plain.signature.responseId).toBe(responseId);
    expect(plain.signature.valid).toBe(count(text, VS_RUN));

    expect(pasted.html, "HTML version missing").not.toBe("");
    const html = await check(request, await htmlToText(page, pasted.html));
    expect(html.verdict, "HTML").toBe("signed");
    expect(html.signature.valid).toBe(count(text, VS_RUN));

    info.annotations.push({
      type: "no-break spaces",
      description: `original ${count(text, /[  ]/g)}, plain ${count(pasted.plain, /[  ]/g)}, HTML ${count(pasted.html, /[  ]|&nbsp;/g)}`,
    });
  });

  test(`copy button (text): ${id}`, async ({ page, request }) => {
    const { text, responseId } = await play(page, id);
    await page.click("#copyText");
    await expect(page.locator("#copyText")).toHaveText("Copied ✓");
    const pasted = await pasteClipboard(page);
    expect(pasted.plain, "the button copies the answer unchanged").toBe(text);
    const r = await check(request, pasted.plain);
    expect(r.verdict).toBe("signed");
    expect(r.signature.responseId).toBe(responseId);
  });

  test(`copy button (formatted): ${id}`, async ({ page, request }) => {
    const { text, responseId } = await play(page, id);
    await page.click("#copyHtml");
    await expect(page.locator("#copyHtml")).toHaveText("Copied ✓");
    const pasted = await pasteClipboard(page);
    expect(pasted.plain).toBe(text);
    const html = await check(request, await htmlToText(page, pasted.html));
    expect(html.verdict, "HTML").toBe("signed");
    expect(html.signature.responseId).toBe(responseId);
    expect(html.signature.valid).toBe(count(text, VS_RUN));
  });
}

// Global functions of the test page (classic script), declared for TypeScript.
declare global {
  const $: (id: string) => HTMLElement;
  const play: () => Promise<void>;
  const render: (md: string) => string;
  const htmlText: (html: string) => string;
  const current: { text: string; responseId: string; id: string };
}

// Public provenance (marker 0xF3): select + copy, then verify via /v1/verify with directory and public key;
// additionally the keys document and a record without text.
test("public provenance: copied answer confirmed via /v1/verify", async ({ page, request }) => {
  const { responseId } = await play(page, "delivery", "public");
  await page.evaluate(() => getSelection()!.selectAllChildren($("bubble")));
  await page.keyboard.press("ControlOrMeta+C");
  const pasted = await pasteClipboard(page);
  const v = await (await request.post("/v1/verify", { data: { text: pasted.plain } })).json();
  expect(v.provenance.verdict).toBe("verified");
  expect(v.provenance.sentences.length).toBeGreaterThan(10);
  expect(v.provenance.sentences.every((s: { origin: boolean; unchanged: boolean }) => s.origin && s.unchanged)).toBe(true);
  const keys = await (await request.get("/.well-known/textsiegel-keys.json")).json();
  expect(keys.keys[0].alg).toBe("Ed25519");
  const record = await (await request.get(`/v1/records/${responseId}`)).json();
  expect(JSON.stringify(record)).not.toContain("Lieferung");
});

// Public check page: labelled input, result as text (not colour only), signed report download, no statistic.
test("check page: check a text, readable verdict, downloadable report", async ({ page }) => {
  const { text } = await play(page, "delivery");
  await page.goto("/check");
  await page.getByLabel("Paste text").fill(text);
  await page.getByRole("button", { name: "Check" }).click();
  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText("Origin confirmed, unchanged");
  await expect(result).toContainText("They are unchanged.");
  await expect(result).not.toContainText("p =");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download signed report" }).click();
  expect((await download).suggestedFilename()).toMatch(/^textsiegel-report-.*\.json$/);
});
