let SAT = null;
try {
    SAT = require('sat');
} catch (e) {
    // SAT is optional; fallback to internal geometry helpers
    SAT = null;
}
const SpatialGrid = require('./spatialGrid');

class ProfessionalIlotPlacer {
    constructor(floorPlan, options = {}) {
        this.walls = floorPlan.walls || [];
        this.forbiddenZones = floorPlan.forbiddenZones || [];
        this.entrances = floorPlan.entrances || [];
        this.bounds = floorPlan.bounds || { minX: 0, minY: 0, maxX: 100, maxY: 100 };
        this.placedIlots = [];
        // Configuration
        this.minEntranceDistance = options.minEntranceDistance || 1.0; // don't place within this distance to entrances
        this.minIlotDistance = options.minIlotDistance || 0.2; // spacing between ilots
        this.maxAttemptsPerIlot = options.maxAttemptsPerIlot || 800;
        // Seedable RNG for deterministic placements when options.seed provided
        try {
            const createRng = require('./seededRng');
            this.rng = (typeof options.seed !== 'undefined' && options.seed !== null) ? createRng(Number(options.seed)) : createRng(1);
        } catch (e) {
            this.rng = Math.random;
        }
        // Use SAT if available for robust polygon-rectangle intersection
        try { this.SAT = require('sat'); } catch (e) { this.SAT = null; }
    }

    // distribution: object where keys are "min-max" areas and values are counts or percentages.
    // totalIlots can be a target count; if distribution values sum to 1 or 100 it's treated as percentage.
    generateIlots(distribution = { '0-1': 10, '1-3': 25, '3-5': 30, '5-10': 35 }, totalIlots = 100) {
        const ilots = [];

        // Normalize distribution into explicit counts when necessary
        const entries = Object.entries(distribution);
        if (entries.length === 0) return ilots;

        let totalValue = 0;
        entries.forEach(([, v]) => totalValue += Number(v));

        // If the provided values sum approximately to 1 or 100, treat as percentages
        const isPercentage = Math.abs(totalValue - 1) < 1e-6 || Math.abs(totalValue - 100) < 1e-6;

        const counts = entries.map(([range, value]) => {
            let count = 0;
            if (isPercentage) {
                const pct = Number(value) / (Math.abs(totalValue - 1) < 1e-6 ? 1 : 100);
                count = Math.round(pct * totalIlots);
            } else if (Number.isInteger(Number(value)) && Number(value) > 0) {
                count = Number(value);
            } else {
                // distribute proportionally to value
                count = Math.round((Number(value) / totalValue) * totalIlots);
            }
            return { range, count };
        });

        // Place larger ilots first for better packing
        const placementCandidates = [];
        for (const { range, count } of counts) {
            const [minSize, maxSize] = range.split('-').map(Number);
            for (let i = 0; i < count; i++) {
                // Ensure area is always positive and within the range
                const area = Math.max(0.5, minSize + this.rng() * Math.max(0.5, (maxSize - minSize)));
                // create realistic rectangular shapes with some aspect ratio randomness
                const aspect = 0.6 + this.rng() * 1.4; // 0.6 - 2.0
                const width = Math.max(0.5, Math.sqrt(area * aspect));
                const height = Math.max(0.5, area / width);
                placementCandidates.push({ area: width * height, width, height, id: `ilot_${placementCandidates.length + 1}` });
            }
        }

        placementCandidates.sort((a, b) => b.area - a.area);

        const placed = [];
        // spatial grid for neighbor queries (cell size relative to average ilot size)
        const avgSize = placementCandidates.reduce((s, c) => s + c.area, 0) / Math.max(1, placementCandidates.length);
        const cellSize = Math.max(1, Math.sqrt(avgSize) * 1.2);
        const grid = new SpatialGrid(this.bounds, cellSize);

        for (const candidate of placementCandidates) {
            const pos = this.findValidPositionForIlot(candidate, placed, grid);
            if (!pos) continue;
            const ilot = { id: candidate.id, x: pos.x, y: pos.y, width: candidate.width, height: candidate.height, area: candidate.area, candidate };
            const rect = { x1: ilot.x, y1: ilot.y, x2: ilot.x + ilot.width, y2: ilot.y + ilot.height };
            placed.push(ilot);
            // SpatialGrid expects items with x,y,width,height
            grid.insert(ilot);
        }

        // After greedy placement attempt, run a deterministic refinement pass to remove overlaps
        this._refinePlacementsDeterministic(placed, grid);

        this.placedIlots = placed;
        return placed;
    }

    // compute overlap area between two axis-aligned rects
    _rectOverlapArea(a, b) {
        const xOverlap = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
        const yOverlap = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
        return xOverlap * yOverlap;
    }

    _rectFor(item) {
        if (!item) return null;
        if (item.rect) return item.rect;
        if (typeof item.x === 'number' && typeof item.y === 'number' && typeof item.width === 'number' && typeof item.height === 'number') {
            return { x1: item.x, y1: item.y, x2: item.x + item.width, y2: item.y + item.height };
        }
        return null;
    }

    // Deterministic local refinement to reduce overlaps using seeded choices.
    _refinePlacementsDeterministic(placed, grid) {
        if (!placed || placed.length <= 1) return;

        // collect overlapping pairs
        const overlaps = [];
        for (let i = 0; i < placed.length; i++) {
            const aRect = this._rectFor(placed[i]);
            const candidates = grid.queryRect(aRect);
            for (const c of candidates) {
                const cRect = this._rectFor(c);
                if (!cRect) continue;
                // find index of candidate in placed
                const j = placed.indexOf(c);
                if (j === -1 || j <= i) continue;
                const area = this._rectOverlapArea(aRect, cRect);
                if (area > 1e-6) overlaps.push({ i, j, area });
            }
        }

        // sort overlaps by area desc to resolve biggest first
        overlaps.sort((u, v) => v.area - u.area);

        // deterministic attempt to shift smaller element away from overlap along the largest free axis
        for (const ov of overlaps) {
            const A = placed[ov.i];
            const B = placed[ov.j];
            const Arect = this._rectFor(A);
            const Brect = this._rectFor(B);
            // decide which to move: smaller area
            const areaA = (Arect.x2 - Arect.x1) * (Arect.y2 - Arect.y1);
            const areaB = (Brect.x2 - Brect.x1) * (Brect.y2 - Brect.y1);
            const moverIndex = areaA <= areaB ? ov.i : ov.j;
            const mover = placed[moverIndex];

            const moverRect = this._rectFor(mover);

            // attempt small deterministic displacement in 8 compass directions ordered by our seeded rng
            const dirs = [
                { dx: -1, dy: 0 },
                { dx: 1, dy: 0 },
                { dx: 0, dy: -1 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: -1 },
                { dx: 1, dy: -1 },
                { dx: -1, dy: 1 },
                { dx: 1, dy: 1 },
            ];

            // shuffle deterministically using our rng
            for (let k = dirs.length - 1; k > 0; k--) {
                const r = Math.floor(this.rng() * (k + 1));
                const tmp = dirs[k];
                dirs[k] = dirs[r];
                dirs[r] = tmp;
            }

            const step = Math.max(0.5, Math.min(moverRect.x2 - moverRect.x1, moverRect.y2 - moverRect.y1) / 4);
            let moved = false;
            for (const d of dirs) {
                const newRect = {
                    x1: moverRect.x1 + d.dx * step,
                    y1: moverRect.y1 + d.dy * step,
                    x2: moverRect.x2 + d.dx * step,
                    y2: moverRect.y2 + d.dy * step,
                };
                // enforce bounds
                if (newRect.x1 < this.bounds.minX || newRect.y1 < this.bounds.minY || newRect.x2 > this.bounds.maxX || newRect.y2 > this.bounds.maxY) continue;
                // quick spatial query to see if it collides
                const nearby = grid.queryRect(newRect);
                let ok = true;
                for (const n of nearby) {
                    const nrect = this._rectFor(n);
                    if (!nrect) continue;
                    if (nrect.x1 === moverRect.x1 && nrect.y1 === moverRect.y1 && nrect.x2 === moverRect.x2 && nrect.y2 === moverRect.y2) continue;
                    if (this._rectOverlapArea(nrect, newRect) > 1e-6) { ok = false; break; }
                }
                if (ok && this.isValidPlacement(newRect, placed, grid)) {
                    // update grid: remove old and insert new
                    // naive removal: rebuild grid (cheap for small counts)
                    // update mover position fields if it's an ilot
                    if (typeof mover.x === 'number') {
                        mover.x = newRect.x1;
                        mover.y = newRect.y1;
                    } else if (mover.rect) {
                        mover.rect = newRect;
                    }
                    grid.clear();
                    for (const p of placed) {
                        // p should be ilot object with x,y,width,height
                        grid.insert(p);
                    }
                    moved = true;
                    break;
                }
            }

            if (!moved) {
                // as a deterministic fallback try nudging along x towards bounds center
                const dir = this.rng() > 0.5 ? 1 : -1;
                const newRect = {
                    x1: moverRect.x1 + dir * step,
                    y1: moverRect.y1,
                    x2: moverRect.x2 + dir * step,
                    y2: moverRect.y2,
                };
                if (!(newRect.x1 < this.bounds.minX || newRect.x2 > this.bounds.maxX) && this.isValidPlacement(newRect, placed, grid)) {
                    if (typeof mover.x === 'number') {
                        mover.x = newRect.x1;
                        mover.y = newRect.y1;
                    } else if (mover.rect) {
                        mover.rect = newRect;
                    }
                    grid.clear();
                    for (const p of placed) {
                        grid.insert(p);
                    }
                }
            }
        }
    }

    findValidPositionForIlot(candidate, placedIlots, grid = null) {
        const bounds = this.bounds;
        const maxAttempts = this.maxAttemptsPerIlot;
        // First: deterministic grid scan centered on bounds center, sorted by proximity.
        const centerX = (bounds.minX + bounds.maxX) / 2 - candidate.width / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2 - candidate.height / 2;

        // choose a reasonable step that's deterministic relative to candidate size
        const stepX = Math.max(0.5, candidate.width / 2);
        const stepY = Math.max(0.5, candidate.height / 2);

        const positions = [];
        for (let x = bounds.minX; x <= bounds.maxX - candidate.width + 1e-9; x += stepX) {
            for (let y = bounds.minY; y <= bounds.maxY - candidate.height + 1e-9; y += stepY) {
                positions.push({ x, y, dist: Math.hypot(x - centerX, y - centerY) });
            }
        }

        // sort deterministically by distance, then x then y
        positions.sort((a, b) => {
            if (a.dist !== b.dist) return a.dist - b.dist;
            if (a.x !== b.x) return a.x - b.x;
            return a.y - b.y;
        });

        for (const pos of positions) {
            const rect = { x1: pos.x, y1: pos.y, x2: pos.x + candidate.width, y2: pos.y + candidate.height };
            if (this.isValidPlacement(rect, placedIlots, grid)) return { x: pos.x, y: pos.y };
        }

        // fallback: randomized attempts (still deterministic when rng is seeded)
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const x = bounds.minX + this.rng() * Math.max(0, (bounds.maxX - bounds.minX - candidate.width));
            const y = bounds.minY + this.rng() * Math.max(0, (bounds.maxY - bounds.minY - candidate.height));
            const rect = { x1: x, y1: y, x2: x + candidate.width, y2: y + candidate.height };
            if (this.isValidPlacement(rect, placedIlots, grid)) {
                return { x, y };
            }
        }

        return null;
    }

    isValidPlacement(rect, placedIlots, grid = null) {
        // ENHANCED: Comprehensive validation with proper tolerance and spatial indexing
        // Must be inside bounds
        if (rect.x1 < this.bounds.minX || rect.y1 < this.bounds.minY ||
            rect.x2 > this.bounds.maxX || rect.y2 > this.bounds.maxY) {
            return false;
        }

        // Must not intersect forbidden zones (strict)
        for (const zone of this.forbiddenZones || []) {
            if (this.rectPolygonOverlap(rect, zone.polygon)) return false;
        }

        // Must not be within minEntranceDistance of entrances
        for (const ent of this.entrances || []) {
            try {
                // support multiple entrance representations: polygon, point {x,y}, or [x,y]
                if (ent && ent.polygon && Array.isArray(ent.polygon) && ent.polygon.length >= 3) {
                    if (this.rectDistanceToPolygon(rect, ent.polygon) < this.minEntranceDistance) return false;
                } else if (ent && Array.isArray(ent) && ent.length >= 2) {
                    // simple [x,y]
                    const d = this.pointToRectDistance(ent, rect);
                    if (d < this.minEntranceDistance) return false;
                } else if (ent && typeof ent.x === 'number' && typeof ent.y === 'number') {
                    const d = this.pointToRectDistance([ent.x, ent.y], rect);
                    if (d < this.minEntranceDistance) return false;
                }
            } catch (e) {
                // Defensive: if entrance data malformed, skip it (do not crash placement)
                continue;
            }
        }

        // Allow touching walls: only forbid overlap with wall polygons if strict area overlap detected
        for (const wall of this.walls || []) {
            if (wall.polygon && this.rectPolygonOverlap(rect, wall.polygon)) {
                // if the overlap region has area (not just edge touching), disallow
                if (this.polygonIntersectsRectWithArea(wall.polygon, rect)) return false;
            }
        }

        // Must not be too close to other ilots (respect minIlotDistance)
        // Query nearby ilots via spatial grid if available, otherwise fallback to provided placedIlots array
        const neighbors = grid ? grid.queryRect({ x1: rect.x1 - this.minIlotDistance, y1: rect.y1 - this.minIlotDistance, x2: rect.x2 + this.minIlotDistance, y2: rect.y2 + this.minIlotDistance }) : placedIlots;
        for (const other of neighbors) {
            const otherRect = this._rectFor(other) || (other && typeof other.x === 'number' ? { x1: other.x, y1: other.y, x2: other.x + other.width, y2: other.y + other.height } : null);
            if (!otherRect) continue;
            if (this.rectsCloserThan(rect, otherRect, this.minIlotDistance)) return false;
        }

        return true;
    }

    // Geometry helpers
    _normalizePolygon(polygon) {
        if (!polygon) return [];
        if (Array.isArray(polygon)) {
            const out = [];
            for (const p of polygon) {
                if (!p) continue;
                if (Array.isArray(p) && p.length >= 2) {
                    out.push([Number(p[0]), Number(p[1])]);
                } else if (typeof p === 'object' && p !== null) {
                    if (typeof p.x === 'number' && typeof p.y === 'number') out.push([Number(p.x), Number(p.y)]);
                    else if (typeof p[0] === 'number' && typeof p[1] === 'number') out.push([Number(p[0]), Number(p[1])]);
                }
            }
            return out;
        }
        if (typeof polygon === 'object' && polygon !== null) {
            if (typeof polygon.x === 'number' && typeof polygon.y === 'number') return [[Number(polygon.x), Number(polygon.y)]];
        }
        return [];
    }
    rectIntersectsPolygon(rect, polygon) {
        const poly = this._normalizePolygon(polygon);
        if (!poly || poly.length < 3) return false;

        // If any rect corner is inside polygon -> intersects
        const corners = [[rect.x1, rect.y1], [rect.x2, rect.y1], [rect.x2, rect.y2], [rect.x1, rect.y2]];
        for (const c of corners) {
            if (this.pointInPolygon(c, poly)) return true;
        }

        // If any polygon vertex inside rect -> intersects
        for (const v of poly) {
            if (v[0] >= rect.x1 && v[0] <= rect.x2 && v[1] >= rect.y1 && v[1] <= rect.y2) return true;
        }

        // If any edges cross
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            if (this.segmentIntersectsRect(a, b, rect)) return true;
        }

        return false;
    }

    polygonIntersectsRectWithArea(polygon, rect) {
        const poly = this._normalizePolygon(polygon);
        // Conservative check: if more than one polygon vertex is strictly inside rect -> area overlap
        let insideCount = 0;
        for (const v of poly) {
            if (v[0] > rect.x1 && v[0] < rect.x2 && v[1] > rect.y1 && v[1] < rect.y2) insideCount++;
            if (insideCount > 1) return true;
        }
        return false;
    }

    rectDistanceToPolygon(rect, polygon) {
        // Return minimum distance between rect and polygon edges or vertices
        const poly = this._normalizePolygon(polygon);
        let minDist = Infinity;

        // check vertices
        for (const v of poly) {
            const dx = Math.max(rect.x1 - v[0], 0, v[0] - rect.x2);
            const dy = Math.max(rect.y1 - v[1], 0, v[1] - rect.y2);
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) minDist = d;
        }

        // check edges
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const d = this.segmentDistanceToRect(a, b, rect);
            if (d < minDist) minDist = d;
        }

        return minDist;
    }

    // Robust rectangle-polygon overlap test that uses SAT when available
    rectPolygonOverlap(rect, polygon) {
        // Normalize polygon input defensively (can be array of [x,y], objects, or malformed)
        const poly = this._normalizePolygon(polygon);
        if (!poly || poly.length < 3) return false;

        // If SAT is available, convert to SAT polys
        if (this.SAT) {
            try {
                const SAT = this.SAT;
                const rectPts = [
                    { x: rect.x1, y: rect.y1 },
                    { x: rect.x2, y: rect.y1 },
                    { x: rect.x2, y: rect.y2 },
                    { x: rect.x1, y: rect.y2 }
                ];
                const polyA = new SAT.Polygon(new SAT.Vector(), rectPts.map(p => new SAT.Vector(p.x, p.y)));
                const polyB = new SAT.Polygon(new SAT.Vector(), poly.map(p => new SAT.Vector(p[0], p[1])));
                const response = new SAT.Response();
                const collided = SAT.testPolygonPolygon(polyA, polyB, response);
                return collided;
            } catch (e) {
                // fallback to geometry checks
            }
        }
        // Fall back to existing checks using normalized polygon
        return this.rectIntersectsPolygon(rect, poly);
    }

    rectsCloserThan(r1, r2, minDist) {
        // Expand r1 by minDist and test overlap
        const e = { x1: r1.x1 - minDist, y1: r1.y1 - minDist, x2: r1.x2 + minDist, y2: r1.y2 + minDist };
        return !(e.x2 <= r2.x1 || e.x1 >= r2.x2 || e.y2 <= r2.y1 || e.y1 >= r2.y2);
    }

    segmentIntersectsRect(a, b, rect) {
        // Liang-Barsky or simple segment vs edge checks
        const rectEdges = [
            [[rect.x1, rect.y1], [rect.x2, rect.y1]],
            [[rect.x2, rect.y1], [rect.x2, rect.y2]],
            [[rect.x2, rect.y2], [rect.x1, rect.y2]],
            [[rect.x1, rect.y2], [rect.x1, rect.y1]]
        ];

        for (const edge of rectEdges) {
            if (this.segmentsIntersect(a, b, edge[0], edge[1])) return true;
        }
        return false;
    }

    segmentDistanceToRect(a, b, rect) {
        // sample endpoints and compute distance if segment does not intersect
        if (this.segmentIntersectsRect(a, b, rect)) return 0;
        const d1 = this.pointToRectDistance(a, rect);
        const d2 = this.pointToRectDistance(b, rect);
        return Math.min(d1, d2);
    }

    pointToRectDistance(p, rect) {
        const dx = Math.max(rect.x1 - p[0], 0, p[0] - rect.x2);
        const dy = Math.max(rect.y1 - p[1], 0, p[1] - rect.y2);
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Robust segment intersection
    segmentsIntersect(p1, p2, p3, p4) {
        const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const o1 = orient(p1, p2, p3);
        const o2 = orient(p1, p2, p4);
        const o3 = orient(p3, p4, p1);
        const o4 = orient(p3, p4, p2);

        if (o1 === 0 && this.onSegment(p1, p3, p2)) return true;
        if (o2 === 0 && this.onSegment(p1, p4, p2)) return true;
        if (o3 === 0 && this.onSegment(p3, p1, p4)) return true;
        if (o4 === 0 && this.onSegment(p3, p2, p4)) return true;

        return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
    }

    onSegment(a, b, c) {
        return Math.min(a[0], c[0]) <= b[0] && b[0] <= Math.max(a[0], c[0]) &&
            Math.min(a[1], c[1]) <= b[1] && b[1] <= Math.max(a[1], c[1]);
    }

    pointInPolygon(point, polygon) {
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

    getIlotType(area) {
        if (area < 1) return 'single';
        if (area < 3) return 'double';
        if (area < 5) return 'team';
        return 'meeting';
    }

}

module.exports = ProfessionalIlotPlacer;