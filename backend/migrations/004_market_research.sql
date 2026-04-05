-- Add market research fields to property table
-- These are populated via Claude web search (auto on upload + backfill for existing)

ALTER TABLE property ADD COLUMN IF NOT EXISTS building_amenities text;
ALTER TABLE property ADD COLUMN IF NOT EXISTS utility_responsibility text;
ALTER TABLE property ADD COLUMN IF NOT EXISTS market_incentives text;
ALTER TABLE property ADD COLUMN IF NOT EXISTS market_research_at timestamptz;
