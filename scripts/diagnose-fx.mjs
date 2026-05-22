import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const usd = await sql`
  select date, from_currency, to_currency, rate
  from fx_rates
  where from_currency = 'USD'
  order by date desc
  limit 10
`;
console.log("\n=== last 10 USD fx_rates rows ===");
console.table(usd);

const eur = await sql`
  select date, from_currency, to_currency, rate
  from fx_rates
  where from_currency = 'EUR' and to_currency = 'USD'
  order by date desc
  limit 5
`;
console.log("\n=== EUR→USD direction (in case the table is keyed that way) ===");
console.table(eur);

const distinctCurrencies = await sql`
  select from_currency, to_currency, count(*) as rows, min(date) as first_date, max(date) as last_date
  from fx_rates
  group by from_currency, to_currency
  order by rows desc
`;
console.log("\n=== fx_rates coverage ===");
console.table(distinctCurrencies);
