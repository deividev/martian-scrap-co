# Planning-package validation only. ASCII source; Windows PowerShell 5.1 compatible.
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$rootPrefix = $root + [System.IO.Path]::DirectorySeparatorChar
$failures = New-Object 'System.Collections.Generic.List[string]'
$texts = @{}
$requiredDocs = @(
    '01-product-requirements.md',
    '02-visual-art-direction.md',
    '03-technical-stack-architecture.md',
    '04-phased-agent-task-plan.md'
)
$requiredRoots = @('AGENT.md', 'AGENTS.md', 'CLAUDE.md')
$requiredPngs = @(
    'scrap-magnet-mars-gameplay-concept.png',
    'scrap-magnet-mars-character-concepts.png',
    'mars-scrapyard-ui-concept-v1.png',
    'scrap-magnet-mars-character-silhouettes-v2.png',
    'scrap-magnet-industrial-stylized.png',
    'scrap-magnet-industrial-detailed.png'
)
$requiredPrompts = @(
    'scrap-magnet-mars-image-prompts.md',
    'mars-scrapyard-ui-concept-v1-prompt.md',
    'scrap-magnet-mars-character-silhouettes-v2-prompt.md'
)


# Exact archived data exceptions only; authored Markdown remains fully checked.
$rawReferenceNames = @('online-coop.txt', 'steam-voice-steps.md', 'TRAILER_CAPTURE_INSTRUCTIONS.md', 'marketing.txt')
$rawReferencePaths = @($rawReferenceNames | ForEach-Object { Join-Path $root ('references/' + $_) })
$contextRoutes = @{
    'online-coop.txt' = @('MSC-003', 'MSC-004', 'MSC-006', 'MSC-007', 'MSC-021', 'MSC-022', 'MSC-023', 'MSC-024', 'MSC-025', 'MSC-026', 'MSC-027', 'MSC-028', 'MSC-029', 'MSC-030', 'MSC-036', 'MSC-091', 'MSC-092', 'MSC-093', 'MSC-114', 'MSC-081', 'MSC-086', 'MSC-089', 'MSC-094', 'MSC-095', 'MSC-096', 'MSC-097', 'MSC-118', 'MSC-103', 'MSC-107', 'MSC-108', 'MSC-109', 'MSC-112', 'MSC-113', 'MSC-115', 'MSC-119')
    'steam-voice-steps.md' = @('MSC-003', 'MSC-004', 'MSC-010', 'MSC-025', 'MSC-026', 'MSC-027', 'MSC-083', 'MSC-084', 'MSC-085', 'MSC-086', 'MSC-088', 'MSC-089', 'MSC-094', 'MSC-095', 'MSC-103', 'MSC-107', 'MSC-108', 'MSC-109', 'MSC-112', 'MSC-113', 'MSC-116')
    'TRAILER_CAPTURE_INSTRUCTIONS.md' = @('MSC-019', 'MSC-113', 'MSC-115', 'MSC-116', 'MSC-119')
    'marketing.txt' = @('MSC-010', 'MSC-040', 'MSC-100', 'MSC-110', 'MSC-115', 'MSC-116', 'MSC-118', 'MSC-119', 'MSC-120')
}

function Assert-NonemptyFile {
    param([string]$RelativePath)
    $path = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $failures.Add('Missing file: ' + $RelativePath)
        return
    }
    if ((Get-Item -LiteralPath $path).Length -eq 0) { $failures.Add('Empty file: ' + $RelativePath) }
}

function Assert-LocalTarget {
    param([string]$Target, [string]$Source)
    $targetValue = [System.Net.WebUtility]::HtmlDecode($Target.Trim())
    if ($targetValue -match '^(https?://|mailto:|#)') { return }
    if ($targetValue.StartsWith('<') -and $targetValue.EndsWith('>')) {
        $targetValue = $targetValue.Substring(1, $targetValue.Length - 2)
    }
    $targetValue = ($targetValue -split '#', 2)[0]
    if ([string]::IsNullOrWhiteSpace($targetValue)) { return }
    $targetValue = [uri]::UnescapeDataString($targetValue)
    if ([System.IO.Path]::IsPathRooted($targetValue) -or $targetValue -match '^[a-zA-Z][a-zA-Z0-9+.-]*:') {
        $failures.Add('Nonportable or unsupported local target in ' + $Source + ': ' + $Target)
        return
    }
    try {
        $full = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetDirectoryName($Source)) $targetValue))
        if (-not $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            $failures.Add('Target escapes package in ' + $Source + ': ' + $Target)
            return
        }
        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { $failures.Add('Broken link in ' + $Source + ': ' + $Target) }
    }
    catch { $failures.Add('Invalid target in ' + $Source + ': ' + $Target) }
}

foreach ($name in $requiredRoots) { Assert-NonemptyFile $name }
foreach ($name in $requiredDocs) { Assert-NonemptyFile ('docs/' + $name) }
foreach ($name in $requiredPngs) { Assert-NonemptyFile ('references/' + $name) }
foreach ($name in $requiredPrompts) { Assert-NonemptyFile ('references/' + $name) }
foreach ($name in $rawReferenceNames) { Assert-NonemptyFile ('references/' + $name) }

$markdownFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.md')
foreach ($file in $markdownFiles) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    if ($rawReferencePaths -contains $file.FullName) { continue }
    $texts[$file.FullName] = $content
    if ([string]::IsNullOrWhiteSpace($content)) { $failures.Add('Whitespace-only Markdown: ' + $file.Name) }
    if ($content -match '(?i)[a-z]:[/\\]Users[/\\][^\r\n]*Documents[/\\]Codex[/\\]' -or $content -match '(?i)\.codex[/\\]generated_images[/\\]') {
        $failures.Add('Old external source dependency remains in Markdown: ' + $file.Name)
    }
    # Fenced code is planned-path/example data, not an actionable Markdown link.
    $prose = [regex]::Replace($content, '(?ms)^```[^\r\n]*\r?\n.*?^```\s*$', '')
    foreach ($match in [regex]::Matches($prose, '!?\[[^\]\r\n]*\]\(([^)\r\n]+)\)')) {
        Assert-LocalTarget $match.Groups[1].Value $file.FullName
    }
    foreach ($match in [regex]::Matches($prose, '(?m)^\[[^\]]+\]:\s*(\S+)')) {
        Assert-LocalTarget $match.Groups[1].Value $file.FullName
    }
    foreach ($match in [regex]::Matches($prose, '(?i)<(?:img|a)\b[^>]*?(?:src|href)\s*=\s*["'']([^"'']+)["'']')) {
        Assert-LocalTarget $match.Groups[1].Value $file.FullName
    }
    foreach ($match in [regex]::Matches($prose, '(?m)^@([^\s]+)\s*$')) {
        Assert-LocalTarget $match.Groups[1].Value $file.FullName
    }
}

foreach ($rootName in $requiredRoots) {
    $rootPath = Join-Path $root $rootName
    if (-not $texts.ContainsKey($rootPath)) { continue }
    $text = $texts[$rootPath]
    foreach ($name in $requiredDocs) {
        if (-not $text.Contains('](docs/' + $name + ')')) { $failures.Add('Missing direct document map link in ' + $rootName + ': ' + $name) }
    }
}
$agentsPath = Join-Path $root 'AGENTS.md'
if ($texts.ContainsKey($agentsPath) -and -not $texts[$agentsPath].Contains('](AGENT.md)')) {
    $failures.Add('AGENTS.md must link to canonical AGENT.md.')
}
$claudePath = Join-Path $root 'CLAUDE.md'
if ($texts.ContainsKey($claudePath)) {
    $claudeProse = [regex]::Replace($texts[$claudePath], '(?ms)^```[^\r\n]*\r?\n.*?^```\s*$', '')
    if ([regex]::Matches($claudeProse, '(?m)^@AGENT\.md\s*$').Count -ne 1) { $failures.Add('CLAUDE.md must contain exactly one standalone @AGENT.md import outside fences.') }
}

$expectedHeadings = @(
    '# Martian Scrap Co. \u2014 Product Requirements',
    '# Martian Scrap Co. \u2014 Visual Art Direction',
    '# Martian Scrap Co. \u2014 Technical Stack and Architecture',
    '# Martian Scrap Co. \u2014 Phased Agent Task Plan'
)
for ($i = 0; $i -lt $requiredDocs.Count; $i++) {
    $path = Join-Path $root ('docs/' + $requiredDocs[$i])
    if (-not $texts.ContainsKey($path)) { continue }
    # The source planning headings intentionally use the established punctuation.
    $pattern = '^' + $expectedHeadings[$i].Replace('Co.', 'Co\.') + '\r?$'
    if (-not [regex]::IsMatch($texts[$path], $pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)) {
        $failures.Add('Unexpected planning document H1: ' + $requiredDocs[$i])
    }
}

$taskBodies = @{}
$taskCount = 0
$phaseCount = 0
$planPath = Join-Path $root 'docs/04-phased-agent-task-plan.md'
if ($texts.ContainsKey($planPath)) {
    $plan = $texts[$planPath]
    $tasks = [regex]::Matches($plan, '(?m)^### (MSC-\d{3}) \u2014 .+$')
    $taskCount = $tasks.Count
    $phaseCount = [regex]::Matches($plan, '(?m)^## Phase \d+ \u2014 ').Count
    $seen = @{}
    for ($i = 0; $i -lt $tasks.Count; $i++) {
        $id = $tasks[$i].Groups[1].Value
        if ($seen.ContainsKey($id)) { $failures.Add('Duplicate task ID: ' + $id) }
        if ($id -cne ('MSC-{0:D3}' -f ($i + 1))) { $failures.Add('Nonsequential task ID: ' + $id) }
        $seen[$id] = $i
    }
    for ($i = 0; $i -lt $tasks.Count; $i++) {
        $id = $tasks[$i].Groups[1].Value
        $start = $tasks[$i].Index + $tasks[$i].Length
        $end = if ($i + 1 -lt $tasks.Count) { $tasks[$i + 1].Index } else { $plan.Length }
        $body = $plan.Substring($start, $end - $start)
        $taskBodies[$id] = $body
        foreach ($field in @('Depends on', 'Output', 'Acceptance', 'Check', 'Status')) {
            if ([regex]::Matches($body, '(?m)^' + [regex]::Escape($field) + ':\s*(\S[^\r\n]*)\r?$').Count -ne 1) {
                $failures.Add($id + ': expected one nonempty ' + $field + ' field')
            }
        }
        $status = [regex]::Match($body, '(?m)^Status:\s*([^\r\n]+)\r?$').Groups[1].Value.Trim()
        if (@('Planned', 'In progress', 'Blocked', 'Done') -cnotcontains $status) { $failures.Add($id + ': unknown status ' + $status) }
        if ($status -in @('Done', 'Blocked') -and [regex]::Matches($body, '(?m)^Outcome:\s*\S').Count -ne 1) {
            $failures.Add($id + ': ' + $status + ' requires one nonempty Outcome field')
        }
        $deps = [regex]::Match($body, '(?m)^Depends on:\s*([^\r\n]+)\r?$').Groups[1].Value.Trim()
        if ($deps -eq 'none') { continue }
        foreach ($depValue in ($deps -split ',')) {
            $dep = $depValue.Trim()
            if ($dep -notmatch '^MSC-\d{3}$') { $failures.Add($id + ': invalid dependency ' + $dep); continue }
            if (-not $seen.ContainsKey($dep)) { $failures.Add($id + ': missing dependency ' + $dep); continue }
            if ($seen[$dep] -ge $i) { $failures.Add($id + ': dependency is not earlier: ' + $dep) }
        }
    }
}

# Verify direct links from every entry point and planning document to all supplied guides.
foreach ($name in $requiredRoots) {
    $path = Join-Path $root $name
    if (-not $texts.ContainsKey($path)) { continue }
    foreach ($guide in $rawReferenceNames) {
        if (-not $texts[$path].Contains('](references/' + $guide + ')')) {
            $failures.Add('Missing supplied-context link in ' + $name + ': ' + $guide)
        }
    }
}
foreach ($name in $requiredDocs) {
    $path = Join-Path $root ('docs/' + $name)
    if (-not $texts.ContainsKey($path)) { continue }
    foreach ($guide in $rawReferenceNames) {
        if (-not $texts[$path].Contains('](../references/' + $guide + ')')) {
            $failures.Add('Missing planning-context link in ' + $name + ': ' + $guide)
        }
    }
}
$agentPath = Join-Path $root 'AGENT.md'
if ($texts.ContainsKey($agentPath)) {
    foreach ($marker in @('Implementation-context routing', 'Context used', 'Deviations', 'V0', 'V1', 'MSC-088', 'NOT YET APPROVED')) {
        if (-not $texts[$agentPath].Contains($marker)) { $failures.Add('Missing canonical context/gate marker: ' + $marker) }
    }
}
if ($texts.ContainsKey($claudePath)) {
    $imports = [regex]::Matches($claudeProse, '(?m)^@[^\s]+\s*$')
    if ($imports.Count -ne 1) { $failures.Add('CLAUDE.md may import only canonical AGENT.md, not long guides or the roadmap.') }
}
foreach ($guide in $contextRoutes.Keys) {
    foreach ($id in $contextRoutes[$guide]) {
        if (-not $taskBodies.ContainsKey($id)) { $failures.Add('Missing context-routed task: ' + $id); continue }
        $contextMatches = [regex]::Matches($taskBodies[$id], '(?m)^Context:\s*(\S[^\r\n]*)\r?$')
        if ($contextMatches.Count -ne 1) { $failures.Add($id + ': expected one nonempty Context field'); continue }
        if (-not $contextMatches[0].Groups[1].Value.Contains('](../references/' + $guide + ')')) {
            $failures.Add($id + ': missing required guide in Context: ' + $guide)
        }
    }
}
$gateMarkers = @{
    'MSC-003' = @('V0', 'approval or deferral')
    'MSC-010' = @('V0', 'V1')
    'MSC-025' = @('V1', 'format/framing')
    'MSC-026' = @('CONDITIONAL', 'V0')
    'MSC-027' = @('V1', 'bidirectional')
    'MSC-088' = @('CONDITIONAL', 'V0', 'V1', 'no recording by default')
    'MSC-115' = @('human voice', 'separately consented')
}
foreach ($id in $gateMarkers.Keys) {
    if (-not $taskBodies.ContainsKey($id)) { continue }
    foreach ($marker in $gateMarkers[$id]) {
        if (-not $taskBodies[$id].Contains($marker)) { $failures.Add($id + ': missing conditional/privacy gate marker ' + $marker) }
    }
}

if ($taskCount -ne 120) { $failures.Add('Expected exactly 120 tasks; found ' + $taskCount) }
if ($phaseCount -ne 12) { $failures.Add('Expected exactly 12 phases; found ' + $phaseCount) }
$pngCount = @(Get-ChildItem -LiteralPath (Join-Path $root 'references') -File -Filter '*.png').Count
if ($pngCount -ne 6) { $failures.Add('Expected six PNG references; found ' + $pngCount) }

Write-Output ('ROOT: ' + $root)
Write-Output ('MARKDOWN FILES: ' + $markdownFiles.Count)
Write-Output ('AUTHORED MARKDOWN CHECKED: ' + $texts.Count)
Write-Output ('RAW SUPPLIED GUIDES: ' + $rawReferenceNames.Count)
Write-Output ('CONTEXT-ROUTED TASKS: ' + @($contextRoutes.Values | ForEach-Object { $_ } | Select-Object -Unique).Count)
Write-Output ('PNG REFERENCES: ' + $pngCount)
Write-Output ('TASKS: ' + $taskCount)
Write-Output ('PHASES: ' + $phaseCount)
Write-Output ('FAILURES: ' + $failures.Count)
foreach ($failure in $failures) { Write-Output ('FAIL: ' + $failure) }
if ($failures.Count -gt 0) { exit 1 }
Write-Output 'PASS: authored links/import, four archived guides, context routes/conditional gates, tasks/dependencies and tracked statuses.'
exit 0
