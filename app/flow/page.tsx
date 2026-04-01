import { redirect } from 'next/navigation'

type SearchParams = Record<string, string | string[] | undefined>

interface FlowPageProps {
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

export default async function FlowPage({ searchParams }: FlowPageProps) {
  const params = await resolveSearchParams(searchParams)
  const variant = readParam(params.variant)

  if (variant === 'tasks') {
    redirect('/tasks')
  }

  redirect('/intake')
}
