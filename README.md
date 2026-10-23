# InsureDB

A local insurance management website backed by PostgreSQL. It covers individual and corporate customers, four policy types, branches and staff, beneficiaries, payments, renewals, claims, investigations, and agent assignments.

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

## Prototype scope

This is a local project demo. Claim files are stored in the local `uploads/` folder, which must be backed up along with PostgreSQL data. The demo login uses an in-memory session store and sample passwords, which should be replaced before deployment. Automated backups, field-level encryption, production availability, and jurisdiction-specific record retention are not configured. The PDF's non-functional targets of 99% uptime and 2–3 second loads are production targets, not guarantees for this local demo.
