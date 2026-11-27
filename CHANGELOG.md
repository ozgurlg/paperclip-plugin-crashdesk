# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-27

First release on npm.

### Added

- Sentry provider, read-only by default, for sentry.io, the EU region and self-hosted Sentry.
- Errors page: unresolved, new, without-a-task, in-progress and resolved numbers that filter the list, a project filter, and the last 24 hours, 7 days or 14 days. Works on a phone.
- Create task: turns an error into a Paperclip task with the exception, stack, release and device, in one click once an assignee is known.
- Triage with an agent: one task per tracker project that asks an agent to group the errors without a task by root cause and open fix tasks for the ones worth fixing.
- Routing: a default assignee, and optionally a Paperclip project and an assignee per Sentry project.
- Task linking by origin, so an error never becomes two open tasks, with the linked task's status next to each error.
- Resolve fixed errors in Sentry (opt-in setting): a finished task marks its error as resolved in the next release. Needs a token with `event:write`.
- Resolved view: the errors seen in the period that are now closed, each with the task that fixed it.
- Dashboard widget: totals with an hourly trend, one line per project with its task coverage, and the most frequent error.
- Agent tools `list-errors`, `get-error` and `create-error-task`.
- Test Configuration makes a real call to Sentry with the saved token, and says when resolving is on but the token is read-only.
- `npm run preview`: the UI with example data, without a running Paperclip.
