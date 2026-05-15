# Create PR Skill

## Workflow

1. 현재 브랜치명을 확인한다 (`git branch --show-current`)
   - 현재 브랜치가 `main` 또는 `master`이면 중단하고, 작업 브랜치로 전환 후 다시 진행한다
2. PR 대상 브랜치를 결정한다:
   - `feature/*` 브랜치 → `dev` (Squash and merge)
   - `dev` 브랜치 → `main` (Create a merge commit)
   - 그 외 → 사용자에게 대상 브랜치를 확인한다
3. 원격에 푸시되지 않은 커밋이 있으면 `git push -u origin <branch>` 실행
4. `gh pr create --base <target>` 으로 PR을 생성한다
   - 제목: 70자 이내로 변경 내용을 요약
   - 본문에 머지 전략 안내를 포함:
     - `dev` 대상: `> **Merge Strategy**: Squash and merge를 사용해주세요.`
     - `main` 대상: `> **Merge Strategy**: Create a merge commit을 사용해주세요.`
5. 생성된 PR URL을 사용자에게 반환한다

## PR 제목·본문 한국어 가이드

PR 제목과 본문은 commit skill의 [한국어 커밋 메시지 작성 가이드](../commit/SKILL.md#한국어-커밋-메시지-작성-가이드)를 그대로 따른다. 특히 다음 세 가지는 PR에서 자주 깨지므로 push 전에 점검한다.

- **§1 영어 직역체 금지** — "본 PR", "본 변경" 같은 한자어 직역체 대신 "이 PR", "이 변경" 사용. "방어 깊이 추가", "~을 잇는다", "발사한다" 등의 직역도 피한다.
- **§4 형식 일관성** — Summary/Test plan/Notes 섹션 안에서 종결어미("~한다"/"~함"/"~하기")를 섞지 않는다. 권장은 "~한다".
- **§6 자가 점검** — 사동형("우회시켜" → "우회하여"), 구어 비속어("박다" → "지정하다"), 영어 동사 직역("때린다" → "호출한다")이 남아 있는지 push 전에 훑는다.

PR 본문은 대체로 커밋 메시지보다 길기 때문에 [§3 정보 밀도](../commit/SKILL.md#3-한-문장에-정보-밀도를-과하게-싣지-않는다) 규칙(한 문장 신규 개념 5개 이내)을 더 엄격하게 적용한다.
