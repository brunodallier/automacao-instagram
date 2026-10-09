-- Additive migration: preserve the original steps and every draft verbatim.
ALTER TABLE "Automation" ADD COLUMN "publicReplies" JSONB;

UPDATE "Automation" a
SET "publicReplies" = jsonb_build_object(
  'enabled', true,
  'strategy', 'ROTATING',
  'variations', (
    SELECT jsonb_agg(text ORDER BY position)
    FROM (
      SELECT COALESCE(s."text", '') AS text, s."position" AS position
      FROM "AutomationStep" s
      WHERE s."automationId" = a.id AND s.kind = 'PUBLIC_REPLY'
      UNION ALL
      SELECT '', 2147480000 + n
      FROM generate_series(1, GREATEST(0, 5 - (
        SELECT COUNT(*)::int FROM "AutomationStep" s
        WHERE s."automationId" = a.id AND s.kind = 'PUBLIC_REPLY'
      ))) n
    ) variations
  ),
  'fallback', jsonb_build_object('enabled', false, 'text', '')
)
WHERE EXISTS (
  SELECT 1 FROM "AutomationStep" s WHERE s."automationId" = a.id AND s.kind = 'PUBLIC_REPLY'
);
