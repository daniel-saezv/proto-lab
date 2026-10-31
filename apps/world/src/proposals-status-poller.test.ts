import { describe, expect, it, vi } from "vitest";
import { createProposalStatusPoller, lobbyPollActive, PROPOSAL_STATUS_POLL_MS } from "./proposals-status-poller";

describe("proposals-status-poller", () => {
  it("lobbyPollActive exige lobby visible y sin prototipo", () => {
    expect(lobbyPollActive({ visible: true, prototypeOpen: false, lobbyMounted: true })).toBe(true);
    expect(lobbyPollActive({ visible: false, prototypeOpen: false, lobbyMounted: true })).toBe(false);
    expect(lobbyPollActive({ visible: true, prototypeOpen: true, lobbyMounted: true })).toBe(false);
  });

  it("no hace fetch cuando shouldPoll es falso", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    const onData = vi.fn();
    const poller = createProposalStatusPoller({
      fetch,
      onData,
      shouldPoll: () => false,
      intervalMs: PROPOSAL_STATUS_POLL_MS,
    });
    poller.start();
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    poller.stop();
    vi.useRealTimers();
  });

  it("hace fetch al arrancar cuando shouldPoll es verdadero", async () => {
    const fetch = vi.fn(async () => ({ ok: true as const, partial: false, items: [] }));
    const onData = vi.fn();
    const poller = createProposalStatusPoller({
      fetch,
      onData,
      shouldPoll: () => true,
      intervalMs: 60_000,
    });
    poller.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledWith({ items: [], partial: false });
    poller.stop();
  });
});
