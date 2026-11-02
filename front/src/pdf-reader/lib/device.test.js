import { describe, expect, it } from 'vitest';
import { isPhone } from './device.js';

describe('isPhone', () => {
  it('미디어 쿼리 결과를 따른다', () => {
    expect(isPhone(() => ({ matches: true }))).toBe(true);
    expect(isPhone(() => ({ matches: false }))).toBe(false);
  });
  it('터치 기기 조건을 함께 묻는다', () => {
    let query = '';
    isPhone((q) => { query = q; return { matches: false }; });
    expect(query.split(',').every((part) => part.includes('pointer:coarse'))).toBe(true);
  });
});
