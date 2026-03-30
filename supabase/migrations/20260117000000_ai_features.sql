-- AI Features Migration
-- Tables for AI request tracking, caching, feedback, and cost management

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- AI Requests Table
-- Tracks all AI API requests for analytics and billing
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Request details
  feature VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  
  -- Token usage
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  
  -- Cost tracking
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
  
  -- Performance
  latency_ms INTEGER,
  
  -- Status
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  
  -- Metadata
  request_metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ai_requests
CREATE INDEX idx_ai_requests_org ON ai_requests(organization_id);
CREATE INDEX idx_ai_requests_user ON ai_requests(user_id);
CREATE INDEX idx_ai_requests_feature ON ai_requests(feature);
CREATE INDEX idx_ai_requests_created ON ai_requests(created_at DESC);
CREATE INDEX idx_ai_requests_success ON ai_requests(success);

-- =====================================================
-- AI Cache Table
-- Caches AI responses to reduce costs and improve performance
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Cache key (hash of input)
  cache_key VARCHAR(255) UNIQUE NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  
  -- Feature type
  feature VARCHAR(50) NOT NULL,
  
  -- Cached response
  response JSONB NOT NULL,
  
  -- Cache statistics
  hit_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ai_cache
CREATE INDEX idx_ai_cache_key ON ai_cache(cache_key);
CREATE INDEX idx_ai_cache_feature ON ai_cache(feature);
CREATE INDEX idx_ai_cache_expires ON ai_cache(expires_at);
CREATE INDEX idx_ai_cache_input_hash ON ai_cache(input_hash);

-- =====================================================
-- AI Feedback Table
-- Collects user feedback on AI features
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Feature and request reference
  feature VARCHAR(50) NOT NULL,
  request_id UUID REFERENCES ai_requests(id) ON DELETE SET NULL,
  
  -- Feedback
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  
  -- Metadata
  feedback_metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ai_feedback
CREATE INDEX idx_ai_feedback_org ON ai_feedback(organization_id);
CREATE INDEX idx_ai_feedback_user ON ai_feedback(user_id);
CREATE INDEX idx_ai_feedback_feature ON ai_feedback(feature);
CREATE INDEX idx_ai_feedback_request ON ai_feedback(request_id);
CREATE INDEX idx_ai_feedback_rating ON ai_feedback(rating);

-- =====================================================
-- AI Costs Table
-- Aggregated monthly costs per organization
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Month (first day of month)
  month DATE NOT NULL,
  
  -- Aggregated data
  total_requests INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(10, 2) DEFAULT 0,
  
  -- Feature breakdown
  feature_breakdown JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(organization_id, month)
);

-- Indexes for ai_costs
CREATE INDEX idx_ai_costs_org ON ai_costs(organization_id);
CREATE INDEX idx_ai_costs_month ON ai_costs(month DESC);

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS
ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_costs ENABLE ROW LEVEL SECURITY;

-- ai_requests policies
CREATE POLICY "Users can view their organization's AI requests"
  ON ai_requests FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM users 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own AI requests"
  ON ai_requests FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    organization_id IN (
      SELECT organization_id 
      FROM users 
      WHERE id = auth.uid()
    )
  );

-- ai_cache policies (read-only for users)
CREATE POLICY "Users can view AI cache"
  ON ai_cache FOR SELECT
  USING (true);

-- ai_feedback policies
CREATE POLICY "Users can view their organization's AI feedback"
  ON ai_feedback FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM users 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own AI feedback"
  ON ai_feedback FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    organization_id IN (
      SELECT organization_id 
      FROM users 
      WHERE id = auth.uid()
    )
  );

-- ai_costs policies
CREATE POLICY "Users can view their organization's AI costs"
  ON ai_costs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM users 
      WHERE id = auth.uid()
    )
  );

-- =====================================================
-- Functions
-- =====================================================

-- Function to update ai_costs aggregation
CREATE OR REPLACE FUNCTION update_ai_costs()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process successful requests
  IF NEW.success THEN
    INSERT INTO ai_costs (
      organization_id,
      month,
      total_requests,
      total_cost_usd,
      feature_breakdown
    )
    VALUES (
      NEW.organization_id,
      DATE_TRUNC('month', NEW.created_at)::DATE,
      1,
      NEW.cost_usd,
      jsonb_build_object(NEW.feature, NEW.cost_usd)
    )
    ON CONFLICT (organization_id, month)
    DO UPDATE SET
      total_requests = ai_costs.total_requests + 1,
      total_cost_usd = ai_costs.total_cost_usd + NEW.cost_usd,
      feature_breakdown = COALESCE(ai_costs.feature_breakdown, '{}'::jsonb) || 
        jsonb_build_object(
          NEW.feature,
          COALESCE((ai_costs.feature_breakdown->NEW.feature)::numeric, 0) + NEW.cost_usd
        ),
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update ai_costs
CREATE TRIGGER trigger_update_ai_costs
  AFTER INSERT ON ai_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_costs();

-- Function to clean expired cache
CREATE OR REPLACE FUNCTION clean_expired_ai_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ai_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update cache hit count
CREATE OR REPLACE FUNCTION increment_cache_hit(p_cache_key VARCHAR)
RETURNS VOID AS $$
BEGIN
  UPDATE ai_cache
  SET 
    hit_count = hit_count + 1,
    last_accessed_at = NOW()
  WHERE cache_key = p_cache_key;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON TABLE ai_requests IS 'Tracks all AI API requests for analytics and billing';
COMMENT ON TABLE ai_cache IS 'Caches AI responses to reduce costs and improve performance';
COMMENT ON TABLE ai_feedback IS 'Collects user feedback on AI features';
COMMENT ON TABLE ai_costs IS 'Aggregated monthly AI costs per organization';

COMMENT ON FUNCTION update_ai_costs() IS 'Automatically updates ai_costs when new requests are created';
COMMENT ON FUNCTION clean_expired_ai_cache() IS 'Removes expired cache entries';
COMMENT ON FUNCTION increment_cache_hit(VARCHAR) IS 'Increments cache hit count and updates last accessed time';
