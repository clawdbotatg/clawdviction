import { sql } from "~~/lib/db";

/**
 * Deduct CV from a wallet. Returns new balance or throws.
 */
export async function deductCV(wallet: string, amount: number): Promise<number> {
  const walletLower = wallet.toLowerCase();

  const result = await sql`
    SELECT balance FROM clawdviction_balances WHERE wallet = ${walletLower}
  `;

  if (result.rows.length === 0) {
    throw new CvError("Wallet not found", 404);
  }

  const currentBalance = parseFloat(result.rows[0].balance);
  if (currentBalance < amount) {
    throw new CvError("Insufficient CV balance", 402);
  }

  const updated = await sql`
    UPDATE clawdviction_balances
    SET balance = balance - ${amount},
        total_spent = total_spent + ${amount}
    WHERE wallet = ${walletLower}
    RETURNING balance
  `;

  return parseFloat(updated.rows[0].balance);
}

export class CvError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
