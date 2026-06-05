import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class JoinLobbyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  code!: string;

  // Optionaler Gast-Anzeigename (nur nötig, wenn die Verbindung noch keine Gast-Identität hat).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestName?: string;
}
