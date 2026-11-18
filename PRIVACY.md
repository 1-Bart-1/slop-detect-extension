# Privacy policy

Slop Detect is a Chrome extension that marks posts and comments as "AI" or "Human".

## What it reads

On Reddit, LinkedIn, Hacker News and X, the extension reads the text of the posts and
comments on the page, to score them. The scoring happens in your browser, with a model
stored on your computer. The texts and the scores are not sent to us or to anyone else,
and they are not saved.

It also reads whether the computer is plugged in, to stop scoring while it runs on
battery. In Firefox that comes from the optional power helper, a small program on your
computer that reads it from the system. It is not saved or sent anywhere.

## What it stores

- The model files, in the browser's cache, until you delete them on the options page or
  remove the extension.
- Your settings. The on/off switches are kept in Chrome's synced storage, so Chrome copies
  them to your other browsers if you use Chrome sync.

## What goes over the network

One download: the model files, from Hugging Face, after you click "Download model". As with
any download, Hugging Face sees your IP address. Their policy is at
https://huggingface.co/privacy.

The extension makes no other requests. It has no account, no analytics and no ads.

## Limited use

The extension uses the page content it reads only to show the badges. We do not collect,
sell or transfer user data, and we do not use it for advertising, for creditworthiness or
for any purpose other than the one above. This follows the Chrome Web Store User Data
Policy, including its Limited Use requirements.

## Questions

Open an issue at https://github.com/voightkampfflabs/slop-detect-extension/issues.
