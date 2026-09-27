# 从矢量绘制指令生成 NSIS 原生位图；不依赖用户字体、截图或远程素材。
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path (Split-Path $PSScriptRoot -Parent) 'packages/desktop/build'
function Draw-Strokes($graphics, [single]$x, [single]$y, [single]$size) {
  $colors = @('#111111', '#777777', '#C2C2C2')
  for ($i = 0; $i -lt 3; $i++) {
    $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($colors[$i]))
    $left = $x + $i * $size * 1.2
    $points = [Drawing.PointF[]]@([Drawing.PointF]::new($left + $size * .18,$y), [Drawing.PointF]::new($left + $size,$y), [Drawing.PointF]::new($left + $size * .82,$y + $size * .24), [Drawing.PointF]::new($left,$y + $size * .24))
    $graphics.FillPolygon($brush,$points)
    $brush.Dispose()
  }
}
function Draw-Paper($graphics, [single]$x, [single]$y, [single]$w, [single]$h, [string]$fill) {
  $p = [Drawing.Drawing2D.GraphicsPath]::new()
  $r = 20
  $p.AddArc($x,$y,$r,$r,180,90)
  $p.AddArc($x+$w-$r,$y,$r,$r,270,90)
  $p.AddArc($x+$w-$r,$y+$h-$r,$r,$r,0,90)
  $p.AddArc($x,$y+$h-$r,$r,$r,90,90)
  $p.CloseFigure()
  $b=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($fill))
  $pen=[Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#DEDEDE'),.6)
  $graphics.FillPath($b,$p)
  $graphics.DrawPath($pen,$p)
  $p.Dispose(); $b.Dispose(); $pen.Dispose()
}
foreach ($kind in @('Sidebar','Header')) {
  $width = if ($kind -eq 'Sidebar') { 164 } else { 150 }
  $height = if ($kind -eq 'Sidebar') { 314 } else { 57 }
  $bitmap = [Drawing.Bitmap]::new($width*3,$height*3,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [Drawing.Graphics]::FromImage($bitmap)
  $g.Clear([Drawing.Color]::White)
  $g.ScaleTransform(3,3)
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $font = [Drawing.Font]::new('Segoe UI',17,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
  $small = [Drawing.Font]::new('Segoe UI',9,[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
  $gray = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#777777'))
  if ($kind -eq 'Sidebar') {
    Draw-Strokes $g 22 31 17
    $g.DrawString('Knorvia',$font,[Drawing.Brushes]::Black,20,51)
    $g.DrawString('STUDIO',$small,$gray,22,78)
    Draw-Paper $g 31 118 111 130 '#EEEEEE'
    Draw-Paper $g 25 111 111 130 '#F8F8F8'
    Draw-Paper $g 19 104 111 130 '#FFFFFF'
    $g.FillEllipse([Drawing.Brushes]::Black,51,130,47,47)
    $g.FillEllipse([Drawing.Brushes]::White,62,146,7,9)
    $g.FillEllipse([Drawing.Brushes]::White,80,146,7,9)
    Draw-Strokes $g 56 203 11
    $g.DrawString('A quiet place to work.',$small,$gray,22,281)
  } else {
    Draw-Strokes $g 22 13 10
    $g.DrawString('Knorvia Studio',$small,[Drawing.Brushes]::Black,22,29)
  }
  $final = [Drawing.Bitmap]::new($width,$height,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $fg = [Drawing.Graphics]::FromImage($final)
  $fg.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $fg.DrawImage($bitmap,0,0,$width,$height)
  $final.Save((Join-Path $destination "installer$kind.bmp"),[Drawing.Imaging.ImageFormat]::Bmp)
  $fg.Dispose(); $final.Dispose(); $g.Dispose(); $bitmap.Dispose(); $font.Dispose(); $small.Dispose(); $gray.Dispose()
}
Write-Output 'Generated Knorvia installer header (150 x 57) and sidebar (164 x 314).'
