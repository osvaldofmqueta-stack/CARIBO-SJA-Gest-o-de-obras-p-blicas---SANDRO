---
name: uv-managed Python discovery
description: Resolving a Python runtime downloaded by uv in the Windows installer.
---

When the Windows installer downloads Python with `uv`, resolve it with `uv python find` while temporarily setting `UV_PYTHON_PREFERENCE=only-managed` and `UV_PYTHON_INSTALL_DIR` to the intended runtime directory. Restore both environment values afterward.

**Why:** this workspace can inherit `UV_PYTHON_PREFERENCE=only-system`, which makes managed-runtime discovery fail or conflict with `--managed-python`.

**How to apply:** use the explicit managed preference for discovery rather than relying on PATH or `uv python find --managed-python`; test the exact command when changing the uv version or install directory.
