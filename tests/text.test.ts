import { expect, test } from 'vitest';
import { modelInput } from '@/src/inference/text';

// The clean-up the model was trained behind (slopdetect's markdown.py): the cases are the
// ones a comment brings.

test('curly quotes, the ellipsis and dashes become ASCII', () => {
  expect(modelInput('“Don’t”… she said — twice – really')).toBe('"Don\'t"... she said - twice - really');
});

test('typography inside code, math and links is left alone', () => {
  expect(modelInput('use `a — b` here')).toBe('use `a — b` here');
  expect(modelInput('see https://example.org/a—b now')).toBe('see https://example.org/a—b now');
});

test('a fenced code block is emptied, inline code stays', () => {
  expect(modelInput('before\n```js\nconst a = 1;\n```\nafter `x`')).toBe('before\n```\n```\nafter `x`');
});

test('an unclosed fence runs to the end of the text', () => {
  expect(modelInput('before\n```\nconst a = 1;')).toBe('before\n```\n```');
});
