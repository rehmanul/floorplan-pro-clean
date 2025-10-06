const ProfessionalCADProcessor = require('../lib/professionalCADProcessor');
const fs = require('fs');

// Generate a simple DXF-like string containing an ARC entity and a LWPOLYLINE with bulge
function makeArcDXF() {
    return [
        '0', 'SECTION', '2', 'ENTITIES',
        '0', 'ARC',
        '10', '50',
        '20', '60',
        '40', '10',
        '50', '0',
        '51', '90',
        '0', 'ENDSEC',
        '0', 'EOF'
    ].join('\n');
}

function makeLwpolyDXF() {
    // triangle with one bulge between v1->v2
    return [
        '0', 'SECTION', '2', 'ENTITIES',
        '0', 'LWPOLYLINE',
        '10', '0', '20', '0', '42', '0',
        '10', '10', '20', '0', '42', '1',
        '10', '10', '20', '10', '42', '0',
        '0', 'ENDSEC',
        '0', 'EOF'
    ].join('\n');
}

test('ARC and LWPOLYLINE (bulge) are parsed into segments/polygons', () => {
    const tmpArc = 'test/tmp_arc.dxf';
    const tmpLw = 'test/tmp_lw.dxf';
    if (!fs.existsSync('test')) fs.mkdirSync('test');
    fs.writeFileSync(tmpArc, makeArcDXF());
    fs.writeFileSync(tmpLw, makeLwpolyDXF());

    const p = new ProfessionalCADProcessor();
    const arcRes = p.processDXF(tmpArc);
    const lwRes = p.processDXF(tmpLw);

    // ARC should have produced at least one wall segment or polygon
    expect(arcRes.walls.length + arcRes.forbiddenZones.length + arcRes.entrances.length).toBeGreaterThan(0);
    expect(lwRes.walls.length + lwRes.forbiddenZones.length + lwRes.entrances.length).toBeGreaterThan(0);

    // cleanup
    fs.unlinkSync(tmpArc);
    fs.unlinkSync(tmpLw);
});
