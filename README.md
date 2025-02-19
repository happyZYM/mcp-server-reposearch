A mcp server to provide better content search than Cline's builtin `search_files` tools.

Features:
- [x] control the filter by `.reposearchignore` file, and use gitignore format.
- [x] support regex for searching
- output format control:
  - [x] whether include content in result
  - [ ] include surrounding lines
- [ ] tokens boom prevention

Notes:
- Currently you need to tell Cline to stop using `search_files` in the system prompt.