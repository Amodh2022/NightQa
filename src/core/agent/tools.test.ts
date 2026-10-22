import { describe, expect, it } from 'vitest';
import { TOOL_DEFS, parseToolCall, toWaitCondition } from './tools.js';

describe('parseToolCall', () => {
  it('accepts each valid tool', () => {
    expect(parseToolCall({ name: 'click', input: { target: 'e3' } }).ok).toBe(true);
    expect(parseToolCall({ name: 'type', input: { target: 'e1', text: 'hi' } }).ok).toBe(true);
    expect(parseToolCall({ name: 'navigate', input: { path: '/cart' } }).ok).toBe(true);
    expect(parseToolCall({ name: 'scroll', input: { direction: 'down' } }).ok).toBe(true);
    expect(parseToolCall({ name: 'wait', input: { kind: 'idle' } }).ok).toBe(true);
    expect(
      parseToolCall({ name: 'expect', input: { statement: 's', result: 'pass', evidence: 'e' } })
        .ok,
    ).toBe(true);
    expect(parseToolCall({ name: 'done', input: { summary: 'ok' } }).ok).toBe(true);
    expect(parseToolCall({ name: 'stuck', input: { reason: 'r' } }).ok).toBe(true);
  });

  it.each([
    [undefined, 'did not call'],
    [{ name: 'rm_rf', input: {} }, 'unknown tool'],
    [{ name: 'click', input: { target: 'button' } }, 'element ref'],
    [{ name: 'click', input: { target: 'e1', extra: 1 } }, 'click'],
    [{ name: 'expect', input: { statement: 's', result: 'maybe', evidence: 'e' } }, 'expect'],
    [{ name: 'wait', input: { kind: 'text' } }, 'text is required'],
    [{ name: 'wait', input: { kind: 'ms' } }, 'ms is required'],
    [{ name: 'click', input: null }, 'click'],
  ])('rejects %j', (raw, why) => {
    const r = parseToolCall(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(why);
  });

  it('exposes exactly the eight allowed tools', () => {
    expect(TOOL_DEFS.map((t) => t.name).sort()).toEqual([
      'click',
      'done',
      'expect',
      'navigate',
      'scroll',
      'stuck',
      'type',
      'wait',
    ]);
  });

  it('maps wait inputs to driver conditions', () => {
    expect(toWaitCondition({ kind: 'text', text: 'Hi' })).toEqual({ kind: 'text', text: 'Hi' });
    expect(toWaitCondition({ kind: 'ms', ms: 500 })).toEqual({ kind: 'ms', ms: 500 });
    expect(toWaitCondition({ kind: 'idle' })).toEqual({ kind: 'idle' });
  });
});
