# ADR-0021: Schema migration uses declared columns as the single source of truth and adds missing columns, with no version number

- Status: Accepted (2026-08-22)

## Context

Adding the first new column to the messages table (transfer duration) showed that the project has no migration mechanism: `migrate()` holds one `CREATE TABLE IF NOT EXISTS`, and no `ALTER TABLE` ever appears in the history. A new column put into the create statement works for new installs, but `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table, so for an existing user the first write fails with `table messages has no column named ...` and a file send fails right after the upgrade. That path is walked only with an old database and new code, which a fresh development database or a fresh test database never reaches.

## Options

1. **Declare the columns once and add the missing ones at every start: the create statement and the column check both derive from `MESSAGE_COLUMNS`, and a start-up pass compares `pragma_table_info` against it and runs `ALTER TABLE ADD COLUMN` for each column that is missing**
2. A version number plus a list of migration scripts, the classic way — rejected: it is the most expressive and covers type changes and table splits, but it keeps two books for one fact, since whether a column exists is itself queryable, and when the version number and the database disagree (a hand-edited database, a half-failed migration) nothing says which wins.
3. Add the column to the create statement and ignore old databases — rejected: it is the way that fails for existing users, as described in the Context.

## Decision

We choose **option 1**: `MESSAGE_COLUMNS` is the single source of truth, the create statement and the add-column logic both derive from it, and a column is added by editing that one place. The check runs at every start and is idempotent, skipping columns already there. No version number is kept, since whether a column exists can be queried directly.

Two hard constraints go with it:

- A new column is nullable: no NOT NULL and no default. SQLite rejects adding a NOT NULL column without a default to a database that has data, and a user who installs a newer version, writes to the database and downgrades would have the older version's INSERT omit the new column, which a non-nullable column would reject.
- When a schema changes, the create statement as it was before the change is appended as a snapshot to the migration test, which walks the upgrade from each historical version.

## Consequences

- Positive: Upgrades are invisible to users and need no action, forgetting to add a column is structurally impossible, and the migration path has an automated gate where it had never run once.
- Neutral: The database carries no version number, so whether it is up to date is read from its columns rather than from a stored value.
- Negative: Only adding columns is expressible: changing a type or a constraint, dropping a column or splitting a table is outside this mechanism, and doing one needs another approach, at which point adding a version number should be reconsidered too.
- Negative: SQLite does not enforce "a new column must be nullable" for you: it rejects a NOT NULL column without a default only on a table that has data, so the mistake does not show in development (fresh database) and breaks only for upgrading users. The constraint is held by people and by the migration test's downgrade case.
- Negative: Historical snapshots must be remembered, and a missing one raises no error and only removes coverage of upgrades from that version. The reminder in the test file's header still depends on being read.

## Sources

- Measured probes: `docs/.workings/transfer-speed/` (a process record, not a basis for the current state). `git log -S` finds no `ALTER TABLE` anywhere in the history.
- The declaration and the add-column logic are in `src/main/db/messages.ts`, the historical snapshots and the gate in `messages.migrate.test.ts`, and the constraints that bind code changes in the Invariants section of `AGENTS.md`.
