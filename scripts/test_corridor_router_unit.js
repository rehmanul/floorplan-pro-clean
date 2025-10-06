const assert = require('assert');
const CorridorRouter = require('../lib/corridorRouter');

function approxPath(path) {
    if (!path) return null;
    return path.map(p => p.map(v => Math.round(v * 100) / 100));
}

function testStartGoalSnapping() {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const router = new CorridorRouter(bounds, 1);
    // big obstacle covers center
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
    router.markObstacle(square);

    // start & goal are within obstacle - snapped search should fail (no free cell)
    const path = router.findPath([1, 1], [9, 9]);
    assert.strictEqual(path, null, 'Path should be null when entire area is blocked');
    console.log('testStartGoalSnapping: PASSED');
}

function testNarrowChannelBlockedByPadding() {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const router = new CorridorRouter(bounds, 1);
    // Two blocks separated by 2 units gap; with padding 1 they should touch and block
    const left = [[0, 0], [4, 0], [4, 10], [0, 10]];
    const right = [[6, 0], [10, 0], [10, 10], [6, 10]];
    router.markObstacle(left, 0.0);
    router.markObstacle(right, 0.0);

    // route from left-top to right-bottom with no padding on obstacles: should be possible
    const direct = router.findPath([2, 1], [8, 9]);
    assert.ok(direct && direct.length > 0, 'Path should exist without padding');

    // now mark with padding 1 (inflate by 1) which should close the 2-unit gap
    const router2 = new CorridorRouter(bounds, 1);
    router2.markObstacle(left, 1.0);
    router2.markObstacle(right, 1.0);
    const blocked = router2.findPath([2, 1], [8, 9]);
    assert.strictEqual(blocked, null, 'Path should be blocked when padding closes gap');
    console.log('testNarrowChannelBlockedByPadding: PASSED');
}

function testDiagonalCornerCutPrevention() {
    const bounds = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
    const router = new CorridorRouter(bounds, 1);
    // Place two obstacles to form a diagonal choke such that moving diagonally would cut the corner
    // Block (1,0) and (0,1) but leave (1,1) free; diagonal move from (0,0) to (1,1) should be prevented
    const a = [[1, 0], [2, 0], [2, 1], [1, 1]]; // block cell (1,0)
    const b = [[0, 1], [1, 1], [1, 2], [0, 2]]; // block cell (0,1)
    router.markObstacle(a, 0); router.markObstacle(b, 0);

    const start = [0.5, 0.5];
    const goal = [1.5, 1.5];
    const path = router.findPath(start, goal);

    // If diagonal corner cutting were allowed, path would be direct with length 2 (start, goal).
    // With prevention, router should find a longer path or none if blocked.
    if (path) {
        // compute hop count
        assert.ok(path.length > 2, 'Diagonal corner cutting should be prevented; path should be longer than 2');
    }
    console.log('testDiagonalCornerCutPrevention: PASSED');
}

function runAll() {
    testStartGoalSnapping();
    testNarrowChannelBlockedByPadding();
    testDiagonalCornerCutPrevention();
    console.log('ALL corridor router unit tests PASSED');
}

runAll();
