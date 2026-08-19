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
 * @param userId The ID of the user making the purchase.
 * @param itemType The type of item (gold_100, gold_600, daily_deal, etc.)
 * @returns The payment link URL or null on failure.
 */
export async function createSquarePayment(amountInCents: number, description: string, userId: string, itemType: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://evolving-chess.web.app';
    
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
        metadata: {
          userId,
          itemType
        }
      },
      checkoutOptions: {
        // Pass the item and user back in the URL for the listener to pick up
        redirectUrl: `${baseUrl}/?checkout_status=success&item_type=${itemType}`,
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
 * Verifies a payment with Square.
 * In a real-world scenario, we would use the order_id from the redirect or a webhook.
 * For this prototype, we verify the order status via the Square API.
 */
export async function verifySquareOrder(orderId: string) {
  try {
    const response = await client.ordersApi.retrieveOrder(orderId);
    const order = response.result.order;
    
    if (order?.state === 'COMPLETED' || order?.state === 'OPEN') {
        return {
            success: true,
            userId: order.metadata?.userId,
            itemType: order.metadata?.itemType,
            amount: Number(order.totalMoney?.amount || 0)
        };
    }
    return { success: false };
  } catch (error) {
    console.error('Square Verification Error:', error);
    return { success: false };
  }
}

/**
 * Simulates a Square Payout request (Exchange).
 */
export async function initiateSquarePayout(amountInCents: number, userId: string) {
  console.log(`[SQUARE PRODUCTION PAYOUT] Payout request logged for user ${userId} of $${(amountInCents / 100).toFixed(2)}`);
  return { success: true };
}
