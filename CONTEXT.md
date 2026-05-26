# SevenAgent Context

## Product Positioning

SevenAgent is a multi-agent assistant workspace for assembling an AI team around a task.
It is not just a chat box, a static dashboard, or a generic workflow editor. The product should help a user describe a goal, form a team of specialized agents, observe their collaboration, and collect the final result.

The product should work for non-developers as well as developers. Coding can be one team template, but the core product language should not assume that every user writes code.

## Core Product Model

SevenAgent has three conceptual layers:

1. Task
   A user goal that the system needs to complete. A task can be simple or complex, and it can be handled by one agent or by a team.

2. Team
   A group of specialized members selected for the task. Teams can come from templates such as daily assistant, content creation, product planning, learning research, or software development.

3. Member
   A specialized agent position inside the team. A member has a role, status, current action, capabilities, outputs, logs, and an optional execution workflow.

## Station Concept

A station is not just a visual card. A station is a visible, controllable position for a specialized agent.

A station should answer:

- Who is this member?
- What role does it play in the current team?
- What is it doing now?
- Does it need user attention?
- What did it recently produce?
- Can the user inspect or adjust its execution flow?

The station UI can be represented as a card, dock item, office seat, control-room console, swimlane, or graph node. The product should not depend on cards as the only form.

## Team Templates

SevenAgent should support different team templates instead of hard-coding a developer-only team.

Example templates:

- Daily assistant team: coordinator, search, writing, schedule, file, summary.
- Content creation team: topic planner, researcher, outline writer, copywriter, title optimizer, reviewer.
- Product planning team: requirements, user research, competitor research, prototype, PRD, review.
- Software development team: architecture, code, UI, test, review, release.
- Learning research team: search, reader, summarizer, questioner, practice, knowledge-card.

The interface can expose friendly words like "team", "member", "station", and "execution flow". Developer-facing words like "agent", "workflow", "node", and "tool" can appear in advanced mode.

## Coordinator

Most teams should have a coordinator member. The coordinator is similar to a PM or orchestrator.

The coordinator is responsible for:

- Understanding the user's goal.
- Breaking the goal into subtasks.
- Assigning work to members.
- Tracking dependencies between members.
- Asking for user confirmation when needed.
- Combining member outputs into the final result.

## Status Model

The business status model should stay small and unambiguous.

Official member statuses:

- `idle`: available and able to accept work.
- `thinking`: planning, reasoning, or deciding what to do next.
- `running`: actively executing a task or calling a tool.
- `waiting`: blocked on user confirmation or external input.
- `done`: completed the current assigned work.
- `error`: failed and needs attention.
- `paused`: manually stopped by the user and should not accept work.

## Idle Mood Rule

"Resting" is not a business status.

Resting is a visual mood for `idle`.

For example, an idle member can be displayed as:

- resting
- drinking coffee
- stretching
- reading notes
- standing by

But the data status remains `idle`.

This keeps scheduling simple: any `idle` member can accept work. Only `paused` means the user intentionally disabled that member.

## UI Principles

The default interface should feel like a command center for an AI team, not a pile of decorative cards.

Important principles:

- Prioritize task progress and final output over decorative agent illustrations.
- Use station visuals to explain state, not to hide information.
- Keep advanced workflow editing behind an inspect or advanced mode.
- Make waiting, error, and confirmation states visually clear.
- Keep dark mode readable: menus, selected text, and canvas grid lines must remain legible.
- Avoid making the product feel like a coding-only tool unless the user selected a software development team template.

## Workflow Role

Workflow editing is powerful but should not be the first concept for every user.

Normal users should see:

- current task
- team members
- progress
- intermediate outputs
- final result

Advanced users can open execution flows to inspect or edit:

- member workflow
- task handoff rules
- tool/API calls
- node connections
- test and save behavior

## Product Sentence

SevenAgent is a workspace where users assemble an AI team for a goal, watch specialized members collaborate, inspect or adjust execution flows when needed, and receive a final usable result.
