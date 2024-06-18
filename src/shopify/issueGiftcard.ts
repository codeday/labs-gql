
import { DateTime } from "luxon";
import randomstring from 'randomstring';
import { makeDebug } from '../utils';
import config from "../config";

const DEBUG = makeDebug('shopify:issueGiftcard');

const ISSUE_GIFTCARD_MUTATION = `
  mutation discountCodeBasicCreate(
    $startsAt: DateTime!,
    $endsAt: DateTime!,
    $title: String!,
    $code: String!,
    $amount: Decimal!
  ) {
    discountCodeBasicCreate(basicCodeDiscount: {
      code: $code,
      title: $title,
      usageLimit: 1,
      startsAt: $startsAt,
      endsAt: $endsAt,
      customerSelection: { all: true }
      customerGets: {
        items: { all: true }
        value: { discountAmount: { amount: $amount, appliesOnEachItem: false } }
      }
    }) {
      userErrors {
        message
        field
      }
    }
  }
`;

export async function issueGiftcard(amount: number, title: string): Promise<string | null> {
  const code = randomstring.generate({ length: 8, charset: 'alphanumeric' }).toUpperCase();

try {
  const result = await fetch(`https://${config.shopify.storeDomain}/admin/api/2023-04/graphql.json`, {
    "headers": {
        "Content-type": "application/json",
        "X-Shopify-Access-Token": config.shopify.apiToken,
      },
      "method": "POST",
      "body": JSON.stringify({
          query: ISSUE_GIFTCARD_MUTATION,
          variables: {
            startsAt: new Date(),
            endsAt: DateTime.now().plus({ days: 35 }).toJSDate(),
            title,
            code,
            amount,
          }
        }),
      }
    ).then(r => r.json());
    if (result.errors && result.errors.length > 0) throw new Error(result.errors.message);
    if (result.data.discountCodeBasicCreate.userErrors && result.data.discountCodeBasicCreate.userErrors.length > 0)
      throw new Error(result.data.discountCodeBasicCreate.userErrors);

    DEBUG(`Created $${amount} promo code ${code}`);
    return code;
  } catch (ex) {
    DEBUG(ex);
    return null;
  }
}