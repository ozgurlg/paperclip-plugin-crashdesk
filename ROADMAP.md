# Roadmap

Crashdesk grows in small, working steps. Each version is usable on its own.

## v0.1: errors in, tasks out (current)

- Sentry provider, read-only by default (`event:read`). sentry.io, the EU region and self-hosted Sentry.
- **Resolve fixed errors** (opt-in, needs `event:write`): a finished task marks its error as resolved in the next release, so it leaves the list and comes back as a regression if the fix did not hold.
- Background sync of the most frequent unresolved errors, cached per time range (24h, 7d, 14d).
- Errors page: unresolved, new, without-a-task, in-progress and resolved counts that filter the list, and the errors with trend lines. Filter by project. Works on a phone.
- **Triage with an agent**: one click hands the errors without a task to an agent, which groups them by root cause and opens the fix tasks.
- Dashboard widget: totals with an hourly trend, one line per project with its task coverage, the most frequent error and a link to the errors page.
- **Routing** (on the errors page): a default assignee gets every error task; optionally each Sentry project, shown with its platform, maps to a Paperclip project and the agent who fixes that code. Create task is then one click.
- **Create task**: turns an error into a Paperclip task with the error, the innermost stack frames, release and device, and a link back to Sentry. Pick the assignee, project and priority with Paperclip's own pickers.
- Tasks are linked by origin, so an error is never turned into two open tasks, and the table shows each task's status.
- Agent tools: `list-errors`, `get-error` and `create-error-task`.
- Error text reaches agents only inside a labelled, sanitized untrusted-data block.

## v0.2: projects and automation

- **Settings page with pick lists** instead of typing: choose which Sentry projects and environment to show, from lists loaded from Sentry (needs the token's Project: Read scope).
- **Errors tab on Paperclip projects**: a mapped project shows its own errors on its project page.
- Rules that open a task by themselves, for example a new error affecting more than N users, or any regression. Off by default, with a daily limit.
- Crash-free session rate per project (needs session data in Sentry), on the page and the dashboard widget.

## v0.3: reach

- A second provider. Candidates: GlitchTip (Sentry-compatible API) and PostHog error tracking.
- Error detail view inside Paperclip, if people ask for it. Until then, the Sentry link is one click away.

Ideas and requests are welcome in [issues](https://github.com/ozgurlg/paperclip-plugin-crashdesk/issues).
