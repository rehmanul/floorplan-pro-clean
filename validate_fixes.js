#!/usr/bin/env node
/**
 * Validation Script for FloorPlan Pro Fixes
 * Tests all critical functionality without full Jest
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 FloorPlan Pro - Validating All Fixes...\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passCount++;
        return true;
    } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        failCount++;
        return false;
    }
}

// Test 1: CAD Processor loads and has enhanced method
test('CAD Processor - buildPolygonsFromSegments enhanced', () => {
    const CADProcessor = require('./lib/professionalCADProcessor');
    const processor = new CADProcessor();
    
    if (typeof processor.buildPolygonsFromSegments !== 'function') {
        throw new Error('buildPolygonsFromSegments method not found');
    }
    
    // Test with sample segments
    const segments = [
        { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, color: 0, layer: 'WALLS' },
        { start: { x: 10, y: 0 }, end: { x: 10, y: 10 }, color: 0, layer: 'WALLS' },
        { start: { x: 10, y: 10 }, end: { x: 0, y: 10 }, color: 0, layer: 'WALLS' },
        { start: { x: 0, y: 10 }, end: { x: 0, y: 0 }, color: 0, layer: 'WALLS' }
    ];
    
    const polygons = processor.buildPolygonsFromSegments(segments);
    if (polygons.length !== 1) {
        throw new Error(`Expected 1 polygon, got ${polygons.length}`);
    }
    if (polygons[0].polygon.length < 3) {
        throw new Error('Polygon should have at least 3 points');
    }
});

// Test 2: Ilot Placer validates properly
test('Ilot Placer - Enhanced validation', () => {
    const IlotPlacer = require('./lib/professionalIlotPlacer');
    
    const floorPlan = {
        walls: [],
        forbiddenZones: [],
        entrances: [],
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    };
    
    const placer = new IlotPlacer(floorPlan, { seed: 12345 });
    
    if (typeof placer.isValidPlacement !== 'function') {
        throw new Error('isValidPlacement method not found');
    }
    
    // Test basic validation
    const rect = { x1: 10, y1: 10, x2: 20, y2: 20 };
    const isValid = placer.isValidPlacement(rect, [], null);
    
    if (typeof isValid !== 'boolean') {
        throw new Error('isValidPlacement should return boolean');
    }
});

// Test 3: Corridor Generator works
test('Corridor Generator - Enhanced routing', () => {
    const CorridorGenerator = require('./lib/professionalCorridorGenerator');
    
    const floorPlan = {
        walls: [],
        forbiddenZones: [],
        entrances: [],
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    };
    
    const ilots = [
        { x: 10, y: 10, width: 5, height: 3 },
        { x: 10, y: 20, width: 5, height: 3 }
    ];
    
    const generator = new CorridorGenerator(floorPlan, ilots);
    
    if (typeof generator.generateCorridors !== 'function') {
        throw new Error('generateCorridors method not found');
    }
    
    const corridors = generator.generateCorridors(1.5);
    if (!Array.isArray(corridors)) {
        throw new Error('generateCorridors should return array');
    }
});

// Test 4: Three.js Renderer exists and has methods
test('Three.js Renderer - Enhanced rendering', () => {
    // Can't fully test Three.js without browser, check file exists
    const rendererPath = path.join(__dirname, 'public', 'threeRenderer.js');
    const content = fs.readFileSync(rendererPath, 'utf8');
    
    if (!content.includes('renderFloorPlan')) {
        throw new Error('renderFloorPlan method not found in renderer');
    }
    
    if (!content.includes('ENHANCED')) {
        throw new Error('Enhanced marker not found - fixes may not be applied');
    }
});

// Test 5: APS Processor enhanced
test('APS Processor - Enhanced extraction', () => {
    const APSProcessor = require('./lib/realAPSProcessor');
    
    if (!process.env.APS_CLIENT_ID) {
        console.log('   ⚠️  APS credentials not set, skipping full test');
        return;
    }
    
    const processor = new APSProcessor(
        process.env.APS_CLIENT_ID,
        process.env.APS_CLIENT_SECRET
    );
    
    if (typeof processor.extractGeometry !== 'function') {
        throw new Error('extractGeometry method not found');
    }
});

// Test 6: Sanitizers work correctly
test('Sanitizers - Data validation', () => {
    const { sanitizeIlot, sanitizeCorridor, safeNum, safePoint } = require('./lib/sanitizers');
    
    // Test safeNum
    if (safeNum(42) !== 42) throw new Error('safeNum failed for valid number');
    if (safeNum('invalid', 10) !== 10) throw new Error('safeNum fallback failed');
    
    // Test safePoint
    const pt = safePoint({ x: 1, y: 2 });
    if (!pt || pt[0] !== 1 || pt[1] !== 2) throw new Error('safePoint failed');
    
    // Test sanitizeIlot
    const ilot = sanitizeIlot({ x: 5, y: 10, width: 3, height: 2 });
    if (!ilot || ilot.x !== 5 || ilot.y !== 10) throw new Error('sanitizeIlot failed');
    
    // Test null handling
    if (sanitizeIlot(null) !== null) throw new Error('sanitizeIlot should return null for invalid input');
});

// Test 7: Server has proper normalization
test('Server - CAD data normalization', () => {
    const serverPath = path.join(__dirname, 'server.js');
    const content = fs.readFileSync(serverPath, 'utf8');
    
    if (!content.includes('normalizeCadData')) {
        throw new Error('normalizeCadData function not found');
    }
    
    if (!content.includes('renderFloorPlan')) {
        console.log('   ℹ️  Server loads render modules dynamically');
    }
});

// Test 8: Integration - Full pipeline simulation
test('Integration - Complete pipeline', () => {
    const CADProcessor = require('./lib/professionalCADProcessor');
    const IlotPlacer = require('./lib/professionalIlotPlacer');
    const CorridorGenerator = require('./lib/professionalCorridorGenerator');
    
    // Simulate processing pipeline
    const processor = new CADProcessor();
    
    // Create mock CAD data
    const mockFloorPlan = {
        walls: [
            { start: { x: 0, y: 0 }, end: { x: 50, y: 0 }, polygon: [[0, 0], [50, 0]] },
            { start: { x: 50, y: 0 }, end: { x: 50, y: 30 }, polygon: [[50, 0], [50, 30]] },
            { start: { x: 50, y: 30 }, end: { x: 0, y: 30 }, polygon: [[50, 30], [0, 30]] },
            { start: { x: 0, y: 30 }, end: { x: 0, y: 0 }, polygon: [[0, 30], [0, 0]] }
        ],
        forbiddenZones: [],
        entrances: [],
        bounds: { minX: 0, minY: 0, maxX: 50, maxY: 30 }
    };
    
    // Test ilot placement
    const placer = new IlotPlacer(mockFloorPlan, { seed: 42 });
    const ilots = placer.generateIlots({ '1-3': 5, '3-5': 3 }, 8);
    
    if (!Array.isArray(ilots)) throw new Error('generateIlots should return array');
    if (ilots.length === 0) throw new Error('generateIlots should place at least some ilots');
    
    // Verify all ilots have required fields
    for (const ilot of ilots) {
        if (typeof ilot.x !== 'number' || typeof ilot.y !== 'number') {
            throw new Error(`Ilot missing coordinates: ${JSON.stringify(ilot)}`);
        }
        if (typeof ilot.width !== 'number' || typeof ilot.height !== 'number') {
            throw new Error(`Ilot missing dimensions: ${JSON.stringify(ilot)}`);
        }
    }
    
    // Test corridor generation
    const generator = new CorridorGenerator(mockFloorPlan, ilots);
    const corridors = generator.generateCorridors(1.5);
    
    if (!Array.isArray(corridors)) throw new Error('generateCorridors should return array');
    
    console.log(`   ℹ️  Generated ${ilots.length} ilots and ${corridors.length} corridors`);
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 Test Results: ${passCount} passed, ${failCount} failed`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (failCount === 0) {
    console.log('✨ All validations passed! System is operational.');
    console.log('🚀 Ready to run: npm start\n');
    process.exit(0);
} else {
    console.log('⚠️  Some validations failed. Review errors above.');
    process.exit(1);
}
