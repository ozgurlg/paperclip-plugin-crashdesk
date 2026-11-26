# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

### Added

- Sentry provider (read-only) with support for sentry.io, the EU region and self-hosted Sentry.
- Errors page with headline numbers and a top-issues table for the last 24 hours, 7 days or 14 days.
- Create task: turns an error into a Paperclip task with assignee, project and priority.
- Project mapping on the errors page (Projects button): link each Sentry project to a Paperclip project once (same-name suggestions) and pick one default assignee for all errors.
- Task linking by origin, with the linked task's status shown next to each error.
- Agent tools `list-errors` and `get-error`.
- Dashboard widget with the headline numbers, the top three issues and a link to the errors page.
- Sidebar entry and background sync job.
