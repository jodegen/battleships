import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { ServerOptions, Server as SocketServer } from 'socket.io';

/**
 * Socket.IO-Adapter mit Redis-Pub/Sub-Backplane (research.md §2). Broadcasts in einen
 * Lobby-Raum werden dadurch instanzübergreifend zustellbar (mehr-Instanz-fähig).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext, pub: Redis, sub: Redis) {
    super(app);
    this.adapterConstructor = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions): SocketServer {
    const server = super.createIOServer(port, options) as SocketServer;
    server.adapter(this.adapterConstructor);
    return server;
  }
}
