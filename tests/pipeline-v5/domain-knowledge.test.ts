import { describe, it, expect } from 'vitest';
import { 
  getKnowledgeCard, 
  listKnowledgeDomains, 
  getCardsByGoalType, 
  DomainKnowledgeCardSchema 
} from '@lib/domain/domain-knowledge/bank';
import { runningCard } from '@lib/domain/domain-knowledge/cards/running';
import { guitarraCard } from '@lib/domain/domain-knowledge/cards/guitarra';
import { idiomasCard } from '@lib/domain/domain-knowledge/cards/idiomas';

describe('Domain Knowledge Bank & Cards', () => {
  
  describe('Static Cards Validation', () => {
    it('runningCard should be a valid DomainKnowledgeCard', () => {
      expect(() => DomainKnowledgeCardSchema.parse(runningCard)).not.toThrow();
      expect(runningCard.domainLabel).toBe('running');
    });

    it('guitarraCard should be a valid DomainKnowledgeCard', () => {
      expect(() => DomainKnowledgeCardSchema.parse(guitarraCard)).not.toThrow();
      expect(guitarraCard.domainLabel).toBe('guitarra');
    });

    it('idiomasCard should be a valid DomainKnowledgeCard', () => {
      expect(() => DomainKnowledgeCardSchema.parse(idiomasCard)).not.toThrow();
      expect(idiomasCard.domainLabel).toBe('idiomas');
    });
  });

  describe('Registry Functions', () => {
    it('listKnowledgeDomains should return all static domains', async () => {
      const domains = await listKnowledgeDomains();
      expect(domains).toContain('running');
      expect(domains).toContain('guitarra');
      expect(domains).toContain('idiomas');
      expect(domains.length).toBeGreaterThanOrEqual(3);
    });

    it('getKnowledgeCard should retrieve cards by label (case-insensitive)', async () => {
      const run = await getKnowledgeCard('RUNNING');
      expect(run).toBeDefined();
      expect(run?.domainLabel).toBe('running');

      const guitar = await getKnowledgeCard('guitarra ');
      expect(guitar).toBeDefined();
      expect(guitar?.domainLabel).toBe('guitarra');
    });

    it('getKnowledgeCard should return undefined for unknown domains', async () => {
      const card = await getKnowledgeCard('quantum_physics');
      expect(card).toBeUndefined();
    });

    it('getCardsByGoalType should filter correctly', async () => {
      // Running is compatible with RECURRENT_HABIT, SKILL_ACQUISITION, QUANT_TARGET_TRACKING
      // Idiomas is compatible with SKILL_ACQUISITION, RECURRENT_HABIT, QUANT_TARGET_TRACKING
      // Guitarra is compatible with SKILL_ACQUISITION, RECURRENT_HABIT, IDENTITY_EXPLORATION
      
      const skillCards = await getCardsByGoalType('SKILL_ACQUISITION');
      const labels = skillCards.map(c => c.domainLabel);
      expect(labels).toContain('running');
      expect(labels).toContain('guitarra');
      expect(labels).toContain('idiomas');

      const identityCards = await getCardsByGoalType('IDENTITY_EXPLORATION');
      const identityLabels = identityCards.map(c => c.domainLabel);
      expect(identityLabels).toContain('guitarra');
      expect(identityLabels).not.toContain('running');
    });
  });

  describe('Card Content Integrity', () => {
    it('should have at least one BLOCKER severity constraint in each card', async () => {
      const cards = [runningCard, guitarraCard, idiomasCard];
      for (const card of cards) {
        const blockers = card.constraints.filter(c => c.severity === 'BLOCKER');
        expect(blockers.length).toBeGreaterThan(0);
      }
    });

    it('should have at least one High Grade source (A or B) in each card', async () => {
      const cards = [runningCard, guitarraCard, idiomasCard];
      for (const card of cards) {
        const highGrade = card.sources.filter(s => 
          s.evidence === 'A_SYSTEMATIC_REVIEW' || s.evidence === 'B_PEER_REVIEWED'
        );
        expect(highGrade.length).toBeGreaterThan(0);
      }
    });
  });
});
