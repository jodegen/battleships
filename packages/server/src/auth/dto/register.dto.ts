import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { IsDisplayName } from '../display-name';

export class RegisterDto {
  @IsEmail()
  email!: string;

  // FR-023: Mindestlänge 8, keine Zeichenklassen-Komposition; Obergrenze gegen DoS.
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsDisplayName()
  displayName!: string;
}
