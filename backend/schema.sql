-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create roles
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT
);

INSERT INTO roles (name, description) VALUES
  ('mechanic', 'Field mechanic'),
  ('supervisor', 'Site supervisor'),
  ('superintendent', 'Operations superintendent'),
  ('hq_audit', 'Headquarters audit'),
  ('admin', 'System administrator')
ON CONFLICT DO NOTHING;

-- Create users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role_id INTEGER REFERENCES roles(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Create equipment types
CREATE TABLE IF NOT EXISTS equipment_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50)
);

INSERT INTO equipment_types (name, category) VALUES
  ('Dump Truck', 'dump_truck'),
  ('Excavator', 'excavator'),
  ('Support Unit', 'support')
ON CONFLICT DO NOTHING;

-- Create units
CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_number VARCHAR(50) UNIQUE NOT NULL,
  equipment_type_id INTEGER REFERENCES equipment_types(id),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create job codes
CREATE TABLE IF NOT EXISTS job_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO job_codes (code, description) VALUES
  ('PS250', 'Intercooler Remove & Install'),
  ('ENG001', 'Engine Overhaul'),
  ('HOSE001', 'Hose Replacement')
ON CONFLICT DO NOTHING;

-- Create components
CREATE TABLE IF NOT EXISTS components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO components (name, category) VALUES
  ('Radiator Hose', 'cooling'),
  ('Brake Line', 'hydraulic'),
  ('Engine Block', 'engine')
ON CONFLICT DO NOTHING;

-- Create config versions
CREATE TABLE IF NOT EXISTS config_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_number INT NOT NULL,
  config_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT false
);

-- Create job matrix
CREATE TABLE IF NOT EXISTS job_matrix (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_code_id UUID REFERENCES job_codes(id),
  equipment_type_id INTEGER REFERENCES equipment_types(id),
  base_points DECIMAL(10,2) NOT NULL,
  unit_factor DECIMAL(10,2) DEFAULT 1.0,
  config_version_id UUID REFERENCES config_versions(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create work orders (CORE TABLE)
CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wo_number VARCHAR(50) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  unit_id UUID REFERENCES units(id),
  equipment_type_id INTEGER REFERENCES equipment_types(id),
  job_code_id UUID REFERENCES job_codes(id),
  assigned_to UUID REFERENCES users(id),
  
  target_hours DECIMAL(10,2),
  standard_manpower INT DEFAULT 1,
  actual_manpower INT DEFAULT 1,
  work_condition VARCHAR(50) DEFAULT 'normal',
  
  status VARCHAR(50) DEFAULT 'created',
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_at TIMESTAMP,
  completed_at TIMESTAMP,
  submitted_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create submissions
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id VARCHAR(100) UNIQUE NOT NULL,
  work_order_id UUID REFERENCES work_orders(id),
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create approvals
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID REFERENCES work_orders(id),
  submission_id UUID REFERENCES submissions(id),
  approval_stage VARCHAR(50),
  status VARCHAR(50),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  override_applied BOOLEAN DEFAULT false,
  override_fields JSONB,
  override_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create scoring snapshots
CREATE TABLE IF NOT EXISTS scoring_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID REFERENCES work_orders(id),
  submission_id UUID REFERENCES submissions(id),
  base_points DECIMAL(10,2),
  unit_factor DECIMAL(10,2) DEFAULT 1.0,
  work_condition_factor DECIMAL(10,2) DEFAULT 1.0,
  safety_factor DECIMAL(10,2) DEFAULT 1.0,
  mtbf_factor DECIMAL(10,2) DEFAULT 1.0,
  timeliness_factor DECIMAL(10,2) DEFAULT 1.0,
  final_points DECIMAL(10,2),
  payout_amount DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create MTBF tracks
CREATE TABLE IF NOT EXISTS mtbf_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID REFERENCES work_orders(id),
  submission_id UUID REFERENCES submissions(id),
  status VARCHAR(50) DEFAULT 'pending',
  prior_work_order_id UUID REFERENCES work_orders(id),
  days_since_prior INT,
  override_applied BOOLEAN DEFAULT false,
  override_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  changes JSONB,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_unit ON work_orders(unit_id);
CREATE INDEX IF NOT EXISTS idx_submissions_wo ON submissions(work_order_id);
CREATE INDEX IF NOT EXISTS idx_approvals_stage ON approvals(approval_stage, status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
