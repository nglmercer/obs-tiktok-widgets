import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
const executablePath = process.env.PLAYGROUND_BROWSER_EXECUTABLE;
test(
  "real inspector: x-ui aliases, multiline, hex validation, paired slider, filters, asset types, audio errors and unknown values",
  { skip: !executablePath },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-inspector-"));
    const { outputFiles } = await build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {Inspector} from './web/studio/features/Inspector';
 const settings={title:'Title',customCss:'body {}',color:'#ff77cc',size:32,events:[],image:'',font:'',soundUrl:'',enabled:false,unknown:{keep:true}};
 const schema={properties:{title:{type:'string'},customCss:{type:'string','x-ui':{widget:'textarea'}},color:{type:'string','x-ui':{widget:'color'}},size:{type:'integer',minimum:12,maximum:96,'x-ui':{control:'slider'}},events:{type:'array',items:{enum:['gift','chat','follow']}},image:{type:'string','x-ui':{control:'image'}},font:{type:'string','x-ui':{control:'font'}},soundUrl:{type:'string','x-ui':{control:'audio'}},enabled:{type:'boolean'},conditional:{type:'string','x-ui':{group:'Advanced',visibleWhen:{field:'enabled',equals:true}}}}};
 createRoot(document.getElementById('root')).render(<Inspector schema={schema} settings={settings} revision="1" assets={['../assets/a.png','../assets/a.woff2','../assets/a.wav']} onDraft={v=>window.draft=v} onSave={async v=>window.saved={...settings,...v}} onTestAudio={async()=>{throw new Error('Autoplay blocked')}}/>);`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      jsx: "automatic",
      bundle: true,
      format: "iife",
      write: false,
      define: { "process.env.NODE_ENV": '"production"' },
    });
    fs.writeFileSync(path.join(root, "test.js"), outputFiles[0].contents);
    fs.writeFileSync(
      path.join(root, "index.html"),
      '<!doctype html><html><head></head><body><div id="root"></div><script src="test.js"></script></body></html>',
    );
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(pathToFileURL(path.join(root, "index.html")).href);
      await page.waitForFunction(() => !!document.querySelector("textarea"));
      assert.deepEqual(errors, []);
      await page
        .getByLabel("customCss", { exact: true })
        .fill("body { color:red; }\n/* Unicode 🙂 */");
      assert.equal(
        await page.getByLabel("conditional", { exact: true }).count(),
        0,
      );
      await page.getByLabel("enabled", { exact: true }).check();
      await page.getByLabel("conditional", { exact: true }).waitFor();
      await page.getByLabel("color", { exact: true }).fill("#invalid");
      await page.getByRole("button", { name: "Save appearance" }).click();
      await page.getByText("Use a six-digit hexadecimal color").waitFor();
      await page.getByLabel("color", { exact: true }).fill("#112233");
      await page.getByLabel("size", { exact: true }).fill("48");
      assert.equal(await page.getByLabel("size slider").inputValue(), "48");
      await page.getByLabel("Search events").fill("gift");
      await page.getByLabel("gift", { exact: true }).check();
      assert.deepEqual(
        await page
          .getByLabel("image", { exact: true })
          .locator("option")
          .allTextContents(),
        ["None", "../assets/a.png"],
      );
      await page
        .getByLabel("font", { exact: true })
        .selectOption("../assets/a.woff2");
      await page
        .getByLabel("soundUrl", { exact: true })
        .selectOption("../assets/a.wav");
      await page.getByRole("button", { name: "Test audio" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Autoplay blocked" })
        .waitFor();
      await page.getByRole("button", { name: "Save appearance" }).click();
      await page.waitForFunction(() => !!window.saved);
      const saved = await page.evaluate(() => window.saved);
      assert.deepEqual(saved.unknown, { keep: true });
      assert.deepEqual(saved.events, ["gift"]);
      assert.equal(saved.color, "#112233");
      assert.equal(saved.size, 48);
      assert.match(saved.customCss, /Unicode/);
      assert.deepEqual(await page.evaluate(() => window.draft.events), [
        "gift",
      ]);
    } finally {
      await browser.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
