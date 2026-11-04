$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$apiDirectory = Join-Path $projectRoot "artifacts\api-server"
$manageScript = Join-Path $apiDirectory "manage.py"
$localDirectory = Join-Path $env:LOCALAPPDATA "CariboSJA"
$localConfig = Join-Path $localDirectory "local.env"
$neonConnectionConfig = Join-Path $localDirectory "neon.connection.dpapi"
$script:AdminPassword = $null
$script:NeonConnectionSecret = $null
$script:StartedProcesses = New-Object System.Collections.ArrayList
$script:DatabaseMode = $null
$script:BackupPath = $null
$script:BackupFormat = $null

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Confirm-Action {
    param([string]$Message)
    $answer = Read-Host "$Message [S/N]"
    return $answer.Trim().ToUpperInvariant() -in @("S", "SIM", "Y", "YES")
}

function Select-DatabaseSetup {
    Write-Step "Conectar a base de dados existente"
    Write-Host "Este instalador liga o PC a base Neon existente; nao cria nem importa uma base local."
    $script:DatabaseMode = "neon"
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Install-WingetPackage {
    param(
        [string]$PackageId,
        [string]$DisplayName,
        [string]$DownloadUrl
    )

    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Warning "winget (App Installer) is missing."
        if (Confirm-Action "Open Microsoft Store to install App Installer?") {
            Start-Process "ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1"
        }
        throw "Install App Installer, then run installer.bat again."
    }

    if (-not (Confirm-Action "$DisplayName is missing or unsupported. Install it now?")) {
        throw "Installation of $DisplayName was declined."
    }

    Write-Host "Installing $DisplayName with winget..."
    & $winget.Source install --id $PackageId --exact --source winget --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Start-Process $DownloadUrl
        throw "winget could not install $DisplayName. The official download page was opened; install it and rerun installer.bat."
    }
    Refresh-Path
}

function Find-Python {
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        try {
            $versionText = & $launcher.Source -3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>$null
            if ($LASTEXITCODE -eq 0) {
                $version = [version]($versionText | Select-Object -Last 1)
                if ($version -ge [version]"3.11.0") {
                    return [pscustomobject]@{
                        Path = $launcher.Source
                        Prefix = @("-3")
                    }
                }
            }
        }
        catch {}
    }

    $pythonCandidates = @()
    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($python) {
        $pythonCandidates += $python.Source
    }

    $registryRoots = @(
        "HKCU:\Software\Python\PythonCore",
        "HKLM:\Software\Python\PythonCore",
        "HKLM:\Software\WOW6432Node\Python\PythonCore"
    )
    foreach ($registryRoot in $registryRoots) {
        if (-not (Test-Path $registryRoot)) {
            continue
        }
        foreach ($versionKey in (Get-ChildItem -Path $registryRoot -ErrorAction SilentlyContinue)) {
            $installPathKey = Join-Path $versionKey.PSPath "InstallPath"
            if (-not (Test-Path $installPathKey)) {
                continue
            }
            try {
                $installPath = Get-Item -LiteralPath $installPathKey
                $executablePath = $installPath.GetValue("ExecutablePath")
                $installDirectory = $installPath.GetValue("")
                if ($executablePath) {
                    $pythonCandidates += [string]$executablePath
                }
                if ($installDirectory) {
                    $pythonCandidates += (Join-Path ([string]$installDirectory) "python.exe")
                }
            }
            catch {}
        }
    }

    $appPathKeys = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\python.exe",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\python.exe",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\python.exe"
    )
    foreach ($appPathKey in $appPathKeys) {
        if (-not (Test-Path $appPathKey)) {
            continue
        }
        try {
            $registeredExecutable = (Get-Item -LiteralPath $appPathKey).GetValue("")
            if ($registeredExecutable) {
                $pythonCandidates += [string]$registeredExecutable
            }
        }
        catch {}
    }

    $uninstallRoots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )
    foreach ($uninstallRoot in $uninstallRoots) {
        if (-not (Test-Path $uninstallRoot)) {
            continue
        }
        foreach ($applicationKey in (Get-ChildItem -Path $uninstallRoot -ErrorAction SilentlyContinue)) {
            try {
                $application = Get-ItemProperty -LiteralPath $applicationKey.PSPath -ErrorAction Stop
                if ($application.DisplayName -match '^Python\s+3\.(11|12|13)') {
                    if ($application.InstallLocation) {
                        $pythonCandidates += (Join-Path ([string]$application.InstallLocation) "python.exe")
                    }
                }
            }
            catch {}
        }
    }

    $pythonRoots = @()
    if ($env:LOCALAPPDATA) {
        $pythonRoots += (Join-Path $env:LOCALAPPDATA "Programs\Python")
    }
    if ($env:ProgramFiles) {
        $pythonRoots += $env:ProgramFiles
    }
    if (${env:ProgramFiles(x86)}) {
        $pythonRoots += ${env:ProgramFiles(x86)}
    }
    $pythonRoots += "C:\Python"
    foreach ($pythonRoot in ($pythonRoots | Select-Object -Unique)) {
        if (-not (Test-Path $pythonRoot)) {
            continue
        }
        if (Test-Path (Join-Path $pythonRoot "python.exe")) {
            $pythonCandidates += (Join-Path $pythonRoot "python.exe")
        }
        foreach ($pythonDirectory in (Get-ChildItem -Path $pythonRoot -Directory -ErrorAction SilentlyContinue)) {
            if ($pythonDirectory.Name -match '^Python3\d+$') {
                $candidate = Join-Path $pythonDirectory.FullName "python.exe"
                $pythonCandidates += $candidate
            }
        }
    }

    foreach ($pythonExecutable in ($pythonCandidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $pythonExecutable)) {
            continue
        }
        try {
            $versionText = & $pythonExecutable -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>$null
            if ($LASTEXITCODE -eq 0) {
                $version = [version]($versionText | Select-Object -Last 1)
                if ($version -ge [version]"3.11.0") {
                    return [pscustomobject]@{
                        Path = $pythonExecutable
                        Prefix = @()
                    }
                }
            }
        }
        catch {}
    }

    $uv = Find-Uv
    if ($uv) {
        try {
            $managedPython = (& $uv.Source python find 3.12 --managed-python 2>$null | Select-Object -Last 1).Trim()
            if ($LASTEXITCODE -eq 0 -and
                -not [string]::IsNullOrWhiteSpace($managedPython) -and
                (Test-Path -LiteralPath $managedPython)) {
                $versionText = & $managedPython -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>$null
                if ($LASTEXITCODE -eq 0 -and [version]($versionText | Select-Object -Last 1) -ge [version]"3.11.0") {
                    return [pscustomobject]@{
                        Path = $managedPython
                        Prefix = @()
                    }
                }
            }
        }
        catch {}
    }

    return $null
}

function Find-NodeVersion {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) {
        return $null
    }

    try {
        $versionText = (& $node.Source --version 2>$null).Trim().TrimStart("v")
        if ($LASTEXITCODE -eq 0) {
            return [pscustomobject]@{
                Path = $node.Source
                Version = [version]$versionText
            }
        }
    }
    catch {}
    return $null
}

function Test-SupportedNode {
    param([version]$Version)
    return (($Version.Major -eq 20 -and $Version.Minor -ge 19) -or
        ($Version.Major -ge 22 -and ($Version.Major -gt 22 -or $Version.Minor -ge 12)))
}

function Find-Pnpm {
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if (-not $pnpm) {
        $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    }
    return $pnpm
}

function Find-Uv {
    $uv = Get-Command uv.exe -ErrorAction SilentlyContinue
    if (-not $uv) {
        $uv = Get-Command uv -ErrorAction SilentlyContinue
    }
    return $uv
}

function Find-Psql {
    $psql = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($psql) {
        return $psql.Source
    }

    $roots = @()
    if ($env:ProgramFiles) {
        $roots += Join-Path $env:ProgramFiles "PostgreSQL"
    }
    $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    if ($programFilesX86) {
        $roots += Join-Path $programFilesX86 "PostgreSQL"
    }

    foreach ($root in $roots) {
        if (Test-Path $root) {
            $match = Get-ChildItem -Path $root -Filter "psql.exe" -Recurse -File -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($match) {
                return $match.FullName
            }
        }
    }
    return $null
}

function Find-PgRestore {
    $restore = Get-Command pg_restore.exe -ErrorAction SilentlyContinue
    if ($restore) {
        return $restore.Source
    }

    $psqlPath = Find-Psql
    if ($psqlPath) {
        $sibling = Join-Path (Split-Path -Parent $psqlPath) "pg_restore.exe"
        if (Test-Path $sibling) {
            return $sibling
        }
    }

    return $null
}

function Ensure-Prerequisites {
    Write-Step "Checking Windows prerequisites"

    if (-not (Find-Uv)) {
        Install-WingetPackage "astral-sh.uv" "uv Python package manager" "https://docs.astral.sh/uv/getting-started/installation/"
    }
    if (-not (Find-Uv)) {
        throw "uv was not found after installation. Close this window, reopen it, and rerun installer.bat."
    }

    if (-not (Find-Python)) {
        $uv = Find-Uv
        Write-Host "Python was not found in a standard Windows location. Downloading a private Python 3.12 with uv..."
        & $uv.Source python install 3.12
        if ($LASTEXITCODE -ne 0) {
            throw "Could not install the private Python 3.12 runtime with uv."
        }
    }
    if (-not (Find-Python)) {
        throw "Python 3.11 or newer could not be found. Check that the uv Python download completed."
    }

    $node = Find-NodeVersion
    if (-not $node -or -not (Test-SupportedNode $node.Version)) {
        Install-WingetPackage "OpenJS.NodeJS.LTS" "Node.js LTS" "https://nodejs.org/en/download"
    }
    $node = Find-NodeVersion
    if (-not $node -or -not (Test-SupportedNode $node.Version)) {
        throw "A supported Node.js version was not found. Vite requires Node.js 20.19+ or 22.12+."
    }

    $pnpm = Find-Pnpm
    $pnpmMajor = 0
    if ($pnpm) {
        try {
            $pnpmVersion = (& $pnpm.Source --version 2>$null).Trim()
            if ($LASTEXITCODE -eq 0) {
                $pnpmMajor = [int]($pnpmVersion.Split(".")[0])
            }
        }
        catch {}
    }
    if (-not $pnpm -or $pnpmMajor -lt 9 -or $pnpmMajor -gt 10) {
        $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (-not $npm) {
            throw "npm was not found with Node.js. Reinstall Node.js LTS and rerun installer.bat."
        }
        if (-not (Confirm-Action "pnpm 9 is required by this project. Install it now?")) {
            throw "Installation of pnpm was declined."
        }
        & $npm.Source install --global pnpm@9
        if ($LASTEXITCODE -ne 0) {
            throw "Could not install pnpm 9."
        }
        Refresh-Path
    }
    if (-not (Find-Pnpm)) {
        throw "pnpm was not found after installation. Close this window, reopen it, and rerun installer.bat."
    }

    if ($script:DatabaseMode -ne "neon") {
        if (-not (Find-Psql)) {
            Install-WingetPackage "PostgreSQL.PostgreSQL.17" "PostgreSQL 17" "https://www.postgresql.org/download/windows/"
        }
        if (-not (Find-Psql)) {
            throw "psql.exe was not found after installing PostgreSQL."
        }
    }
}

function Install-ProjectDependencies {
    Write-Step "Installing project dependencies"

    $pythonInfo = Find-Python
    $pythonArguments = @($pythonInfo.Prefix) + @("-c", "import sys; print(sys.executable)")
    $pythonExecutable = (& $pythonInfo.Path @pythonArguments | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Could not locate the supported Python interpreter."
    }
    $venvDirectory = Join-Path $projectRoot ".venv"
    [Environment]::SetEnvironmentVariable("UV_PROJECT_ENVIRONMENT", $venvDirectory, "Process")
    $uv = Find-Uv
    & $uv.Source sync --frozen --no-install-project --python $pythonExecutable
    [Environment]::SetEnvironmentVariable("UV_PROJECT_ENVIRONMENT", $null, "Process")
    if ($LASTEXITCODE -ne 0) {
        throw "Could not install the locked Python dependencies from uv.lock."
    }
    if (-not (Test-Path (Join-Path $venvDirectory "Scripts\python.exe"))) {
        throw "uv did not create the expected local Python environment."
    }

    $pnpm = Find-Pnpm
    & $pnpm.Source install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        throw "Could not install the frontend dependencies from pnpm-lock.yaml."
    }
}

function Start-PostgresService {
    $services = @(Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue)
    if ($services.Count -eq 0) {
        throw "The PostgreSQL service was not found. Install PostgreSQL 17 and rerun installer.bat."
    }

    $service = $services | Sort-Object Name -Descending | Select-Object -First 1
    if ($service.Status -ne "Running") {
        Write-Host "Starting PostgreSQL service $($service.Name)..."
        try {
            Start-Service -Name $service.Name
        }
        catch {
            throw "Could not start PostgreSQL. Start its service from Windows Services, then rerun installer.bat."
        }
    }
}

function Invoke-Psql {
    param(
        [string]$Database,
        [string]$Sql
    )

    $psqlPath = Find-Psql
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $psqlPath
    $startInfo.Arguments = "-X -q -t -A -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d $Database"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables["PGPASSWORD"] = $script:AdminPassword

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $process.StandardInput.WriteLine($Sql)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        throw "PostgreSQL rejected a setup command. Check the postgres password and local service. $stderr"
    }
    return $stdout.Trim()
}

function Get-LocalDatabaseConnection {
    if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
        throw "The local PostgreSQL connection is not configured."
    }

    try {
        $databaseUri = [System.Uri]$env:DATABASE_URL
        $separator = $databaseUri.UserInfo.IndexOf(":")
        if ($separator -lt 1) {
            throw "The database URL has no username or password."
        }

        $databaseName = [System.Uri]::UnescapeDataString($databaseUri.AbsolutePath.TrimStart("/"))
        if ([string]::IsNullOrWhiteSpace($databaseName)) {
            throw "The database URL has no database name."
        }

        return [pscustomobject]@{
            Host = $databaseUri.Host
            Port = if ($databaseUri.Port -gt 0) { $databaseUri.Port } else { 5432 }
            Database = $databaseName
            Username = [System.Uri]::UnescapeDataString($databaseUri.UserInfo.Substring(0, $separator))
            Password = [System.Uri]::UnescapeDataString($databaseUri.UserInfo.Substring($separator + 1))
        }
    }
    catch {
        throw "The local PostgreSQL connection configuration is invalid."
    }
}

function Invoke-LocalPsql {
    param([string]$Sql)

    $connection = Get-LocalDatabaseConnection
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = Find-Psql
    $startInfo.Arguments = "-X -q -t -A -v ON_ERROR_STOP=1 -h $($connection.Host) -p $($connection.Port) -U $($connection.Username) -d $($connection.Database)"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables["PGPASSWORD"] = $connection.Password

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $process.StandardInput.WriteLine($Sql)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        throw "Could not query the configured local database. Check the database URL and PostgreSQL service. $stderr"
    }
    return $stdout.Trim()
}

function Test-DatabaseEmpty {
    param(
        [string]$Database,
        [switch]$UseLocalCredentials
    )

    $sql = @"
SELECT CASE WHEN
    EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname <> 'information_schema'
          AND n.nspname !~ '^pg_'
    )
    OR EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname <> 'information_schema'
          AND n.nspname !~ '^pg_'
    )
    OR EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname <> 'information_schema'
          AND n.nspname !~ '^pg_'
          AND t.typtype IN ('c', 'd', 'e', 'r')
    )
    OR EXISTS (
        SELECT 1
        FROM pg_namespace
        WHERE nspname <> 'public'
          AND nspname <> 'information_schema'
          AND nspname !~ '^pg_'
    )
THEN '0' ELSE '1' END;
"@
    if ($UseLocalCredentials) {
        return (Invoke-LocalPsql -Sql $sql) -eq "1"
    }
    return (Invoke-Psql -Database $Database -Sql $sql) -eq "1"
}

function Invoke-PostgresBackupRestore {
    $connection = Get-LocalDatabaseConnection
    $backupPathArgument = '"' + $script:BackupPath + '"'
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $false
    $startInfo.EnvironmentVariables["PGPASSWORD"] = $connection.Password

    if ($script:BackupFormat -eq "sql") {
        $startInfo.FileName = Find-Psql
        $startInfo.Arguments = "-X --single-transaction -v ON_ERROR_STOP=1 -h $($connection.Host) -p $($connection.Port) -U $($connection.Username) -d $($connection.Database) -f $backupPathArgument"
    }
    else {
        $restorePath = Find-PgRestore
        if (-not $restorePath) {
            throw "pg_restore.exe was not found beside psql.exe. Reinstall PostgreSQL and rerun installer.bat."
        }
        $startInfo.FileName = $restorePath
        $startInfo.Arguments = "--exit-on-error --single-transaction --no-owner --no-privileges -h $($connection.Host) -p $($connection.Port) -U $($connection.Username) -d $($connection.Database) $backupPathArgument"
    }

    Write-Host "Importing the full PostgreSQL backup. This may take several minutes..."
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "PostgreSQL could not restore the backup (exit code $($process.ExitCode)). Review the restore output above; the target database was empty before this attempt."
    }
}

function Validate-PostgresBackupArchive {
    if ($script:BackupFormat -ne "archive") {
        return
    }

    $restorePath = Find-PgRestore
    if (-not $restorePath) {
        throw "pg_restore.exe was not found beside psql.exe. Reinstall PostgreSQL and rerun installer.bat."
    }
    & $restorePath --list $script:BackupPath 1>$null
    if ($LASTEXITCODE -ne 0) {
        throw "The selected backup is not a valid PostgreSQL custom, tar, or directory-format dump."
    }
}

function Read-PostgresAdminPassword {
    $securePassword = Read-Host "Enter the PostgreSQL administrator password for user postgres" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $script:AdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    if ([string]::IsNullOrWhiteSpace($script:AdminPassword)) {
        throw "The PostgreSQL administrator password cannot be empty."
    }
}

function Create-LocalDatabase {
    Write-Step "Preparing the local PostgreSQL database"
    Start-PostgresService
    Read-PostgresAdminPassword

    $connectionTest = Invoke-Psql -Database "postgres" -Sql "SELECT 1;"
    if ($connectionTest -ne "1") {
        throw "Could not connect to PostgreSQL on 127.0.0.1:5432."
    }

    $databaseExists = Invoke-Psql -Database "postgres" -Sql "SELECT 1 FROM pg_database WHERE datname = 'fiscaliza_caribo';"
    if ($databaseExists -eq "1") {
        if ($script:DatabaseMode -eq "backup" -and
            -not (Test-DatabaseEmpty -Database "fiscaliza_caribo")) {
            throw "The local database fiscaliza_caribo already contains application objects. The backup was not imported and no existing data was changed."
        }
        if (-not (Confirm-Action "Database fiscaliza_caribo already exists. Reuse it without deleting data? The installer will adjust the database and schema owner/permissions.")) {
            throw "Database setup was cancelled; no existing database was changed."
        }
    }

    $roleExists = Invoke-Psql -Database "postgres" -Sql "SELECT 1 FROM pg_roles WHERE rolname = 'fiscaliza_app';"
    if ($roleExists -eq "1") {
        if (-not (Confirm-Action "PostgreSQL role fiscaliza_app already exists. Reset its password for this app? Other local apps using this role could be affected.")) {
            throw "Database setup was cancelled; the existing fiscaliza_app role was not changed."
        }
    }
    $appPassword = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
    if ($roleExists -eq "1") {
        $roleSql = "ALTER ROLE fiscaliza_app WITH LOGIN PASSWORD '$appPassword';"
    }
    else {
        $roleSql = "CREATE ROLE fiscaliza_app WITH LOGIN PASSWORD '$appPassword';"
    }
    [void](Invoke-Psql -Database "postgres" -Sql $roleSql)

    if ($databaseExists -eq "1") {
        [void](Invoke-Psql -Database "postgres" -Sql "ALTER DATABASE fiscaliza_caribo OWNER TO fiscaliza_app;")
        [void](Invoke-Psql -Database "fiscaliza_caribo" -Sql "ALTER SCHEMA public OWNER TO fiscaliza_app; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fiscaliza_app; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fiscaliza_app;")
    }
    else {
        [void](Invoke-Psql -Database "postgres" -Sql "CREATE DATABASE fiscaliza_caribo OWNER fiscaliza_app;")
        [void](Invoke-Psql -Database "fiscaliza_caribo" -Sql "ALTER SCHEMA public OWNER TO fiscaliza_app;")
    }

    [void][System.IO.Directory]::CreateDirectory($localDirectory)
    $sessionSecret = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
    $databaseUrl = "postgresql://fiscaliza_app:$appPassword@127.0.0.1:5432/fiscaliza_caribo"
    $configContent = "DATABASE_URL=$databaseUrl`r`nSESSION_SECRET=$sessionSecret`r`nDJANGO_DEBUG=true`r`n"
    [System.IO.File]::WriteAllText($localConfig, $configContent, [System.Text.Encoding]::ASCII)
    $script:AdminPassword = $null
    Write-Host "Local database credentials were saved under your Windows user profile, outside the project."
}

function Import-LocalConfig {
    if (-not (Test-Path $localConfig)) {
        return $false
    }

    foreach ($line in [System.IO.File]::ReadAllLines($localConfig)) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
            continue
        }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            throw "The local configuration file is invalid: $localConfig"
        }
        $key = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1)
        if ($key -notin @("DATABASE_URL", "SESSION_SECRET", "DJANGO_DEBUG")) {
            throw "The local configuration file contains an unsupported setting: $key"
        }
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }

    if ($script:DatabaseMode -eq "neon") {
        return $true
    }
    if (-not $env:DATABASE_URL -or -not $env:SESSION_SECRET) {
        return $false
    }
    return $true
}

function Set-NeonConnectionFromSecureString {
    param([System.Security.SecureString]$SecureConnection)

    if (-not $SecureConnection -or $SecureConnection.Length -eq 0) {
        throw "The Neon connection string cannot be empty."
    }

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureConnection)
    try {
        $connectionString = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }

    try {
        $databaseUri = [System.Uri]$connectionString
    }
    catch {
        throw "Introduza uma URL PostgreSQL valida do Neon."
    }
    if ($databaseUri.Scheme -notin @("postgres", "postgresql") -or
        [string]::IsNullOrWhiteSpace($databaseUri.Host) -or
        [string]::IsNullOrWhiteSpace($databaseUri.UserInfo) -or
        $databaseUri.AbsolutePath.Trim("/") -eq "") {
        throw "Introduza uma URL PostgreSQL valida do Neon."
    }

    $script:NeonConnectionSecret = $SecureConnection
    [Environment]::SetEnvironmentVariable("CARIBO_DATABASE_URL", $connectionString, "Process")
    $connectionString = $null
}

function Load-ProtectedNeonConnection {
    if (-not (Test-Path -LiteralPath $neonConnectionConfig -PathType Leaf)) {
        return $false
    }

    try {
        $protectedValue = [System.IO.File]::ReadAllText($neonConnectionConfig).Trim()
        if ([string]::IsNullOrWhiteSpace($protectedValue)) {
            throw "empty"
        }
        $secureConnection = ConvertTo-SecureString -String $protectedValue
        Set-NeonConnectionFromSecureString -SecureConnection $secureConnection
        return $true
    }
    catch {
        throw "Nao foi possivel descodificar a conexao Neon guardada. Execute novamente como o mesmo utilizador Windows ou escolha nao reutilizar e introduza a URL."
    }
}

function Save-ProtectedNeonConnection {
    if (-not $script:NeonConnectionSecret) {
        throw "The Neon connection is not available to save."
    }

    [void][System.IO.Directory]::CreateDirectory($localDirectory)
    $protectedValue = ConvertFrom-SecureString -SecureString $script:NeonConnectionSecret
    [System.IO.File]::WriteAllText(
        $neonConnectionConfig,
        $protectedValue,
        [System.Text.Encoding]::ASCII
    )
    $protectedValue = $null
    Write-Host "A conexao Neon foi guardada cifrada para este utilizador Windows."
}

function Configure-NeonDatabase {
    Write-Step "Configurar a base Neon"
    Write-Host "A base Neon e partilhada; as alteracoes feitas neste PC aparecem aos outros utilizadores."
    Write-Host "Fotos do Replit podem nao abrir neste PC; fotos enviadas aqui ficam apenas neste PC."
    if (-not (Confirm-Action "Compreende que esta instalacao vai usar a base Neon partilhada?")) {
        throw "Configuracao Neon cancelada; nenhum dado da base foi alterado."
    }

    $hasLocalConfig = Import-LocalConfig
    [Environment]::SetEnvironmentVariable("DJANGO_DEBUG", "true", "Process")
    if (-not $hasLocalConfig -or [string]::IsNullOrWhiteSpace($env:SESSION_SECRET)) {
        $sessionSecret = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
        [Environment]::SetEnvironmentVariable("SESSION_SECRET", $sessionSecret, "Process")
        [void][System.IO.Directory]::CreateDirectory($localDirectory)
        if ($hasLocalConfig -and (Test-Path -LiteralPath $localConfig -PathType Leaf)) {
            [System.IO.File]::AppendAllText(
                $localConfig,
                "SESSION_SECRET=$sessionSecret`r`nDJANGO_DEBUG=true`r`n",
                [System.Text.Encoding]::ASCII
            )
        }
        else {
            [System.IO.File]::WriteAllText(
                $localConfig,
                "SESSION_SECRET=$sessionSecret`r`nDJANGO_DEBUG=true`r`n",
                [System.Text.Encoding]::ASCII
            )
        }
        $sessionSecret = $null
    }

    $reuseSavedConnection = $false
    if (Test-Path -LiteralPath $neonConnectionConfig -PathType Leaf) {
        $reuseSavedConnection = Confirm-Action "Reutilizar a conexao Neon cifrada deste utilizador?"
    }
    if ($reuseSavedConnection) {
        [void](Load-ProtectedNeonConnection)
    }
    else {
        $secureConnection = Read-Host "Introduza a URL PostgreSQL do Neon (entrada oculta)" -AsSecureString
        Set-NeonConnectionFromSecureString -SecureConnection $secureConnection
    }

    [Environment]::SetEnvironmentVariable("PGCONNECT_TIMEOUT", "10", "Process")
}

function Test-NeonDatabaseConnection {
    $venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
    $code = "from django.db import connection; connection.ensure_connection(); print('CARIBO_NEON_CONNECTION_OK')"
    $output = @(& $venvPython $manageScript shell -c $code 2>&1)
    if ($LASTEXITCODE -ne 0 -or (($output -join "`n") -notmatch "CARIBO_NEON_CONNECTION_OK")) {
        throw "Nao foi possivel conectar ao Neon. Verifique a URL, a rede e o estado do projeto. Nenhuma migracao foi executada."
    }
}

function Find-FreePort {
    param(
        [int]$FirstPort,
        [int]$LastPort
    )

    for ($port = $FirstPort; $port -le $LastPort; $port++) {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
        try {
            $listener.Start()
            $listener.Stop()
            return $port
        }
        catch {
            try { $listener.Stop() } catch {}
        }
    }
    return $null
}

function Test-LocalManager {
    $python = Join-Path $projectRoot ".venv\Scripts\python.exe"
    $code = "from works.models import AccessProfile; print('CARIBO_GESTOR_EXISTS=' + str(AccessProfile.objects.filter(role='gestor', activo=True, user__is_active=True, user__is_superuser=True).exists()))"
    $output = & $python $manageScript shell -c $code
    if ($LASTEXITCODE -ne 0) {
        throw "Could not check for an existing local Gestor account."
    }
    return (($output -join "`n") -match "CARIBO_GESTOR_EXISTS=True")
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [System.Diagnostics.Process]$Process
    )

    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        if ($Process -and $Process.HasExited) {
            return $false
        }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $true
            }
        }
        catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

try {
    if (-not (Test-Path (Join-Path $apiDirectory "manage.py"))) {
        throw "Run installer.bat from the project folder; artifacts\api-server\manage.py was not found."
    }

    Select-DatabaseSetup
    Ensure-Prerequisites
    Validate-PostgresBackupArchive
    Install-ProjectDependencies

    if ($script:DatabaseMode -eq "neon") {
        Configure-NeonDatabase
        Test-NeonDatabaseConnection
    }
    else {
        [Environment]::SetEnvironmentVariable("CARIBO_DATABASE_URL", $null, "Process")
        Write-Step "Loading local database configuration"
        if (-not (Import-LocalConfig)) {
            Create-LocalDatabase
            if (-not (Import-LocalConfig)) {
                throw "Could not load the local PostgreSQL configuration."
            }
        }

        if ($script:DatabaseMode -eq "backup") {
            if (-not (Test-DatabaseEmpty -UseLocalCredentials)) {
                throw "The local database already contains application objects. The backup was not imported and no existing data was changed."
            }

            Write-Step "Importing the PostgreSQL backup"
            [void](Invoke-LocalPsql -Sql "ALTER SCHEMA public OWNER TO fiscaliza_app; GRANT ALL PRIVILEGES ON SCHEMA public TO fiscaliza_app;")
            Invoke-PostgresBackupRestore
        }
    }

    $venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
    & $venvPython $manageScript check
    if ($LASTEXITCODE -ne 0) {
        throw "Django configuration checks failed."
    }
    if ($script:DatabaseMode -eq "neon") {
        & $venvPython $manageScript migrate --check
        if ($LASTEXITCODE -ne 0) {
            throw "A base Neon tem migracoes Django pendentes. O instalador nao alterou o esquema; aplique as migracoes num ambiente administrativo e tente novamente."
        }
        Save-ProtectedNeonConnection
    }
    else {
        & $venvPython $manageScript migrate --noinput
        if ($LASTEXITCODE -ne 0) {
            throw "Database migrations failed."
        }
    }
    if ($script:DatabaseMode -eq "demo") {
        & $venvPython $manageScript seed_demo
        if ($LASTEXITCODE -ne 0) {
            throw "Could not load the demonstration data."
        }
    }

    if (-not (Test-LocalManager)) {
        Write-Step "Criar o primeiro Gestor da base selecionada"
        Write-Host "Nao foi encontrado um Gestor ativo. O comando pedira email, nome e palavra-passe."
        & $venvPython $manageScript bootstrap_manager
        if ($LASTEXITCODE -ne 0) {
            throw "The Gestor account was not created."
        }
        if (-not (Test-LocalManager)) {
            throw "The Gestor account could not be verified after setup."
        }
    }
    else {
        Write-Host "Ja existe um Gestor ativo; a palavra-passe nao foi alterada."
    }

    Write-Step "Starting the local application"
    $apiPort = Find-FreePort -FirstPort 8080 -LastPort 8090
    $webPort = Find-FreePort -FirstPort 5173 -LastPort 5190
    if (-not $apiPort -or -not $webPort) {
        throw "Could not find free local ports for the API and web app."
    }

    [Environment]::SetEnvironmentVariable("CARIBO_LOCAL", "1", "Process")
    [Environment]::SetEnvironmentVariable("CARIBO_API_TARGET", "http://127.0.0.1:$apiPort", "Process")
    [Environment]::SetEnvironmentVariable("PORT", [string]$webPort, "Process")
    [Environment]::SetEnvironmentVariable("BASE_PATH", "/", "Process")

    $apiProcess = Start-Process `
        -FilePath $venvPython `
        -ArgumentList @("manage.py", "runserver", "127.0.0.1:$apiPort") `
        -WorkingDirectory $apiDirectory `
        -PassThru
    [void]$script:StartedProcesses.Add($apiProcess)

    if (-not (Wait-ForHttp -Url "http://127.0.0.1:$apiPort/api/healthz" -Process $apiProcess)) {
        throw "The local API did not become healthy on port $apiPort."
    }

    [Environment]::SetEnvironmentVariable("CARIBO_DATABASE_URL", $null, "Process")
    [Environment]::SetEnvironmentVariable("DATABASE_URL", $null, "Process")
    [Environment]::SetEnvironmentVariable("SESSION_SECRET", $null, "Process")

    $commandPrompt = Join-Path $env:SystemRoot "System32\cmd.exe"
    $webProcess = Start-Process `
        -FilePath $commandPrompt `
        -ArgumentList @("/k", "pnpm --filter @workspace/fiscaliza-caribo run dev") `
        -WorkingDirectory $projectRoot `
        -PassThru
    [void]$script:StartedProcesses.Add($webProcess)

    $appUrl = "http://127.0.0.1:$webPort/"
    if (-not (Wait-ForHttp -Url $appUrl -Process $webProcess)) {
        throw "The local web app did not become ready on port $webPort."
    }

    Start-Process $appUrl
    Write-Host ""
    Write-Host "INSTALACAO CONCLUIDA COM EXITO" -ForegroundColor Green
    Write-Host "Aplicacao local: $appUrl"
    if ($script:DatabaseMode -eq "neon") {
        Write-Host "Base PostgreSQL: Neon (partilhada; sem importacao automatica de dados)"
    }
    elseif ($script:DatabaseMode -eq "backup") {
        Write-Host "Base PostgreSQL: fiscaliza_caribo (backup importado)"
    }
    else {
        Write-Host "Base PostgreSQL: fiscaliza_caribo (dados de demonstracao)"
    }
    $skull = [char]0x2620
    Write-Host "$skull Desenvolvido pelo Eng. Osvaldo Queta"
}
catch {
    foreach ($process in $script:StartedProcesses) {
        try {
            if (-not $process.HasExited) {
                Stop-Process -Id $process.Id -Force
            }
        }
        catch {}
    }
    Write-Host ""
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    $script:AdminPassword = $null
}