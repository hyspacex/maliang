# Prompt-injection threat model

Story and complaint text is hostile data even when it was written innocently.

Controls:

- the Electron renderer has no Node.js, filesystem, shell, Codex, credential,
  or arbitrary navigation access;
- every IPC payload is runtime-validated;
- user content is written to a job file and never concatenated into a command;
- subprocesses are spawned with argument arrays and `shell: false`;
- text jobs are read-only and image jobs can write only in a random job
  directory;
- Codex user configuration and repository rule files are ignored;
- structured text output is schema-bound and then evidence-validated;
- output size, time, artifact type, and artifact path are bounded;
- symlinks and paths outside a job directory are rejected;
- malformed or unrelated output fails closed; and
- model prose is never shown to a child.

Remaining risk: Codex image generation is an evolving prototype surface. Live
conformance tests and a version pin are required before each playtest cohort.
