-- ─── Property images table ───────────────────────────────────────────────────
CREATE TABLE property_image (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES property(id) ON DELETE CASCADE,
  s3_key text NOT NULL,
  filename text,
  is_preview boolean DEFAULT false,
  uploaded_at timestamptz DEFAULT now()
);
CREATE INDEX idx_property_image_property_id ON property_image (property_id);
