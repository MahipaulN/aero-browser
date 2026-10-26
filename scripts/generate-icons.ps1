Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force -Path "build" | Out-Null
New-Item -ItemType Directory -Force -Path "src\renderer\assets" | Out-Null

function Draw-AeroIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $size / 256.0

    # 1. Background Squircle
    $pad = 14.0 * $scale
    $sqSize = $size - (2.0 * $pad)
    $radius = 52.0 * $scale
    $diam = $radius * 2.0

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($pad, $pad, $diam, $diam, 180, 90)
    $path.AddArc(($pad + $sqSize - $diam), $pad, $diam, $diam, 270, 90)
    $path.AddArc(($pad + $sqSize - $diam), ($pad + $sqSize - $diam), $diam, $diam, 0, 90)
    $path.AddArc($pad, ($pad + $sqSize - $diam), $diam, $diam, 90, 90)
    $path.CloseFigure()

    # Dark obsidian slate gradient background (#0d111a to #171d2b)
    $bgC1 = [System.Drawing.Color]::FromArgb(255, 13, 17, 26)
    $bgC2 = [System.Drawing.Color]::FromArgb(255, 23, 29, 43)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF 0, $size), $bgC1, $bgC2
    $g.FillPath($bgBrush, $path)

    # Ambient radial glow inside squircle
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(($size * 0.2), ($size * 0.2), ($size * 0.6), ($size * 0.6))
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(80, 56, 189, 248) # Sky Cyan glow
    $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 13, 17, 26))
    $g.FillPath($glowBrush, $glowPath)

    # Rim border: subtle glass stroke
    $strokeWidth = [float][Math]::Max(1.0, (1.5 * $scale))
    $penColor = [System.Drawing.Color]::FromArgb(45, 255, 255, 255)
    $rimPen = New-Object System.Drawing.Pen ($penColor, $strokeWidth)
    $g.DrawPath($rimPen, $path)

    # 2. Geometric Aero Supersonic 'A' Symbol
    # Left aerodynamic wing blade (Electric Cyan to Azure Blue)
    $leftWing = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p1 = New-Object System.Drawing.PointF ($size * 0.5), ($size * 0.22)
    $p2 = New-Object System.Drawing.PointF ($size * 0.26), ($size * 0.74)
    $p3 = New-Object System.Drawing.PointF ($size * 0.38), ($size * 0.74)
    $p4 = New-Object System.Drawing.PointF ($size * 0.5), ($size * 0.44)
    $leftWing.AddPolygon(@($p1, $p2, $p3, $p4))

    $lwC1 = [System.Drawing.Color]::FromArgb(255, 56, 189, 248) # Cyan-400
    $lwC2 = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)  # Blue-600
    $lwBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $p1, $p2, $lwC1, $lwC2
    $g.FillPath($lwBrush, $leftWing)

    # Right aerodynamic wing blade (Vivid Indigo to Purple)
    $rightWing = New-Object System.Drawing.Drawing2D.GraphicsPath
    $rp1 = New-Object System.Drawing.PointF ($size * 0.5), ($size * 0.22)
    $rp2 = New-Object System.Drawing.PointF ($size * 0.5), ($size * 0.44)
    $rp3 = New-Object System.Drawing.PointF ($size * 0.62), ($size * 0.74)
    $rp4 = New-Object System.Drawing.PointF ($size * 0.74), ($size * 0.74)
    $rightWing.AddPolygon(@($rp1, $rp2, $rp3, $rp4))

    $rwC1 = [System.Drawing.Color]::FromArgb(255, 99, 102, 241) # Indigo-500
    $rwC2 = [System.Drawing.Color]::FromArgb(255, 168, 85, 247) # Purple-500
    $rwBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rp1, $rp4, $rwC1, $rwC2
    $g.FillPath($rwBrush, $rightWing)

    # Floating Supersonic Crossbar / Vortex Core (Pure Diamond White to Cyan)
    $bar = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bp1 = New-Object System.Drawing.PointF ($size * 0.33), ($size * 0.57)
    $bp2 = New-Object System.Drawing.PointF ($size * 0.67), ($size * 0.57)
    $bp3 = New-Object System.Drawing.PointF ($size * 0.61), ($size * 0.64)
    $bp4 = New-Object System.Drawing.PointF ($size * 0.39), ($size * 0.64)
    $bar.AddPolygon(@($bp1, $bp2, $bp3, $bp4))

    # Bar subtle drop shadow
    $barShadow = New-Object System.Drawing.Drawing2D.GraphicsPath
    $sOffset = 3.0 * $scale
    $bsp1 = New-Object System.Drawing.PointF ($bp1.X), ($bp1.Y + $sOffset)
    $bsp2 = New-Object System.Drawing.PointF ($bp2.X), ($bp2.Y + $sOffset)
    $bsp3 = New-Object System.Drawing.PointF ($bp3.X), ($bp3.Y + $sOffset)
    $bsp4 = New-Object System.Drawing.PointF ($bp4.X), ($bp4.Y + $sOffset)
    $barShadow.AddPolygon(@($bsp1, $bsp2, $bsp3, $bsp4))
    $barShadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(80, 0, 0, 0))
    $g.FillPath($barShadowBrush, $barShadow)

    $barC1 = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
    $barC2 = [System.Drawing.Color]::FromArgb(255, 186, 230, 253) # Light cyan-200
    $barBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bp1, $bp3, $barC1, $barC2
    $g.FillPath($barBrush, $bar)

    # Specular highlight on vertex peak
    $peakPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $peakPath.AddEllipse(($size * 0.47), ($size * 0.20), ($size * 0.06), ($size * 0.06))
    $peakBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 255, 255, 255))
    $g.FillPath($peakBrush, $peakPath)

    $g.Flush()
    $g.Dispose()
    return $bmp
}

# Generate 512x512 Master PNG and 256x256
$master = Draw-AeroIcon 512
$master.Save("build\icon-master.png", [System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()

$icon256 = Draw-AeroIcon 256
$icon256.Save("build\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon256.Save("src\renderer\assets\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon256.Dispose()

# Generate multi-frame Windows .ico with standard resolutions (256, 128, 64, 48, 32, 16)
$sizes = @(256, 128, 64, 48, 32, 16)
$pngStreams = @()

foreach ($sz in $sizes) {
    $bmp = Draw-AeroIcon $sz
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngStreams += $ms
    $bmp.Dispose()
}

$icoFileStream = [System.IO.File]::Create("build\icon.ico")
$binWriter = New-Object System.IO.BinaryWriter $icoFileStream

# ICONDIR header: idReserved (0), idType (1 = icon), idCount (6)
$binWriter.Write([UInt16]0)
$binWriter.Write([UInt16]1)
$binWriter.Write([UInt16]($sizes.Count))

# Calculate entries and image offsets
$offset = 6 + ($sizes.Count * 16)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $sz = $sizes[$i]
    $dataLen = $pngStreams[$i].Length

    $widthByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
    $heightByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

    $binWriter.Write($widthByte)          # Width
    $binWriter.Write($heightByte)         # Height
    $binWriter.Write([byte]0)             # ColorCount
    $binWriter.Write([byte]0)             # Reserved
    $binWriter.Write([UInt16]1)           # ColorPlanes
    $binWriter.Write([UInt16]32)          # BitsPerPixel
    $binWriter.Write([UInt32]$dataLen)    # ImageSize
    $binWriter.Write([UInt32]$offset)     # ImageOffset

    $offset += $dataLen
}

# Write PNG bytes
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $bytes = $pngStreams[$i].ToArray()
    $binWriter.Write($bytes)
    $pngStreams[$i].Dispose()
}

$binWriter.Flush()
$binWriter.Close()
$icoFileStream.Close()

Write-Host "Generated multi-resolution Aero icon: build/icon.ico, build/icon.png, build/icon-master.png"
