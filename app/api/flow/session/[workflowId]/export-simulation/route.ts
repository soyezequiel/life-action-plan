import { DateTime } from 'luxon'
import { loadOwnedWorkflow, notFoundResponse } from '../../../_helpers'
import { getSimulationTree } from '../../../../../../src/lib/db/db-helpers'
import { buildSimulationExportBundle, buildTimelineCsv } from '../../../../../../src/lib/flow/simulation-export-builder'
import { jsonResponse } from '../../../../_shared'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
): Promise<Response> {
  const { workflowId } = await params
  const session = await loadOwnedWorkflow(request, workflowId)

  if (!session) {
    return notFoundResponse()
  }

  if (!session.state.simulationTreeId) {
    return jsonResponse({
      success: false,
      error: 'FLOW_SIMULATION_TREE_REQUIRED'
    }, { status: 400 })
  }

  const tree = await getSimulationTree(workflowId)

  if (!tree) {
    return jsonResponse({
      success: false,
      error: 'FLOW_SIMULATION_TREE_NOT_FOUND'
    }, { status: 404 })
  }

  const url = new URL(request.url)
  const format = url.searchParams.get('format') ?? 'json'
  const timestamp = DateTime.utc().toFormat('yyyyMMdd-HHmmss')

  if (format === 'csv') {
    const bundle = buildSimulationExportBundle({ session, tree })
    const csv = buildTimelineCsv(bundle.timeline)

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="lap-simulation-${workflowId}-${timestamp}.csv"`,
        'Cache-Control': 'no-store'
      }
    })
  }

  const bundle = buildSimulationExportBundle({ session, tree })

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="lap-simulation-${workflowId}-${timestamp}.json"`,
      'Cache-Control': 'no-store'
    }
  })
}
