/**
 * Audit H-1: sign-out must tear down the WebSocket. riderSocket is the owner
 * of the shared WS slot for the rider session; teardownRiderSocket() must
 * close whatever socket occupies the slot (rider OR driver — the slot is
 * single), detach its handlers so no ghost reconnect fires, and clear the
 * store's identity tag. The tag itself (setWebSocket) is what lets adoption
 * sites reject a previous session's socket.
 */
/* eslint-disable import/first */
jest.mock("../config", () => ({
  WS_URL: "ws://localhost:3001",
  API_URL: "http://localhost",
}));

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

import { useWSStore } from "@/store";
import { teardownRiderSocket } from "../riderSocket";

function fakeWebSocket(): WebSocket {
  return {
    readyState: 1,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    close: jest.fn(),
  } as unknown as WebSocket;
}

beforeEach(() => {
  useWSStore.getState().resetWebSocket();
});

describe("useWSStore socket identity tagging", () => {
  it("tags the socket with its owner's role and user id", () => {
    const sock = fakeWebSocket();
    useWSStore.getState().setWebSocket(sock, "rider", "user-a");
    const s = useWSStore.getState();
    expect(s.ws).toBe(sock);
    expect(s.socketRole).toBe("rider");
    expect(s.socketUserId).toBe("user-a");
  });

  it("resetWebSocket clears the slot and identity", () => {
    useWSStore.getState().setWebSocket(fakeWebSocket(), "driver", "user-b");
    useWSStore.getState().resetWebSocket();
    const s = useWSStore.getState();
    expect(s.ws).toBeNull();
    expect(s.socketRole).toBeNull();
    expect(s.socketUserId).toBeNull();
  });
});

describe("teardownRiderSocket (audit H-1)", () => {
  it("closes the occupying socket, detaches handlers, and resets the store", () => {
    const sock = fakeWebSocket();
    const onClose = jest.fn();
    const onMessage = jest.fn();
    sock.onclose = onClose;
    sock.onmessage = onMessage;
    useWSStore.getState().setWebSocket(sock, "driver", "user-stale");
    // simulate an inbound close after teardown detached the handler
    sock.onclose = onClose;

    teardownRiderSocket();

    expect(sock.close).toHaveBeenCalledTimes(1);
    const s = useWSStore.getState();
    expect(s.ws).toBeNull();
    expect(s.socketRole).toBeNull();
    expect(s.socketUserId).toBeNull();
    // handlers detached — a close event on the dead socket must be a no-op
    sock.onclose?.(undefined as never);
    expect(onClose).toHaveBeenCalledTimes(0);
  });

  it("is a no-op when no socket occupies the slot", () => {
    expect(() => teardownRiderSocket()).not.toThrow();
    expect(useWSStore.getState().ws).toBeNull();
  });
});
