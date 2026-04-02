-- Add province to property for reliable Quebec detection
ALTER TABLE property ADD COLUMN IF NOT EXISTS province text;

-- Preserve the original Quebec designation when converting
ALTER TABLE unit ADD COLUMN IF NOT EXISTS unit_type_original text;

CREATE INDEX IF NOT EXISTS idx_property_province ON property (province);
