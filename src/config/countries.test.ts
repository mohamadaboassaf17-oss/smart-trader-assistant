import { describe, expect, it } from 'vitest';

import { ENABLED_COUNTRIES } from './countries';

describe('countries config', () => {
  it('includes IQ by default (M9)', () => {
    expect(ENABLED_COUNTRIES).toContain('IQ');
    expect(ENABLED_COUNTRIES).toContain('LB');
    expect(ENABLED_COUNTRIES).toContain('SY');
  });
});
