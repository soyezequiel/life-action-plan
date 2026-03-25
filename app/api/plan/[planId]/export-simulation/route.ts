import { DateTime } from 'luxon'
import { getDatabase } from '../../../../../src/lib/db/connection'
import { eq } from 'drizzle-orm'
import { planWorkflows } from '../../../../../src/lib/db/schema'
import { loadOwnedWorkflow, notFoundResponse } from '../../../flow/_helpers'
import { getSimulationTree } from '../../../../../src/lib/db/db-helpers'
import { buildSimulationExportBundle, buildTimelineCsv } from '../../../../../src/lib/flow/simulation-export-builder'
import { jsonResponse } from '../../../_shared'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ planId: string }> }
): Promise<Response> {
  const { planId } = await params

  // Find the workflow associated with this plan
  const workflowRow = await getDatabase().select({ id: planWorkflows.id })
    .from(planWorkflows)
    .where(eq(planWorkflows.planId, planId))
    .limit(1)

  if (!workflowRow.length) {
    return jsonResponse({
      success: false,
      error: 'FLOW_WORKFLOW_NOT_FOUND'
    }, { status: 404 })
  }

  const workflowId = workflowRow[0].id
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
        'Content-Disposition': `attachment; filename="simulacion-lap-${timestamp}.csv"`
      }
    })
  } else {
    const bundle = buildSimulationExportBundle({ session, tree })
    const jsonStr = JSON.stringify(bundle, null, 2)

    return new Response(jsonStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="simulacion-lap-${timestamp}.json"`
      }
    })
  }
}
