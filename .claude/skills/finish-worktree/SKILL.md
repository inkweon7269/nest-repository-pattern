---
name: finish-worktree
description: PR 머지를 확인한 뒤 워크트리와 로컬 작업 브랜치를 정리하고 base 브랜치를 갱신합니다. 워크트리에서 작업한 PR이 머지된 후 사용.
argument-hint: '[브랜치명]'
---

# Finish Worktree Skill

워크트리 작업이 GitHub에 머지된 뒤, 워크트리·로컬 브랜치를 안전하게 제거하고 base 브랜치를 최신화한다.

> **전제: 메인 체크아웃에서 실행한다.** 제거 대상 워크트리 안에 서 있으면 워크트리를 지울 수 없다.

## Workflow

1. **대상 식별** — `git worktree list`로 정리할 워크트리와 그 브랜치를 확인한다. 인자로 브랜치명을 받았으면 그것을, 없으면 사용자에게 대상을 확인한다.

2. **PR 머지 확정 검증** — 머지되지 않은 작업을 지워 유실하지 않도록 반드시 먼저 확인한다.
   ```bash
   gh pr view <branch> --json state,mergedAt,baseRefName
   ```
   - `state`가 `MERGED`가 아니면 **중단**하고 사용자에게 알린다.
   - `baseRefName`(머지된 대상 브랜치, 보통 `dev` 또는 `main`)을 4번에서 사용한다.

3. **세션이 워크트리 안이면 메인 복귀** — 현재 세션 작업 디렉터리가 제거 대상 워크트리이면 `ExitWorktree`(`action: keep`)로 메인 체크아웃으로 돌아온 뒤 진행한다.

4. **base 브랜치 갱신** — 2번에서 얻은 `baseRefName`으로 전환해 최신화한다.
   ```bash
   git checkout <baseRefName>
   git fetch origin --prune
   git pull --ff-only
   ```

5. **워크트리 제거** — 워크트리 경로명은 브랜치명의 `/`를 `-`로 치환한 값이다(예: `feature/comments` → `feature-comments`).
   ```bash
   git worktree remove .claude/worktrees/<name>
   ```
   - uncommitted 변경이 있으면 git이 거부한다. 그 변경을 **정말 버려도 되는지 사용자에게 확인**한 뒤에만 `--force`를 붙인다.

6. **로컬 브랜치 삭제** — 2번에서 `MERGED`를 확정했으므로 강제 삭제한다.
   ```bash
   git branch -D <branch>
   ```
   - `feature/* → dev`는 squash-merge라 로컬 브랜치가 git상 "미머지"로 남아 `-d`는 거부된다. `-D`가 정상 경로다.

7. **메타데이터 정리** — `git worktree prune`.

8. **결과 보고** — 제거한 워크트리/브랜치, 갱신한 base 브랜치를 사용자에게 보고한다.

## Notes

- 생성은 `/start-worktree`로 수행한다.
- 2번 검증 없이 5·6번을 실행하지 않는다 — 머지 안 된 작업의 영구 유실을 막는 핵심 안전장치다.
