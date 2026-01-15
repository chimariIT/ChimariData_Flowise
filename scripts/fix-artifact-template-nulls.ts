import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('🔄 Normalizing artifact_templates nulls...');

  await db.execute(sql`
    UPDATE artifact_templates SET metadata = '{}'::jsonb WHERE metadata IS NULL;
    UPDATE artifact_templates SET steps = '[]'::jsonb WHERE steps IS NULL;
    UPDATE artifact_templates SET expected_artifacts = '[]'::jsonb WHERE expected_artifacts IS NULL;
    UPDATE artifact_templates SET summary = '' WHERE summary IS NULL;
    UPDATE artifact_templates SET journey_type = COALESCE(journey_type, 'business');
    UPDATE artifact_templates SET industry = COALESCE(industry, 'general');
    UPDATE artifact_templates SET communication_style = COALESCE(communication_style, 'professional');
    UPDATE artifact_templates SET target_role = COALESCE(target_role, 'executive');
    UPDATE artifact_templates SET target_seniority = COALESCE(target_seniority, 'senior');
    UPDATE artifact_templates SET target_maturity = COALESCE(target_maturity, 'intermediate');
    UPDATE artifact_templates SET artifact_types = COALESCE(artifact_types, '[]'::jsonb);
    UPDATE artifact_templates SET visualization_types = COALESCE(visualization_types, '[]'::jsonb);
    UPDATE artifact_templates SET narrative_style = COALESCE(narrative_style, 'executive');
    UPDATE artifact_templates SET content_depth = COALESCE(content_depth, 'standard');
    UPDATE artifact_templates SET interactivity_level = COALESCE(interactivity_level, 'medium');
    UPDATE artifact_templates SET use_cases = COALESCE(use_cases, '[]'::jsonb);
    UPDATE artifact_templates SET delivery_format = COALESCE(delivery_format, '[]'::jsonb);
  `);

  console.log('✅ Null normalization complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed to normalize artifact_templates:', err);
  process.exit(1);
});
