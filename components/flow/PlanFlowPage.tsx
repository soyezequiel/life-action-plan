import ConflictResolverMockup from '../mockups/ConflictResolverMockup'
import RefinementMockup from '../mockups/RefinementMockup'
import SimulationCostMockup from '../mockups/SimulationCostMockup'
import SpatialPrioritizationMockup from '../mockups/SpatialPrioritizationMockup'
import TaskManagementMockup from '../mockups/TaskManagementMockup'

interface PlanFlowPageProps {
  variant?: 'refinement' | 'spatial' | 'conflict' | 'simulation' | 'tasks'
  initialProfileId?: string
  provider?: string
}

export function PlanFlowPage({ variant = 'refinement' }: PlanFlowPageProps) {
  switch (variant) {
    case 'spatial':
      return <SpatialPrioritizationMockup />
    case 'conflict':
      return <ConflictResolverMockup />
    case 'simulation':
      return <SimulationCostMockup />
    case 'tasks':
      return <TaskManagementMockup />
    default:
      return <RefinementMockup />
  }
}
