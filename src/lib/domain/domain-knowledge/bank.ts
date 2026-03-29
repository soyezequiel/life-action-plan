/**
 * Domain Knowledge Bank
 *
 * Central registry for DomainKnowledgeCard objects.
 * Cards can be:
 *   - Static (cards/ directory): hand-authored, high confidence
 *   - Dynamic (generator.ts): generated via LLM + RAG at runtime
 *
 * Usage:
 *   const card = getKnowledgeCard('running')  // returns DomainKnowledgeCard | undefined
 */

import { z } from 'zod';
import type { GoalType } from '../goal-taxonomy';

// ─── Evidence grades ────────────────────────────────────────────────────────

export const EvidenceGradeSchema = z.enum([
  'A_SYSTEMATIC_REVIEW',   // Cochrane-level meta-analysis
  'B_PEER_REVIEWED',       // Single RCT or cohort study
  'C_INDUSTRY_STANDARD',   // Professional association guidelines
  'D_HEURISTIC',           // Practitioner consensus, coaching lore
  'E_UNKNOWN',             // Provenance unverifiable
]);
export type EvidenceGrade = z.infer<typeof EvidenceGradeSchema>;

// ─── Constraint severity ────────────────────────────────────────────────────

export const ConstraintSeveritySchema = z.enum(['INFO', 'WARNING', 'BLOCKER']);
export type ConstraintSeverity = z.infer<typeof ConstraintSeveritySchema>;

// ─── DomainKnowledgeCard schema ─────────────────────────────────────────────

export const DomainKnowledgeCardSchema = z.object({
  /** Canonical label used as lookup key. Lower-case, no spaces. e.g. "running" */
  domainLabel: z.string(),

  /** Which GoalTypes this domain is compatible with */
  goalTypeCompatibility: z.array(z.string()) as z.ZodArray<z.ZodType<GoalType>>,

  /** Atomic tasks / session types the template builder can use */
  tasks: z.array(z.object({
    id: z.string(),
    label: z.string(),
    typicalDurationMin: z.number().int().positive(),
    tags: z.array(z.string()),
    equivalenceGroupId: z.string(),
  })).min(1),

  /** Trackable metrics for this domain */
  metrics: z.array(z.object({
    id: z.string(),
    label: z.string(),
    unit: z.string(),
    direction: z.enum(['increase', 'decrease']),
  })),

  /** Optional skill / mastery ladder */
  progression: z.object({
    levels: z.array(z.object({
      levelId: z.string(),
      description: z.string(),
      exitCriteria: z.array(z.string()),
    })),
  }).optional(),

  /** Domain-specific constraints that the Validator and Scheduler must respect */
  constraints: z.array(z.object({
    id: z.string(),
    description: z.string(),
    severity: ConstraintSeveritySchema,
  })),

  /** Bibliography / provenance */
  sources: z.array(z.object({
    title: z.string(),
    evidence: EvidenceGradeSchema,
  })).min(1),

  /** How was this card generated */
  generationMeta: z.object({
    method: z.enum(['RAG', 'HYBRID', 'LLM_ONLY', 'MANUAL']),
    confidence: z.number().min(0).max(1),
  }),
}).strict();

export type DomainKnowledgeCard = z.infer<typeof DomainKnowledgeCardSchema>;

// ─── Registry ───────────────────────────────────────────────────────────────

/** Lazy-loaded registry. Populated on first call to ensure no circular imports. */
let _registry: Map<string, DomainKnowledgeCard> | null = null;

async function getRegistry(): Promise<Map<string, DomainKnowledgeCard>> {
  if (_registry !== null) return _registry;

  // Dynamic imports keep the registry tree-shakeable and avoid circular deps
  const [{ runningCard }, { guitarraCard }, { idiomasCard }, { healthCard }, { cocinaItalianaCard }] = await Promise.all([
    import('./cards/running'),
    import('./cards/guitarra'),
    import('./cards/idiomas'),
    import('./cards/health'),
    import('./cards/cocina-italiana'),
  ]);

  _registry = new Map<string, DomainKnowledgeCard>([
    [runningCard.domainLabel, runningCard],
    [guitarraCard.domainLabel, guitarraCard],
    [idiomasCard.domainLabel, idiomasCard],
    [healthCard.domainLabel, healthCard],
    [cocinaItalianaCard.domainLabel, cocinaItalianaCard],
  ]);

  return _registry;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Look up a DomainKnowledgeCard by its canonical domain label.
 *
 * @param domain - e.g. 'running', 'guitarra', 'idiomas'
 * @returns The matching card, or `undefined` if not found.
 *
 * @example
 *   const card = await getKnowledgeCard('running');
 */
function canonicalizeDomainLabel(domain: string): string {
  const normalized = domain.toLowerCase().trim();

  if ([
    'cocina',
    'cocina italiana',
    'cocina-italiana',
    'cocina de platos italianos',
    'recetas italianas',
    'platos italianos',
    'italian cooking',
    'italian cuisine',
  ].includes(normalized)) {
    return 'cocina-italiana';
  }

  if ([
    'health',
    'health-weight',
    'health-weight-loss',
    'weight-loss',
    'weight loss',
    'weight_management',
    'weight-management',
    'fitness',
    'wellness',
    'salud y peso',
    'salud',
  ].includes(normalized)) {
    return 'salud';
  }

  return normalized;
}

export async function getKnowledgeCard(domain: string): Promise<DomainKnowledgeCard | undefined> {
  const registry = await getRegistry();
  return registry.get(canonicalizeDomainLabel(domain));
}

/**
 * Returns all registered domain labels (sorted alphabetically).
 */
export async function listKnowledgeDomains(): Promise<string[]> {
  const registry = await getRegistry();
  return Array.from(registry.keys()).sort();
}

/**
 * Returns all cards that are compatible with a given GoalType.
 */
export async function getCardsByGoalType(goalType: GoalType): Promise<DomainKnowledgeCard[]> {
  const registry = await getRegistry();
  return Array.from(registry.values()).filter(card =>
    (card.goalTypeCompatibility as string[]).includes(goalType)
  );
}

/**
 * Register a dynamically-generated card at runtime.
 * If a card for the same domain already exists, it is replaced only if
 * the new card has equal or higher confidence.
 */
export async function registerCard(card: DomainKnowledgeCard): Promise<void> {
  const registry = await getRegistry();
  const existing = registry.get(card.domainLabel);
  if (!existing || card.generationMeta.confidence >= existing.generationMeta.confidence) {
    // Validate before registering
    DomainKnowledgeCardSchema.parse(card);
    registry.set(card.domainLabel, card);
  }
}
