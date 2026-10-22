import { describe, expect, it } from 'vitest';
import { containsText } from './text.js';

describe('containsText', () => {
  it('ignores case and whitespace', () => {
    expect(containsText('Cart shows\n  1 ITEM', 'cart shows 1 item')).toBe(true);
  });
  it('is false for text that is not there', () => {
    expect(containsText('Cart is empty', 'Total: $49.00')).toBe(false);
  });
});
