# Commit Skill
1. Run `pnpm build:local`, `pnpm test`, and `pnpm format --check` to verify no regressions
2. Check changed files with `git status` and stage only relevant files (avoid `git add .`)
3. Generate a conventional commit message in Korean based on the diff
4. Before pushing, verify the current branch is NOT a protected branch (main/master). If it is, warn the user and abort the push
5. Commit and push to the current branch
6. Do NOT re-analyze or re-plan changes — just commit
