$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$checkout = Join-Path $sourceRoot '.publish-projetos'
if (Test-Path -LiteralPath $checkout) { throw 'A pasta .publish-projetos já existe. Confira o checkout existente antes de continuar.' }
git clone --branch main git@github-maxsuel:MaxsuelR10/Projetos.git $checkout
if ($LASTEXITCODE -ne 0) { throw 'Falha ao acessar o GitHub. Desbloqueie a chave SSH neste PowerShell.' }
Push-Location $checkout
try {
  git switch -c codex/financas-max-neon-auth
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar a branch.' }
  $target = Join-Path $checkout 'financas-do-max'
  if (Test-Path -LiteralPath $target) { throw 'O repositório já contém financas-do-max. Revise antes de copiar.' }
  New-Item -ItemType Directory -Path $target | Out-Null
  $files = @('dist','tests','docs','api','scripts','package.json','package-lock.json','server.mjs','storage.mjs','auth.mjs','http-api.mjs','max-ai.mjs','vercel.json','README.md','.gitignore','.env.example')
  foreach ($entry in $files) { Copy-Item -LiteralPath (Join-Path $sourceRoot $entry) -Destination $target -Recurse }
  git add -- financas-do-max
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar os arquivos.' }
  git diff --cached --stat
  git commit -m 'feat: preparar Financas do Max com Neon Auth e isolamento de usuarios'
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o commit. Confira sua identidade Git.' }
  git push -u origin codex/financas-max-neon-auth
  if ($LASTEXITCODE -ne 0) { throw 'Falha no envio. O commit permanece no checkout .publish-projetos.' }
  Write-Host 'Branch enviada. A main e a publicação atual foram preservadas.'
} finally { Pop-Location }
