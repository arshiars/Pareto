-- Add notes field to unit table for analyst annotations
ALTER TABLE unit ADD COLUMN IF NOT EXISTS notes text;
