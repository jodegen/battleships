import { Injectable } from '@nestjs/common';
import type { Stat, User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserInput {
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Legt Nutzer + zugehörige (Null-)Statistik in einer Transaktion an. */
  createUser(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        stat: { create: {} },
      },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  }

  getStat(userId: string): Promise<Stat | null> {
    return this.prisma.stat.findUnique({ where: { userId } });
  }
}
