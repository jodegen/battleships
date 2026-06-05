import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';

/**
 * ioredis-Lebenszyklus (M3/004). Hält den Haupt-Client für Live-State und liefert
 * duplizierte Clients für den Socket.IO-Redis-Adapter (Pub/Sub-Backplane, research.md §2).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly dupes: Redis[] = [];

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    // ioredis reconnektet selbst; transiente Verbindungsfehler (z. B. EPIPE beim Shutdown)
    // dürfen nicht als „unhandled error event" den Prozess stören.
    this.client.on('error', () => undefined);
  }

  /** Eigenständiger Client (für Adapter-Pub/Sub oder Tests); wird mit-aufgeräumt. */
  duplicate(): Redis {
    const dupe = this.client.duplicate();
    // „Connection is closed"-Rauschen beim Shutdown unterdrücken.
    dupe.on('error', () => undefined);
    this.dupes.push(dupe);
    return dupe;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.dupes, this.client].map((c) => c.quit().catch(() => undefined)));
  }
}
