import type { ProposalStatusItem, ProposalStatusResponse } from "./proposals-status-api";

export const PROPOSAL_STATUS_POLL_MS = 30_000;

export type ProposalStatusPoller = {
  start: () => void;
  stop: () => void;
  refresh: () => void;
  setShouldPoll: (fn: () => boolean) => void;
};

export function createProposalStatusPoller(options: {
  fetch: () => Promise<ProposalStatusResponse>;
  onData: (data: { items: ProposalStatusItem[]; partial: boolean }) => void;
  onError?: () => void;
  shouldPoll: () => boolean;
  intervalMs?: number;
  now?: () => number;
}): ProposalStatusPoller {
  const intervalMs = options.intervalMs ?? PROPOSAL_STATUS_POLL_MS;
  const now = options.now ?? (() => Date.now());
  let shouldPoll = options.shouldPoll;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  async function runOnce() {
    if (!shouldPoll() || inFlight) return;
    inFlight = true;
    try {
      const data = await options.fetch();
      options.onData({ items: data.items, partial: data.partial });
    } catch {
      options.onError?.();
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (timer != null) return;
    void runOnce();
    timer = setInterval(() => void runOnce(), intervalMs);
  }

  function stop() {
    if (timer != null) clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
    refresh: () => void runOnce(),
    setShouldPoll(fn) {
      shouldPoll = fn;
    },
  };
}

export function lobbyPollActive(input: {
  visible: boolean;
  prototypeOpen: boolean;
  lobbyMounted: boolean;
}): boolean {
  return input.visible && input.lobbyMounted && !input.prototypeOpen;
}