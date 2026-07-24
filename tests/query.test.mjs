import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeQuery } from '../dist/query.js';

test('omits undefined and null query values', () => {
  assert.equal(
    serializeQuery({
      eventId: undefined,
      runDate: null,
      page: 2,
    }),
    'page=2',
  );
});

test('preserves meaningful falsy query values', () => {
  assert.equal(
    serializeQuery({
      enabled: false,
      page: 0,
      search: '',
    }),
    'enabled=false&page=0&search=',
  );
});

test('serializes dates and compact arrays safely', () => {
  assert.equal(
    serializeQuery({
      at: new Date('2026-07-24T06:51:02.515Z'),
      relations: ['pool', undefined, 'pricings'],
    }),
    'at=2026-07-24T06%3A51%3A02.515Z&relations=pool%2Cpricings',
  );
});

test('omits excluded keys and arrays containing only absent values', () => {
  assert.equal(
    serializeQuery(
      {
        callbackUrl: '/settings',
        values: [undefined, null],
        active: true,
      },
      ['callbackUrl'],
    ),
    'active=true',
  );
});
