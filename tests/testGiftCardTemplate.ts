import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'fs/promises';
import path from 'path';

// The mentor-giftcard Shopify discount is a `discountCodeBasicCreate` amount-off
// discount, which only reduces the eligible item subtotal and CANNOT waive the
// shipping line. The gift email must therefore never promise "free shipping",
// or mentors will be asked to pay an unexpected shipping charge at checkout for
// a "free" gift. This guard fails if that false promise is re-introduced.
test('giftCard.md does not promise free shipping (Shopify discountAmount cannot waive shipping)', async () => {
  const src = (await readFile(path.join(__dirname, '..', 'src', 'email', 'templates', 'giftCard.md'))).toString();
  assert.equal(
    /free\s+shipping/i.test(src),
    false,
    'giftCard.md must not promise "free shipping": the issued discountCodeBasicCreate discountAmount only applies to the item subtotal, not the shipping line',
  );
});
