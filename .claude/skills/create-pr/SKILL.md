# Create PR Skill
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
