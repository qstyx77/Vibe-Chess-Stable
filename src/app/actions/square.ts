'use server';

import { Client, Environment } from 'square';

// Using provided Square Sandbox Credentials
const client = new Client({
  accessToken: 'EAAAl0Dg9Fa4q5Tg4JpYPLJhlpFdpIG5PaOCaIVUkQEm-EcpWs17MjU7gPVLZUKM',
  environment: Environment.Sandbox,
});

/**
 * Creates a Square Online Checkout payment link.
 * @param amountInCents The amount to charge in USD cents.
 * @param description A brief description of the purchase.
 * @returns The payment link URL or null on failure.
 */
export async function createSquarePayment(amountInCents: number, description: string) {
  try {
    const response = await client.checkoutApi.createPaymentLink({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId: 'L78ME539SJ571',
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
        redirectUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
        askForShippingAddress: false,
      }
    });

    return response.result.paymentLink?.url || null;
  } catch (error) {
    console.error('Square Payment Error:', error);
    return null;
  }
}

/**
 * Simulates a Square Payout request (Exchange).
 * In a real-world scenario, this would use the Payouts API.
 */
export async function initiateSquarePayout(amountInCents: number, userId: string) {
  // In sandbox, we simulate the approval process.
  // Real world requires Square Payouts entitlement and recipient onboarding.
  console.log(`[SQUARE PAYOUT] Initiated payout for user ${userId} of $${(amountInCents / 100).toFixed(2)}`);
  return { success: true };
}
