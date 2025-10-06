const ProfessionalIlotPlacer = require('../lib/professionalIlotPlacer');
const ProfessionalCorridorGenerator = require('../lib/professionalCorridorGenerator');

const floorPlan = {
    bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
    walls: [],
    forbiddenZones: [],
    entrances: [],
    rooms: []
};

function run(seed) {
    const ilotPlacer = new ProfessionalIlotPlacer(floorPlan, { seed });
    const ilots = ilotPlacer.generateIlots({ '1-3': 10, '3-5': 20, '5-10': 10 }, 50);
    const corridorGen = new ProfessionalCorridorGenerator(floorPlan, ilots);
    const corridors = corridorGen.generateCorridors(1.5);
    return { ilots, corridors };
}

const a = run(999);
const b = run(999);

console.log('ilot counts:', a.ilots.length, b.ilots.length);
console.log('corridor counts:', a.corridors.length, b.corridors.length);
console.log(JSON.stringify(a.ilots) === JSON.stringify(b.ilots) ? 'ILOTS DETERMINISTIC' : 'ILOTS NON-DETERMINISTIC');
console.log(JSON.stringify(a.corridors) === JSON.stringify(b.corridors) ? 'CORRIDORS DETERMINISTIC' : 'CORRIDORS NON-DETERMINISTIC');
