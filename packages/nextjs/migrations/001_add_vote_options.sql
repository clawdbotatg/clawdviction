-- Migration: Add multi-option vote support to governance
-- Phase 1 Governance: structured votes with CV commitments and time windows

-- Add vote options and deadline columns to proposals
ALTER TABLE governance_proposals
  ADD COLUMN IF NOT EXISTS options JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duration_hours INTEGER DEFAULT NULL;

-- Add chosen option and CV commitment to responses
ALTER TABLE governance_responses
  ADD COLUMN IF NOT EXISTS chosen_option VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cv_committed BIGINT DEFAULT NULL;
