import { ApiProperty } from '@nestjs/swagger';
import { Admin } from '@src/admin/entities/admin.entity';
import { AdminRole } from '@src/admin/enum/admin-role.enum';

export class AdminProfileResponseDto {
  @ApiProperty({ description: '관리자 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '이메일', example: 'admin@example.com' })
  email: string;

  @ApiProperty({ description: '이름', example: '관리자' })
  name: string;

  @ApiProperty({
    description: '등급',
    enum: AdminRole,
    example: AdminRole.MANAGER,
  })
  role: AdminRole;

  @ApiProperty({ description: '생성일시' })
  createdAt: Date;

  @ApiProperty({ description: '수정일시' })
  updatedAt: Date;

  static of(admin: Admin): AdminProfileResponseDto {
    const dto = new AdminProfileResponseDto();
    dto.id = admin.id;
    dto.email = admin.email;
    dto.name = admin.name;
    dto.role = admin.role;
    dto.createdAt = admin.createdAt;
    dto.updatedAt = admin.updatedAt;
    return dto;
  }
}
