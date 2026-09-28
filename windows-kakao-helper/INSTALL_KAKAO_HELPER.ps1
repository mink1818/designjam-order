$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

try {
  # 이전 카톡찾기 요청이 백그라운드에 남아 있으면 설치 전에 해당 보조 프로세스만 종료합니다.
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*DESIGN_SOCKS_KAKAO_SEARCH.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  $appDir = Join-Path $env:LOCALAPPDATA 'DesignSocksKakao'
  New-Item -ItemType Directory -Path $appDir -Force | Out-Null
  $sourceHelper = Join-Path $PSScriptRoot 'DESIGN_SOCKS_KAKAO_SEARCH.ps1'
  $installedHelper = Join-Path $appDir 'DESIGN_SOCKS_KAKAO_SEARCH.ps1'
  $helperText = Get-Content -LiteralPath $sourceHelper -Raw -Encoding UTF8
  Set-Content -LiteralPath $installedHelper -Value $helperText -Encoding UTF8 -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'DESIGN_SOCKS_KAKAO_LAUNCHER.vbs') -Destination (Join-Path $appDir 'DESIGN_SOCKS_KAKAO_LAUNCHER.vbs') -Force

  $protocolRoot = 'HKCU:\Software\Classes\designsocks-kakao'
  New-Item -Path $protocolRoot -Force | Out-Null
  Set-Item -Path $protocolRoot -Value 'URL:DESIGN SOCKS Kakao Search'
  New-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null

  $iconKey = Join-Path $protocolRoot 'DefaultIcon'
  New-Item -Path $iconKey -Force | Out-Null
  Set-Item -Path $iconKey -Value "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe,0"

  $commandKey = Join-Path $protocolRoot 'shell\open\command'
  New-Item -Path $commandKey -Force | Out-Null
  $launcherPath = Join-Path $appDir 'DESIGN_SOCKS_KAKAO_LAUNCHER.vbs'
  $command = '"' + $env:SystemRoot + '\System32\wscript.exe" "' + $launcherPath + '" "%1"'
  Set-Item -Path $commandKey -Value $command

  $saved = (Get-Item -Path $commandKey).GetValue('')
  if ([string]::IsNullOrWhiteSpace($saved) -or $saved -notlike '*DESIGN_SOCKS_KAKAO_LAUNCHER.vbs*') {
    throw 'Windows 연결 주소 등록을 확인할 수 없습니다.'
  }

  [System.Windows.Forms.MessageBox]::Show("설치가 완료되었습니다.`n`nPC 카카오톡을 로그인한 상태에서`n2_TEST_DIRECT.bat을 실행해 주세요.", 'DESIGN SOCKS 카톡 찾기', 'OK', 'Information') | Out-Null
} catch {
  [System.Windows.Forms.MessageBox]::Show("설치 실패:`n$($_.Exception.Message)", 'DESIGN SOCKS 카톡 찾기', 'OK', 'Error') | Out-Null
  exit 1
}
