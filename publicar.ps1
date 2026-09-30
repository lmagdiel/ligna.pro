# Publica o site no Cloudflare Pages.
# Uso (PowerShell, na pasta do repositorio):
#   .\publicar.ps1              -> ramo main (producao; hoje ainda protegida por senha)
#   .\publicar.ps1 -Ramo teste  -> deploy de teste, em endereco separado
# Requisitos: Hugo extended (winget install Hugo.Hugo.Extended), Node.js (npx)
# e o .env com CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID. As dependências das Functions
# (worker-mailer) são instaladas em node_modules na primeira execução.
param([string]$Ramo = "main")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

foreach ($linha in Get-Content .env) {
  if ($linha -match '^\s*(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)\s*=\s*(.+?)\s*$') {
    Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim('"', "'")
  }
}
if (-not $env:CLOUDFLARE_API_TOKEN -or -not $env:CLOUDFLARE_ACCOUNT_ID) {
  throw "Faltam CLOUDFLARE_API_TOKEN ou CLOUDFLARE_ACCOUNT_ID no .env"
}

if (-not (Test-Path node_modules)) { npm install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw "npm install falhou" } }

hugo --gc --minify --cleanDestinationDir
if ($LASTEXITCODE -ne 0) { throw "O build do Hugo falhou" }

$commit = (git rev-parse --short HEAD)
npx --yes wrangler@4 pages deploy public --project-name=ligna-pro --branch=$Ramo --commit-hash=$commit --commit-dirty=true
if ($LASTEXITCODE -ne 0) { throw "A publicacao falhou" }
