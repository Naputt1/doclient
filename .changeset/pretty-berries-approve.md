---
'@doclient/renderer-go': patch
---

Fix upload method signatures: remove duplicate tok parameter from upload templates
Fix upload test calls: use extraMethodArgs instead of hardcoded args
Remove renderer-go dependency from @doclient/cli (dynamic import for scaffold)
