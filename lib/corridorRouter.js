class CorridorRouter {
    constructor(bounds, cellSize = 1) {
        this.bounds = bounds;
        this.cellSize = cellSize;
        this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize));
        this.rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cellSize));
        this.grid = new Array(this.rows).fill(0).map(() => new Array(this.cols).fill(0));
    }

    _toCell(x, y) {
        const col = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.bounds.minX) / this.cellSize)));
        const row = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.bounds.minY) / this.cellSize)));
        return { col, row };
    }

    // Mark a polygon as an obstacle. Optional padding (in world units) inflates the polygon
    // to account for corridor width / clearance. This implementation marks grid cells whose
    // centers are inside the polygon or within `padding` distance to any polygon edge.
    markObstacle(polygon, padding = 0) {
        if (!polygon || polygon.length < 3) return;
        // Rasterize polygon into occupied cells (bounding box fill + point-in-polygon + edge distance check)
        const minX = Math.min(...polygon.map(p => p[0]));
        const maxX = Math.max(...polygon.map(p => p[0]));
        const minY = Math.min(...polygon.map(p => p[1]));
        const maxY = Math.max(...polygon.map(p => p[1]));

        // Expand bounds by padding
        const pad = Math.max(0, padding || 0);
        const cellMin = this._toCell(minX - pad, minY - pad);
        const cellMax = this._toCell(maxX + pad, maxY + pad);

        const padSq = pad * pad;

        for (let r = cellMin.row; r <= cellMax.row; r++) {
            for (let c = cellMin.col; c <= cellMax.col; c++) {
                const cx = this.bounds.minX + (c + 0.5) * this.cellSize;
                const cy = this.bounds.minY + (r + 0.5) * this.cellSize;
                const pt = [cx, cy];
                if (this._pointInPolygon(pt, polygon)) {
                    this.grid[r][c] = 1;
                    continue;
                }
                if (pad > 0) {
                    // check distance to polygon edges
                    for (let i = 0; i < polygon.length; i++) {
                        const a = polygon[i];
                        const b = polygon[(i + 1) % polygon.length];
                        const d2 = this._pointSegmentDistanceSq(pt, a, b);
                        if (d2 <= padSq) { this.grid[r][c] = 1; break; }
                    }
                }
            }
        }
    }

    _pointSegmentDistanceSq(p, a, b) {
        // squared distance from point p to segment ab
        const x = p[0], y = p[1];
        const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1];
        const dx = x2 - x1, dy = y2 - y1;
        if (dx === 0 && dy === 0) {
            const ddx = x - x1, ddy = y - y1; return ddx * ddx + ddy * ddy;
        }
        const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
        const tt = Math.max(0, Math.min(1, t));
        const px = x1 + tt * dx, py = y1 + tt * dy;
        const rx = x - px, ry = y - py; return rx * rx + ry * ry;
    }

    _pointInPolygon(point, polygon) {
        const x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    findPath(start, goal) {
        // A* on grid, 8-neighbors, prevents diagonal corner-cutting and supports optional padding/corridorWidth
        const startCell = this._toCell(start[0], start[1]);
        const goalCell = this._toCell(goal[0], goal[1]);
        const cols = this.cols, rows = this.rows;
        const grid = this.grid;

        // helper to find nearest free cell (including the cell itself)
        const findNearestFree = (r0, c0, maxRadius = 3) => {
            if (r0 < 0 || r0 >= rows || c0 < 0 || c0 >= cols) return null;
            if (grid[r0][c0] === 0) return { row: r0, col: c0 };
            for (let radius = 1; radius <= maxRadius; radius++) {
                for (let dr = -radius; dr <= radius; dr++) {
                    for (let dc = -radius; dc <= radius; dc++) {
                        const r = r0 + dr, c = c0 + dc;
                        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
                        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue; // perimeter only
                        if (grid[r][c] === 0) return { row: r, col: c };
                    }
                }
            }
            return null;
        };

        // If start or goal are inside obstacles, try to snap them to the nearest free cell.
        const safeGridAccess = (r, c) => {
            if (r == null || c == null) return 1; // treat out-of-range as obstacle
            if (r < 0 || r >= rows || c < 0 || c >= cols) return 1;
            return grid[r][c];
        };

        if (safeGridAccess(startCell.row, startCell.col) === 1) {
            const snap = findNearestFree(startCell.row, startCell.col, 5);
            if (!snap) return null;
            startCell.row = snap.row; startCell.col = snap.col;
        }
        if (safeGridAccess(goalCell.row, goalCell.col) === 1) {
            const snap = findNearestFree(goalCell.row, goalCell.col, 5);
            if (!snap) return null;
            goalCell.row = snap.row; goalCell.col = snap.col;
        }

        const inBounds = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
        const key = (r, c) => `${r}_${c}`;
        const h = (r, c) => Math.hypot(r - goalCell.row, c - goalCell.col);

        // Min-heap for the open set (binary heap)
        class MinHeap {
            constructor() { this.items = []; }
            push(node) {
                this.items.push(node); let i = this.items.length - 1;
                while (i > 0) {
                    const p = Math.floor((i - 1) / 2);
                    if (this.items[p].f <= this.items[i].f) break;
                    [this.items[p], this.items[i]] = [this.items[i], this.items[p]]; i = p;
                }
            }
            pop() {
                if (!this.items.length) return null;
                const root = this.items[0];
                const last = this.items.pop();
                if (this.items.length) {
                    this.items[0] = last; let i = 0; while (true) {
                        const l = 2 * i + 1, r = 2 * i + 2; let smallest = i;
                        if (l < this.items.length && this.items[l].f < this.items[smallest].f) smallest = l;
                        if (r < this.items.length && this.items[r].f < this.items[smallest].f) smallest = r;
                        if (smallest === i) break;[this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]]; i = smallest;
                    }
                }
                return root;
            }
            size() { return this.items.length; }
        }

        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        const openHeap = new MinHeap();
        const openSet = new Set();
        const closed = new Set();

        const startKey = key(startCell.row, startCell.col);
        gScore.set(startKey, 0);
        fScore.set(startKey, h(startCell.row, startCell.col));
        openHeap.push({ r: startCell.row, c: startCell.col, f: fScore.get(startKey), k: startKey });
        openSet.add(startKey);

        const DEBUG = !!process.env.CORRIDOR_DEBUG;
        let iter = 0;
        if (DEBUG) {
            console.log('corridorRouter: start', { startCell, goalCell, rows, cols });
            // print a small ascii grid around start/goal for quick inspection
            const preview = [];
            for (let r = 0; r < rows; r++) {
                let line = '';
                for (let c = 0; c < cols; c++) line += (grid[r][c] ? '#' : '.');
                preview.push(line);
            }
            console.log(preview.join('\n'));
            console.log('gScore keys at start:', Array.from(gScore.keys()));
            console.log('fScore keys at start:', Array.from(fScore.keys()));
            console.log('startKey:', startKey, 'gScore.has(startKey)=', gScore.has(startKey), 'gScore.get=', gScore.get(startKey));
        }
        try {
            while (openHeap.size()) {
                const currentNode = openHeap.pop();
                if (!currentNode) break;
                if (DEBUG && (++iter % 1000 === 0)) console.log('corridorRouter iter', iter);
                const currentKey = currentNode.k;
                openSet.delete(currentKey);

                const current = { r: currentNode.r, c: currentNode.c };
                if (DEBUG) console.log('expand', currentKey);
                if (current.r === goalCell.row && current.c === goalCell.col) {
                    // reconstruct path
                    const path = [];
                    let cur = currentKey;
                    while (cur) {
                        const [r, c] = cur.split('_').map(Number);
                        const x = this.bounds.minX + (c + 0.5) * this.cellSize;
                        const y = this.bounds.minY + (r + 0.5) * this.cellSize;
                        path.push([x, y]);
                        cur = cameFrom.get(cur);
                    }
                    path.reverse();
                    return path;
                }

                closed.add(currentKey);
                if (DEBUG) console.log('gScore.has(currentKey)=', gScore.has(currentKey), 'gScore.get(currentKey)=', gScore.get(currentKey));
                const currentG = gScore.has(currentKey) ? gScore.get(currentKey) : Infinity;
                if (DEBUG) console.log('before neighbors for', currentKey, 'currentG=', currentG);
                if (!isFinite(currentG)) continue;

                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = current.r + dr; const nc = current.c + dc;
                        if (!inBounds(nr, nc)) continue;
                        if (DEBUG) console.log(' checking neighbor dr,dc', dr, dc, 'nr,nc', nr, nc, 'grid=', grid[nr] && grid[nr][nc]);
                        // prevent diagonal corner-cutting: if moving diagonally, both adjacent orthogonals must be free
                        if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
                            if (safeGridAccess(current.r + dr, current.c) === 1) continue;
                            if (safeGridAccess(current.r, current.c + dc) === 1) continue;
                        }
                        if (safeGridAccess(nr, nc) === 1) {
                            if (DEBUG) console.log(' neighbor', nr, nc, 'blocked');
                            continue; // obstacle
                        }

                        const neighborKey = key(nr, nc);
                        if (closed.has(neighborKey)) {
                            if (DEBUG) console.log(' neighbor', neighborKey, 'closed');
                            continue;
                        }

                        const tentativeG = currentG + Math.hypot(dr, dc);
                        const prevG = gScore.has(neighborKey) ? gScore.get(neighborKey) : Infinity;
                        if (tentativeG < prevG) {
                            cameFrom.set(neighborKey, currentKey);
                            gScore.set(neighborKey, tentativeG);
                            const f = tentativeG + h(nr, nc);
                            fScore.set(neighborKey, f);
                            if (!openSet.has(neighborKey)) {
                                if (DEBUG) console.log('  push neighbor', neighborKey, 'f=', f);
                                openHeap.push({ r: nr, c: nc, f, k: neighborKey });
                                openSet.add(neighborKey);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('corridorRouter.findPath error:', err && err.stack ? err.stack : err);
            return null;
        }

        return null; // no path
    }
}

module.exports = CorridorRouter;
