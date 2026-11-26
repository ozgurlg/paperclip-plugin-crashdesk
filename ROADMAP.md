# Roadmap

Crashdesk grows in small, working steps. Each version is usable on its own.

## v0.1: errors in, tasks out (current)

- Sentry provider, read-only (`event:read`). sentry.io, the EU region and self-hosted Sentry.
- Background sync of the most frequent unresolved errors, cached per time range (24h, 7d, 14d).
- Errors page: unresolved, new, users affected and linked-task counts, plus a top-issues table with trend lines.
- Dashboard widget with the headline numbers, the top three issues and a link to the errors page.
- **Create task**: turns an error into a Paperclip task with the error, the innermost stack frames, release and device, and a link back to Sentry. Pick the assignee, project and priority with Paperclip's own pickers.
- Tasks are linked by origin, so an error is never turned into two open tasks, and the table shows each task's status.
- Agent tools: `list-errors` and `get-error`.
- Error text reaches agents only inside a labelled, sanitized untrusted-data block.

## v0.2: automation

- Rules that open a task by themselves, for example a new error affecting more than N users, or any regression. Off by default.
- Crash-free session rate per project (needs session data in Sentry), on the page and the dashboard widget.

## v0.3: reach

- A second provider. Candidates: GlitchTip (Sentry-compatible API) and PostHog error tracking.
- Optional two-way sync: resolve the Sentry issue when its task is done. Needs a token with write access, so it stays opt-in.
- Error detail view inside Paperclip, if people ask for it. Until then, the Sentry link is one click away.

Ideas and requests are welcome in [issues](https://github.com/ozgurlg/paperclip-plugin-crashdesk/issues).
