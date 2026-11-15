// Records transcript.json, played by chat.html, as docs/demo.gif. Frames are rendered one by one at a fixed
// clock, so the result doesn't depend on machine speed. Needs ffmpeg and a Playwright Chromium.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const FPS = 12;
const WIDTH = 480;

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "../../../docs/demo.gif");
const transcript = readFileSync(join(here, "transcript.json"), "utf8");
const frames = mkdtempSync(join(tmpdir(), "calendar-agent-demo-frames-"));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 460, height: 912 }, deviceScaleFactor: 2 });
  await page.addInitScript(`window.TRANSCRIPT = ${transcript};`);
  await page.goto(pathToFileURL(join(here, "chat.html")).href);
  const duration = await page.evaluate(() => (window as unknown as { demo: { duration: number } }).demo.duration);

  const count = Math.ceil((duration / 1000) * FPS);
  for (let frame = 0; frame <= count; frame++) {
    await page.evaluate(
      (ms) => (window as unknown as { demo: { render(ms: number): void } }).demo.render(ms),
      (frame * 1000) / FPS,
    );
    await page.screenshot({ path: join(frames, `${String(frame).padStart(5, "0")}.png`) });
  }

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(FPS),
      "-i",
      join(frames, "%05d.png"),
      "-vf",
      `scale=${WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
      output,
    ],
    { stdio: "inherit" },
  );
  console.log(`Wrote ${count + 1} frames (${(duration / 1000).toFixed(1)} s) to ${output}`);
} finally {
  await browser.close();
  rmSync(frames, { recursive: true, force: true });
}
