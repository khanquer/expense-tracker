/**
 * Hands images picked in the add sheet to the Add screen. File pickers must be opened directly
 * from the tap, so the sheet owns the inputs and passes the result along in memory.
 */
let pending: Blob[] = []

export function putFiles(files: Blob[]) {
  pending = files
}

export function takeFiles(): Blob[] {
  const files = pending
  pending = []
  return files
}
