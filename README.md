# Slop Detect

A Chrome and Firefox extension that marks posts and comments as `AI 0.93` or `Human 0.04`. The model runs in your browser, so no text leaves the machine.

This is a Firefox port of [Slop Detect](https://github.com/voightkampfflabs/slop-detect-extension) by Voight-Kampff Labs.

![A Reddit post with an "AI 0.87" badge next to its time](img/reddit.png)

Works on Reddit, LinkedIn, Hacker News and X.

![Hacker News comments with badges](img/hn.png)

<p>
  <img src="img/twitter.png" alt="A post on X with a badge" width="49%" />
  <img src="img/linkedin.png" alt="A LinkedIn post with a badge" width="49%" />
</p>

## Model

[VoightKampffLabs/voi-slop-detect-380M](https://huggingface.co/VoightKampffLabs/voi-slop-detect-380M),
the 8-bit quantized ONNX export.

- Downloaded from Hugging Face once (450 MB), after you click "Download model".
- Runs on the GPU through WebGPU, or on the CPU through WebAssembly. Firefox runs WebAssembly on one thread, and WebGPU only where Firefox offers it (on Linux, not by default: `dom.webgpu.enabled` in `about:config`).
- Scores English texts of 30 tokens or more, and the first 512 tokens of a long one.
- The score is an estimate and can be wrong.

## Battery and shortcut

In Chrome, "Only score while plugged in", on by default in the popup: on battery nothing is scored and the model is unloaded, and scoring carries on by itself once the computer is plugged in again. The popup says when that is why there are no badges. Firefox gives extensions no way to tell whether the computer is plugged in, so it has no such setting and scores whenever the extension is on.

Alt+Shift+D switches the extension on or off. Change the key in Chrome at `chrome://extensions/shortcuts`, in Firefox at `about:addons` under the gear menu, "Manage Extension Shortcuts".

## Install

Firefox (140 or newer): from [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/slop-detect/), once it is listed there.

Chrome (116 or newer): build it as below and load `.output/chrome-mv3` at `chrome://extensions` ("Load unpacked", developer mode).

## Build

Needs Node 24 or newer and npm 11 or newer.

```
npm ci
npm run build                # .output/chrome-mv3
npm run build -- -b firefox  # .output/firefox-mv2
npm run zip -- -b firefox    # .output/slop-detect-extension-<version>-firefox.zip, and -sources.zip
```

To try your own Firefox build, load `.output/firefox-mv2/manifest.json` at `about:debugging#/runtime/this-firefox` ("Load Temporary Add-on…"); it is gone when Firefox restarts. To keep it, give it an add-on id of your own in `wxt.config.ts`, sign it with an [AMO API key](https://addons.mozilla.org/developers/addon/api/key/), `npx web-ext sign --channel unlisted --source-dir .output/firefox-mv2`, and install the `.xpi` it writes from `about:addons`.

The AMO listing is `amo-metadata.json`, submitted with the sources zip:

```
npx web-ext sign --channel listed --source-dir .output/firefox-mv2 \
  --amo-metadata amo-metadata.json --upload-source-code .output/slop-detect-extension-<version>-sources.zip
```

AMO takes the privacy policy (`PRIVACY.md`) and the support site on the add-on's edit page, not through this file.

## Code

| part | where |
|---|---|
| content script: finds the texts, draws the badges | `entrypoints/feed.content.ts`, `src/content/` |
| model host: a page shared by all tabs, Chrome's offscreen document or a frame in Firefox's background page | `entrypoints/host/`, `src/host/` |
| worker: tokenizes, batches, runs ONNX Runtime | `src/inference/` |
| sites: selectors for each site, one file per site | `src/sites/` |
| pages: popup, options, welcome, log | `entrypoints/` |
| whether to score now, and the power source | `src/power.ts`, `src/host/power.ts` |

To add a site, add a `Site` to `src/sites/` and list it in `src/sites/index.ts`.

## Test

```
npm test                              # unit tests
npm run e2e -- --backend webgpu       # the built extension in Chrome; also wasm, auto
npm run e2e -- --browser firefox      # the same in Firefox
```

The e2e run needs a model export at `../slop-detector/runs/voi-slop-detect-380M/web`, or `--model <dir>`. It runs the installed Chrome, or `firefox` on the path; `--executable <path>` picks another, such as Chrome for Testing (`npx @puppeteer/browsers install chrome@stable`). In Chrome it also unplugs the battery as the extension sees it and checks that nothing is scored until it is plugged in again.
