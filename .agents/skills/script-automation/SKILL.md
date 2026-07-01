# script-automation

## When to use
- Use this skill when a project task has been repeated 3-4 times.
- Use this skill when a manual workflow can be expressed as deterministic steps with inputs, outputs, validation, and readable errors.
- Use this skill before spending agent time on repeatable checks, reports, migrations, or generated artifacts.

## Required context
- Read `AGENTS.md`.
- Check `.agents/knowledge_tree.md` for existing scripts before writing a new one.
- Choose the owner folder: `scripts/`, `backend/scripts/`, `frontend/scripts/`, or `.agents/scripts/`.

## Script requirements
1. Give the script one clear purpose.
2. Prefer safe defaults and explicit destructive flags.
3. Print human-readable progress and failure messages.
4. Validate inputs before changing files.
5. Support a dry-run/report mode when practical.
6. Keep the script deterministic; avoid hidden network or environment assumptions.
7. Test the script with the smallest focused dry-run or automated test that proves it works.

## Agent workflow
1. Look for an existing script that owns the task.
2. If none exists and the task is repeated or deterministic, create one before repeating the manual work again.
3. Run the script.
4. Verify the output through tests, dry-run output, or a focused fixture.
5. Document the script in `.agents/knowledge_tree.md`.

## Done criteria
- Future agents can find and run the script without rediscovering the workflow.
- The script handles bad input clearly.
- The script has been run successfully in the current task or has a focused test.
