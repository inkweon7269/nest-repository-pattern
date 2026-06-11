import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class UpdateProfileRequestDto {
  @ApiProperty({
    description: '변경할 이름 (1~30자)',
    example: '홍길동',
    minLength: 1,
    maxLength: 30,
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 30)
  name!: string;
}
