# Biome tooling policy

Biome 2.5.15 is the sole owned linter and formatter. Install with the pinned
Node 24 / pnpm 10.23.0 workspace commands. The binary is a root dev dependency;
workspace scripts resolve it through pnpm's root binary path.

- `pnpm lint` checks the owned source scopes in `biome.json`, without writing.
- `pnpm --filter <workspace> lint` checks that workspace within the same scopes.
- `pnpm format:check -- <path>` checks formatting of an explicitly selected path.
- `pnpm format -- <path>` formats an explicitly selected path. Without a path,
  these two commands operate on all configured owned scopes.

Formatting is opt-in and is not an added CI gate. Existing source has mixed
formatting; this migration does not rewrite it or claim the entire repository
already passes a formatting check. CI continues to run lint and TypeScript,
with unchanged build order and browser acceptance.

## Scope and migration basis

The includes list is the union of the previous workspace lint paths and root
`tooling`. Fixture directories, vendor directories, generated Worker declarations,
build outputs and dependencies are excluded from lint and formatting. Legacy
root applications, submodules and upstream generated runtimes are not included.
CSS, JSON and HTML linting are not newly introduced; owned files in those
languages can still be explicitly formatted within the includes list.

The previous Oxlint 1.81.0 effective configuration enabled 111 rule names in
new workspaces; the portal additionally configured React Hooks and component
exports. Biome's own ESLint migration mapping (including inspired rules) mapped
67 of those names. The explicit configuration enables 68 Biome rules after
removing one broader mapping and adding Hooks/component-export checks.
`recommended: false` selects this explicit compatibility ruleset rather than
introducing Biome's different recommended policy. Errors and warnings fail lint.
This is not a claim of complete rule-for-rule equivalence.

The initial recommended-preset audit reported 497 errors, 2328 warnings and
739 informational diagnostics across 502 files. Those include new accessibility,
non-null-assertion, coercion, callback-return and effect-dependency policies.
They are not silently fixed during a tooling migration: changing legacy
comparisons, numerical constants, React lifetimes or deliberate negative type
contracts requires separate behavior-focused review. The compatibility pass
checks 463 JS/TS files after matching the old language scope.

## Deliberate mapping differences

`no-empty-static-block` mapped to Biome `noEmptyBlockStatements`, which also
rejects intentionally empty callbacks, test doubles and catch blocks. That
broader rule is omitted instead of editing 227 existing occurrences. Static
empty blocks therefore have no equivalent dedicated Biome gate in this policy.

The following overrides name exact existing files in `biome.json`; they do not
turn off linting for those files or apply to all future files:

- `noPrecisionLoss`: MAGFit quaternion constants retain authoritative upstream
  decimal spellings and the same JavaScript rounding.
- `noAssignInExpressions`: existing regex iteration, memoization and browser
  mock setup use explicit assignments permitted by the old conditional rule.
- `useArraySortCompare`: identified calls sort string keys lexicographically.
- `noShadowRestrictedNames`: local `escape` and `constructor` names are flagged
  by Biome's broader global-name list.
- `noForIn`: the existing AnalyticTune loop enumerates a settings record;
  replacing it could change inherited-property behavior.
- `noUselessEmptyExport`: a MAVLink declaration retains its explicit module marker.
- `useComponentExportOnlyModules`: existing mixed hook/component public APIs and
  browser test harnesses retain their exports. Other components, including the
  portal, retain this rule with `allowConstantExport: true`.

Hooks must remain at the top level. The configuration retains checks for invalid
super calls, unreachable code, unsafe optional chaining/finally, invalid loop
direction, duplicate members/keys/cases, assignment to constants/imports/globals,
unused variables, async Promise executors, sparse arrays and other mapped defects.

## Rules without an automatic Biome mapping

These prior rule names were not mapped by Biome 2.5.15's migration tool. Some
are type-aware rules that the prior CLI did not activate with `--type-aware`;
TypeScript checks remain mandatory. Absence from this list is not proof of
identical analysis or diagnostics between tools. No second linter is retained.

`no-caller`, `no-delete-var`, `no-invalid-regexp`, `no-iterator`, `oxc/bad-array-method-on-arguments`, `oxc/bad-char-at-comparison`, `oxc/bad-comparison-sequence`, `oxc/bad-match-all-arg`, `oxc/bad-min-max-func`, `oxc/bad-object-literal-comparison`, `oxc/bad-replace-all-arg`, `oxc/const-comparisons`, `oxc/double-comparisons`, `oxc/erasing-op`, `oxc/missing-throw`, `oxc/number-arg-out-of-range`, `oxc/only-used-in-recursion`, `oxc/uninvoked-array-callback`, `typescript/await-thenable`, `typescript/no-array-delete`, `typescript/no-base-to-string`, `typescript/no-duplicate-type-constituents`, `typescript/no-floating-promises`, `typescript/no-implied-eval`, `typescript/no-meaningless-void-operator`, `typescript/no-misused-spread`, `typescript/no-redundant-type-constituents`, `typescript/no-unnecessary-parameter-property-assignment`, `typescript/no-unsafe-unary-minus`, `typescript/no-useless-default-assignment`, `typescript/restrict-template-expressions`, `typescript/triple-slash-reference`, `typescript/unbound-method`, `unicorn/no-await-in-promise-methods`, `unicorn/no-invalid-fetch-options`, `unicorn/no-invalid-remove-event-listener`, `unicorn/no-new-array`, `unicorn/no-single-promise-in-promise-methods`, `unicorn/no-unnecessary-await`, `unicorn/no-useless-fallback-in-spread`, `unicorn/no-useless-length-check`, `unicorn/no-useless-spread`, `unicorn/prefer-set-size`, `unicorn/prefer-string-starts-ends-with`.
