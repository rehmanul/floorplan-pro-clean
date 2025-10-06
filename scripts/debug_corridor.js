const CorridorRouter = require('../lib/corridorRouter');

function runDebug() {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const router = new CorridorRouter(bounds, 1);

    const square = [[4, 4], [6, 4], [6, 6], [4, 6]];
    router.markObstacle(square);

    console.log('Grid (rows x cols =', router.rows, 'x', router.cols, ')');
    for (let r = 0; r < router.rows; r++) {
        let line = '';
        for (let c = 0; c < router.cols; c++) {
            line += router.grid[r][c] ? '#' : '.';
        }
        console.log(line);
    }

    const start = [1, 1];
    const goal = [9, 9];
    const path = router.findPath(start, goal);
    console.log('Path result:', path);
}

runDebug();
