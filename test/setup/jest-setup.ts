import { initializeTransactionalContext } from 'typeorm-transactional';

// `@Transactional()`이 적용된 핸들러는 단위/통합 테스트 어디서든 컨텍스트가
// 초기화되어 있어야 한다. setupFiles로 모든 테스트 파일 import 전에 1회 실행.
initializeTransactionalContext();
