<?php
/**
 * Regex-based database compiler for GRT databases.
 * Parses XML files without requiring SimpleXMLElement.
 */

$dbPath = dirname(__DIR__) . '/grt_databases';
$outputFile = __DIR__ . '/grt_db.json';

$database = [
    'calibers' => [],
    'projectiles' => [],
    'powders' => [],
    'loads' => []
];

// Helper to parse a single GRT XML file using regex
function parseGrtXmlRegex($filePath) {
    if (!file_exists($filePath)) {
        return null;
    }
    $content = file_get_contents($filePath);
    $data = [];
    
    // Match either <var name="..." value="..." /> or <input name="..." value="..." />
    preg_match_all('/<(?:var|input)\s+name=[\'"]([^\'"]+)[\'"]\s+value=[\'"]([^\'"]*)[\'"]/', $content, $matches);
    
    if (!empty($matches[1])) {
        for ($i = 0; $i < count($matches[1]); $i++) {
            $name = $matches[1][$i];
            $val = urldecode($matches[2][$i]);
            $data[$name] = $val;
        }
    }
    
    return $data;
}

// Helper to parse nested .grtload XML files using regex
function parseGrtLoadRegex($filePath) {
    if (!file_exists($filePath)) {
        return null;
    }
    $content = file_get_contents($filePath);
    
    $loadData = [
        'name' => basename($filePath, '.grtload'),
        'caliber' => [],
        'gun' => [],
        'projectile' => [],
        'propellant' => []
    ];
    
    // Find each section: caliber, gun, projectile, propellant
    foreach (['caliber', 'gun', 'projectile', 'propellant'] as $section) {
        if (preg_match('/<' . $section . '>([\s\S]*?)<\/' . $section . '>/', $content, $matches)) {
            $sectionContent = $matches[1];
            preg_match_all('/<input\s+name=[\'"]([^\'"]+)[\'"]\s+value=[\'"]([^\'"]*)[\'"]/', $sectionContent, $inputs);
            if (!empty($inputs[1])) {
                for ($i = 0; $i < count($inputs[1]); $i++) {
                    $name = $inputs[1][$i];
                    $val = urldecode($inputs[2][$i]);
                    $loadData[$section][$name] = $val;
                }
            }
        }
    }
    
    return $loadData;
}

// 1. Scan calibers
$calibersDir = $dbPath . '/calibers';
if (is_dir($calibersDir)) {
    foreach (glob($calibersDir . '/*.caliber') as $file) {
        $parsed = parseGrtXmlRegex($file);
        if (!empty($parsed)) {
            $database['calibers'][] = $parsed;
        }
    }
}
// Include the template caliber in the root of grt_databases
$rootCaliber = $dbPath . '/template_9 mm Luger (9 mm Para(bellum), 9 x 19 (mm)).caliber';
if (file_exists($rootCaliber)) {
    $parsed = parseGrtXmlRegex($rootCaliber);
    if (!empty($parsed)) {
        $database['calibers'][] = $parsed;
    }
}

// 2. Scan projectiles
$projectilesDir = $dbPath . '/projectiles';
if (is_dir($projectilesDir)) {
    foreach (glob($projectilesDir . '/*.projectile') as $file) {
        $parsed = parseGrtXmlRegex($file);
        if (!empty($parsed)) {
            $database['projectiles'][] = $parsed;
        }
    }
}

// 3. Scan powders
$powdersDir = $dbPath . '/powders';
if (is_dir($powdersDir)) {
    foreach (glob($powdersDir . '/*.propellant') as $file) {
        $parsed = parseGrtXmlRegex($file);
        if (!empty($parsed)) {
            $database['powders'][] = $parsed;
        }
    }
}

// 4. Scan loads
$loadsDir = $dbPath . '/loads';
if (is_dir($loadsDir)) {
    foreach (glob($loadsDir . '/*.grtload') as $file) {
        $parsed = parseGrtLoadRegex($file);
        if (!empty($parsed['caliber']) || !empty($parsed['projectile']) || !empty($parsed['propellant'])) {
            $database['loads'][] = $parsed;
        }
    }
}

// Write consolidated database as minified JSON
$json = json_encode($database, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    die("JSON encoding failed: " . json_last_error_msg() . "\n");
}

file_put_contents($outputFile, $json);
echo "Database compiled successfully via regex to $outputFile. Counts:\n";
echo "  Calibers: " . count($database['calibers']) . "\n";
echo "  Projectiles: " . count($database['projectiles']) . "\n";
echo "  Powders: " . count($database['powders']) . "\n";
echo "  Loads: " . count($database['loads']) . "\n";
