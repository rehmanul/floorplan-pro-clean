const ProfessionalIlotPlacer = require('../lib/professionalIlotPlacer');

const floorPlan = {
    bounds: { minX: 0, minY: 0, maxX: 50, maxY: 30 },
    walls: [],
    forbiddenZones: [],
    entrances: [],
    rooms: []
};

function run(seed) {
    const placer = new ProfessionalIlotPlacer(floorPlan, { seed });
    return placer.generateIlots({ '0-1': 10, '1-3': 25, '3-5': 30, '5-10': 35 }, 50);
}

const a = run(12345);
const b = run(12345);

console.log('a count', a.length, 'b count', b.length);
console.log(JSON.stringify(a) === JSON.stringify(b) ? 'DETERMINISTIC' : 'NON-DETERMINISTIC');
console.log('sample a[0]:', a[0]);
console.log('sample b[0]:', b[0]);
