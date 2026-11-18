param([string]$OutputFile,[int]$Seconds=20)
$ErrorActionPreference='Stop'
$taskExe='G:\selftool\WebCharacter\personal-digital-companion\desktop\node_modules\electron\dist\electron.exe'
$cores=[Environment]::ProcessorCount
$samples=@();$prior=@{};$last=[DateTime]::UtcNow
foreach($item in (Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object Path -eq $taskExe)){$prior[$item.Id]=$item.CPU}
for($i=0;$i -lt $Seconds;$i++){
  Start-Sleep -Milliseconds 1000
  $now=[DateTime]::UtcNow;$wall=($now-$last).TotalSeconds;$last=$now
  $items=@(Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object Path -eq $taskExe)
  if(!$items.Count){throw '目标桌宠进程未运行'}
  $cpu=0;$ws=0;$private=0;$next=@{}
  foreach($item in $items){if($prior.ContainsKey($item.Id)){$cpu+=[Math]::Max(0,$item.CPU-$prior[$item.Id])};$next[$item.Id]=$item.CPU;$ws+=$item.WorkingSet64;$private+=$item.PrivateMemorySize64}
  $prior=$next
  $samples+=[PSCustomObject]@{elapsedSeconds=$i+1;cpuMachinePercent=100*$cpu/$wall/$cores;cpuOneCorePercent=100*$cpu/$wall;workingSetMiB=$ws/1MB;privateMiB=$private/1MB;processes=$items.Count}
}
$report=[PSCustomObject]@{logicalProcessors=$cores;seconds=$Seconds;samples=$samples;meanCPU=($samples.cpuMachinePercent|Measure-Object -Average).Average;maxCPU=($samples.cpuMachinePercent|Measure-Object -Maximum).Maximum;meanWorkingSetMiB=($samples.workingSetMiB|Measure-Object -Average).Average;meanPrivateMiB=($samples.privateMiB|Measure-Object -Average).Average}
$parent=Split-Path -Parent $OutputFile;New-Item -ItemType Directory -Path $parent -Force|Out-Null
$report|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $OutputFile -Encoding utf8
$report|Select-Object logicalProcessors,seconds,meanCPU,maxCPU,meanWorkingSetMiB,meanPrivateMiB|ConvertTo-Json
