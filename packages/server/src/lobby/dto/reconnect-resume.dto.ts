import { IsString, MaxLength, MinLength } from 'class-validator';

/** Intent `reconnect:resume` (005): Wiedereintritt in eine laufende Partie per Per-Seat-Token. */
export class ReconnectResumeDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  token!: string;
}
