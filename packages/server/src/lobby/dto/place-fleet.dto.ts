import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, Min, ValidateNested } from 'class-validator';

class CoordDto {
  @IsInt()
  @Min(0)
  x!: number;

  @IsInt()
  @Min(0)
  y!: number;
}

class ShipPlacementDto {
  @IsInt()
  @Min(1)
  length!: number;

  @ValidateNested()
  @Type(() => CoordDto)
  origin!: CoordDto;

  @IsIn(['horizontal', 'vertical'])
  orientation!: 'horizontal' | 'vertical';
}

export class PlaceFleetDto {
  @IsString()
  code!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ShipPlacementDto)
  placements!: ShipPlacementDto[];
}
