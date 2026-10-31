import { defineConfig, devices } from "@playwright/test";

const PORT = 8788;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1200, height: 900 } },
  webServer: {
    command: "node ../server/server.ts",
    url: `http://127.0.0.1:${PORT}/api/answers`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1200, height: 900 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1200, height: 900 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1200, height: 900 } } },
  ],
});
