import type { HostMessage } from '../../src/net/protocol';
import { SnapshotAssembler } from '../../src/net/snapshot';
import type { SessionSnapshot } from '../../src/simulation/host/hostRouter';

/**
 * Minimal snapshot loading for raw-protocol test guests: collects the chunks of the latest snapshot and returns the
 * session snapshot once it is complete and verified. The full catch-up pipeline is `GuestSession`.
 */
export class SnapshotCatcher {
  #assembler: SnapshotAssembler | undefined;

  /** Feeds a host message; returns the loaded snapshot when this message completed one. */
  feed(message: HostMessage): SessionSnapshot | undefined {
    if (message.type === 'snapshot-begin') {
      this.#assembler = new SnapshotAssembler(message, 0, Number.MAX_SAFE_INTEGER);
      return undefined;
    }
    if (message.type !== 'snapshot-chunk' || !this.#assembler) return undefined;
    if (this.#assembler.add(message.snapshot, message.index, message.data) !== 'accepted') return undefined;
    const result = this.#assembler.complete(0);
    if (!result.ok) return undefined;
    this.#assembler = undefined;
    return result.state as SessionSnapshot;
  }
}
