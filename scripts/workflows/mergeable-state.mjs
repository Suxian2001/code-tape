const waitingMergeableStates = new Set(['blocked', 'dirty', 'unknown']);

export function shouldWaitForMergeableState(state) {
  if (!state) {
    return false;
  }
  return waitingMergeableStates.has(state);
}
