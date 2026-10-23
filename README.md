# InsureDB

An insurance management website backed by PostgreSQL. It covers individual and corporate customers, four policy types, branches and staff, beneficiaries, payments, renewals, claims, investigations, and agent assignments.

## Run it

The project is already configured in this folder for the local PostgreSQL server at port **5433**. Open [http://localhost:3000](http://localhost:3000) while `npm start` is running.

To set it up on another computer:

1. Install Node.js 20+ and PostgreSQL 14+.
2. Create the database: `createdb insurance_management`.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and adjust `DATABASE_URL` and `SESSION_SECRET`.
5. Run `npm run db:setup` to create the schema and sample data.
6. Run `npm start`, then open `http://localhost:3000`.

Demo login: **admin / Demo@123**. The other demo usernames are `employee`, `agent`, `underwriter`, `investigator`, and `customer`; all use the same password. Sample records are fictional.

## Show the database in the GUI

1. Open **Overview** to show totals and recent policies.
2. Open **Table explorer** and select a table. **View schema** shows columns, types, primary key, and foreign-key links. Records can be searched and exported as CSV.
3. Add a customer or policy with the guided form. It writes the base row and the correct subtype row in one transaction.
4. Open **Payments** and choose **Receipt** to view a printable payment receipt. Open **Claim documents** to upload and download PDF, PNG, or JPEG evidence.
5. Open **Reports** for policy, claim, revenue, and agent commission summaries.

The SQL schema is in `schema.sql` and demonstration records are in `seed.sql`. PostgreSQL enforces primary keys, foreign keys, unique policy and receipt numbers, exactly one matching customer/policy subtype, active-policy claims, settlement limits, and a 100% maximum beneficiary share. Renewals retain old and new premiums and extend the policy end date.

Run `npm test` for database integrity checks in a temporary database. Run `npm run test:api` while the site is running for API and role-access checks. The API check creates and removes a temporary claim and document.

For a second database GUI, `pgadmin-servers.json` contains the local PostgreSQL connection definition that can be imported into pgAdmin. It does not contain a password.

## Deploy on Render

1. Open [Deploy to Render](https://render.com/deploy?repo=https://github.com/rajatmurhe/InsureDB) and sign in to Render.
2. Review the Blueprint. It creates the `insuredb` web service and `insuredb-db` PostgreSQL database on the free plan in Singapore.
3. Set distinct `ADMIN_PASSWORD` and `VIEWER_PASSWORD` values of at least 16 characters when Render prompts. Keep them private. Render generates `SESSION_SECRET` and connects `DATABASE_URL` automatically.
4. Select **Apply**. The start command creates the schema, adds fictional sample records, and starts the site. Open the URL shown for the web service and sign in as `viewer` to demonstrate the tables, or `admin` to edit records.

The hosted login does not publish demo credentials. The viewer account can inspect all 20 insurance tables and reports but cannot change records. Uploaded claim files and sessions are kept in PostgreSQL so they survive web service restarts. Existing local demo users remain available only in local development.

Render's free web service sleeps after 15 minutes of no traffic. Its free PostgreSQL database expires 30 days after creation and has no backups. Upgrade the database before then if you need to keep it online and retain its data. The free plan is suitable for a short-lived course demonstration.

## Prototype scope

All seeded customer and policy records are fictional. Automated backups, field-level encryption, production availability, and jurisdiction-specific record retention are not configured. The PDF's non-functional targets of 99% uptime and 2–3 second loads are production targets, not guarantees for this demo.
