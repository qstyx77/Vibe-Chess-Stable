'use server';

import { Client, Environment } from 'square';

// Square Production Credentials
const client = new Client({
  accessToken: 'EAAAlwCjM42SE0ChTCwlwIUR2oTG3clQLSUO_ANX_dmNoZjaTwswwmg2bSOxuBQv',
  environment: Environment.Production,
});

/**
 * Creates a Square Online Checkout payment link in Production.
 * @param amountInCents The amount to charge in USD cents.
 * @param description A brief description of the purchase.
 * @returns The payment link URL or null on failure.
 */
export async function createSquarePayment(amountInCents: number, description: string) {
  try {
    const response = await client.checkoutApi.createPaymentLink({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId: 'LSMCVMC7NSKKJ',
        lineItems: [
          {
            name: description,
            quantity: '1',
            basePriceMoney: {
              amount: BigInt(amountInCents),
              currency: 'USD',
            },
          },
        ],
      },
      checkoutOptions: {
        redirectUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://evolving-chess.web.app',
        askForShippingAddress: false,
      }
    });

    return response.result.paymentLink?.url || null;
  } catch (error) {
    console.error('Square Production Payment Error:', error);
    return null;
  }
}

/**
 * Simulates a Square Payout request (Exchange).
 * In a production environment, this would typically interface with the Payouts API 
 * or log the request for manual fulfillment.
 */
export async function initiateSquarePayout(amountInCents: number, userId: string) {
  // In production, we log the intent. Fulfillment requires Payouts API entitlement or manual handling.
  console.log(`[SQUARE PRODUCTION PAYOUT] Payout request logged for user ${userId} of $${(amountInCents / 100).toFixed(2)}`);
  return { success: true };
}
