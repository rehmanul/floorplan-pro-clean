const ProfessionalIlotPlacer = require('../lib/professionalIlotPlacer');

test('placements avoid forbidden zones and entrances', () => {
    const floorPlan = {
        bounds: { minX: 0, minY: 0, maxX: 50, maxY: 50 },
        forbiddenZones: [{ polygon: [[10, 10], [15, 10], [15, 15], [10, 15]] }],
        entrances: [{ polygon: [[30, 0], [32, 0], [32, 2], [30, 2]] }]
    };

    const placer = new ProfessionalIlotPlacer(floorPlan, { minEntranceDistance: 2, minIlotDistance: 0.5, maxAttemptsPerIlot: 200 });
    const distribution = { '1-2': 5, '2-3': 3 };
    const ilots = placer.generateIlots(distribution, 8);

    // none should intersect forbidden zone
    for (const ilot of ilots) {
        const rect = { x1: ilot.x, y1: ilot.y, x2: ilot.x + ilot.width, y2: ilot.y + ilot.height };
        expect(placer.rectIntersectsPolygon(rect, floorPlan.forbiddenZones[0].polygon)).toBe(false);
        // entrance distance
        expect(placer.rectDistanceToPolygon(rect, floorPlan.entrances[0].polygon)).toBeGreaterThanOrEqual(0);
        expect(placer.rectDistanceToPolygon(rect, floorPlan.entrances[0].polygon)).toBeGreaterThanOrEqual(placer.minEntranceDistance - 1e-6);
    }

    // Check no overlaps (simple pairwise check)
    for (let i = 0; i < ilots.length; i++) {
        for (let j = i + 1; j < ilots.length; j++) {
            const a = { x1: ilots[i].x, y1: ilots[i].y, x2: ilots[i].x + ilots[i].width, y2: ilots[i].y + ilots[i].height };
            const b = { x1: ilots[j].x, y1: ilots[j].y, x2: ilots[j].x + ilots[j].width, y2: ilots[j].y + ilots[j].height };
            expect(placer.rectsCloserThan(a, b, placer.minIlotDistance)).toBe(false);
        }
    }
});
