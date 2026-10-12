# The fixture is a custom CLI wrapper; preserve its arguments at the native boundary.
# Windows PowerShell's legacy `& exe @args` drops embedded quotes by itself.
function ConvertTo-NativeArgument([string] $value) {
  $escaped = [regex]::Replace($value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

$env:NATIVE_MESSAGE_SHIM_RAN = 'yes'
$parts = @(ConvertTo-NativeArgument $env:NATIVE_MESSAGE_CLI_FIXTURE)
foreach ($argument in $args) {
  $parts += ConvertTo-NativeArgument $argument
}
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $env:NATIVE_MESSAGE_CLI_EXECUTABLE
$start.UseShellExecute = $false
$start.Arguments = [string]::Join(' ', [string[]] $parts)
$child = [Diagnostics.Process]::new()
$child.StartInfo = $start
if (-not $child.Start()) { throw 'Could not start the native fixture.' }
$child.WaitForExit()
exit $child.ExitCode
