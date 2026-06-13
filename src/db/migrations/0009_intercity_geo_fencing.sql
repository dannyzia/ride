-- Migration: Intercity geo-fencing
-- Adds city_boundaries table, intercity_per_km_bdt to pricing, and zone polygon placeholder

-- 1. Create city_boundaries table
CREATE TABLE IF NOT EXISTS city_boundaries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(100) NOT NULL,
  polygon    jsonb        NOT NULL,
  is_active  boolean      NOT NULL DEFAULT true,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS city_boundaries_name_idx ON city_boundaries (name);
CREATE INDEX IF NOT EXISTS city_boundaries_active_idx ON city_boundaries (is_active);

-- 2. Add intercity_per_km_bdt to pricing
ALTER TABLE pricing
  ADD COLUMN IF NOT EXISTS intercity_per_km_bdt integer NOT NULL DEFAULT 0;

-- 2b. Seed intercity_per_km_bdt values (1.3x–1.5x normal per_km_bdt)
UPDATE pricing SET intercity_per_km_bdt = 1160 WHERE vehicle_type = 'bike_basic';
UPDATE pricing SET intercity_per_km_bdt = 1425 WHERE vehicle_type = 'bike_standard';
UPDATE pricing SET intercity_per_km_bdt = 1575 WHERE vehicle_type = 'bike_plus';
UPDATE pricing SET intercity_per_km_bdt = 2250 WHERE vehicle_type = 'cng';
UPDATE pricing SET intercity_per_km_bdt = 2250 WHERE vehicle_type = 'car_economy';
UPDATE pricing SET intercity_per_km_bdt = 2700 WHERE vehicle_type = 'car_comfort';
UPDATE pricing SET intercity_per_km_bdt = 3150 WHERE vehicle_type = 'car_premium';
UPDATE pricing SET intercity_per_km_bdt = 3750 WHERE vehicle_type = 'car_xl';

-- 3. Add platform_commission_percent to rides (if not already present)
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS platform_commission_bdt integer;

-- 4. Seed 8 divisional city boundaries (approximate polygons — replace with real data from admin panel)
INSERT INTO city_boundaries (name, polygon, is_active) VALUES
  ('Dhaka',      '[{"lat":23.73,"lng":90.25},{"lat":23.78,"lng":90.22},{"lat":23.84,"lng":90.21},{"lat":23.90,"lng":90.23},{"lat":23.95,"lng":90.28},{"lat":23.99,"lng":90.35},{"lat":24.01,"lng":90.42},{"lat":24.00,"lng":90.50},{"lat":23.98,"lng":90.57},{"lat":23.94,"lng":90.63},{"lat":23.88,"lng":90.67},{"lat":23.81,"lng":90.68},{"lat":23.74,"lng":90.66},{"lat":23.68,"lng":90.62},{"lat":23.63,"lng":90.56},{"lat":23.60,"lng":90.49},{"lat":23.59,"lng":90.42},{"lat":23.60,"lng":90.35},{"lat":23.63,"lng":90.29},{"lat":23.68,"lng":90.26}]'::jsonb, true),
  ('Chattogram', '[{"lat":22.17,"lng":91.60},{"lat":22.22,"lng":91.56},{"lat":22.28,"lng":91.55},{"lat":22.35,"lng":91.57},{"lat":22.41,"lng":91.61},{"lat":22.46,"lng":91.67},{"lat":22.50,"lng":91.74},{"lat":22.52,"lng":91.82},{"lat":22.51,"lng":91.89},{"lat":22.48,"lng":91.95},{"lat":22.43,"lng":91.99},{"lat":22.37,"lng":92.01},{"lat":22.30,"lng":92.00},{"lat":22.24,"lng":91.97},{"lat":22.19,"lng":91.92},{"lat":22.16,"lng":91.85},{"lat":22.15,"lng":91.78},{"lat":22.15,"lng":91.70},{"lat":22.16,"lng":91.65},{"lat":22.17,"lng":91.60}]'::jsonb, true),
  ('Rajshahi',   '[{"lat":24.20,"lng":88.40},{"lat":24.26,"lng":88.37},{"lat":24.32,"lng":88.38},{"lat":24.37,"lng":88.41},{"lat":24.42,"lng":88.46},{"lat":24.45,"lng":88.52},{"lat":24.47,"lng":88.59},{"lat":24.47,"lng":88.66},{"lat":24.45,"lng":88.72},{"lat":24.41,"lng":88.77},{"lat":24.36,"lng":88.80},{"lat":24.30,"lng":88.81},{"lat":24.24,"lng":88.79},{"lat":24.19,"lng":88.75},{"lat":24.16,"lng":88.69},{"lat":24.15,"lng":88.62},{"lat":24.16,"lng":88.55},{"lat":24.18,"lng":88.49},{"lat":24.19,"lng":88.44},{"lat":24.20,"lng":88.40}]'::jsonb, true),
  ('Khulna',     '[{"lat":22.65,"lng":89.30},{"lat":22.70,"lng":89.27},{"lat":22.77,"lng":89.28},{"lat":22.83,"lng":89.31},{"lat":22.88,"lng":89.36},{"lat":22.92,"lng":89.42},{"lat":22.95,"lng":89.49},{"lat":22.96,"lng":89.56},{"lat":22.95,"lng":89.63},{"lat":22.92,"lng":89.69},{"lat":22.87,"lng":89.73},{"lat":22.81,"lng":89.75},{"lat":22.74,"lng":89.74},{"lat":22.68,"lng":89.71},{"lat":22.64,"lng":89.66},{"lat":22.61,"lng":89.59},{"lat":22.60,"lng":89.52},{"lat":22.61,"lng":89.45},{"lat":22.63,"lng":89.38},{"lat":22.65,"lng":89.30}]'::jsonb, true),
  ('Sylhet',     '[{"lat":24.70,"lng":91.65},{"lat":24.76,"lng":91.62},{"lat":24.82,"lng":91.63},{"lat":24.88,"lng":91.67},{"lat":24.93,"lng":91.73},{"lat":24.97,"lng":91.80},{"lat":24.99,"lng":91.88},{"lat":24.99,"lng":91.96},{"lat":24.97,"lng":92.03},{"lat":24.93,"lng":92.08},{"lat":24.87,"lng":92.11},{"lat":24.80,"lng":92.11},{"lat":24.74,"lng":92.08},{"lat":24.69,"lng":92.03},{"lat":24.66,"lng":91.96},{"lat":24.65,"lng":91.88},{"lat":24.66,"lng":91.80},{"lat":24.68,"lng":91.73},{"lat":24.69,"lng":91.68},{"lat":24.70,"lng":91.65}]'::jsonb, true),
  ('Barisal',    '[{"lat":22.50,"lng":90.15},{"lat":22.55,"lng":90.12},{"lat":22.62,"lng":90.13},{"lat":22.68,"lng":90.17},{"lat":22.73,"lng":90.23},{"lat":22.77,"lng":90.30},{"lat":22.79,"lng":90.38},{"lat":22.79,"lng":90.46},{"lat":22.77,"lng":90.53},{"lat":22.73,"lng":90.58},{"lat":22.67,"lng":90.61},{"lat":22.60,"lng":90.61},{"lat":22.54,"lng":90.58},{"lat":22.49,"lng":90.53},{"lat":22.46,"lng":90.46},{"lat":22.45,"lng":90.38},{"lat":22.46,"lng":90.30},{"lat":22.48,"lng":90.23},{"lat":22.49,"lng":90.18},{"lat":22.50,"lng":90.15}]'::jsonb, true),
  ('Rangpur',    '[{"lat":25.50,"lng":88.90},{"lat":25.56,"lng":88.87},{"lat":25.63,"lng":88.88},{"lat":25.69,"lng":88.92},{"lat":25.74,"lng":88.98},{"lat":25.78,"lng":89.05},{"lat":25.80,"lng":89.13},{"lat":25.80,"lng":89.21},{"lat":25.78,"lng":89.28},{"lat":25.74,"lng":89.33},{"lat":25.68,"lng":89.36},{"lat":25.61,"lng":89.36},{"lat":25.55,"lng":89.33},{"lat":25.50,"lng":89.28},{"lat":25.47,"lng":89.21},{"lat":25.46,"lng":89.13},{"lat":25.47,"lng":89.05},{"lat":25.49,"lng":88.98},{"lat":25.49,"lng":88.93},{"lat":25.50,"lng":88.90}]'::jsonb, true),
  ('Mymensingh', '[{"lat":24.55,"lng":90.20},{"lat":24.60,"lng":90.17},{"lat":24.66,"lng":90.18},{"lat":24.72,"lng":90.22},{"lat":24.77,"lng":90.28},{"lat":24.81,"lng":90.35},{"lat":24.83,"lng":90.43},{"lat":24.83,"lng":90.51},{"lat":24.81,"lng":90.58},{"lat":24.77,"lng":90.63},{"lat":24.71,"lng":90.66},{"lat":24.64,"lng":90.66},{"lat":24.58,"lng":90.63},{"lat":24.53,"lng":90.58},{"lat":24.50,"lng":90.51},{"lat":24.49,"lng":90.43},{"lat":24.50,"lng":90.35},{"lat":24.52,"lng":90.28},{"lat":24.54,"lng":90.23},{"lat":24.55,"lng":90.20}]'::jsonb, true)
ON CONFLICT DO NOTHING;
