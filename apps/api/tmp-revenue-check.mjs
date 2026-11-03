import dotenv from "dotenv";
import pg from "pg";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const mode = await client.query(
  `SELECT "paymentMode" FROM "SystemSettings" WHERE key = 'commission'`
);

const comm = await client.query(`
  SELECT ((o."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Damascus')::date AS d,
         SUM(c."calculatedCommission")::float AS commissions,
         COUNT(*)::int AS n
  FROM "Commission" c
  JOIN "Order" o ON o.id = c."orderId"
  WHERE o.status = 'COMPLETED'
    AND o."completedAt" > NOW() - INTERVAL '14 days'
  GROUP BY 1
  ORDER BY 1 DESC
`);

const adj = await client.query(`
  SELECT (( "createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Damascus')::date AS d,
         CASE
           WHEN notes LIKE 'تعويض سائق%' THEN 'compensation'
           WHEN notes LIKE 'غرامة سائق%' THEN 'fine'
           ELSE 'other'
         END AS kind,
         SUM(amount)::float AS total,
         COUNT(*)::int AS n
  FROM "FinancialTransaction"
  WHERE "createdAt" > NOW() - INTERVAL '14 days'
    AND type = 'MANUAL_ADJUSTMENT'
    AND (notes LIKE 'تعويض سائق%' OR notes LIKE 'غرامة سائق%')
  GROUP BY 1, 2
  ORDER BY 1 DESC, 2
`);

console.log(JSON.stringify({ mode: mode.rows, comm: comm.rows, adj: adj.rows }, null, 2));
await client.end();
