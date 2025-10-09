# FloorPlan Pro - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- Git
- (Optional) Autodesk APS credentials for DWG support

### Installation

```bash
# Clone the repository
git clone https://github.com/rehmanul/floorplan-pro-clean.git
cd floorplan-pro-clean

# Install dependencies
npm install

# Configure environment (optional for APS)
cp .env.example .env
# Edit .env and add your APS credentials if using DWG files
```

### Running the Application

```bash
# Start the server
npm start

# Server will start at http://localhost:5000
# Open http://localhost:5000 in your browser
```

## 📋 Basic Workflow

### 1. Upload CAD File

```
Click "Upload CAD File" → Select .dxf or .dwg file
```

**Supported formats:**
- ✅ DXF (AutoCAD Drawing Exchange Format)
- ✅ DWG (via Autodesk APS translation)

**Expected layer naming:**
- `WALLS` / `PARTITION` → Black walls (0,0,0)
- `ENTRANCE` / `DOOR` / `EXIT` → Red entrances (255,0,0)  
- `FORBIDDEN` / `STAIR` / `ELEVATOR` → Blue forbidden zones (0,0,255)

### 2. Configure Ilot Distribution

Edit the distribution JSON in the left panel:

```json
{
  "0-1": 10,   // 10% of ilots between 0-1 m²
  "1-3": 25,   // 25% between 1-3 m²
  "3-5": 30,   // 30% between 3-5 m²
  "5-10": 35   // 35% between 5-10 m²
}
```

### 3. Generate Ilots

```
Click "Generate Îlots" → Wait for placement
```

The system will:
1. Parse the floor plan geometry
2. Identify free zones
3. Place ilots according to distribution
4. Avoid walls, entrances, and forbidden zones
5. Eliminate overlaps

### 4. Generate Corridors

```
Adjust "Corridor Width" slider → Click "Generate Corridors"
```

The system will:
1. Group ilots into rows
2. Detect facing rows
3. Route corridors between them
4. Validate clearances
5. Generate optimized paths

### 5. Export Results

```
Click "Export PDF" or "Export Image"
```

Exports will include:
- Floor plan outline (black)
- Generated ilots (green)
- Corridor network (yellow)
- Forbidden zones (blue)
- Entrances (red)

## 🎨 Visualization Modes

### Three.js Mode (Default)
- Full 3D visualization
- Interactive camera controls
- Material effects and shadows
- LOD optimization

### Autodesk Viewer Mode
- Professional BIM viewer
- Native DWG/DXF viewing
- Measurement tools
- Model navigation

### 2D Canvas Fallback
- Automatic fallback if WebGL unavailable
- Basic 2D rendering
- Lightweight and fast

## 🛠️ Advanced Usage

### Custom Seed for Deterministic Placement

```javascript
// In distribution editor, add:
{
  "0-1": 10,
  "1-3": 25,
  "3-5": 30,
  "5-10": 35,
  "seed": 12345  // Same seed = same placement
}
```

### Corridor Width Optimization

Typical values:
- **1.0m** - Minimal (single person)
- **1.5m** - Standard (default)
- **2.0m** - Comfortable (two persons)
- **2.5m+** - Wide (accessibility)

### Placement Options

```javascript
{
  "minEntranceDistance": 1.0,  // Distance from entrances
  "minIlotDistance": 0.2,      // Spacing between ilots
  "maxAttemptsPerIlot": 800    // Placement attempts
}
```

## 🔧 Troubleshooting

### No ilots generated
**Cause:** Floor plan too small or too constrained  
**Solution:** 
- Check CAD file has valid bounds
- Reduce ilot count or size
- Increase placement attempts

### Corridors not appearing
**Cause:** Ilots not aligned in rows  
**Solution:**
- Regenerate ilots with different seed
- Adjust corridor width
- Check row grouping tolerance

### Renderer shows nothing
**Cause:** Invalid geometry or WebGL issue  
**Solution:**
- Check browser console for errors
- Try 2D fallback mode
- Validate CAD file has walls

### APS translation timeout
**Cause:** File too large or APS busy  
**Solution:**
- Wait and retry
- Use DXF instead of DWG
- Check APS credentials

## 📊 Performance Tips

### For Large Floor Plans (>5000 entities)

1. **Use DXF instead of DWG** (faster parsing)
2. **Reduce ilot count** (fewer placements)
3. **Increase spatial grid cell size** (faster queries)
4. **Disable post-processing** (faster rendering)

### For Best Quality

1. **Clean CAD layers** (proper naming)
2. **Close all polygons** (proper geometry)
3. **Use metric units** (m² not ft²)
4. **Remove duplicate entities** (cleaner parsing)

## 🧪 Validation

Run system validation:

```bash
node validate_fixes.js
```

Expected output:
```
✅ CAD Processor - buildPolygonsFromSegments enhanced
✅ Ilot Placer - Enhanced validation
✅ Corridor Generator - Enhanced routing
✅ Three.js Renderer - Enhanced rendering
✅ APS Processor - Enhanced extraction
✅ Sanitizers - Data validation
✅ Server - CAD data normalization
✅ Integration - Complete pipeline

📊 Test Results: 8 passed, 0 failed
✨ All validations passed! System is operational.
```

## 📚 Additional Resources

- **API Documentation:** `/docs/API.md`
- **Architecture:** `/ARCHITECTURE_FIXES.md`
- **Bug Fixes:** `/FIXES_APPLIED.md`
- **GitHub Issues:** [Report bugs](https://github.com/rehmanul/floorplan-pro-clean/issues)

## 💡 Examples

### Example 1: Office Layout

```javascript
// Distribution for typical office
{
  "1-3": 40,    // Individual desks
  "3-5": 30,    // Small meeting rooms
  "5-10": 20,   // Team spaces
  "10-20": 10   // Conference rooms
}
```

### Example 2: Hotel Floor

```javascript
// Distribution for hotel rooms
{
  "15-20": 60,  // Standard rooms
  "20-30": 30,  // Deluxe rooms
  "30-50": 10   // Suites
}
```

### Example 3: Co-Working Space

```javascript
// Distribution for flexible workspace
{
  "1-2": 30,    // Hot desks
  "2-4": 40,    // Fixed desks
  "4-8": 20,    // Small offices
  "8-15": 10    // Meeting rooms
}
```

## 🎯 Best Practices

1. **Always validate CAD file** before uploading
2. **Start with default distribution** then customize
3. **Generate corridors after ilots** for best results
4. **Save configurations** that work well
5. **Test with small areas first** before full floor
6. **Export frequently** to preserve work

## 🆘 Support

Need help?
- **Email:** rehman.shoj2@gmail.com
- **GitHub:** [Open an issue](https://github.com/rehmanul/floorplan-pro-clean/issues)
- **Documentation:** Check `/docs` folder

---

**Version:** 1.0.0  
**Last Updated:** 2025-10-09  
**Status:** ✅ Production Ready
