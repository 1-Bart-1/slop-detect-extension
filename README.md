# Slop Detect, the Chrome extension

Marks the posts and comments of the listed sites with `AI 0.93` or `Human 0.04`. The
score comes from `voi-slop-detect-380M`, which runs in the browser: on the GPU through
WebGPU, or on the CPU through WebAssembly. No text leaves the machine. The sites so far are
Reddit, LinkedIn, Hacker News and X.

## Run it

```
npm install
npm run build          # .output/chrome-mv3
```

Load `.output/chrome-mv3` at `chrome://extensions` (developer mode, "Load unpacked"), open
the popup and press "Download model". `npm run dev` rebuilds and reloads on changes.

`VITE_REPO=http://127.0.0.1:8473 npm run build` takes the model from a local export
directory served over HTTP instead of Hugging Face.

## How it works

| part | file | does |
|---|---|---|
| content script | `entrypoints/feed.content.ts`, `src/content/` | finds the site's text blocks, sends the ones within a screen of the viewport, draws the badges |
| background | `entrypoints/background.ts` | starts the model host |
| model host | `entrypoints/offscreen/`, `src/host/` | an offscreen document shared by all tabs: score cache, log, state; closes after five minutes without a tab |
| worker | `src/inference/` | downloads and caches the model, tokenizes, batches, runs ONNX Runtime (`session.ts`) |
| pages | `entrypoints/popup`, `options`, `log`, `src/ui/` | switches, model download, settings, the host's log |
| shared | `src/protocol.ts`, `src/ports.ts`, `src/settings.ts` | the messages between these parts, the ports that carry them, the stored settings |

The host is an offscreen document and not the service worker: Chrome stops a service worker
after 30 seconds, and only a document gets the cross-origin isolation that WebAssembly
threads need.

A text goes to the model as markdown, the form of its training texts: the content script
writes the site's markup back as lists, quotes, bold, code fences and full link addresses
(`src/content/markdown.ts`), and a site can leave parts out, like LinkedIn's "more" button
and hashtags.

Only English texts are sent to the model, which was trained on English: the content script
asks the browser's language detector (`i18n.detectLanguage`) and drops a text that is
reliably in another language. An option switches this off.

Texts under 30 tokens are not scored, and the first 512 tokens of a long one are. The
worker runs the newest texts first and fills a batch up to 1,024 padded tokens on WebGPU
and 256 on WebAssembly. The numbers behind this are in RFC 015 of the `slop-detector` repo.

A badge says Human below the model's `flag_min` and AI from `generated_min` on (both from
the model's `bands.json`); the band between gets a badge only with the option switched on.

## Add a site

Add a `Site` to `src/sites/`: match patterns, host names, and for each kind of text a
selector of the item, of the text element inside it, and of the element on its metadata
line that the badge follows. `skip` and `tidy` take out of a text what the site adds to it.
List it in `src/sites/index.ts`.

## Test

```
npm test                              # unit tests
npm run e2e -- --backend webgpu       # the built extension in Chromium; also wasm, auto
```

The end-to-end run needs Playwright's Chromium (`npx playwright-core install chromium`;
branded Chrome does not load unpacked extensions from the command line) and a model export
at `../slop-detector/runs/voi-slop-detect-380M/web`, or `--model <dir>`. It serves a page
with Reddit's markup in place of reddit.com. Each backend keeps a Chromium profile with the
450 MB model cache under `.profiles/`.
