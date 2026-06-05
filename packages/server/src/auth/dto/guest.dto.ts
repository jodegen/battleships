import { IsDisplayName } from '../display-name';

export class GuestDto {
  @IsDisplayName()
  displayName!: string;
}
