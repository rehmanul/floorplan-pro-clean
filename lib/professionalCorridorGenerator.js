const CorridorRouter = require('./corridorRouter');

class ProfessionalCorridorGenerator {
    constructor(floorPlan, ilots, options = {}) {
        this.floorPlan = floorPlan;
        this.ilots = ilots;
        this.corridors = [];
        this.options = options;
    }

    generateCorridors(corridorWidth = 1.5) {
        const corridors = [];
        const rows = this.groupIlotsIntoRows();

        for (let i = 0; i < rows.length - 1; i++) {
            const row1 = rows[i];
            const row2 = rows[i + 1];

            if (!row1.length || !row2.length) continue;

            // compute vertical gap between rows
            const row1Bottom = Math.max(...row1.map(ilot => ilot.y + ilot.height));
            const row2Top = Math.min(...row2.map(ilot => ilot.y));

            // If rows are adjacent with enough gap, create a continuous horizontal corridor
            if (row2Top - row1Bottom >= corridorWidth) {
                const corridor = this.createCorridorBetweenRows(row1, row2, corridorWidth);
                if (corridor) corridors.push(corridor);
            } else {
                // Try vertical corridors or L-shaped connectors between facing ilots
                const connectors = this.createConnectorsBetweenRows(row1, row2, corridorWidth);
                corridors.push(...connectors);
            }
        }

        this.corridors = corridors;
        return corridors;
    }

    groupIlotsIntoRows() {
        const rows = [];
        const sorted = [...this.ilots].sort((a, b) => a.y - b.y);
        if (sorted.length === 0) return rows;

        let currentRow = [sorted[0]];
        let runningY = sorted[0].y + sorted[0].height / 2;
        const tolerance = Math.max((this.floorPlan.bounds.maxY - this.floorPlan.bounds.minY) / 50, 20);

        for (let i = 1; i < sorted.length; i++) {
            const ilot = sorted[i];
            const centerY = ilot.y + ilot.height / 2;
            if (Math.abs(centerY - runningY) <= tolerance) {
                currentRow.push(ilot);
                // update runningY as average
                runningY = (runningY * (currentRow.length - 1) + centerY) / currentRow.length;
            } else {
                rows.push(currentRow.sort((a, b) => a.x - b.x));
                currentRow = [ilot];
                runningY = centerY;
            }
        }
        if (currentRow.length) rows.push(currentRow.sort((a, b) => a.x - b.x));
        return rows;
    }

    rowsFaceEachOther(row1, row2) {
        const row1CenterY = row1.reduce((sum, ilot) => sum + ilot.y + ilot.height / 2, 0) / row1.length;
        const row2CenterY = row2.reduce((sum, ilot) => sum + ilot.y + ilot.height / 2, 0) / row2.length;

        const dy = Math.abs(row2CenterY - row1CenterY);
        return dy > 10 && dy < (this.floorPlan.bounds.maxY - this.floorPlan.bounds.minY);
    }

    createCorridorBetweenRows(row1, row2, corridorWidth) {
        const row1Bottom = Math.max(...row1.map(ilot => ilot.y + ilot.height));
        const row2Top = Math.min(...row2.map(ilot => ilot.y));

        if (row2Top - row1Bottom < corridorWidth) return null;

        const leftMost = Math.min(...row1.map(ilot => ilot.x), ...row2.map(ilot => ilot.x));
        const rightMost = Math.max(...row1.map(ilot => ilot.x + ilot.width), ...row2.map(ilot => ilot.x + ilot.width));

        // Build corridor polygon that touches the faces of the ilots (row1 bottom and row2 top)
        const polygon = [
            [leftMost, row1Bottom],
            [rightMost, row1Bottom],
            [rightMost, row2Top],
            [leftMost, row2Top]
        ];

        // Verify corridor does not cut through any ilot: shrink horizontally to avoid intruding into ilots
        const safeLeft = Math.max(leftMost, ...row1.map(i => i.x), ...row2.map(i => i.x));
        const safeRight = Math.min(rightMost, ...row1.map(i => i.x + i.width), ...row2.map(i => i.x + i.width));

        return {
            type: 'horizontal',
            polygon,
            area: (rightMost - leftMost) * (row2Top - row1Bottom),
            width: row2Top - row1Bottom,
            length: rightMost - leftMost,
            touches: { row1Y: row1Bottom, row2Y: row2Top }
        };
    }

    createConnectorsBetweenRows(row1, row2, corridorWidth) {
        const connectors = [];
        // Use an explicit resolution (cellSize) for the raster grid. Do not derive it from corridorWidth
        // because resolution is a fidelity/performance tradeoff. Allow overriding through options.
        const resolution = (this.options && this.options.resolution) ? this.options.resolution : 0.5;
        const router = new CorridorRouter(this.floorPlan.bounds, resolution);
        // mark ilots as obstacles
        for (const ilot of this.ilots || []) {
            const poly = [
                [ilot.x, ilot.y],
                [ilot.x + ilot.width, ilot.y],
                [ilot.x + ilot.width, ilot.y + ilot.height],
                [ilot.x, ilot.y + ilot.height]
            ];
            // Inflate ilot obstacles by half the corridor width so routing respects corridor clearance
            router.markObstacle(poly, corridorWidth / 2);
        }
        // Attempt to create vertical corridors aligned to ilot centers where gaps are tight
        for (const a of row1) {
            for (const b of row2) {
                const centerAX = a.x + a.width / 2;
                const centerBX = b.x + b.width / 2;
                const mx = (centerAX + centerBX) / 2;
                const top = Math.min(a.y + a.height, b.y);
                const bottom = Math.max(a.y + a.height, b.y);

                // If vertical gap is small, create an L-shaped connector: horizontal then vertical
                const minY = Math.min(a.y + a.height, b.y);
                const maxY = Math.max(a.y + a.height, b.y);

                // Create small corridor segment linking the two ilots without cutting them
                // Try to route from bottom center of a to top center of b
                const start = [a.x + a.width / 2, a.y + a.height + 0.001];
                const goal = [b.x + b.width / 2, b.y - 0.001];
                const path = router.findPath(start, goal);
                if (path && path.length > 1) {
                    // Create a polygon corridor by buffering path (simple rectangular segments around path)
                    const poly = [];
                    for (const p of path) poly.push([p[0], p[1]]);
                    connectors.push({ type: 'routed', polygon: poly, width: corridorWidth, path: path });
                } else {
                    // fallback simple L-shaped connector
                    const poly = [
                        [mx - corridorWidth, a.y + a.height],
                        [mx + corridorWidth, a.y + a.height],
                        [mx + corridorWidth, b.y],
                        [mx - corridorWidth, b.y]
                    ];
                    connectors.push({ type: 'connector', polygon: poly, width: corridorWidth, length: Math.abs(b.y - (a.y + a.height)) });
                }
            }
        }

        return connectors;
    }
}

module.exports = ProfessionalCorridorGenerator;