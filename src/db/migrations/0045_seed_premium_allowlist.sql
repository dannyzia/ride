-- Seed canonical premium allowlist (§5b, §15 of implementation plan)
-- Brand-wide rows: model IS NULL = whole brand matches
-- Brand+model rows: model IS NOT NULL = specific model matches
-- Case normalization handled by the LOWER() unique index on vehicle_premium_allowlist

-- ── Brand-wide entries (luxury marques) ──────────────────────────────────
INSERT INTO vehicle_premium_allowlist (brand, model, is_active) VALUES
  ('Mercedes-Benz', NULL, true),
  ('BMW', NULL, true),
  ('Audi', NULL, true),
  ('Lexus', NULL, true),
  ('Volvo', NULL, true),
  ('Land Rover', NULL, true),
  ('Jaguar', NULL, true),
  ('Porsche', NULL, true)
ON CONFLICT DO NOTHING;

-- ── Brand+model entries (Toyota premium models) ──────────────────────────
INSERT INTO vehicle_premium_allowlist (brand, model, is_active) VALUES
  ('Toyota', 'Premio', true),
  ('Toyota', 'Allion', true),
  ('Toyota', 'Camry', true),
  ('Toyota', 'Crown', true),
  ('Toyota', 'Harrier', true),
  ('Toyota', 'Land Cruiser', true),
  ('Toyota', 'Prado', true),
  ('Honda', 'Accord', true)
ON CONFLICT DO NOTHING;
