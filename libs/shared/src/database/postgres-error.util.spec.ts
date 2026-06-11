import { QueryFailedError } from 'typeorm';
import { isUniqueViolation } from './postgres-error.util';

function createQueryFailedError(driverError: Error): QueryFailedError {
  return new QueryFailedError('INSERT INTO posts ...', [], driverError);
}

describe('isUniqueViolation', () => {
  it('driverError.code가 23505인 QueryFailedError이면 true를 반환한다', () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });

    expect(isUniqueViolation(createQueryFailedError(driverError))).toBe(true);
  });

  it('driverError.code가 다른 SQLSTATE(23503)이면 false를 반환한다', () => {
    const driverError = Object.assign(new Error('fk violation'), {
      code: '23503',
    });

    expect(isUniqueViolation(createQueryFailedError(driverError))).toBe(false);
  });

  it('driverError에 code가 없으면 false를 반환한다', () => {
    expect(
      isUniqueViolation(createQueryFailedError(new Error('no code'))),
    ).toBe(false);
  });

  it('QueryFailedError가 아닌 일반 Error이면 false를 반환한다', () => {
    const error = Object.assign(new Error('plain'), { code: '23505' });

    expect(isUniqueViolation(error)).toBe(false);
  });

  it('null, undefined, 문자열 입력이면 false를 반환한다', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
