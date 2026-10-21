import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

test(
  "template artwork previews on hover and keyboard focus without viewport overflow",
  {
    skip: !process.env.PLAYGROUND_BROWSER_EXECUTABLE,
  },
  async () => {
    const result = await build({
      stdin: {
        contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {TemplatePreview} from './web/studio/features/TemplatePreview'; createRoot(document.getElementById('root')).render(<TemplatePreview name="Chat" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%232b3245'/%3E%3Ctext x='40' y='180' fill='white' font-size='40'%3EChat preview%3C/text%3E%3C/svg%3E"/>);`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
    });
    const browser = await chromium.launch({
      executablePath: process.env.PLAYGROUND_BROWSER_EXECUTABLE,
      headless: true,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 480, height: 480 },
        locale: "en-US",
      });
      await page.setContent(
        '<div id="root" style="width:240px;margin:16px"></div>',
      );
      await page.addStyleTag({
        content:
          readFileSync("web/shared/tokens.css", "utf8") +
          readFileSync("web/studio/styles/studio.css", "utf8"),
      });
      await page.addScriptTag({ content: result.outputFiles[0].text });
      const trigger = page.getByRole("button", { name: "Preview Chat" });
      await trigger.hover();
      await page.getByRole("tooltip").waitFor();
      const bounds = await page.getByRole("tooltip").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 480);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 480);
      await page.mouse.move(475, 475);
      await page.getByRole("tooltip").waitFor({ state: "detached" });
      await trigger.focus();
      await page.getByRole("tooltip").waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("tooltip").waitFor({ state: "detached" });
    } finally {
      await browser.close();
    }
  },
);
