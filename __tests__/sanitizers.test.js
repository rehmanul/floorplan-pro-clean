const { sanitizeIlot, sanitizeCorridor, safePoint } = require('../lib/sanitizers');

describe('sanitizeIlot', () => {
    test('returns null for non-object', () => {
        expect(sanitizeIlot(null)).toBeNull();
        expect(sanitizeIlot(123)).toBeNull();
    });

    test('sanitizes object with x/y', () => {
        const i = { x: 10.5, y: -2 };
        const s = sanitizeIlot(i);
        expect(s).toMatchObject({ x: 10.5, y: -2 });
    });

    test('sanitizes object with center array', () => {
        const i = { center: [1, 2] };
        const s = sanitizeIlot(i);
        expect(s).toMatchObject({ x: 1, y: 2 });
    });

    test('returns null when missing coordinates', () => {
        expect(sanitizeIlot({})).toBeNull();
        expect(sanitizeIlot({ center: ['a', null] })).toBeNull();
    });
});

describe('sanitizeCorridor', () => {
    test('returns null for non-object', () => {
        expect(sanitizeCorridor(null)).toBeNull();
    });

    test('sanitizes corridor with path array', () => {
        const c = { path: [[0, 0], { x: 1, y: 1 }, [2, 2, 0]] };
        const s = sanitizeCorridor(c);
        expect(s).toHaveProperty('path');
        expect(Array.isArray(s.path)).toBe(true);
        expect(s.path.length).toBeGreaterThanOrEqual(2);
    });

    test('sanitizes bbox-like corridor', () => {
        const c = { x: 0, y: 0, width: 10, height: 5 };
        const s = sanitizeCorridor(c);
        expect(s).toMatchObject({ x: 0, y: 0, width: 10, height: 5 });
    });

    test('returns null for invalid polygon', () => {
        const c = { polygon: [[0, 0], [1, 'a']] };
        expect(sanitizeCorridor(c)).toBeNull();
    });
});
