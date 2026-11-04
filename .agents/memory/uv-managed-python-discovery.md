---
name: uv-managed Python discovery
description: Resolving a Python runtime downloaded by uv in the Windows installer.
---

When the Windows installer downloads Python with `uv`, resolve it with `uv python find` while temporarily setting `UV_PYTHON_PREFERENCE=only-managed` and `UV_PYTHON_INSTALL_DIR` to the intended runtime directory. Restore both environment values afterward.

**Why:** this workspace can inherit `UV_PYTHON_PREFERENCE=only-system`, which makes managed-runtime discovery fail or conflict with `--managed-python`.

**How to apply:** use the explicit managed preference for discovery rather than relying on PATH or `uv python find --managed-python`; test the exact command when changing the uv version or install directory.

Keep Python `-c` version probes free of embedded double quotes when invoked from Windows PowerShell 5.1.

**Why:** legacy native-argument marshalling removes those quotes. A valid installed Python then raises SyntaxError, which a swallowed detection error misreports as a missing interpreter. Changing search directories cannot fix this. Reproduced using PowerShell's Legacy argument mode; quote-free probes passed.

**How to apply:** regression-test the actual probe strings with legacy argument passing, not just Python or PowerShell syntax in isolation. This reproduction does not replace an end-to-end Windows installation test.
