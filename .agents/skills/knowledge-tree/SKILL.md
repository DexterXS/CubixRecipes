# knowledge-tree

## When to use
- Use this skill at the start of every CubixRecipes coding or analysis task.
- Use it after any change that affects architecture, module ownership, API contracts, runtime data files, or feature-to-file mappings.

## Source
- Primary file: `.agents/knowledge_tree.md`.

## Steps before a task
1. Read `.agents/knowledge_tree.md` first.
2. Find the relevant feature branch or module node.
3. Identify the smallest set of files needed for the task.
4. Open only those files unless the tree is clearly stale for the touched area.
5. If stale, inspect only the affected files and update the tree.

## Steps after a change
1. Update affected nodes in `.agents/knowledge_tree.md`.
2. Update dependency links if imports, APIs, data files, classes, services, or frontend calls changed.
3. Add a new branch for new functionality.
4. Remove or rewrite obsolete branches when functionality is removed or materially changed.

## Full rebuild rule
- Do not rebuild the whole tree unless the user explicitly says: "Перестрой дерево знаний полностью".

## Done criteria
- The tree points future agents to the correct files without requiring a repository-wide scan.
- The tree contains no copied implementation code.
- The tree reflects the changed feature, API, data, and dependency relationships.
