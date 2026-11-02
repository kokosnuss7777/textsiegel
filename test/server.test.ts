// The HTTP server must survive malformed requests and never return error text (ticket 01). These tests start the
// real server process on a free port; raw sockets are used where fetch would normalize the request target.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_TEXT_LENGTH } from "../src/service.ts";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..", "server", "server.ts");

const TIMEOUT = { timeout: 20_000 };

async function startServer(env: Record<string, string> = {}): Promise<{ base: string; proc: ChildProcess }> {
  const proc = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: "0", HOST: "127.0.0.1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      let out = "";
      let err = "";
      const timer = setTimeout(() => reject(new Error(`server did not listen within 10 s: ${err}`)), 10_000);
      proc.stderr!.on("data", (d) => { err += d; });
      proc.stdout!.on("data", (d) => {
        out += d;
        const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
        if (m) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${m[1]}`);
        }
      });
      proc.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited with ${code} before listening: ${err}`));
      });
    });
    return { base, proc };
  } catch (e) {
    proc.kill();
    throw e;
  }
}

/** Send a raw request line and return the status code of the answer. */
function rawStatus(base: string, requestLine: string): Promise<number> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const socket = connect(Number(port), hostname, () => socket.write(`${requestLine}\r\nHost: localhost\r\nConnection: close\r\n\r\n`));
    let data = "";
    socket.on("data", (d) => { data += d; });
    socket.on("end", () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0)));
    socket.on("error", reject);
    socket.setTimeout(10_000, () => socket.destroy(new Error("no answer within 10 s")));
  });
}

test("malformed request targets get 400 and the server keeps answering", TIMEOUT, async () => {
  const { base, proc } = await startServer();
  try {
    for (const target of ["//[", "//[::1", "http://[", "//user@[x]"]) {
      assert.equal(await rawStatus(base, `GET ${target} HTTP/1.1`), 400, target);
      assert.equal(proc.exitCode, null, `server exited after ${target}`);
      const ok = await fetch(`${base}/.well-known/textsiegel-keys.json`);
      assert.equal(ok.status, 200, `no answer after ${target}`);
    }
  } finally {
    proc.kill();
  }
});

test("invalid JSON and bodies without text get 400 without error text", TIMEOUT, async () => {
  const { base, proc } = await startServer();
  try {
    for (const path of ["/v1/verify", "/api/check"])
      for (const body of ["", "{", "null", "[]", "{}", '{"text": 5}', '{"text": null}']) {
        const r = await fetch(`${base}${path}`, { method: "POST", body });
        const answer = await r.text();
        assert.equal(r.status, 400, `${path} ${body}`);
        assert.doesNotMatch(answer, /Error|at |\.ts/, `${path} ${body}`);
      }
  } finally {
    proc.kill();
  }
});

test("unexpected errors give 500 without error text, path or stack", TIMEOUT, async () => {
  const dir = mkdtempSync(join(tmpdir(), "textsiegel-server-"));
  const notADirectory = join(dir, "records-is-a-file");
  writeFileSync(notADirectory, "");
  const { base, proc } = await startServer({ RECORDS_DIR: notADirectory });
  try {
    // Storing the record of a public answer fails because RECORDS_DIR is a file.
    const r = await fetch(`${base}/api/answer?mode=public`);
    const answer = await r.text();
    assert.equal(r.status, 500);
    assert.doesNotMatch(answer, /records-is-a-file|Error|EEXIST|ENOTDIR|at /);
    assert.equal((await fetch(`${base}/.well-known/textsiegel-keys.json`)).status, 200);
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("texts above MAX_TEXT_LENGTH and oversized bodies get 413 before any processing", TIMEOUT, async () => {
  const { base, proc } = await startServer();
  try {
    const post = (body: string) => fetch(`${base}/v1/verify`, { method: "POST", body });
    assert.equal((await post(JSON.stringify({ text: "a".repeat(MAX_TEXT_LENGTH) }))).status, 200, "at the limit");
    assert.equal((await post(JSON.stringify({ text: "a".repeat(MAX_TEXT_LENGTH + 1) }))).status, 413, "one above the limit");
    // The body limit counts characters of the body; JSON whitespace pads a valid body to the boundary.
    const padded = (length: number) => { const b = '{"text": "a"}'; return b + " ".repeat(length - b.length); };
    assert.equal((await post(padded(1_000_000))).status, 200, "body at the limit");
    assert.equal((await post(padded(1_000_001))).status, 413, "body one above the limit");
    assert.equal((await fetch(`${base}/api/check`, { method: "POST", body: JSON.stringify({ text: "a".repeat(MAX_TEXT_LENGTH + 1) }) })).status, 413, "test page check");
  } finally {
    proc.kill();
  }
});

test("about page states the same text limit as the service", TIMEOUT, () => {
  const about = readFileSync(join(dirname(SERVER), "about.html"), "utf8");
  assert.ok(about.includes(`at most ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters`));
});
