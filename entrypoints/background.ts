import type { FromBackground, ToBackground } from '@/src/protocol';
import { hostQuery, hostSettings } from '@/src/settings';

/** The offscreen document that hosts the model. Chrome allows one per extension. */
const HOST_PAGE = '/offscreen.html';

export default defineBackground(() => {
  /** Set while the document is being created: two tabs can ask at the same moment. */
  let creating: Promise<void> | null = null;

  async function ensureHost(): Promise<void> {
    const open = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (open.length > 0) return;
    creating ??= hostSettings
      .get()
      .then((settings) =>
        browser.offscreen.createDocument({
          url: HOST_PAGE + hostQuery(settings),
          reasons: ['WORKERS'],
          justification: 'Runs the detection model in a worker, on the GPU or on several threads.',
        }),
      )
      .finally(() => (creating = null));
    await creating;
  }

  browser.runtime.onMessage.addListener((message: ToBackground, _sender, respond: (answer: FromBackground) => void) => {
    if (message.type !== 'ensure-host') return;
    ensureHost().then(
      () => respond({ ok: true }),
      (error) => respond({ ok: false, error: String(error) }),
    );
    return true; // the answer comes later
  });
});
