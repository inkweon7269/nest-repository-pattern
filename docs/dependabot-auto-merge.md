# Dependabot PR 자동 머지 및 그룹화 설정

## Context

Dependabot이 개별 패키지마다 별도 PR을 생성하고, 모든 npm PR이 lock 파일을 수정하므로 하나를 머지할 때마다 나머지가 충돌합니다. 매번 수동으로 rebase 요청 → CI 대기 → 머지를 반복해야 하는 비효율을 해결합니다.

## 변경 사항

### 1. `dependabot.yml` - catch-all 그룹 추가

**파일:** `.github/dependabot.yml`

- npm 섹션에 `other` 그룹 추가: `patterns: ["*"]`로 기존 그룹에 속하지 않는 모든 패키지를 하나의 PR로 묶음
- GitHub Actions 섹션에도 `all-actions` 그룹 추가: 모든 actions를 하나의 PR로 묶음

### 2. 리포지토리 설정 변경 (사전 조건)

자동 머지가 작동하려면 두 가지 설정이 필요합니다:

- **Auto-merge 활성화**: `gh api` 명령으로 리포지토리의 `allow_auto_merge` 옵션을 켬
- **Branch protection 추가**: `main` 브랜치에 required status checks 설정 (Lint & Build, Unit Tests, Integration Tests, Security Audit). 이것이 있어야 auto-merge가 CI 통과를 기다린 후 머지함

### 3. `dependabot-auto-merge.yml` - 자동 머지 워크플로우 생성

**파일:** `.github/workflows/dependabot-auto-merge.yml`

- `pull_request_target` 이벤트로 트리거 (Dependabot PR에 필요)
- `github.actor == 'dependabot[bot]'` 조건으로 Dependabot PR만 대상
- `gh pr review --approve`로 자동 승인
- `gh pr merge --auto --squash`로 auto-merge 활성화 (CI 통과 시 자동 머지)
- `GITHUB_TOKEN` 사용 (별도 PAT 불필요)

## 기대 효과

- **Before**: npm PR 10개 → 하나씩 머지할 때마다 수동 rebase 필요 (10회 반복)
- **After**: npm PR 최대 5개 (nestjs, typeorm, testing, eslint, other) → CI 통과 시 자동 순차 머지

## 검증

1. 현재 남은 PR(#8~#12)에 대해 자동 머지가 적용되는지 확인
2. 다음 주 Dependabot 스케줄(월요일)에 PR 그룹화가 정상 동작하는지 확인
