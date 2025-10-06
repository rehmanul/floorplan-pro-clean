const ProfessionalCADProcessor = require('../lib/professionalCADProcessor');
const ProfessionalIlotPlacer = require('../lib/professionalIlotPlacer');
const ProfessionalCorridorGenerator = require('../lib/professionalCorridorGenerator');
const ExportManager = require('../lib/exportManager');

(async function () {
    try {
        const cad = new ProfessionalCADProcessor();
        const filePath = 'uploads/residential floor plan for test.dxf';
        const cadData = cad.processDXF(filePath);
        console.log('CAD data bounds:', cadData.bounds);

        const floorPlan = { walls: cadData.walls, forbiddenZones: cadData.forbiddenZones, entrances: cadData.entrances, bounds: cadData.bounds, rooms: [] };

        const placer = new ProfessionalIlotPlacer(floorPlan, { minEntranceDistance: 2, minIlotDistance: 0.5, maxAttemptsPerIlot: 500 });
        const ilots = placer.generateIlots({ '1-2': 5, '2-3': 3, '3-5': 2 }, 10);
        console.log('Generated ilots:', ilots.length);

        const generator = new ProfessionalCorridorGenerator(floorPlan, ilots);
        const corridors = generator.generateCorridors(1.8);
        console.log('Generated corridors:', corridors.length);

        const exporter = new ExportManager();
        const pdfBytes = await exporter.exportToPDF(floorPlan, ilots, corridors, { width: 800, height: 600 });
        const path = await exporter.saveToFile(pdfBytes, `debug_floorplan_${Date.now()}`, 'pdf');
        console.log('Exported PDF to', path);
    } catch (e) {
        console.error('Debug export failed:', e && e.stack ? e.stack : e);
        process.exit(1);
    }
})();
