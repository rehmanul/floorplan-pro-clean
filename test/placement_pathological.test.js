const ProfessionalIlotPlacer = require('../lib/professionalIlotPlacer');

// A pathological tight box where ilots must be tightly packed without overlap
test('deterministic packing avoids overlaps in narrow bounds', () => {
    const floorPlan = {
        walls: [],
        forbiddenZones: [],
        entrances: [],
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 4 }
    };

    const placer = new ProfessionalIlotPlacer(floorPlan, { seed: 42, minIlotDistance: 0.1, maxAttemptsPerIlot: 200 });
    const placed = placer.generateIlots({ '0.5-1': 20 }, 20);

    // ensure no overlap pairwise
    for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
            const a = { x1: placed[i].x, y1: placed[i].y, x2: placed[i].x + placed[i].width, y2: placed[i].y + placed[i].height };
            const b = { x1: placed[j].x, y1: placed[j].y, x2: placed[j].x + placed[j].width, y2: placed[j].y + placed[j].height };
            const overlapX = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
            const overlapY = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
            expect(overlapX * overlapY).toBeLessThan(1e-6);
        }
    }

    // deterministic: running again with same seed should produce same count and positions
    const placer2 = new ProfessionalIlotPlacer(floorPlan, { seed: 42, minIlotDistance: 0.1, maxAttemptsPerIlot: 200 });
    const placed2 = placer2.generateIlots({ '0.5-1': 20 }, 20);
    expect(placed2.length).toBe(placed.length);
    for (let i = 0; i < placed.length; i++) {
        expect(Math.abs(placed[i].x - placed2[i].x)).toBeLessThan(1e-6);
        expect(Math.abs(placed[i].y - placed2[i].y)).toBeLessThan(1e-6);
    }
});
