INSERT INTO branch (branch_name,address,phone) VALUES
 ('Mumbai Central','Fort, Mumbai, Maharashtra','022-4001-1100'),
 ('Pune West','Baner, Pune, Maharashtra','020-4002-2200');
INSERT INTO customer (customer_type,address,phone,email,registration_date) VALUES
 ('Individual','Andheri West, Mumbai','9876501001','aarav@example.com','2026-01-12'),
 ('Individual','Kothrud, Pune','9876501002','meera@example.com','2026-02-05'),
 ('Corporate','BKC, Mumbai','022-4400-9900','contact@novatech.example','2026-03-18'),
 ('Individual','Worli, Mumbai','9876501004','isha@example.com','2026-04-21');
INSERT INTO individual_customer VALUES
 (1,'Aarav Sharma','1992-08-16','Male','Architect'),
 (2,'Meera Desai','1988-12-02','Female','Teacher'),
 (4,'Isha Kulkarni','1995-05-09','Female','Designer');
INSERT INTO corporate_customer VALUES (3,'NovaTech Solutions','CIN-U72900MH2020PTC001','Rohan Mehta','Technology');
INSERT INTO employee (name,designation,salary,branch_id) VALUES
 ('Sanjay Rao','Operations Manager',85000,1),('Nina Patel','Claims Executive',62000,2);
INSERT INTO agent (name,phone,email,commission_rate,branch_id) VALUES
 ('Riya Kapoor','9876511101','riya@insurance.example',7.50,1),
 ('Kabir Joshi','9876511102','kabir@insurance.example',6.00,2);
INSERT INTO underwriter (name,department,approval_limit) VALUES
 ('Ananya Iyer','Retail',5000000),('Vikram Sethi','Commercial',15000000);
INSERT INTO investigator (name,phone,specialization,license_number) VALUES
 ('Dev Nair','9876522201','Vehicle','INV-MH-1024'),
 ('Priya Menon','9876522202','Health','INV-MH-2048');
INSERT INTO policy (policy_number,customer_id,underwriter_id,policy_type,start_date,end_date,premium_amount,status) VALUES
 ('POL-LIFE-1001',1,1,'Life','2026-01-15','2046-01-14',24000,'Active'),
 ('POL-HEALTH-1002',2,1,'Health','2026-02-10','2027-02-09',18000,'Active'),
 ('POL-VEH-1003',1,1,'Vehicle','2026-03-01','2027-02-28',11500,'Active'),
 ('POL-PROP-1004',3,2,'Property','2026-04-01','2027-03-31',88000,'Active'),
 ('POL-HEALTH-1005',4,NULL,'Health','2026-10-20','2027-10-19',21000,'Pending');
INSERT INTO life_insurance_policy VALUES (1,'Nisha Sharma',2500000,20);
INSERT INTO health_insurance_policy VALUES (2,'Family Floater','Apollo Network'),(5,'Individual','Max Healthcare');
INSERT INTO vehicle_insurance_policy VALUES (3,'MH02AB1234','Hyundai i20',650000);
INSERT INTO property_insurance_policy VALUES (4,'BKC Office Tower, Mumbai',12000000);
INSERT INTO beneficiary (policy_id,name,relationship,share_percentage) VALUES
 (1,'Nisha Sharma','Spouse',60),(1,'Rohan Sharma','Son',40),
 (2,'Aditi Desai','Daughter',100);
INSERT INTO payment (policy_id,amount,payment_date,payment_mode,receipt_number) VALUES
 (1,24000,'2026-01-15','UPI','RCT-1001'),
 (2,18000,'2026-02-10','Card','RCT-1002'),
 (3,12500,'2026-03-01','Bank Transfer','RCT-1003'),
 (4,88000,'2026-04-01','Bank Transfer','RCT-1004');
INSERT INTO policy_renewal (policy_id,renewal_date,old_premium,new_premium) VALUES
 (3,'2026-10-01',11500,12500);
INSERT INTO claim (policy_id,claim_date,claim_amount,status,description,settlement_amount) VALUES
 (3,'2026-06-18',45000,'Settled','Rear bumper damage after collision',42000),
 (2,'2026-09-05',32000,'Investigating','Hospitalisation and treatment expenses',NULL),
 (4,'2026-10-02',150000,'Filed','Storm damage to office premises',NULL);
INSERT INTO claim_document (claim_id,document_type,file_name,upload_date) VALUES
 (1,'Repair invoice','repair-invoice-1001.pdf','2026-06-18'),
 (2,'Hospital bill','hospital-bill-1002.pdf','2026-09-05');
INSERT INTO investigation (claim_id,investigator_id,investigation_date,findings,recommendation) VALUES
 (1,1,'2026-06-22','Damage and repair quote verified.','Approve'),
 (2,2,'2026-09-07','Medical records requested from hospital.','Further Review');
INSERT INTO agent_assignment (agent_id,policy_id,assignment_date,role) VALUES
 (1,1,'2026-01-12','Sales'),(2,2,'2026-02-05','Sales'),
 (1,3,'2026-02-25','Sales'),(1,4,'2026-03-20','Account manager');
