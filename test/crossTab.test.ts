import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCrossTabSync } from '../src/crossTab';

describe('createCrossTabSync', () => {
  let originalBroadcastChannel: typeof BroadcastChannel | undefined;

  beforeEach(() => {
    originalBroadcastChannel = globalThis.BroadcastChannel;
  });

  afterEach(() => {
    if (originalBroadcastChannel) {
      globalThis.BroadcastChannel = originalBroadcastChannel;
    } else {
      // @ts-expect-error - deleting to restore undefined state
      delete globalThis.BroadcastChannel;
    }
  });

  it('should return null when BroadcastChannel is not available', () => {
    // @ts-expect-error - intentionally making it undefined
    delete globalThis.BroadcastChannel;

    const result = createCrossTabSync({
      channelName: 'test-channel',
      onLogoutReceived: vi.fn(),
    });

    expect(result).toBeNull();
  });

  describe('with BroadcastChannel available', () => {
    let mockChannel: {
      postMessage: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      onmessage: ((event: MessageEvent) => void) | null;
    };
    let MockBroadcastChannel: new (name: string) => typeof mockChannel;
    let constructorCalls: string[];

    beforeEach(() => {
      constructorCalls = [];
      mockChannel = {
        postMessage: vi.fn(),
        close: vi.fn(),
        onmessage: null,
      };

      // Create a proper class mock
      MockBroadcastChannel = class {
        constructor(name: string) {
          constructorCalls.push(name);
          return mockChannel;
        }
      } as unknown as new (name: string) => typeof mockChannel;
      globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;
    });

    it('should create a BroadcastChannel with the given name', () => {
      createCrossTabSync({
        channelName: 'my-auth-channel',
        onLogoutReceived: vi.fn(),
      });

      expect(constructorCalls).toContain('my-auth-channel');
    });

    it('should return CrossTabSync instance with methods', () => {
      const result = createCrossTabSync({
        channelName: 'test',
        onLogoutReceived: vi.fn(),
      });

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('broadcastLogout');
      expect(result).toHaveProperty('destroy');
      expect(typeof result?.broadcastLogout).toBe('function');
      expect(typeof result?.destroy).toBe('function');
    });

    it('should broadcast logout message', () => {
      const sync = createCrossTabSync({
        channelName: 'test',
        onLogoutReceived: vi.fn(),
      });

      sync?.broadcastLogout();

      expect(mockChannel.postMessage).toHaveBeenCalledWith({ type: 'LOGOUT' });
    });

    it('should close channel on destroy', () => {
      const sync = createCrossTabSync({
        channelName: 'test',
        onLogoutReceived: vi.fn(),
      });

      sync?.destroy();

      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should call onLogoutReceived when receiving LOGOUT message', () => {
      const onLogoutReceived = vi.fn();

      createCrossTabSync({
        channelName: 'test',
        onLogoutReceived,
      });

      // Simulate receiving a message
      const messageEvent = { data: { type: 'LOGOUT' } } as MessageEvent;
      mockChannel.onmessage?.(messageEvent);

      expect(onLogoutReceived).toHaveBeenCalled();
    });

    it('should not call onLogoutReceived for non-LOGOUT messages', () => {
      const onLogoutReceived = vi.fn();

      createCrossTabSync({
        channelName: 'test',
        onLogoutReceived,
      });

      // Simulate receiving a different message
      const messageEvent = { data: { type: 'OTHER' } } as MessageEvent;
      mockChannel.onmessage?.(messageEvent);

      expect(onLogoutReceived).not.toHaveBeenCalled();
    });

    it('should not call onLogoutReceived for null data', () => {
      const onLogoutReceived = vi.fn();

      createCrossTabSync({
        channelName: 'test',
        onLogoutReceived,
      });

      // Simulate receiving null data
      const messageEvent = { data: null } as MessageEvent;
      mockChannel.onmessage?.(messageEvent);

      expect(onLogoutReceived).not.toHaveBeenCalled();
    });

    it('should not call onLogoutReceived for undefined data', () => {
      const onLogoutReceived = vi.fn();

      createCrossTabSync({
        channelName: 'test',
        onLogoutReceived,
      });

      // Simulate receiving undefined data
      const messageEvent = { data: undefined } as MessageEvent;
      mockChannel.onmessage?.(messageEvent);

      expect(onLogoutReceived).not.toHaveBeenCalled();
    });
  });
});
