param([Parameter(Mandatory=$true,Position=0)][string]$RequestUri)
$ErrorActionPreference='Stop'
$appDir=Join-Path $env:LOCALAPPDATA 'DesignSocksKakao';$logPath=Join-Path $appDir 'helper.log'
New-Item -ItemType Directory -Path $appDir -Force|Out-Null
function Log([string]$m){Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff') $m" -Encoding UTF8}
try{
 Log 'START';Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Web;Add-Type -AssemblyName UIAutomationClient;Add-Type -AssemblyName UIAutomationTypes
 Add-Type @'
using System;using System.Runtime.InteropServices;public static class DSW{[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr h,int n);}
'@
 $uri=[Uri]$RequestUri;if($uri.Scheme-ne'designsocks-kakao'-or$uri.Host-ne'search'){throw '지원하지 않는 요청입니다.'}
 $q=[System.Web.HttpUtility]::ParseQueryString($uri.Query);$name=([string]$q['name']).Trim();$name=($name-replace'[\x00-\x1F\x7F]',' ')
 if([string]::IsNullOrWhiteSpace($name)){throw '검색할 거래처명이 없습니다.'};if($name.Length-gt100){$name=$name.Substring(0,100)};Log "QUERY=$name"
 $k=Get-Process -Name KakaoTalk -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowHandle-ne 0}|Select-Object -First 1
 if(-not$k){throw 'PC 카카오톡 창을 찾지 못했습니다. 카카오톡을 먼저 실행하고 로그인해 주세요.'};Log "KAKAO PID=$($k.Id)"
 [DSW]::ShowWindowAsync($k.MainWindowHandle,9)|Out-Null;[DSW]::SetForegroundWindow($k.MainWindowHandle)|Out-Null
 $shell=New-Object -ComObject WScript.Shell;$shell.AppActivate($k.Id)|Out-Null;Start-Sleep -Milliseconds 350
 $root=[System.Windows.Automation.AutomationElement]::FromHandle($k.MainWindowHandle);$opened=$false
 if($root){
  $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
  foreach($b in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)){
   if(-not$b.Current.IsOffscreen-and$b.Current.IsEnabled-and$b.Current.Name-match'검색|Search'){
    try{$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();$opened=$true;Log "UIA BUTTON=$($b.Current.Name)";Start-Sleep -Milliseconds 350;break}catch{}
   }
  }
 }
 if(-not$opened){[System.Windows.Forms.SendKeys]::SendWait('^+f');Log 'CTRL+SHIFT+F';Start-Sleep -Milliseconds 450}
 $filled=$false;$focus=[System.Windows.Automation.AutomationElement]::FocusedElement
 if($focus-and$focus.Current.ControlType-eq[System.Windows.Automation.ControlType]::Edit){try{$focus.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($name);$filled=$true;Log 'UIA FOCUSED EDIT'}catch{}}
 if(-not$filled-and$root){
  $ec=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)
  foreach($e in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$ec)){
   if(-not$e.Current.IsOffscreen-and$e.Current.IsEnabled){try{$e.SetFocus();$e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($name);$filled=$true;Log "UIA EDIT=$($e.Current.Name)";break}catch{}}
  }
 }
 if(-not$filled){[System.Windows.Forms.Clipboard]::SetText($name);[System.Windows.Forms.SendKeys]::SendWait('^a');[System.Windows.Forms.SendKeys]::SendWait('^v');Log 'CLIPBOARD FALLBACK'}
 Log 'DONE HUMAN CONFIRMATION REQUIRED'
}catch{Log "ERROR=$($_.Exception.ToString())";try{Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue;[System.Windows.Forms.MessageBox]::Show("카톡 찾기 실패:`n$($_.Exception.Message)`n`n진단기록:`n$logPath",'DESIGN SOCKS 카톡 찾기','OK','Error')|Out-Null}catch{};exit 1}
