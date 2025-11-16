import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY not set - payment features disabled');
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      typescript: true,
    })
  : null;

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Helper to create checkout session
export async function createCheckoutSession({
  priceId,
  customerId,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata = {},
}: {
  priceId: string;
  customerId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    customer_email: !customerId ? customerEmail : undefined,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    subscription_data: {
      metadata,
    },
    allow_promotion_codes: true,
  });

  return session;
}

// Helper to create one-time payment session
export async function createOneTimeCheckoutSession({
  priceId,
  customerId,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata = {},
}: {
  priceId: string;
  customerId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    customer_email: !customerId ? customerEmail : undefined,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    allow_promotion_codes: true,
  });

  return session;
}

// Helper to cancel subscription
export async function cancelSubscription(subscriptionId: string) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  return await stripe.subscriptions.cancel(subscriptionId);
}

// Helper to get customer portal URL
export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session;
}

// Helper to construct webhook event
export function constructWebhookEvent(payload: string | Buffer, signature: string) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook not configured');
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    STRIPE_WEBHOOK_SECRET
  );
}
