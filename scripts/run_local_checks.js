const assert = require('assert');
const ProfessionalIlotPlacer = require('../lib/professionalIlotPlacer');

function geometryChecks() {
    const fp = { bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } };
    const placer = new ProfessionalIlotPlacer(fp);

    const poly = [[10, 10], [20, 10], [20, 20], [10, 20]]; // square
    assert.strictEqual(placer.pointInPolygon([15, 15], poly), true);
    assert.strictEqual(placer.pointInPolygon([5, 5], poly), false);

    const rect1 = { x1: 12, y1: 12, x2: 18, y2: 18 };
    const rect2 = { x1: 0, y1: 0, x2: 9, y2: 9 };
    assert.strictEqual(placer.rectIntersectsPolygon(rect1, poly), true);
    assert.strictEqual(placer.rectIntersectsPolygon(rect2, poly), false);
    console.log('Geometry checks passed');
}

function placementChecks() {
    const floorPlan = {
        bounds: { minX: 0, minY: 0, maxX: 50, maxY: 50 },
        forbiddenZones: [{ polygon: [[10, 10], [15, 10], [15, 15], [10, 15]] }],
        entrances: [{ polygon: [[30, 0], [32, 0], [32, 2], [30, 2]] }]
    };

    const placer = new ProfessionalIlotPlacer(floorPlan, { minEntranceDistance: 2, minIlotDistance: 0.5, maxAttemptsPerIlot: 200 });
    const distribution = { '1-2': 5, '2-3': 3 };
    const ilots = placer.generateIlots(distribution, 8);

    for (const ilot of ilots) {
        const rect = { x1: ilot.x, y1: ilot.y, x2: ilot.x + ilot.width, y2: ilot.y + ilot.height };
        assert.strictEqual(placer.rectIntersectsPolygon(rect, floorPlan.forbiddenZones[0].polygon), false);
        assert.ok(placer.rectDistanceToPolygon(rect, floorPlan.entrances[0].polygon) >= placer.minEntranceDistance - 1e-6);
    }

    for (let i = 0; i < ilots.length; i++) {
        for (let j = i + 1; j < ilots.length; j++) {
            const a = { x1: ilots[i].x, y1: ilots[i].y, x2: ilots[i].x + ilots[i].width, y2: ilots[i].y + ilots[i].height };
            const b = { x1: ilots[j].x, y1: ilots[j].y, x2: ilots[j].x + ilots[j].width, y2: ilots[j].y + ilots[j].height };
            assert.strictEqual(placer.rectsCloserThan(a, b, placer.minIlotDistance), false);
        }
    }

    console.log('Placement checks passed');
}

try {
    geometryChecks();
    placementChecks();
    console.log('All local checks passed');
} catch (e) {
    console.error('Local checks failed:', e && e.message);
    process.exit(1);
}
