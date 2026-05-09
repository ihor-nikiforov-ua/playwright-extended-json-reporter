# Issue tracker: GitHub

Issues for this repo live in GitHub Issues for `ihor-nikiforov-ua/playwright-runboard-reporter`. Use the `gh` CLI for issue operations. The canonical in-repo data-contract PRD lives at `docs/prd/runboard-reporter-data-contract.md`; GitHub Issues track implementation work and may link or mirror planning content.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue: `gh issue view <number> --comments`
- List issues: `gh issue list --state open --json number,title,body,labels,comments`
- Comment on an issue: `gh issue comment <number> --body "..."`
- Apply / remove labels: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; after the GitHub repository rename, `gh` does this automatically inside the clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
