/**
 * bcrypt 해시 강도(cost factor). 비밀번호와 refresh token digest 해싱에
 * 공통 적용한다. 값 변경은 env가 아닌 코드 리뷰를 거친 상수 수정으로만 한다 —
 * 잘못된 env 값으로 보안 강도가 조용히 낮아지는 사고를 막기 위함.
 */
export const BCRYPT_SALT_ROUNDS = 10;
