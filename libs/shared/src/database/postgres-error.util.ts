import { QueryFailedError } from 'typeorm';

/**
 * PostgreSQL unique_violation (SQLSTATE 23505) 여부를 판별하는 타입가드.
 *
 * Repository write 직후 catch 블록에서 동시성 race로 발생한 unique 제약 위반을
 * `ConflictException`으로 변환할 때 일관되게 사용한다. `driverError`의 unsafe
 * 캐스팅을 이 한 곳으로 모아, 호출 지점에서는 메시지/제어 흐름만 책임지게 한다.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string })?.code === '23505'
  );
}
