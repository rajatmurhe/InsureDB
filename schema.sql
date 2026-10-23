BEGIN;

CREATE TABLE IF NOT EXISTS branch (
  branch_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_name varchar(100) NOT NULL UNIQUE,
  address text NOT NULL,
  phone varchar(30)
);
CREATE TABLE IF NOT EXISTS customer (
  customer_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_type varchar(20) NOT NULL CHECK (customer_type IN ('Individual','Corporate')),
  address text NOT NULL,
  phone varchar(30),
  email varchar(150) NOT NULL UNIQUE,
  registration_date date NOT NULL DEFAULT CURRENT_DATE
);
CREATE TABLE IF NOT EXISTS individual_customer (
  customer_id integer PRIMARY KEY REFERENCES customer(customer_id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  dob date,
  gender varchar(30),
  occupation varchar(100)
);
CREATE TABLE IF NOT EXISTS corporate_customer (
  customer_id integer PRIMARY KEY REFERENCES customer(customer_id) ON DELETE CASCADE,
  company_name varchar(160) NOT NULL,
  registration_number varchar(80) NOT NULL UNIQUE,
  contact_person varchar(120),
  industry_type varchar(100)
);
CREATE TABLE IF NOT EXISTS employee (
  employee_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(120) NOT NULL,
  designation varchar(100) NOT NULL,
  salary numeric(12,2) CHECK (salary >= 0),
  branch_id integer NOT NULL REFERENCES branch(branch_id)
);
CREATE TABLE IF NOT EXISTS agent (
  agent_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(120) NOT NULL,
  phone varchar(30),
  email varchar(150) UNIQUE,
  commission_rate numeric(5,2) NOT NULL DEFAULT 5 CHECK (commission_rate BETWEEN 0 AND 100),
  branch_id integer NOT NULL REFERENCES branch(branch_id)
);
CREATE TABLE IF NOT EXISTS underwriter (
  underwriter_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(120) NOT NULL,
  department varchar(100),
  approval_limit numeric(14,2) NOT NULL CHECK (approval_limit >= 0)
);
CREATE TABLE IF NOT EXISTS investigator (
  investigator_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(120) NOT NULL,
  phone varchar(30),
  specialization varchar(100),
  license_number varchar(80) UNIQUE
);
CREATE TABLE IF NOT EXISTS policy (
  policy_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_number varchar(30) NOT NULL UNIQUE DEFAULT ('POL-' || upper(substr(md5(random()::text || clock_timestamp()::text),1,10))),
  customer_id integer NOT NULL REFERENCES customer(customer_id),
  underwriter_id integer REFERENCES underwriter(underwriter_id),
  policy_type varchar(20) NOT NULL CHECK (policy_type IN ('Life','Health','Vehicle','Property')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  premium_amount numeric(12,2) NOT NULL CHECK (premium_amount > 0),
  status varchar(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Active','Rejected','Expired','Cancelled')),
  CHECK (end_date > start_date)
);
CREATE TABLE IF NOT EXISTS life_insurance_policy (
  policy_id integer PRIMARY KEY REFERENCES policy(policy_id) ON DELETE CASCADE,
  beneficiary_name varchar(120) NOT NULL,
  sum_assured numeric(14,2) NOT NULL CHECK (sum_assured > 0),
  term_years integer NOT NULL CHECK (term_years > 0)
);
CREATE TABLE IF NOT EXISTS health_insurance_policy (
  policy_id integer PRIMARY KEY REFERENCES policy(policy_id) ON DELETE CASCADE,
  coverage_type varchar(100) NOT NULL,
  hospital_network varchar(150)
);
CREATE TABLE IF NOT EXISTS vehicle_insurance_policy (
  policy_id integer PRIMARY KEY REFERENCES policy(policy_id) ON DELETE CASCADE,
  vehicle_number varchar(30) NOT NULL,
  vehicle_model varchar(100) NOT NULL,
  idv_value numeric(14,2) NOT NULL CHECK (idv_value > 0)
);
CREATE TABLE IF NOT EXISTS property_insurance_policy (
  policy_id integer PRIMARY KEY REFERENCES policy(policy_id) ON DELETE CASCADE,
  property_address text NOT NULL,
  property_value numeric(14,2) NOT NULL CHECK (property_value > 0)
);
CREATE TABLE IF NOT EXISTS beneficiary (
  beneficiary_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_id integer NOT NULL REFERENCES policy(policy_id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  relationship varchar(80),
  share_percentage numeric(5,2) NOT NULL CHECK (share_percentage > 0 AND share_percentage <= 100)
);
CREATE TABLE IF NOT EXISTS payment (
  payment_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_id integer NOT NULL REFERENCES policy(policy_id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode varchar(30) NOT NULL CHECK (payment_mode IN ('Card','Bank Transfer','UPI','Cash','Cheque')),
  receipt_number varchar(40) NOT NULL UNIQUE DEFAULT ('RCT-' || upper(substr(md5(random()::text || clock_timestamp()::text),1,10)))
);
CREATE TABLE IF NOT EXISTS policy_renewal (
  renewal_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_id integer NOT NULL REFERENCES policy(policy_id),
  renewal_date date NOT NULL,
  old_premium numeric(12,2) NOT NULL CHECK (old_premium > 0),
  new_premium numeric(12,2) NOT NULL CHECK (new_premium > 0),
  new_end_date date NOT NULL
);
CREATE TABLE IF NOT EXISTS claim (
  claim_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_id integer NOT NULL REFERENCES policy(policy_id),
  claim_date date NOT NULL DEFAULT CURRENT_DATE,
  claim_amount numeric(14,2) NOT NULL CHECK (claim_amount > 0),
  status varchar(20) NOT NULL DEFAULT 'Filed' CHECK (status IN ('Filed','Investigating','Approved','Rejected','Settled')),
  description text NOT NULL,
  settlement_amount numeric(14,2) CHECK (settlement_amount >= 0 AND settlement_amount <= claim_amount),
  CHECK (status <> 'Settled' OR settlement_amount IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS claim_document (
  document_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  claim_id integer NOT NULL REFERENCES claim(claim_id) ON DELETE CASCADE,
  document_type varchar(80) NOT NULL,
  file_name varchar(255) NOT NULL,
  upload_date date NOT NULL DEFAULT CURRENT_DATE,
  storage_key varchar(100),
  mime_type varchar(120)
);
CREATE TABLE IF NOT EXISTS claim_document_file (
  document_id integer PRIMARY KEY REFERENCES claim_document(document_id) ON DELETE CASCADE,
  content bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS investigation (
  investigation_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  claim_id integer NOT NULL REFERENCES claim(claim_id),
  investigator_id integer NOT NULL REFERENCES investigator(investigator_id),
  investigation_date date NOT NULL DEFAULT CURRENT_DATE,
  findings text NOT NULL,
  recommendation varchar(20) NOT NULL CHECK (recommendation IN ('Approve','Reject','Further Review'))
);
CREATE TABLE IF NOT EXISTS agent_assignment (
  assignment_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id integer NOT NULL REFERENCES agent(agent_id),
  policy_id integer NOT NULL REFERENCES policy(policy_id),
  assignment_date date NOT NULL DEFAULT CURRENT_DATE,
  role varchar(80) NOT NULL DEFAULT 'Sales',
  UNIQUE (agent_id, policy_id)
);
CREATE TABLE IF NOT EXISTS app_user (
  user_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username varchar(80) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('Admin','Employee','Agent','Underwriter','Investigator','Customer','Viewer')),
  person_id integer,
  display_name varchar(120) NOT NULL
);
CREATE TABLE IF NOT EXISTS app_session (
  sid text PRIMARY KEY,
  sess jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_session_expires_at_idx ON app_session(expires_at);

CREATE OR REPLACE FUNCTION validate_beneficiary_share() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM policy WHERE policy_id = NEW.policy_id FOR UPDATE;
  IF (SELECT COALESCE(SUM(share_percentage),0) FROM beneficiary
      WHERE policy_id = NEW.policy_id AND beneficiary_id <> COALESCE(NEW.beneficiary_id,-1)) + NEW.share_percentage > 100 THEN
    RAISE EXCEPTION 'Beneficiary shares for a policy cannot exceed 100%%';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS beneficiary_share_check ON beneficiary;
CREATE TRIGGER beneficiary_share_check BEFORE INSERT OR UPDATE ON beneficiary
FOR EACH ROW EXECUTE FUNCTION validate_beneficiary_share();

CREATE OR REPLACE FUNCTION validate_policy_subtype() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_type text;
BEGIN
  SELECT policy_type INTO actual_type FROM policy WHERE policy_id = NEW.policy_id;
  IF actual_type <> TG_ARGV[0] THEN
    RAISE EXCEPTION 'Policy % is %, not %', NEW.policy_id, actual_type, TG_ARGV[0];
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS life_type_check ON life_insurance_policy;
CREATE TRIGGER life_type_check BEFORE INSERT OR UPDATE ON life_insurance_policy FOR EACH ROW EXECUTE FUNCTION validate_policy_subtype('Life');
DROP TRIGGER IF EXISTS health_type_check ON health_insurance_policy;
CREATE TRIGGER health_type_check BEFORE INSERT OR UPDATE ON health_insurance_policy FOR EACH ROW EXECUTE FUNCTION validate_policy_subtype('Health');
DROP TRIGGER IF EXISTS vehicle_type_check ON vehicle_insurance_policy;
CREATE TRIGGER vehicle_type_check BEFORE INSERT OR UPDATE ON vehicle_insurance_policy FOR EACH ROW EXECUTE FUNCTION validate_policy_subtype('Vehicle');
DROP TRIGGER IF EXISTS property_type_check ON property_insurance_policy;
CREATE TRIGGER property_type_check BEFORE INSERT OR UPDATE ON property_insurance_policy FOR EACH ROW EXECUTE FUNCTION validate_policy_subtype('Property');

CREATE OR REPLACE FUNCTION validate_policy_type_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.policy_type <> OLD.policy_type AND (
    EXISTS (SELECT 1 FROM life_insurance_policy WHERE policy_id=NEW.policy_id) OR
    EXISTS (SELECT 1 FROM health_insurance_policy WHERE policy_id=NEW.policy_id) OR
    EXISTS (SELECT 1 FROM vehicle_insurance_policy WHERE policy_id=NEW.policy_id) OR
    EXISTS (SELECT 1 FROM property_insurance_policy WHERE policy_id=NEW.policy_id)) THEN
    RAISE EXCEPTION 'Policy type cannot change after type details are created';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS policy_type_change_check ON policy;
CREATE TRIGGER policy_type_change_check BEFORE UPDATE ON policy FOR EACH ROW EXECUTE FUNCTION validate_policy_type_change();

CREATE OR REPLACE FUNCTION validate_active_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM policy WHERE policy_id=NEW.policy_id AND status='Active') THEN
    RAISE EXCEPTION 'A claim requires an active policy';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS active_claim_check ON claim;
CREATE TRIGGER active_claim_check BEFORE INSERT ON claim FOR EACH ROW EXECUTE FUNCTION validate_active_claim();

CREATE OR REPLACE FUNCTION apply_policy_renewal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE policy SET premium_amount=NEW.new_premium,end_date=NEW.new_end_date,status='Active' WHERE policy_id=NEW.policy_id;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION validate_policy_renewal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_premium numeric; current_end_date date; current_status text;
BEGIN
  SELECT premium_amount,end_date,status INTO current_premium,current_end_date,current_status FROM policy WHERE policy_id=NEW.policy_id FOR UPDATE;
  IF current_status NOT IN ('Active','Expired') THEN RAISE EXCEPTION 'Only active or expired policies can be renewed'; END IF;
  IF current_premium <> NEW.old_premium THEN
    RAISE EXCEPTION 'Old premium must match the policy current premium';
  END IF;
  NEW.new_end_date:=COALESCE(NEW.new_end_date,(current_end_date + interval '1 year')::date);
  IF NEW.new_end_date <= current_end_date THEN RAISE EXCEPTION 'Renewal end date must extend the policy'; END IF;
  RETURN NEW;
END $$;
CREATE INDEX IF NOT EXISTS policy_customer_idx ON policy(customer_id);
CREATE INDEX IF NOT EXISTS claim_policy_idx ON claim(policy_id);
CREATE INDEX IF NOT EXISTS payment_policy_idx ON payment(policy_id);
ALTER TABLE policy_renewal ADD COLUMN IF NOT EXISTS new_end_date date;
UPDATE policy_renewal r SET new_end_date=(p.end_date + interval '1 year')::date
  FROM policy p WHERE p.policy_id=r.policy_id AND r.new_end_date IS NULL;
ALTER TABLE policy_renewal ALTER COLUMN new_end_date SET NOT NULL;
DROP TRIGGER IF EXISTS policy_renewal_validate ON policy_renewal;
CREATE TRIGGER policy_renewal_validate BEFORE INSERT ON policy_renewal FOR EACH ROW EXECUTE FUNCTION validate_policy_renewal();
DROP TRIGGER IF EXISTS policy_renewal_apply ON policy_renewal;
CREATE TRIGGER policy_renewal_apply AFTER INSERT ON policy_renewal FOR EACH ROW EXECUTE FUNCTION apply_policy_renewal();

CREATE OR REPLACE FUNCTION validate_claim_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('Approved','Rejected','Settled') AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT EXISTS (SELECT 1 FROM investigation WHERE claim_id=NEW.claim_id) THEN
    RAISE EXCEPTION 'Record an investigation before deciding the claim';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS claim_decision_check ON claim;
CREATE TRIGGER claim_decision_check BEFORE UPDATE OF status ON claim FOR EACH ROW EXECUTE FUNCTION validate_claim_decision();

ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS storage_key varchar(100);
ALTER TABLE claim_document ADD COLUMN IF NOT EXISTS mime_type varchar(120);
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('Admin','Employee','Agent','Underwriter','Investigator','Customer','Viewer'));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='claim_settlement_valid') THEN
    ALTER TABLE claim ADD CONSTRAINT claim_settlement_valid
      CHECK (settlement_amount IS NULL OR (settlement_amount >= 0 AND settlement_amount <= claim_amount));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='claim_settled_has_amount') THEN
    ALTER TABLE claim ADD CONSTRAINT claim_settled_has_amount
      CHECK (status <> 'Settled' OR settlement_amount IS NOT NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ensure_customer_subtype() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid integer; ctype text; n integer;
BEGIN
  IF TG_OP='DELETE' THEN cid:=OLD.customer_id; ELSE cid:=NEW.customer_id; END IF;
  SELECT customer_type INTO ctype FROM customer WHERE customer_id=cid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT (SELECT count(*) FROM individual_customer WHERE customer_id=cid)
       + (SELECT count(*) FROM corporate_customer WHERE customer_id=cid) INTO n;
  IF n <> 1 OR (ctype='Individual' AND NOT EXISTS (SELECT 1 FROM individual_customer WHERE customer_id=cid))
            OR (ctype='Corporate' AND NOT EXISTS (SELECT 1 FROM corporate_customer WHERE customer_id=cid)) THEN
    RAISE EXCEPTION 'Customer % must have exactly one matching subtype', cid;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS customer_subtype_complete ON customer;
CREATE CONSTRAINT TRIGGER customer_subtype_complete AFTER INSERT OR UPDATE OR DELETE ON customer
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_customer_subtype();
DROP TRIGGER IF EXISTS individual_subtype_complete ON individual_customer;
CREATE CONSTRAINT TRIGGER individual_subtype_complete AFTER INSERT OR UPDATE OR DELETE ON individual_customer
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_customer_subtype();
DROP TRIGGER IF EXISTS corporate_subtype_complete ON corporate_customer;
CREATE CONSTRAINT TRIGGER corporate_subtype_complete AFTER INSERT OR UPDATE OR DELETE ON corporate_customer
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_customer_subtype();

CREATE OR REPLACE FUNCTION ensure_policy_subtype() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid integer; ptype text; n integer;
BEGIN
  IF TG_OP='DELETE' THEN pid:=OLD.policy_id; ELSE pid:=NEW.policy_id; END IF;
  SELECT policy_type INTO ptype FROM policy WHERE policy_id=pid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT (SELECT count(*) FROM life_insurance_policy WHERE policy_id=pid)
       + (SELECT count(*) FROM health_insurance_policy WHERE policy_id=pid)
       + (SELECT count(*) FROM vehicle_insurance_policy WHERE policy_id=pid)
       + (SELECT count(*) FROM property_insurance_policy WHERE policy_id=pid) INTO n;
  IF n <> 1 OR (ptype='Life' AND NOT EXISTS (SELECT 1 FROM life_insurance_policy WHERE policy_id=pid))
            OR (ptype='Health' AND NOT EXISTS (SELECT 1 FROM health_insurance_policy WHERE policy_id=pid))
            OR (ptype='Vehicle' AND NOT EXISTS (SELECT 1 FROM vehicle_insurance_policy WHERE policy_id=pid))
            OR (ptype='Property' AND NOT EXISTS (SELECT 1 FROM property_insurance_policy WHERE policy_id=pid)) THEN
    RAISE EXCEPTION 'Policy % must have exactly one matching subtype', pid;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS policy_subtype_complete ON policy;
CREATE CONSTRAINT TRIGGER policy_subtype_complete AFTER INSERT OR UPDATE OR DELETE ON policy
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_policy_subtype();
DROP TRIGGER IF EXISTS life_subtype_complete ON life_insurance_policy;
CREATE CONSTRAINT TRIGGER life_subtype_complete AFTER INSERT OR UPDATE OR DELETE ON life_insurance_policy
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_policy_subtype();
DROP TRIGGER IF EXISTS health_subtype_complete ON health_insurance_policy;
CREATE CONSTRAINT TRIGGER health_subtype_complete AFTER INSERT OR UPDATE OR DELETE ON health_insurance_policy
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_policy_subtype();
DROP TRIGGER IF EXISTS vehicle_subtype_complete ON vehicle_insurance_policy;
CREATE CONSTRAINT TRIGGER vehicle_subtype_complete AFTER INSERT OR UPDATE OR DELETE ON vehicle_insurance_policy
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_policy_subtype();
DROP TRIGGER IF EXISTS property_subtype_complete ON property_insurance_policy;
CREATE CONSTRAINT TRIGGER property_subtype_complete AFTER INSERT OR UPDATE OR DELETE ON property_insurance_policy
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_policy_subtype();

UPDATE policy p SET end_date=r.new_end_date
  FROM (SELECT policy_id,max(new_end_date) new_end_date FROM policy_renewal GROUP BY policy_id) r
  WHERE r.policy_id=p.policy_id AND p.end_date<r.new_end_date;

COMMIT;
