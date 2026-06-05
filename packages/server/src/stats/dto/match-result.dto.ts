import { IsIn, IsUUID } from 'class-validator';

export type ReportedOutcome = 'win' | 'loss';

export class MatchResultDto {
  // Client-erzeugte, partie-stabile Kennung (FR-019): gleiche Partie → gleiche resultId.
  @IsUUID()
  resultId!: string;

  // Kein Unentschieden in „Schiffe versenken".
  @IsIn(['win', 'loss'])
  outcome!: ReportedOutcome;
}
