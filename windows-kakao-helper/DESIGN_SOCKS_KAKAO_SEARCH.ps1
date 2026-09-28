param([Parameter(Mandatory=$true,Position=0)][string]$RequestUri)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Web
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DesignSocksWindow {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
'@

function Show-HelperMessage([string]$message) {
  [System.Windows.Forms.MessageBox]::Show($message, 'DESIGN SOCKS 카톡 찾기', 'OK', 'Information') | Out-Null
}

try {
  $uri = [Uri]$RequestUri
  if ($uri.Scheme -ne 'designsocks-kakao' -or $uri.Host -ne 'search') { throw '지원하지 않는 요청입니다.' }
  $query = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
  $name = ([string]$query['name']).Trim()
  $name = ($name -replace '[\x00-\x1F\x7F]', ' ')
  if ([string]::IsNullOrWhiteSpace($name)) { throw '검색할 거래처명이 없습니다.' }
  if ($name.Length -gt 100) { $name = $name.Substring(0, 100) }

  $kakao = Get-Process -Name 'KakaoTalk' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $kakao) {
    $candidates = @(
      "$env:LOCALAPPDATA\Kakao\KakaoTalk\KakaoTalk.exe",
      "$env:ProgramFiles\Kakao\KakaoTalk\KakaoTalk.exe",
      "${env:ProgramFiles(x86)}\Kakao\KakaoTalk\KakaoTalk.exe"
    ) | Where-Object { $_ -and (Test-Path $_) }
    if (-not $candidates) { throw 'PC 카카오톡을 찾지 못했습니다. 카카오톡을 먼저 실행해 주세요.' }
    Start-Process $candidates[0]
    Start-Sleep -Seconds 2
    $kakao = Get-Process -Name 'KakaoTalk' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  }
  if (-not $kakao) { throw 'PC 카카오톡 창을 찾지 못했습니다. 카카오톡 로그인 상태를 확인해 주세요.' }

  [DesignSocksWindow]::ShowWindowAsync($kakao.MainWindowHandle, 9) | Out-Null
  [DesignSocksWindow]::SetForegroundWindow($kakao.MainWindowHandle) | Out-Null
  try { (New-Object -ComObject WScript.Shell).AppActivate($kakao.Id) | Out-Null } catch {}
  Start-Sleep -Milliseconds 250

  # 카카오톡의 검색 단축키를 사용해 업데이트에 따른 화면 좌표 변경 영향을 피합니다.
  [System.Windows.Forms.SendKeys]::SendWait('^f')
  Start-Sleep -Milliseconds 300

  # UI Automation ValuePattern을 우선 사용합니다.
  $filled = $false
  try {
    $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($focused) {
      $pattern = $null
      if ($focused.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
        $pattern.SetValue($name)
        $filled = $true
      }
    }
  } catch { $filled = $false }

  # UI Automation을 지원하지 않는 카카오톡 버전에서는 클립보드 붙여넣기로 보완합니다.
  if (-not $filled) {
    [System.Windows.Forms.Clipboard]::SetText($name)
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    [System.Windows.Forms.SendKeys]::SendWait('^v')
  }

  # Enter/클릭을 수행하지 않습니다. 검색 결과 화면에서 반드시 사람이 확인합니다.
} catch {
  Show-HelperMessage $_.Exception.Message
  exit 1
}
