import { ProfileResponseDto } from '@src/auth/dto/response/profile.response.dto';
import { User } from '@src/auth/entities/user.entity';

describe('ProfileResponseDto', () => {
  const now = new Date();

  const createUser = (overrides: Partial<User> = {}): User => {
    const user = new User();
    user.id = 1;
    user.email = 'test@example.com';
    user.password = 'hashed-password';
    user.name = '테스트유저';
    user.hashedRefreshToken = 'hashed-token';
    user.createdAt = now;
    user.updatedAt = now;
    Object.assign(user, overrides);
    return user;
  };

  describe('of', () => {
    it('User 엔티티의 공개 필드를 DTO로 매핑한다', () => {
      const user = createUser();

      const dto = ProfileResponseDto.of(user);

      expect(dto.id).toBe(user.id);
      expect(dto.email).toBe(user.email);
      expect(dto.name).toBe(user.name);
      expect(dto.createdAt).toBe(user.createdAt);
      expect(dto.updatedAt).toBe(user.updatedAt);
    });

    it('ProfileResponseDto 인스턴스를 반환한다', () => {
      const user = createUser();

      const dto = ProfileResponseDto.of(user);

      expect(dto).toBeInstanceOf(ProfileResponseDto);
    });

    it('password를 포함하지 않는다', () => {
      const user = createUser();

      const dto = ProfileResponseDto.of(user);

      expect(dto).not.toHaveProperty('password');
    });

    it('hashedRefreshToken을 포함하지 않는다', () => {
      const user = createUser();

      const dto = ProfileResponseDto.of(user);

      expect(dto).not.toHaveProperty('hashedRefreshToken');
    });
  });
});
