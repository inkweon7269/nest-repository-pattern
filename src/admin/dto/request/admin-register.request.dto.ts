import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AdminRole } from '@src/admin/enum/admin-role.enum';

export class AdminRegisterRequestDto {
  @ApiProperty({ description: '이메일', example: 'admin@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: '비밀번호 (최소 8자)', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: '이름', example: '관리자' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: '관리자 등급',
    enum: AdminRole,
    default: AdminRole.MANAGER,
  })
  @IsEnum(AdminRole)
  @IsOptional()
  role?: AdminRole;
}
