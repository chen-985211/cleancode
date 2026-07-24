export function shouldAcquireSingleInstanceLock(environment: Readonly<NodeJS.ProcessEnv>): boolean {
  return environment.CLEANCODE_TEST_DISABLE_SINGLE_INSTANCE_LOCK !== '1'
}
