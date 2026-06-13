// Stub for the "ws" package on native platforms.
// React Native provides a global WebSocket implementation, so the real "ws"
// Node.js package is not needed (and cannot be bundled by Metro).
// This stub prevents Metro from resolving Node.js built-in dependencies
// (stream, net, tls) that don't exist in the React Native runtime.
export default class WebSocket {
  constructor() {
    throw new Error("ws package should not be used on native platforms");
  }
}
