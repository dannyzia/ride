/**
 * Audit H-1: sign-out must tear down the WebSocket. riderSocket is the owner
 * of the shared WS slot for the rider session; teardownRiderSocket() must
 * close whatever socket occupies the slot (rider OR driver — the slot is
 * single), detach its handlers so no ghost reconnect fires, and clear the
 * store's identity tag. The tag itself (setWebSocket) is what lets adoption
 * sites reject a previous session's socket.
 *
 * Plus the handshake-readiness contract (device-observed 2026-09-20): an OPEN
 * socket is not automatically a working channel. connectRiderSocket puts the
 * socket in the slot before `onopen`/`auth:hello`, so a socket the server never
 * registered is OPEN and silent — indistinguishable from an empty pool unless
 * readiness depends on the server's own `auth:ok`.
 */
/* eslint-disable import/first */
jest.mock("../config", () => ({
  WS_URL: "ws://localhost:3001",
  API_URL: "http://localhost",
}));

const mockGetSession = jest.fn();
jest.mock("../supabase", () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
}));

import { useWSStore } from "@/store";
import {
  teardownRiderSocket,
  ensureRiderSocket,
  isRiderSocketReady,
} from "../riderSocket";

type Listener = (event: { data: string }) => void;

/** Minimal WebSocket stand-in that lets a test drive the handshake. */
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  sent: string[] = [];
  close = jest.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });
  send = jest.fn((data: string) => {
    this.sent.push(data);
  });
  private listeners = new Map<string, Listener[]>();

  constructor() {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => l !== fn));
  }

  emit(type: string, event: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(event as { data: string });
  }

  /** The server accepted the TCP connection. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** The server answered the handshake. */
  authOk(): void {
    this.emit("message", { data: JSON.stringify({ type: "auth:ok", role: "rider" }) });
  }
}

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

const SESSION = { access_token: "tok", user: { id: "user-a" } };

beforeEach(() => {
  useWSStore.getState().resetWebSocket();
  FakeWebSocket.instances = [];
  mockGetSession.mockResolvedValue({ data: { session: null } });
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
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

describe("isRiderSocketReady — OPEN is not the same as delivering", () => {
  it("rejects an OPEN socket the server never answered", () => {
    // The device state: /health read connected_riders: 0 (a connected client
    // that was never a registered rider) while this socket was OPEN.
    expect(isRiderSocketReady(fakeWebSocket())).toBe(false);
  });

  it("rejects CONNECTING, CLOSING, CLOSED and absent sockets", () => {
    for (const rs of [0, 2, 3]) {
      expect(isRiderSocketReady({ readyState: rs } as unknown as WebSocket)).toBe(false);
    }
    expect(isRiderSocketReady(null)).toBe(false);
    expect(isRiderSocketReady(undefined)).toBe(false);
  });

  it("accepts a socket only after the server's auth:ok", async () => {
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    const socket = (await ensureRiderSocket()) as unknown as FakeWebSocket;
    expect(socket).toBeTruthy();

    socket.open();
    // Handshake sent, answer not back: still not a channel we can rely on.
    expect(socket.sent.some((m) => m.includes("auth:hello"))).toBe(true);
    expect(isRiderSocketReady(useWSStore.getState().ws)).toBe(false);

    socket.authOk();
    expect(isRiderSocketReady(useWSStore.getState().ws)).toBe(true);
  });
});

describe("ensureRiderSocket — replace a socket that is not live", () => {
  it("replaces an OPEN rider socket the server never registered", async () => {
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    const unregistered = fakeWebSocket();
    useWSStore.getState().setWebSocket(unregistered, "rider", "user-a");

    await ensureRiderSocket();

    expect(unregistered.close).toHaveBeenCalledTimes(1);
    expect(useWSStore.getState().ws).not.toBe(unregistered);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("adopts a socket that completed the handshake instead of reconnecting", async () => {
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    const first = (await ensureRiderSocket()) as unknown as FakeWebSocket;
    first.open();
    first.authOk();

    const second = await ensureRiderSocket();

    expect(second).toBe(useWSStore.getState().ws);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(first.close).not.toHaveBeenCalled();
  });

  it("closes the socket when the server rejects the handshake", async () => {
    mockGetSession.mockResolvedValue({ data: { session: SESSION } });
    const socket = (await ensureRiderSocket()) as unknown as FakeWebSocket;
    socket.open();

    socket.emit("message", { data: JSON.stringify({ type: "auth:error", message: "token_expired" }) });

    // The server leaves a refused socket open, so nothing else would replace
    // it — closing is what puts onclose's reconnect path in charge.
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(isRiderSocketReady(useWSStore.getState().ws)).toBe(false);
  });
});
