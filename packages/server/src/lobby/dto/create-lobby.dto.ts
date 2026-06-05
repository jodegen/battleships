import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, ValidateNested } from 'class-validator';

import type { TurnTimerSeconds } from '../../realtime/events';

export class LobbySettingsDto {
  @IsBoolean()
  allowTouching!: boolean;

  // 15/30/60 Sekunden oder null („aus"); IsOptional lässt null/undefined zu (FR-005).
  @IsOptional()
  @IsIn([15, 30, 60])
  turnTimerSeconds!: TurnTimerSeconds;

  @IsBoolean()
  extraTurnOnHit!: boolean;
}

export class CreateLobbyDto {
  @ValidateNested()
  @Type(() => LobbySettingsDto)
  settings!: LobbySettingsDto;
}
