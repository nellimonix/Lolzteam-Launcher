import { describe, expect, it } from 'vitest';
import { labelColors } from '../labelColor';

describe('labelColors', () => {
  it('prefixes a bare 6-digit hex and keeps it', () => {
    expect(labelColors('3083ff').background).toBe('#3083ff');
  });

  it('keeps an already #-prefixed hex', () => {
    expect(labelColors('#3083ff').background).toBe('#3083ff');
  });

  it('expands a 3-digit hex', () => {
    expect(labelColors('#0af').background).toBe('#00aaff');
  });

  it('picks white text on a dark background', () => {
    expect(labelColors('#1b1b1b').text).toBe('#ffffff');
  });

  it('picks dark text on a light background', () => {
    expect(labelColors('#f5f5a0').text).toBe('#1a1a1a');
  });

  it('falls back to a neutral chip for empty input', () => {
    const c = labelColors('');
    expect(c.background).toBe('#3a3a3a');
    expect(c.text).toBe('#ffffff');
  });

  it('passes through a non-hex CSS colour', () => {
    expect(labelColors('tomato').background).toBe('tomato');
  });
});
