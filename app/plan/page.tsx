import { PlanFlowPage } from '../../components/flow/PlanFlowPage'
import { getDeploymentMode } from '../../src/lib/env/deployment'

type SearchParams = Record<string, string | string[] | undefined>

interface PlanPageProps {
  searchParams?: Promise<SearchParams>
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' && value[0].trim() ? value[0].trim() : null
  }

  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function resolveSearchParams(searchParams: Promise<SearchParams> | undefined): Promise<SearchParams> {
  if (!searchParams) {
    return {}
  }

  return (await searchParams) ?? {}
}

export default async function PlanPage({ searchParams }: PlanPageProps) {
  const params = await resolveSearchParams(searchParams)
  const profileId = readParam(params.profileId) ?? readParam(params.id) ?? ''
  const provider = readParam(params.provider) ?? (getDeploymentMode() === 'local' ? 'codex' : 'openai')

  return <PlanFlowPage initialProfileId={profileId} provider={provider} />
}
