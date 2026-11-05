/**
 * Manual test script for fulfill endpoint idempotency.
 *
 * Run against local dev server:
 *   npx tsx scripts/test-fulfill-idempotency.ts
 *
 * Prerequisites:
 *   1. Dev server running (npm run dev)
 *   2. MongoDB connected with test data
 *   3. At least one entropy_pending transaction with a valid txId
 *
 * What this tests:
 *   - First call to /api/mint/fulfill should succeed
 *   - Second call with same txId should also succeed (alreadyFulfilled: true)
 *   - No error should be returned on the second call
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Replace with a real txId from your MongoDB (must be entropy_pending)
const TEST_TX_ID = process.env.TEST_TX_ID || "";

// Replace with a valid session cookie (login first, copy from browser)
const SESSION_COOKIE = process.env.SESSION_COOKIE || "";

async function callFulfill(txId: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/mint/fulfill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SESSION_COOKIE ? { Cookie: SESSION_COOKIE } : {}),
    },
    body: JSON.stringify({ txId }),
  });
  return res.json();
}

async function main() {
  if (!TEST_TX_ID) {
    console.error("Set TEST_TX_ID env var to an entropy_pending transaction ID");
    process.exit(1);
  }

  console.log("=== Fulfill Idempotency Test ===\n");
  console.log(`txId: ${TEST_TX_ID}`);
  console.log(`Base URL: ${BASE_URL}\n`);

  // Call 1
  console.log("--- Call 1: Normal fulfill ---");
  const result1 = await callFulfill(TEST_TX_ID);
  console.log("Response:", JSON.stringify(result1, null, 2));

  if (!(result1 as any).success) {
    console.error("\nFirst call failed. Check txId and server state.");
    process.exit(1);
  }

  // Call 2 (same txId — should be idempotent)
  console.log("\n--- Call 2: Same txId (idempotent) ---");
  const result2 = await callFulfill(TEST_TX_ID);
  console.log("Response:", JSON.stringify(result2, null, 2));

  // Verify
  const r1 = result1 as any;
  const r2 = result2 as any;

  console.log("\n=== Verification ===");
  console.log(`Call 1 success: ${r1.success}`);
  console.log(`Call 2 success: ${r2.success}`);
  console.log(`Call 2 alreadyFulfilled: ${r2.alreadyFulfilled}`);
  console.log(`Cards match: ${JSON.stringify(r1.cards) === JSON.stringify(r2.cards)}`);

  if (r2.success && r2.alreadyFulfilled) {
    console.log("\n[PASS] Idempotency works — second call returns success with alreadyFulfilled=true");
  } else if (r2.success) {
    console.log("\n[PASS] Second call succeeded (may have re-synced from chain)");
  } else {
    console.error("\n[FAIL] Second call returned error:", r2.error);
    process.exit(1);
  }
}

main().catch(console.error);
