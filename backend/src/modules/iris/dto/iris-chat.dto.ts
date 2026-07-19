import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class IrisChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
