const CorridorRouter = require('../lib/corridorRouter');

function runTest() {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const router = new CorridorRouter(bounds, 1);

    // mark an obstacle in the middle
    const square = [[4, 4], [6, 4], [6, 6], [4, 6]];
    router.markObstacle(square);

    const start = [1, 1];
    const goal = [9, 9];

    const path = router.findPath(start, goal);
    if (!path) {
        console.error('No path found');
        process.exit(1);
    }
    console.log('Path length:', path.length);
    console.log(path.slice(0, 5));
}

runTest();
