export const productionTarget = {
  projectId: '7d5bf55e-3c2d-4df5-abe9-0f0aa36ad435',
  environmentId: '05fa9e3b-c143-4f08-92b0-dd54b164d65d',
} as const

export function requireProductionTarget(projectId?: string, environmentId?: string) {
  if (
    projectId !== productionTarget.projectId ||
    environmentId !== productionTarget.environmentId
  ) {
    throw new Error(
      'This declaration only describes the registered calendar-aggregator production environment.',
    )
  }

  return productionTarget
}
