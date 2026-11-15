# 把 Blender 原始渲染并排排版；不改变模型、材质或图片内容。
Add-Type -AssemblyName System.Drawing
$outputDir = Join-Path (Split-Path (Split-Path $PSScriptRoot)) 'work/bird-model'

function Write-Sheet($Name, $Items, $Columns, $Size) {
    $rows = [Math]::Ceiling($Items.Count / $Columns)
    $image = [System.Drawing.Bitmap]::new($Columns * $Size, [int]($rows * ($Size + 32)))
    $graphics = [System.Drawing.Graphics]::FromImage($image)
    $font = [System.Drawing.Font]::new('Microsoft YaHei', 12)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(222, 235, 237))
    try {
        $graphics.Clear([System.Drawing.Color]::FromArgb(29, 37, 40))
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        for ($i = 0; $i -lt $Items.Count; $i++) {
            $x = ($i % $Columns) * $Size
            $y = [Math]::Floor($i / $Columns) * ($Size + 32)
            $source = [System.Drawing.Image]::FromFile((Join-Path $outputDir $Items[$i][0]))
            try { $graphics.DrawImage($source, [int]$x, [int]$y, $Size, $Size) }
            finally { $source.Dispose() }
            $graphics.DrawString($Items[$i][1], $font, $brush, [single]($x + 12), [single]($y + $Size + 3))
        }
        $image.Save((Join-Path $outputDir $Name), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally { $brush.Dispose(); $font.Dispose(); $graphics.Dispose(); $image.Dispose() }
}

Write-Sheet 'comparison.png' @(
    @('before-profile.png', '原粗模 · 历史侧视'),
    @('folded-profile.png', '本轮结构预览 · 侧视'),
    @('before-front.png', '原粗模 · 历史展开'),
    @('display-front.png', '本轮结构预览 · 展开')
) 2 520

$stages = @(0, 0.5, 1, 1.5, 2, 2.5, 3)
$items = @()
foreach ($stage in $stages) { $items += ,@("stage-$stage.png", "阶段 $stage · 正面") }
foreach ($stage in $stages) { $items += ,@("stage-$stage-side.png", "阶段 $stage · 侧面") }
Write-Sheet 'stages.png' $items 7 230

Write-Sheet 'details.png' @(
    @('folded-back.png', '收拢 · 背面'),
    @('display-three.png', '展开 · 斜侧面'),
    @('display-back.png', '展开 · 背面'),
    @('breast-detail.png', '胸盾 · 羽片近景')
) 2 440

if (Test-Path (Join-Path $outputDir 'iteration-1/folded-profile.png')) {
    Write-Sheet 'iteration-comparison.png' @(
        @('iteration-1/folded-profile.png', '上一版 · 侧视'),
        @('folded-profile.png', '本轮 · 曲面布羽'),
        @('iteration-1/stage-1-side.png', '上一版 · 胸盾悬空'),
        @('stage-1-side.png', '本轮 · 羽根接入身体'),
        @('iteration-1/display-front.png', '上一版 · 展开'),
        @('display-front.png', '本轮 · 展开')
    ) 2 440
}
if (Test-Path (Join-Path $outputDir 'head-detail.png')) {
    Write-Sheet 'plumage-details.png' @(
        @('head-detail.png', '头颈 · 曲面短羽'),
        @('breast-detail.png', '胸盾 · 逐羽反光')
    ) 2 500
}
if (Test-Path (Join-Path $outputDir 'rest-three.png')) {
    Write-Sheet 'rest-views.png' @(
        @('rest-three.png', '常态 · 斜侧面'),
        @('rest-front.png', '常态 · 正面'),
        @('rest-side.png', '常态 · 侧面'),
        @('folded-back.png', '常态 · 背面')
    ) 2 440
}
if (Test-Path (Join-Path $outputDir 'iteration-2/folded-profile.png')) {
    Write-Sheet 'realism-comparison.png' @(
        @('iteration-2/folded-profile.png', '第二批 · 历史预览'),
        @('folded-profile.png', '当前 · 按用户三视图修正')
    ) 2 520
}
if (Test-Path (Join-Path $outputDir 'rest-side.png')) {
    Write-Sheet 'turnaround.png' @(
        @('rest-front.png', '正面 · 胸盾 / 蓝色冠羽'),
        @('rest-side.png', '侧面 · 胸腹 / 折翼 / 长尾'),
        @('folded-back.png', '背面 · 肩羽 / 覆羽 / 飞羽')
    ) 3 480
}
Write-Output "Preview sheets saved to $outputDir"
if (Test-Path (Join-Path $outputDir 'head-left.png')) {
    Write-Sheet 'head-views.png' @(
        @('head-left.png', '头部 · 侧面'),
        @('head-front.png', '头部 · 正面'),
        @('head-three.png', '头部 · 斜侧'),
        @('head-back.png', '头部 · 后侧')
    ) 2 440
}
if ((Test-Path (Join-Path $outputDir 'bill-before.png')) -and (Test-Path (Join-Path $outputDir 'bill-side.png'))) {
    Write-Sheet 'bill-comparison.png' @(
        @('bill-before.png', '修改前 · 直锥轮廓'),
        @('bill-side.png', '本轮 · 弧背 / 薄下喙 / 微下扣')
    ) 2 500
    Write-Sheet 'bill-views.png' @(
        @('bill-side.png', '喙形 · 严格侧视'),
        @('bill-three.png', '喙形 · 斜侧'),
        @('bill-front.png', '喙形 · 正面'),
        @('bill-top.png', '喙形 · 俯视')
    ) 2 440
}
if ((Test-Path (Join-Path $outputDir 'root-refine-before.png')) -and (Test-Path (Join-Path $outputDir 'root-refine-side.png'))) {
    Write-Sheet 'root-refine-comparison.png' @(
        @('root-refine-before.png', '修改前 · 上仰 / 喙根截口'),
        @('root-refine-side.png', '本轮 · 降低喙角 / 收顺接合')
    ) 2 500
    Write-Sheet 'root-refine-views.png' @(
        @('root-refine-side.png', '本轮 · 侧视'),
        @('root-refine-three.png', '本轮 · 斜侧'),
        @('root-refine-front.png', '本轮 · 正面'),
        @('root-refine-top.png', '本轮 · 俯视')
    ) 2 440
}
if ((Test-Path (Join-Path $outputDir 'neck-before.png')) -and (Test-Path (Join-Path $outputDir 'neck-side.png'))) {
    Write-Sheet 'neck-comparison.png' @(
        @('neck-before.png', '修改前 · 前颈内凹 / 胸羽外张'),
        @('neck-side.png', '本轮 · 饱满前颈 / 贴胸羽')
    ) 2 500
    Write-Sheet 'neck-views.png' @(
        @('neck-side.png', '前颈 · 侧视'),
        @('neck-three.png', '前颈 · 斜侧'),
        @('neck-front.png', '前颈 · 正面')
    ) 3 400
}
if ((Test-Path (Join-Path $outputDir 'chest-before.png')) -and (Test-Path (Join-Path $outputDir 'folded-chest-front.png'))) {
    Write-Sheet 'chest-fold-comparison.png' @(
        @('chest-before.png', '修改前 · 常态外张'),
        @('folded-chest-front.png', '本轮 · 常态收拢贴胸')
    ) 2 500
    Write-Sheet 'chest-states.png' @(
        @('folded-chest-three.png', '常态 · 贴胸'),
        @('chest-transition.png', '过渡 · 形态 0.5'),
        @('display-front.png', '求偶 · 展开')
    ) 3 400
}
