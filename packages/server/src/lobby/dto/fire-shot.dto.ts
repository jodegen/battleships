import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

class TargetDto {
  @IsInt()
  @Min(0)
  x!: number;

  @IsInt()
  @Min(0)
  y!: number;
}

export class FireShotDto {
  @IsString()
  code!: string;

  @IsString()
  @MaxLength(64)
  moveId!: string;

  @ValidateNested()
  @Type(() => TargetDto)
  target!: TargetDto;
}
