/**
 * Configuration for cross-tab sync
 */
interface CrossTabSyncConfig {
  channelName: string;
  onLogoutReceived: () => void;
}

/**
 * Cross-tab sync instance
 */
export interface CrossTabSync {
  broadcastLogout: () => void;
  destroy: () => void;
}

/**
 * Auth message types for BroadcastChannel
 */
interface AuthMessage {
  type: 'LOGOUT';
}

/**
 * Create a cross-tab synchronization instance using BroadcastChannel
 * Returns null if BroadcastChannel is not available (e.g., in Node.js or old browsers)
 *
 * @param config - Configuration for cross-tab sync
 * @returns CrossTabSync instance or null
 */
export function createCrossTabSync(
  config: CrossTabSyncConfig
): CrossTabSync | null {
  // Check if BroadcastChannel is available
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  const { channelName, onLogoutReceived } = config;
  const channel = new BroadcastChannel(channelName);

  channel.onmessage = (event: MessageEvent<AuthMessage>) => {
    if (event.data?.type === 'LOGOUT') {
      onLogoutReceived();
    }
  };

  return {
    broadcastLogout: () => {
      channel.postMessage({ type: 'LOGOUT' } satisfies AuthMessage);
    },
    destroy: () => {
      channel.close();
    },
  };
}
