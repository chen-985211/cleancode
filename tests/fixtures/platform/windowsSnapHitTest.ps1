param([long]$Handle, [int]$X, [int]$Y, [ValidateSet('Probe','Hover','Leave','Click','Cancel')][string]$Action)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CaptionProbe {
    [StructLayout(LayoutKind.Sequential)]
    public struct Point { public int x, y; }
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
    [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hwnd, ref Point point);
    [DllImport("user32.dll")] public static extern IntPtr ChildWindowFromPointEx(IntPtr hwnd, Point point, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr SendMessageTimeoutW(IntPtr hwnd,
        uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    public static int Send(IntPtr hwnd, uint message, int wParam, Point point) {
        int coordinates = (point.y << 16) | (point.x & 0xffff);
        IntPtr result;
        if (SendMessageTimeoutW(hwnd, message, (IntPtr)wParam, (IntPtr)coordinates, 2, 3000, out result) == IntPtr.Zero)
            throw new InvalidOperationException("Window message timed out.");
        return result.ToInt32();
    }
}
'@
$window = [IntPtr]::new($Handle)
$null = [CaptionProbe]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$client = New-Object CaptionProbe+Point
$client.x, $client.y = $X, $Y
$point = $client
if (-not [CaptionProbe]::ClientToScreen($window, [ref]$point)) { throw 'No window client area.' }
$hit = [CaptionProbe]::Send($window, 0x84, 0, $point)
$children = @()
$parent = $window
while ($true) {
    $relative = $point
    if (-not [CaptionProbe]::ScreenToClient($parent, [ref]$relative)) { break }
    $child = [CaptionProbe]::ChildWindowFromPointEx($parent, $relative, 3)
    if ($child -eq [IntPtr]::Zero -or $child -eq $parent) { break }
    $children += [CaptionProbe]::Send($child, 0x84, 0, $point)
    $parent = $child
}
if ($Action -eq 'Hover') { $null = [CaptionProbe]::Send($window, 0xA0, $hit, $point) }
if ($Action -eq 'Leave') { $null = [CaptionProbe]::Send($window, 0x2A2, 0, $point) }
if ($Action -in 'Click','Cancel') {
    $null = [CaptionProbe]::Send($window, 0xA1, $hit, $point)
    if ($Action -eq 'Cancel') { $client.x += 100 }
    $null = [CaptionProbe]::Send($window, 0x202, 0, $client)
}
@{ hit = $hit; children = $children } | ConvertTo-Json -Compress
