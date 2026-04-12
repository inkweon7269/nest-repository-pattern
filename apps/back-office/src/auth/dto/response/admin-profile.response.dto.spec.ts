import { AdminProfileResponseDto } from './admin-profile.response.dto';
import { Admin } from '@app/shared';
import { AdminRole } from '@app/shared';

describe('AdminProfileResponseDto', () => {
  const now = new Date();

  const createAdmin = (overrides: Partial<Admin> = {}): Admin => {
    const admin = new Admin();
    admin.id = 1;
    admin.email = 'admin@example.com';
    admin.password = 'hashed-password';
    admin.name = '관리자';
    admin.role = AdminRole.MANAGER;
    admin.hashedRefreshToken = 'hashed-token';
    admin.createdAt = now;
    admin.updatedAt = now;
    Object.assign(admin, overrides);
    return admin;
  };

  describe('of', () => {
    it('Admin 엔티티의 공개 필드를 DTO로 매핑한다', () => {
      const admin = createAdmin();

      const dto = AdminProfileResponseDto.of(admin);

      expect(dto.id).toBe(admin.id);
      expect(dto.email).toBe(admin.email);
      expect(dto.name).toBe(admin.name);
      expect(dto.role).toBe(admin.role);
      expect(dto.createdAt).toBe(admin.createdAt);
      expect(dto.updatedAt).toBe(admin.updatedAt);
    });

    it('AdminProfileResponseDto 인스턴스를 반환한다', () => {
      const admin = createAdmin();

      const dto = AdminProfileResponseDto.of(admin);

      expect(dto).toBeInstanceOf(AdminProfileResponseDto);
    });

    it('password를 포함하지 않는다', () => {
      const admin = createAdmin();

      const dto = AdminProfileResponseDto.of(admin);

      expect(dto).not.toHaveProperty('password');
    });

    it('hashedRefreshToken을 포함하지 않는다', () => {
      const admin = createAdmin();

      const dto = AdminProfileResponseDto.of(admin);

      expect(dto).not.toHaveProperty('hashedRefreshToken');
    });

    it('SUPER 등급을 올바르게 매핑한다', () => {
      const admin = createAdmin({ role: AdminRole.SUPER });

      const dto = AdminProfileResponseDto.of(admin);

      expect(dto.role).toBe(AdminRole.SUPER);
    });
  });
});
