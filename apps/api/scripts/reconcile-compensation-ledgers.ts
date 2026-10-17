/**
 * One-off: settle unpaid commissions/fines against unused compensations
 * without changing remainingDebt (fixes pre-fix POSTPAID ledger desync).
 *
 * Usage (from apps/api): npx tsx scripts/reconcile-compensation-ledgers.ts
 */
import { accountingService } from "../src/modules/accounting/accounting.service";
import { prisma } from "../src/shared/prisma";

async function main() {
  const result = await accountingService.reconcileCoveredLedgersFromCompensations(null);
  console.log(
    JSON.stringify(
      {
        paymentMode: result.paymentMode,
        driversScanned: result.driversScanned,
        driversReconciled: result.driversReconciled,
        details: result.details
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
