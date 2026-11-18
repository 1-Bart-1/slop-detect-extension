# Slop Detect

A Chrome and Firefox extension that marks posts and comments as `AI 0.93` or `Human 0.04`. The model runs in your browser, so no text leaves the machine.

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

"Only score while plugged in", on by default in the popup: on battery nothing is scored and the model is unloaded, and scoring carries on by itself once the computer is plugged in again. The popup says when that is why there are no badges.

Alt+Shift+D switches the extension on or off. Change the key in Chrome at `chrome://extensions/shortcuts`, in Firefox at `about:addons` under the gear menu, "Manage Extension Shortcuts".

Chrome knows the power source by itself. Firefox gives extensions no way to read it, so on Linux it needs a small helper, `native/`, which needs `python3`:

```
native/install            # once, for your user; restart Firefox afterwards
native/install --remove   # takes it out again
```

Without the helper, Firefox scores on battery too, and the popup says the helper is missing.

## Build

```
npm install
npm run build                # .output/chrome-mv3
npm run build -- -b firefox  # .output/firefox-mv2
npm run zip -- -b firefox    # .output/slop-detect-extension-<version>-firefox.zip
```

Chrome: load `.output/chrome-mv3` at `chrome://extensions` ("Load unpacked", developer mode).
Needs Chrome 116 or newer.

Firefox (140 or newer): at `about:debugging#/runtime/this-firefox`, "Load Temporary Add-on…" and pick `.output/firefox-mv2/manifest.json`. A temporary add-on is gone when Firefox restarts. Release Firefox installs only add-ons Mozilla has signed, so to keep it:

- Sign it for yourself: `npx web-ext sign --channel unlisted --source-dir .output/firefox-mv2` with an [AMO API key](https://addons.mozilla.org/developers/addon/api/key/). This signs without listing it on AMO; install the `.xpi` it writes from `about:addons` ("Install Add-on From File…").
- Or use Firefox Developer Edition, Nightly or an unbranded build, set `xpinstall.signatures.required` to `false` in `about:config`, and install the Firefox zip from `about:addons` as above.

## Code

| part | where |
|---|---|
| content script: finds the texts, draws the badges | `entrypoints/feed.content.ts`, `src/content/` |
| model host: a page shared by all tabs, Chrome's offscreen document or a frame in Firefox's background page | `entrypoints/host/`, `src/host/` |
| worker: tokenizes, batches, runs ONNX Runtime | `src/inference/` |
| sites: selectors for each site, one file per site | `src/sites/` |
| pages: popup, options, welcome, log | `entrypoints/` |
| whether to score now, and the power source | `src/power.ts`, `src/host/power.ts`, `native/` |

To add a site, add a `Site` to `src/sites/` and list it in `src/sites/index.ts`.

## Test

```
npm test                              # unit tests
python3 -m unittest discover -s native   # the power helper
npm run e2e -- --backend webgpu       # the built extension in Chrome; also wasm, auto
npm run e2e -- --browser firefox      # the same in Firefox
```

The e2e run needs a model export at `../slop-detector/runs/voi-slop-detect-380M/web`, or `--model <dir>`. It runs the installed Chrome, or `firefox` on the path; `--executable <path>` picks another, such as Chrome for Testing (`npx @puppeteer/browsers install chrome@stable`). In Firefox it also unplugs a fake power supply and checks that nothing is scored until it is plugged in again.
