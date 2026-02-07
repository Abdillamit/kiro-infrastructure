/**
 * Stage definitions for multi-environment deployment
 */
export enum STAGE {
  BETA = 'beta',
  PROD = '',
}

/**
 * Utility function to prefix resource names with stage
 * @param stage - The deployment stage
 * @param name - The resource name
 * @param separator - Separator between stage and name (default: '')
 * @returns Stagified name (e.g., 'betaUsersTable' or 'UsersTable')
 */
export function stagify(stage: STAGE, name: string, separator = ''): string {
  return stage ? `${stage}${separator}${name}` : name;
}

/**
 * Get stage from string value
 */
export function getStage(stageStr: string): STAGE {
  return stageStr === 'beta' ? STAGE.BETA : STAGE.PROD;
}
