const { safeNum, safePoint } = require('../lib/overlayHelpers');

describe('overlayHelpers.safeNum', () => {
    test('returns numeric value for numbers', () => {
        expect(safeNum(2.5)).toBe(2.5);
        expect(safeNum(-1)).toBe(-1);
    });

    test('extracts number from array', () => {
        expect(safeNum([3, 4])).toBe(3);
    });

    test('falls back to default', () => {
        expect(safeNum(null, 7)).toBe(7);
        expect(safeNum('a', 5)).toBe(5);
    });
});

describe('overlayHelpers.safePoint', () => {
    test('parses array points', () => {
        expect(safePoint([1, 2])).toEqual([1, 2, 0]);
    });

    test('parses object points', () => {
        expect(safePoint({ x: 5, y: 6, z: 1 })).toEqual([5, 6, 1]);
    });

    test('returns null for invalid', () => {
        expect(safePoint(null)).toBeNull();
        expect(safePoint({})).toBeNull();
    });
});
