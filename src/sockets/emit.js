/** @type {import("socket.io").Server | null} */
let ioRef = null;

export function attachSocketServer(io) {
  ioRef = io;
}

/**
 * @param {string} projectId
 * @param {string} event
 * @param {unknown} [payload]
 */
export function emitToProject(projectId, event, payload) {
  ioRef?.to(`project:${projectId}`).emit(event, payload ?? {});
}
