---
name: start-worktree
description: 타입별 base 브랜치에서 git 워크트리를 생성하고, gitignore된 env·설정 복사와 pnpm install까지 자동화합니다. 병렬 작업용 새 워크트리를 시작할 때 사용.
argument-hint: '[브랜치명]'
---

# Start Worktree Skill

병렬 작업용 워크트리를 `.claude/worktrees/` 아래에 만들고, 이 레포에서 워크트리가 그냥은 동작하지 않는 함정(gitignore된 env 누락, node_modules 미공유)을 자동으로 해소한다.

## Workflow

1. **브랜치명 정규화** — 인자로 받은 이름을 정리한다.
   - `feature/`, `dev`, `hotfix/`, `docs/`, `refactor/` 등 접두사가 있으면 그대로 사용한다.
   - 접두사가 없으면 사용자에게 타입을 확인한다 (기본 `feature/<name>`).

2. **원격 동기화** — `git fetch origin --prune`.

3. **타입별 base 브랜치 결정** — `create-pr` 스킬의 머지 방향과 대칭으로 정한다.
   - `feature/*` → `origin/dev`
   - `dev` → `origin/main`
   - 그 외(`hotfix/*`·`docs/*`·`refactor/*` 등) → 사용자에게 확인 (기본 `origin/main`)

4. **워크트리 경로명 생성** — 브랜치명의 `/`를 `-`로 치환한다. 예: `feature/comments` → `feature-comments`. 경로는 `.claude/worktrees/<name>`.

5. **워크트리 + 브랜치 동시 생성** — 메인 체크아웃에서 실행한다.
   ```bash
   git worktree add -b <branch> .claude/worktrees/<name> <base>
   ```
   - 같은 이름의 브랜치/워크트리가 이미 있으면 중단하고 사용자에게 알린다.

6. **gitignore된 파일 복사** — 메인 체크아웃에 서 있는 상태에서, 새 워크트리로 복사한다. 이 파일들은 gitignore라 워크트리 체크아웃에 빠져 있어, 빠지면 부팅·마이그레이션·통합테스트가 전부 실패한다.
   ```bash
   cp .env.local .env.development .env.production .claude/worktrees/<name>/ 2>/dev/null || true
   cp .claude/settings.local.json .claude/worktrees/<name>/.claude/ 2>/dev/null || true
   ```
   - 존재하는 env 파일만 복사된다(없는 파일은 무시). `settings.local.json`은 권한 승인을 워크트리에서도 잇기 위해 복사한다.

7. **세션을 워크트리로 전환** — `EnterWorktree` 도구를 `path: .claude/worktrees/<name>`로 호출한다. (5번에서 이미 등록된 워크트리에 진입하는 방식)

8. **의존성 설치** — 워크트리는 node_modules를 공유하지 않으므로 워크트리 안에서 설치한다.
   ```bash
   pnpm install
   ```

9. **준비 완료 보고** — 브랜치명 / base 브랜치 / 워크트리 경로를 사용자에게 보고한다.

## 병렬 에이전트 팀에 적용할 때

이 스킬은 **단일 세션이 워크트리로 들어가는 용도**(`EnterWorktree`)다. 병렬 에이전트 팀을 워크트리로 돌릴 때는 **네이티브 `Agent(isolation:"worktree")`를 쓰지 않는다** — 워크트리 폴더가 `agent-<agentId>`(예: `agent-a61df464fc89b9855`)로 자동 명명되어 IDE 파일 트리에서 어떤 작업인지 식별할 수 없다.

대신 **리더가 작업마다 브랜치명 워크트리를 미리 만든 뒤**, 팀원을 그 폴더 경로에 배정한다(팀원은 isolation 없이 지정된 워크트리 안에서만 작업).

```bash
# 리더가 작업 수만큼 반복 — 폴더명 = 브랜치명의 / 를 - 로 치환
git worktree add -b <branch> .claude/worktrees/<name> origin/main
# 예: git worktree add -b docs/readme-compression .claude/worktrees/docs-readme-compression origin/main
```

- 폴더가 `docs-readme-compression`처럼 읽혀 식별이 쉽다.
- env 복사·`pnpm install`은 그 작업이 부팅/빌드/테스트를 요구할 때만 수행한다(docs-only면 생략).
- 정리는 작업별로 `/finish-worktree`를 사용한다.

## Notes

- 워크트리 폴더(`.claude/worktrees/`)는 `.gitignore`에 등록되어 있어 메인 체크아웃의 `git status`를 더럽히지 않는다.
- 정리는 작업 머지 후 `/finish-worktree`로 수행한다.
- 이 스킬이 만드는 `feature/*` 브랜치는 `origin/dev`에서 분기한다 — 머지 PR도 `feature/* → dev`로 올린다(`create-pr` 참고).
