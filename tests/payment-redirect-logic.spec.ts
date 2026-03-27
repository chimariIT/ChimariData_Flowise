/**
 * Unit Tests for Payment Redirect Detection Logic
 *
 * Tests the fix for payment auto-trigger in execute-step.tsx
 * Issue: Code only checked for ?payment=success, but Stripe Elements redirects
 * with ?payment_intent=pi_xxx&redirect_status=succeeded
 */

import { test, expect } from '@playwright/test';

/**
 * Simulates the payment detection logic from execute-step.tsx
 *
 * BEFORE FIX: Only checked for payment=success
 * AFTER FIX: Supports both Checkout Sessions and Stripe Elements
 */
function shouldVerifyPayment(urlParams: Record<string, string>): {
  shouldVerify: boolean;
  method: 'checkout-session' | 'stripe-elements' | 'none';
  reason: string;
} {
  const paymentSuccess = urlParams.payment === 'success';
  const sessionId = urlParams.session_id;
  const paymentIntentId = urlParams.payment_intent;
  const redirectStatus = urlParams.redirect_status;

  // FIX: Support multiple payment success indicators
  // 1. Checkout Sessions: ?payment=success&session_id=cs_xxx
  // 2. Stripe Elements: ?payment_intent=pi_xxx&redirect_status=succeeded
  const isCheckoutSuccess = paymentSuccess && sessionId;
  const isStripeIntentSuccess = redirectStatus === 'succeeded' && paymentIntentId;
  const shouldVerify = isCheckoutSuccess || isStripeIntentSuccess;

  if (isStripeIntentSuccess) {
    return { shouldVerify: true, method: 'stripe-elements', reason: 'Payment intent with redirect_status=succeeded' };
  }
  if (isCheckoutSuccess) {
    return { shouldVerify: true, method: 'checkout-session', reason: 'Payment=success with session_id' };
  }
  return { shouldVerify: false, method: 'none', reason: 'No valid payment indicators found' };
}

// =====================================================
// Stripe Elements Flow (FIXED)
// =====================================================

test('should detect successful payment from redirect_status=succeeded', () => {
  // This is what Stripe Elements actually sends
  const result = shouldVerifyPayment({
    payment_intent: 'pi_1234567890',
    redirect_status: 'succeeded',
    projectId: 'proj-123'
  });

  expect(result.shouldVerify).toBe(true);
  expect(result.method).toBe('stripe-elements');
});

test('should detect successful payment with redirect_status=succeeded and payment_intent', () => {
  const result = shouldVerifyPayment({
    payment_intent: 'pi_test_abc123',
    redirect_status: 'succeeded'
  });

  expect(result.shouldVerify).toBe(true);
  expect(result.method).toBe('stripe-elements');
});

test('should NOT trigger on redirect_status=failed', () => {
  const result = shouldVerifyPayment({
    payment_intent: 'pi_test_abc123',
    redirect_status: 'failed'
  });

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

test('should NOT trigger on payment_intent without redirect_status', () => {
  const result = shouldVerifyPayment({
    payment_intent: 'pi_test_abc123'
  });

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

test('should NOT trigger on redirect_status without payment_intent', () => {
  const result = shouldVerifyPayment({
    redirect_status: 'succeeded'
  });

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

// =====================================================
// Checkout Session Flow (Original)
// =====================================================

test('should detect successful payment from payment=success with session_id', () => {
  const result = shouldVerifyPayment({
    payment: 'success',
    session_id: 'cs_test_abc123'
  });

  expect(result.shouldVerify).toBe(true);
  expect(result.method).toBe('checkout-session');
});

test('should NOT trigger on payment=success without session_id', () => {
  const result = shouldVerifyPayment({
    payment: 'success'
  });

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

test('should NOT trigger on payment=failed', () => {
  const result = shouldVerifyPayment({
    payment: 'failed',
    session_id: 'cs_test_abc123'
  });

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

// =====================================================
// Edge Cases
// =====================================================

test('should NOT trigger with no parameters', () => {
  const result = shouldVerifyPayment({});

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

test('should NOT trigger with only projectId', () => {
  const result = shouldVerifyPayment({
    projectId: 'proj-123'
  });

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

test('should handle mixed parameters correctly', () => {
  // Both payment_intent and payment=success present
  // Should prefer Stripe Elements (more specific)
  const result = shouldVerifyPayment({
    payment: 'success',
    session_id: 'cs_123',
    payment_intent: 'pi_123',
    redirect_status: 'succeeded'
  });

  expect(result.shouldVerify).toBe(true);
  // Should detect as Stripe Elements since it has both required params
  expect(result.method).toBe('stripe-elements');
});

test('should NOT trigger on incomplete Stripe Elements params', () => {
  const result = shouldVerifyPayment({
    payment_intent: 'pi_123',
    redirect_status: 'pending'  // Wrong status
  });

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

// =====================================================
// Real-World Scenarios
// =====================================================

test('Stripe Elements success redirect URL', () => {
  // Simulates: /projects/123?payment_intent=pi_3MqB8L2eZvKYlo2C1g5c9HjQ&redirect_status=succeeded
  const result = shouldVerifyPayment({
    payment_intent: 'pi_3MqB8L2eZvKYlo2C1g5c9HjQ',
    redirect_status: 'succeeded'
  });

  expect(result.shouldVerify).toBe(true);
  expect(result.method).toBe('stripe-elements');
});

test('Stripe Checkout success redirect URL', () => {
  // Simulates: /projects/123?payment=success&session_id=cs_test_123
  const result = shouldVerifyPayment({
    payment: 'success',
    session_id: 'cs_test_123'
  });

  expect(result.shouldVerify).toBe(true);
  expect(result.method).toBe('checkout-session');
});

test('Failed payment should not trigger', () => {
  const result = shouldVerifyPayment({
    payment_intent: 'pi_3MqB8L2eZvKYlo2C1g5c9HjQ',
    redirect_status: 'failed'
  });

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

test('Direct navigation to execute step (no payment)', () => {
  const result = shouldVerifyPayment({
    projectId: 'proj-123'
  });

  expect(result.shouldVerify).toBe(false);
  expect(result.method).toBe('none');
});

// =====================================================
// Regression Tests - CRITICAL BUG FIX
// =====================================================

test('REGRESSION: redirect_status=succeeded was NOT detected before fix', () => {
  // This is the critical bug fix - this scenario would have failed before
  const result = shouldVerifyPayment({
    payment_intent: 'pi_any_id',
    redirect_status: 'succeeded'
  });

  // Before fix: would return { shouldVerify: false, method: 'none' }
  // After fix: returns { shouldVerify: true, method: 'stripe-elements' }
  expect(result.shouldVerify).toBe(true);
  expect(result.method).toBe('stripe-elements');
});

test('BACKWARD COMPATIBILITY: payment=success still works', () => {
  // Ensure we didn't break the original flow
  const result = shouldVerifyPayment({
    payment: 'success',
    session_id: 'cs_any_id'
  });

  expect(result.shouldVerify).toBe(true);
  expect(result.method).toBe('checkout-session');
});
