const ProfessionalIlotPlacer = require('../lib/professionalIlotPlacer');

test('pointInPolygon and rectIntersectsPolygon basic checks', () => {
    const fp = { bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } };
    const placer = new ProfessionalIlotPlacer(fp);

    const poly = [[10, 10], [20, 10], [20, 20], [10, 20]]; // square
    expect(placer.pointInPolygon([15, 15], poly)).toBe(true);
    expect(placer.pointInPolygon([5, 5], poly)).toBe(false);

    const rect1 = { x1: 12, y1: 12, x2: 18, y2: 18 };
    const rect2 = { x1: 0, y1: 0, x2: 9, y2: 9 };
    expect(placer.rectIntersectsPolygon(rect1, poly)).toBe(true);
    expect(placer.rectIntersectsPolygon(rect2, poly)).toBe(false);
});
