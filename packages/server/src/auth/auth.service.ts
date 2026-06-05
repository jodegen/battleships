import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';

import { UsersService } from '../users/users.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password';
import { SessionService } from './session.service';

export interface AuthResult {
  readonly user: User;
  readonly token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase().trim();
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('Diese E-Mail ist bereits vergeben.');
    }
    const passwordHash = await hashPassword(dto.password);
    let user: User;
    try {
      user = await this.users.createUser({ email, displayName: dto.displayName.trim(), passwordHash });
    } catch (error) {
      // Race: zwei parallele Registrierungen derselben E-Mail.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Diese E-Mail ist bereits vergeben.');
      }
      throw error;
    }
    const token = await this.sessions.issue(user.id);
    return { user, token };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.users.findByEmail(email);
    // FR-008: einheitlicher Fehler, unabhängig davon ob E-Mail existiert oder Passwort falsch ist.
    const ok = user ? await verifyPassword(user.passwordHash, dto.password) : false;
    if (!user || !ok) {
      throw new UnauthorizedException('Ungültige Zugangsdaten.');
    }
    const token = await this.sessions.issue(user.id);
    return { user, token };
  }
}
