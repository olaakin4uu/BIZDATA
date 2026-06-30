import { AnalyticsAgent } from './agent.types';
import { PatternDetectionAgent } from './implementations/pattern-detection.agent';
import { MatchingAgent } from './implementations/matching.agent';
import { SectorClassificationAgent } from './implementations/sector-classification.agent';
import { BehaviouralAnalyticsAgent } from './implementations/behavioural-analytics.agent';
import { PredictiveComplianceAgent } from './implementations/predictive-compliance.agent';
import { DocumentIntelligenceAgent } from './implementations/document-intelligence.agent';

/** The six BRIS analytics agents (§5.2), in execution order. */
export const AGENTS: AnalyticsAgent[] = [
  new PatternDetectionAgent(),
  new MatchingAgent(),
  new SectorClassificationAgent(),
  new BehaviouralAnalyticsAgent(),
  new PredictiveComplianceAgent(),
  new DocumentIntelligenceAgent(),
];
