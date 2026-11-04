param([string]$Python = "python3")

$ErrorActionPreference = "Stop"
# Legacy reproduces Windows PowerShell 5.1's native argument marshalling.
$PSNativeCommandArgumentPassing = "Legacy"
$installer = Join-Path $PSScriptRoot "install-local.ps1"
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($installer, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$probes = @($ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.StringConstantExpressionAst] -and
    $node.Value.StartsWith("import sys; print(") -and
    $node.Value -notmatch "sys.executable"
}, $true))
if ($probes.Count -ne 3) { throw "Expected three Python version probes." }
foreach ($probe in $probes) {
    $output = & $Python -c $probe.Value
    if ($LASTEXITCODE -ne 0) {
        throw "Python probe failed with legacy argument passing: $($probe.Value)"
    }
    $version = [version]($output | Select-Object -Last 1)
    if ($version -lt [version]"3.11.0") { throw "Test requires Python 3.11+." }
}
Write-Host "PASS: all three installer probes work with legacy PowerShell arguments."
