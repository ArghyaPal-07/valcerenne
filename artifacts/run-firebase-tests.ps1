Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore,auth --project demo-valcerenne 'node server/test-firebase.js'
$LASTEXITCODE | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'firebase-test-exit.txt')
