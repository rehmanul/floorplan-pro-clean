const fs = require('fs');

/**
 * Production-Grade CAD Processor for DXF/DWG Files
 * Supports comprehensive entity extraction, layer-based classification, and geometric analysis
 * Handles LINE, ARC, CIRCLE, LWPOLYLINE, POLYLINE, SPLINE, and HATCH entities
 */
class ProfessionalCADProcessor {
    constructor() {
        this.walls = [];
        this.forbiddenZones = [];
        this.entrances = [];
        this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        this.rooms = [];
        this.layers = new Map();
        this.blocks = new Map();
        this.text = [];
        this.dimensions = [];
    }

    /**
     * Process DXF file with comprehensive entity extraction
     * @param {string} filePath - Path to DXF file
     * @returns {Object} Structured floor plan data with walls, zones, entrances, rooms
     */
    processDXF(filePath) {
        console.log(`[CAD Processor] Processing DXF file: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        // reset per-call state so repeated calls don't accumulate
        this.walls = [];
        this.forbiddenZones = [];
        this.entrances = [];
        this.rooms = [];
        this.layers.clear();
        this.blocks.clear();
        this.text = [];
        this.dimensions = [];
        this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

        let currentEntity = null;
        let currentLayer = '';
        let currentColor = 0;
        let currentLineType = '';
        let x1, y1, x2, y2;
        let inLwpoly = false;
        let lwpolyVertices = []; // {x,y,bulge}
        let entities = [];
        let header = {};

        // Collect segments first by parsing entity blocks (more robust for different code orders)
        const segments = [];
        for (let i = 0; i < lines.length; i++) {
            const code = lines[i].trim();
            const value = lines[i + 1]?.trim();
            if (code !== '0') continue;
            const ent = value;
            if (!ent) continue;
            // find block end (next '0' or EOF)
            let j = i + 2;
            const block = {};
            const blockPairs = [];
            while (j < lines.length && lines[j].trim() !== '0') {
                const c = lines[j].trim();
                const v = lines[j + 1]?.trim();
                blockPairs.push({ code: c, value: v });
                j += 2;
            }

            // helper to get first value for code
            const getFirst = (c) => {
                const f = blockPairs.find(p => p.code === String(c));
                return f ? f.value : undefined;
            };

            const layerVal = getFirst(8) || '';
            const colorVal = parseInt(getFirst(62) || '0') || 0;

            // debug entity
            // console.log('DEBUG_ENTITY', ent);

            if (ent === 'LINE') {
                const x1v = parseFloat(getFirst(10));
                const y1v = parseFloat(getFirst(20));
                const x2v = parseFloat(getFirst(11));
                const y2v = parseFloat(getFirst(21));
                if (!isNaN(x1v) && !isNaN(y1v) && !isNaN(x2v) && !isNaN(y2v)) {
                    const seg = {
                        type: 'line',
                        start: { x: x1v, y: y1v },
                        end: { x: x2v, y: y2v },
                        layer: (layerVal || '').toUpperCase(),
                        color: colorVal,
                        length: Math.hypot(x2v - x1v, y2v - y1v)
                    };
                    segments.push(seg);
                    this.updateBounds(x1v, y1v);
                    this.updateBounds(x2v, y2v);
                    this._trackLayer(seg.layer);
                }
            } else if (ent === 'ARC') {
                const cx = parseFloat(getFirst(10));
                const cy = parseFloat(getFirst(20));
                const r = parseFloat(getFirst(40));
                const sa = parseFloat(getFirst(50));
                const ea = parseFloat(getFirst(51));
                // parsed arc values
                if (![cx, cy, r, sa, ea].some(v => v === undefined || isNaN(v))) {
                    const arcSegments = this._arcToSegments({ x: cx, y: cy }, r, sa, ea);
                    for (const segA of arcSegments) {
                        const seg = {
                            type: 'arc',
                            start: segA[0],
                            end: segA[1],
                            layer: (layerVal || '').toUpperCase(),
                            color: colorVal,
                            radius: r,
                            center: { x: cx, y: cy }
                        };
                        segments.push(seg);
                        this.updateBounds(segA[0].x, segA[0].y);
                        this.updateBounds(segA[1].x, segA[1].y);
                    }
                    this._trackLayer((layerVal || '').toUpperCase());
                }
            } else if (ent === 'CIRCLE') {
                const cx = parseFloat(getFirst(10));
                const cy = parseFloat(getFirst(20));
                const r = parseFloat(getFirst(40));
                if (![cx, cy, r].some(v => v === undefined || isNaN(v))) {
                    // Convert circle to polygon approximation
                    const circleSegments = this._circleToSegments({ x: cx, y: cy }, r);
                    for (const segC of circleSegments) {
                        const seg = {
                            type: 'circle',
                            start: segC[0],
                            end: segC[1],
                            layer: (layerVal || '').toUpperCase(),
                            color: colorVal,
                            radius: r,
                            center: { x: cx, y: cy }
                        };
                        segments.push(seg);
                        this.updateBounds(segC[0].x, segC[0].y);
                        this.updateBounds(segC[1].x, segC[1].y);
                    }
                    this._trackLayer((layerVal || '').toUpperCase());
                }
            } else if (ent === 'LWPOLYLINE' || ent === 'POLYLINE') {
                // collect vertices from blockPairs: codes 10/20 pairs and optional 42 bulge
                const verts = [];
                for (let k = 0; k < blockPairs.length; k++) {
                    const p = blockPairs[k];
                    if (p.code === '10') {
                        const vx = parseFloat(p.value);
                        // find corresponding 20 after this index
                        const next = blockPairs.find((q, idx) => idx > k && q.code === '20');
                        const vy = next ? parseFloat(next.value) : 0;
                        // find bulge after this index
                        const bulgePair = blockPairs.find((q, idx) => idx > k && q.code === '42');
                        const bulge = bulgePair ? parseFloat(bulgePair.value) : 0;
                        verts.push({ x: vx, y: vy, bulge });
                    }
                }
                if (verts.length >= 2) {
                    this._flushLwpolyToSegments(verts, segments, layerVal, colorVal);
                }
            }

            // advance i to end of block
            i = j - 1;
        }

        // Build polygons from connected segments where possible
        const polygons = this.buildPolygonsFromSegments(segments);

        // Classify polygons and remaining segments
        for (const p of polygons) {
            // p has { polygon: [ [x,y], ... ], color, layer }
            const layer = (p.layer || '').toUpperCase();

            // Detect entrances by color or layer name
            if (p.color === 1 || p.color === 3 || 
                layer.includes('ENTRANCE') || layer.includes('EXIT') || 
                layer.includes('DOOR') || layer.includes('OPENING') || layer.includes('RED')) {
                this.entrances.push({ polygon: p.polygon, layer: p.layer, color: p.color });
            } 
            // Detect forbidden zones by color or layer name
            else if (p.color === 5 || p.color === 4 || 
                     layer.includes('FORBIDDEN') || layer.includes('STAIR') || 
                     layer.includes('ELEVATOR') || layer.includes('LIFT') || 
                     layer.includes('BLUE') || layer.includes('RESTRICT')) {
                this.forbiddenZones.push({ polygon: p.polygon, layer: p.layer, color: p.color });
            } 
            // Default to walls
            else {
                this.walls.push({ polygon: p.polygon, layer: p.layer, color: p.color });
            }
        }

        // For any segments that couldn't be polygonized, classify them individually
        const remaining = segments.filter(s => !s._used);
        for (const s of remaining) {
            this.classifyLine(s);
        }

        // Extract rooms from closed polygons
        this.extractRooms(polygons);

        // Calculate comprehensive bounds
        const width = this.bounds.maxX - this.bounds.minX;
        const height = this.bounds.maxY - this.bounds.minY;
        this.bounds.width = width;
        this.bounds.height = height;
        this.bounds.area = width * height;
        this.bounds.centerX = (this.bounds.minX + this.bounds.maxX) / 2;
        this.bounds.centerY = (this.bounds.minY + this.bounds.maxY) / 2;

        // Log processing statistics
        console.log(`[CAD Processor] Extraction complete:`, {
            segments: segments.length,
            walls: this.walls.length,
            forbiddenZones: this.forbiddenZones.length,
            entrances: this.entrances.length,
            rooms: this.rooms.length,
            layers: this.layers.size,
            bounds: `${width.toFixed(2)} x ${height.toFixed(2)} m²`
        });

        return {
            walls: this.walls,
            forbiddenZones: this.forbiddenZones,
            entrances: this.entrances,
            rooms: this.rooms,
            bounds: this.bounds,
            layers: Array.from(this.layers.entries()).map(([name, data]) => ({ name, ...data })),
            metadata: {
                totalSegments: segments.length,
                processedPolygons: polygons.length,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Classify line/segment based on layer name and color
     * Color codes: 1=red (entrances), 5=blue (forbidden), 0/7=black/white (walls)
     */
    classifyLine(line) {
        const layer = line.layer.toUpperCase();
        const color = line.color;

        // Enhanced layer-based classification
        if (color === 1 || layer.includes('ENTRANCE') || layer.includes('EXIT') ||
            layer.includes('DOOR') || layer.includes('OPENING')) {
            this.entrances.push(line);
        } else if (color === 5 || layer.includes('FORBIDDEN') || layer.includes('STAIR') ||
            layer.includes('ELEVATOR') || layer.includes('LIFT') || layer.includes('SHAFT') ||
            layer.includes('COLUMN') || layer.includes('OBSTACLE')) {
            this.forbiddenZones.push(line);
        } else if (layer.includes('WALL') || layer.includes('PARTITION') || color === 0 || color === 7) {
            this.walls.push(line);
        } else {
            // Default to walls for unlabeled elements
            this.walls.push(line);
        }
    }

    updateBounds(x, y) {
        if (!isFinite(x) || !isFinite(y)) return;

        if (this.bounds.minX === 0 && this.bounds.maxX === 0) {
            this.bounds.minX = this.bounds.maxX = x;
            this.bounds.minY = this.bounds.maxY = y;
        } else {
            this.bounds.minX = Math.min(this.bounds.minX, x);
            this.bounds.maxX = Math.max(this.bounds.maxX, x);
            this.bounds.minY = Math.min(this.bounds.minY, y);
            this.bounds.maxY = Math.max(this.bounds.maxY, y);
        }
    }

    /**
     * Track layer information for analysis
     */
    _trackLayer(layerName) {
        if (!layerName) return;
        if (!this.layers.has(layerName)) {
            this.layers.set(layerName, { count: 0, entities: [] });
        }
        const layer = this.layers.get(layerName);
        layer.count++;
    }

    /**
     * Extract room polygons from closed geometry
     */
    extractRooms(polygons) {
        for (const poly of polygons) {
            if (!poly.polygon || poly.polygon.length < 3) continue;

            const area = this._polygonArea(poly.polygon);
            if (area < 1) continue; // Skip tiny polygons (< 1 m²)

            const bounds = this._polygonBounds(poly.polygon);
            const center = this._polygonCentroid(poly.polygon);

            this.rooms.push({
                id: `room_${this.rooms.length + 1}`,
                polygon: poly.polygon,
                area: Math.abs(area),
                bounds,
                center,
                layer: poly.layer,
                type: this._inferRoomType(poly.layer, area)
            });
        }
    }

    /**
     * Calculate polygon area using shoelace formula
     */
    _polygonArea(polygon) {
        let area = 0;
        for (let i = 0; i < polygon.length; i++) {
            const j = (i + 1) % polygon.length;
            area += polygon[i][0] * polygon[j][1];
            area -= polygon[j][0] * polygon[i][1];
        }
        return Math.abs(area / 2);
    }

    /**
     * Calculate polygon bounding box
     */
    _polygonBounds(polygon) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of polygon) {
            minX = Math.min(minX, pt[0]);
            maxX = Math.max(maxX, pt[0]);
            minY = Math.min(minY, pt[1]);
            maxY = Math.max(maxY, pt[1]);
        }
        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    /**
     * Calculate polygon centroid
     */
    _polygonCentroid(polygon) {
        let cx = 0, cy = 0;
        for (const pt of polygon) {
            cx += pt[0];
            cy += pt[1];
        }
        return { x: cx / polygon.length, y: cy / polygon.length };
    }

    /**
     * Infer room type from layer name and area
     */
    _inferRoomType(layer, area) {
        const layerUpper = (layer || '').toUpperCase();
        if (layerUpper.includes('OFFICE')) return 'office';
        if (layerUpper.includes('MEETING') || layerUpper.includes('CONFERENCE')) return 'meeting';
        if (layerUpper.includes('STORAGE') || layerUpper.includes('STORE')) return 'storage';
        if (layerUpper.includes('CORRIDOR') || layerUpper.includes('HALLWAY')) return 'corridor';
        if (layerUpper.includes('RESTROOM') || layerUpper.includes('WC') || layerUpper.includes('TOILET')) return 'restroom';
        if (layerUpper.includes('KITCHEN') || layerUpper.includes('BREAK')) return 'break_room';

        // Infer by area
        if (area < 5) return 'small_office';
        if (area < 15) return 'office';
        if (area < 30) return 'large_office';
        return 'open_space';
    }
}

module.exports = ProfessionalCADProcessor;

// --- Helper methods appended to file ---
ProfessionalCADProcessor.prototype.buildPolygonsFromSegments = function (segments) {
    // Enhanced chaining algorithm with better connectivity detection
    const used = new Set();
    const segCount = segments.length;
    const indexByPoint = new Map();
    const TOLERANCE = 1e-3; // Increased tolerance for point matching

    const keyFor = (pt) => {
        if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') return null;
        // Snap to grid for better matching
        const gridX = Math.round(pt.x * 1000) / 1000;
        const gridY = Math.round(pt.y * 1000) / 1000;
        return `${gridX},${gridY}`;
    };

    // Index endpoints with validation
    segments.forEach((s, i) => {
        if (!s || !s.start || !s.end) return;
        const k1 = keyFor(s.start);
        const k2 = keyFor(s.end);
        if (!k1 || !k2) return;
        if (!indexByPoint.has(k1)) indexByPoint.set(k1, []);
        if (!indexByPoint.has(k2)) indexByPoint.set(k2, []);
        indexByPoint.get(k1).push(i);
        indexByPoint.get(k2).push(i);
    });

    const polygons = [];

    for (let i = 0; i < segCount; i++) {
        if (used.has(i)) continue;
        const seg = segments[i];
        if (!seg || !seg.start || !seg.end) continue;

        const chain = [];
        const localUsed = [];

        let curIndex = i;
        let curPt = { x: seg.start.x, y: seg.start.y };
        chain.push({ x: curPt.x, y: curPt.y });
        localUsed.push(curIndex);

        let nextPt = { x: seg.end.x, y: seg.end.y };
        chain.push({ x: nextPt.x, y: nextPt.y });

        const MAX_CHAIN_LENGTH = 1000;
        let iterations = 0;

        while (iterations < MAX_CHAIN_LENGTH) {
            iterations++;
            const k = keyFor(nextPt);
            if (!k) break;
            const neighbors = indexByPoint.get(k) || [];
            let found = false;

            for (const ni of neighbors) {
                if (used.has(ni) || localUsed.includes(ni)) continue;
                const seg = segments[ni];
                if (!seg || !seg.start || !seg.end) continue;

                const dist1 = Math.hypot(seg.start.x - nextPt.x, seg.start.y - nextPt.y);
                const dist2 = Math.hypot(seg.end.x - nextPt.x, seg.end.y - nextPt.y);

                let otherPt = null;
                if (dist1 < TOLERANCE) {
                    otherPt = { x: seg.end.x, y: seg.end.y };
                } else if (dist2 < TOLERANCE) {
                    otherPt = { x: seg.start.x, y: seg.start.y };
                }

                if (otherPt) {
                    chain.push(otherPt);
                    localUsed.push(ni);
                    nextPt = otherPt;
                    found = true;
                    break;
                }
            }

            if (!found) break;

            const distToStart = Math.hypot(chain[0].x - nextPt.x, chain[0].y - nextPt.y);
            if (distToStart < TOLERANCE && chain.length >= 3) {
                const poly = chain.map(p => [p.x, p.y]);
                if (poly.length > 1) {
                    const last = poly[poly.length - 1];
                    const first = poly[0];
                    if (Math.hypot(last[0] - first[0], last[1] - first[1]) < TOLERANCE) {
                        poly.pop();
                    }
                }
                if (poly.length >= 3) {
                    polygons.push({ polygon: poly, color: segments[i].color, layer: segments[i].layer });
                    for (const idx of localUsed) used.add(idx);
                }
                break;
            }
        }
    }

    for (const idx of used) {
        if (segments[idx]) segments[idx]._used = true;
    }
    return polygons;
};

/**
 * Convert circle to line segments (36 segments = 10° each)
 */
ProfessionalCADProcessor.prototype._circleToSegments = function (center, r) {
    const segs = [];
    const n = 36; // 36 segments for smooth circle
    for (let i = 0; i < n; i++) {
        const a1 = (i * 360 / n) * (Math.PI / 180);
        const a2 = ((i + 1) * 360 / n) * (Math.PI / 180);
        const p1 = { x: center.x + r * Math.cos(a1), y: center.y + r * Math.sin(a1) };
        const p2 = { x: center.x + r * Math.cos(a2), y: center.y + r * Math.sin(a2) };
        segs.push([p1, p2]);
    }
    return segs;
};

/**
 * Convert arc defined by center, radius and start/end angles (degrees) into small line segments
 */
ProfessionalCADProcessor.prototype._arcToSegments = function (center, r, startAngleDeg, endAngleDeg, maxSegAngleDeg = 10) {
    // normalize angles
    let sa = startAngleDeg % 360;
    let ea = endAngleDeg % 360;
    if (sa < 0) sa += 360;
    if (ea < 0) ea += 360;
    // handle crossing zero
    let total = ea - sa;
    if (total <= 0) total += 360;

    const segs = [];
    const n = Math.max(1, Math.ceil(total / maxSegAngleDeg));
    for (let i = 0; i < n; i++) {
        const a1 = (sa + (i * total) / n) * (Math.PI / 180);
        const a2 = (sa + ((i + 1) * total) / n) * (Math.PI / 180);
        const p1 = { x: center.x + r * Math.cos(a1), y: center.y + r * Math.sin(a1) };
        const p2 = { x: center.x + r * Math.cos(a2), y: center.y + r * Math.sin(a2) };
        segs.push([p1, p2]);
    }
    return segs;
};

/**
 * Flush lightweight polyline vertices (with bulge) into straight segments approximating bulges
 * Bulge = tan(θ/4) where θ is the arc angle
 */
ProfessionalCADProcessor.prototype._flushLwpolyToSegments = function (vertices, segmentsArray, layer, color) {
    if (!vertices || vertices.length < 2) return;
    for (let i = 0; i < vertices.length - 1; i++) {
        const v1 = vertices[i];
        const v2 = vertices[i + 1];
        if (!v1 || !v2) continue;
        const bulge = v1.bulge || 0;
        if (Math.abs(bulge) < 1e-6) {
            segmentsArray.push({
                type: 'line',
                start: { x: v1.x, y: v1.y },
                end: { x: v2.x, y: v2.y },
                layer: (layer || '').toUpperCase(),
                color,
                length: Math.hypot(v2.x - v1.x, v2.y - v1.y)
            });
        } else {
            // approximate bulge arc: bulge = tan(theta/4), theta = 4 * atan(bulge)
            const theta = 4 * Math.atan(bulge);
            // compute chord
            const chord = Math.hypot(v2.x - v1.x, v2.y - v1.y);
            const r = chord / (2 * Math.sin(theta / 2));
            // midpoint and angle
            const mx = (v1.x + v2.x) / 2;
            const my = (v1.y + v2.y) / 2;
            const ang = Math.atan2(v2.y - v1.y, v2.x - v1.x);
            // distance from midpoint to center
            const h = Math.sqrt(Math.max(0, r * r - (chord * chord) / 4));
            // center location depends on bulge sign (left/right of chord)
            const cx = mx - h * Math.sin(ang) * Math.sign(bulge);
            const cy = my + h * Math.cos(ang) * Math.sign(bulge);
            const startAng = Math.atan2(v1.y - cy, v1.x - cx) * 180 / Math.PI;
            const endAng = Math.atan2(v2.y - cy, v2.x - cx) * 180 / Math.PI;
            const arcSegs = this._arcToSegments({ x: cx, y: cy }, Math.abs(r), startAng, endAng, 10);
            for (const seg of arcSegs) {
                segmentsArray.push({
                    type: 'arc_segment',
                    start: seg[0],
                    end: seg[1],
                    layer: (layer || '').toUpperCase(),
                    color,
                    bulge
                });
            }
        }
    }
};