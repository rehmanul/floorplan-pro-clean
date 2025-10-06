// FloorPlan Pro Clean - Advanced System
import * as THREE from './libs/build/three.module.js';
import { ThreeRenderer } from './threeRenderer.js';
import { loadViewer, overlayShapes } from './autodeskViewer.js';

let currentFloorPlan = null;
let generatedIlots = [];
let corridorNetwork = [];
let currentRenderer = null;
let rendererType = 'three'; // Default renderer

document.addEventListener('DOMContentLoaded', function () {
    console.log('FloorPlan Pro Clean - System Ready');

    // Global defensive error handler to surface injected-script issues (e.g., content.js from extensions)
    window.addEventListener('error', (ev) => {
        try {
            const src = ev.filename || (ev.error && ev.error.fileName) || '';
            if (src && src.toLowerCase().includes('content.js')) {
                console.warn('An injected script (content.js) triggered an error:', ev.message, 'from', src);
                // suppress the error to avoid breaking the app UI; report to console only
                ev.preventDefault && ev.preventDefault();
            }
        } catch (e) { /* ignore errors in handler */ }
    });

    // Defensive shim: some browser extensions inject a global `content` object that conflicts with our usage.
    // Provide a minimal safe `content.query` stub if an unexpected `content` object exists to avoid runtime TypeErrors.
    try {
        if (typeof window.content === 'undefined') {
            // Some extensions inject code expecting a `content` global. Provide a minimal safe object to avoid crashes.
            Object.defineProperty(window, 'content', {
                configurable: true,
                enumerable: false,
                writable: true,
                value: { query: function () { return null; } }
            });
        } else if (typeof window.content.query === 'undefined') {
            // Only add a safe no-op query function if content exists but doesn't expose query.
            Object.defineProperty(window.content, 'query', {
                configurable: true,
                enumerable: false,
                writable: true,
                value: function () { return null; }
            });
        }
    } catch (e) {
        // ignore
    }

    // Initialize the main container
    const container = document.getElementById('threeContainer');
    if (container) {
        currentRenderer = new ThreeRenderer(container);
    }

    // Viewer toggle buttons
    const useThreeBtn = document.getElementById('useThreeBtn');
    const useViewerBtn = document.getElementById('useViewerBtn');
    let viewerHandle = null;
    let viewerContainer = document.getElementById('threeContainer');

    if (useThreeBtn && useViewerBtn) {
        useThreeBtn.addEventListener('click', async () => {
            rendererType = 'three';
            if (viewerHandle && viewerHandle.viewer) {
                try { viewerHandle.viewer.finish(); } catch (e) { /* ignore */ }
                viewerHandle = null;
            }
            // re-init ThreeRenderer if needed
            if (!currentRenderer) currentRenderer = new ThreeRenderer(viewerContainer);
            currentRenderer.renderFloorPlan(currentFloorPlan, generatedIlots, corridorNetwork);
        });

        useViewerBtn.addEventListener('click', async () => {
            rendererType = 'viewer';
            try {
                if (!viewerHandle) {
                    viewerHandle = await loadViewer(viewerContainer, currentFloorPlan?.urn || '', { autoApplyTransform: true });
                }
                // overlay existing ilots/corridors, passing viewer handle for projection
                overlayShapes(viewerContainer, generatedIlots, corridorNetwork, viewerHandle);
            } catch (e) {
                console.error('Failed to initialize Autodesk Viewer:', e);
                showNotification('Viewer initialization failed', 'error');
            }
        });

        // Transform debug button (opens small debug panel when viewer is active)
        const transformDebugBtn = document.getElementById('transformDebugBtn');
        if (transformDebugBtn) {
            transformDebugBtn.addEventListener('click', async () => {
                if (!viewerHandle) {
                    try { viewerHandle = await loadViewer(viewerContainer, currentFloorPlan?.urn || '', { autoApplyTransform: true }); }
                    catch (e) { showNotification('Viewer not available', 'error'); return; }
                }
                try {
                    // lazy import of debug renderer function
                    const mod = await import('./autodeskViewer.js');
                    const urn = currentFloorPlan?.urn || '';
                    mod.renderTransformDebugPanel(viewerContainer, urn, viewerHandle, {
                        onApply: (m) => {
                            // reproject overlays when transform applied
                            overlayShapes(viewerContainer, generatedIlots, corridorNetwork, viewerHandle);
                        }
                    });
                } catch (e) {
                    console.error('Failed to open transform debug panel', e);
                }
            });
        }
    }

    // Sidebar toggle buttons
    const leftToggleBtn = document.querySelector('.toggle-left');
    const rightToggleBtn = document.querySelector('.toggle-right');
    const containerDiv = document.querySelector('.container');

    if (leftToggleBtn && containerDiv) {
        leftToggleBtn.addEventListener('click', () => {
            containerDiv.classList.toggle('left-collapsed');
        });
    }

    if (rightToggleBtn && containerDiv) {
        rightToggleBtn.addEventListener('click', () => {
            containerDiv.classList.toggle('right-collapsed');
        });
    }

    // Attach event listeners to UI elements
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.onchange = handleFileUpload;

    const generateIlotsBtn = document.getElementById('generateIlotsBtn');
    if (generateIlotsBtn) generateIlotsBtn.onclick = generateIlots;

    const generateCorridorsBtn = document.getElementById('generateCorridorsBtn');
    if (generateCorridorsBtn) generateCorridorsBtn.onclick = generateCorridors;

    const corridorWidthSlider = document.getElementById('corridorWidthSlider');
    const corridorWidthValue = document.getElementById('corridorWidthValue');
    if (corridorWidthSlider && corridorWidthValue) {
        corridorWidthValue.textContent = corridorWidthSlider.value + 'm';
        corridorWidthSlider.addEventListener('input', () => {
            corridorWidthValue.textContent = corridorWidthSlider.value + 'm';
        });
    }

    // Optional distribution editor (simple JSON textarea)
    const distributionEditor = document.createElement('textarea');
    distributionEditor.id = 'distributionEditor';
    distributionEditor.style.width = '100%';
    distributionEditor.style.height = '80px';
    distributionEditor.value = JSON.stringify({ '0-1': 10, '1-3': 25, '3-5': 30, '5-10': 35 }, null, 2);
    const configLabel = document.querySelector('.panel h4');
    const containerPanel = document.querySelector('.panel');
    // Insert under configuration block
    const configSection = document.querySelectorAll('.panel')[0];
    if (configSection) configSection.appendChild(distributionEditor);

    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) exportPdfBtn.onclick = exportToPDF;

    const exportImageBtn = document.getElementById('exportImageBtn');
    if (exportImageBtn) exportImageBtn.onclick = exportToImage;

    // Zoom controls - compatible with OrbitControls implementations that may not expose dollyIn/dollyOut
    window.addEventListener('wheel', (event) => {
        if (!currentRenderer) return;
        const controls = currentRenderer.controls;
        const camera = currentRenderer.camera;
        if (!controls || !camera) return;

        event.preventDefault();
        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;

        // Orthographic camera: adjust zoom
        if (camera.isOrthographicCamera) {
            camera.zoom = Math.max(0.1, Math.min(10, camera.zoom * zoomFactor));
            camera.updateProjectionMatrix();
            // If controls support update, call it
            if (typeof controls.update === 'function') controls.update();
            return;
        }

        // Perspective camera: move camera along its forward vector
        if (camera.isPerspectiveCamera) {
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const move = dir.multiplyScalar((zoomFactor - 1) * 200); // scale movement
            camera.position.add(move);
            if (typeof controls.update === 'function') controls.update();
            return;
        }
    }, { passive: false });

    showNotification('FloorPlan Pro Clean ready for CAD analysis', 'info');
});

async function handleFileUpload(e) {
    if (!e.target.files[0]) return;

    const file = e.target.files[0];
    try {
        showNotification('Processing CAD file...', 'info');
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('http://localhost:3001/api/jobs', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        let analysisData;

        if (result.urn) {
            analysisData = await pollForAPSCompletion(result.urn);
        } else {
            throw new Error('Upload failed to return a valid URN.');
        }

        currentFloorPlan = {
            walls: analysisData.walls || [],
            forbiddenZones: analysisData.forbiddenZones || [],
            entrances: analysisData.entrances || [],
            bounds: analysisData.bounds,
            totalArea: analysisData.totalArea || 0,
            rooms: analysisData.rooms || []
            , placementTransform: analysisData.placementTransform || null
        };

        // Update UI statistics
        document.getElementById('roomCount').textContent = currentFloorPlan.rooms.length;
        document.getElementById('totalArea').textContent = `${currentFloorPlan.totalArea} m²`;

        if (currentRenderer) currentRenderer.renderFloorPlan(currentFloorPlan, generatedIlots, corridorNetwork);
        showNotification(`File processed successfully!`, 'success');

    } catch (error) {
        showNotification('Upload failed: ' + error.message, 'error');
    }
}

async function generateIlots() {
    if (!currentFloorPlan) {
        showNotification('Please upload a CAD file first', 'warning');
        return;
    }

    showNotification('Generating îlots...', 'info');

    // Derive ilot count from floor area when possible (approx 1 ilot per 12 m^2)
    let totalIlots = 100;
    try {
        if (currentFloorPlan && currentFloorPlan.bounds && currentFloorPlan.bounds.width && currentFloorPlan.bounds.height) {
            const area = currentFloorPlan.bounds.width * currentFloorPlan.bounds.height;
            totalIlots = Math.max(6, Math.round(area / 12));
        }
    } catch (e) {
        console.warn('Error computing ilot count from bounds, using default 100', e);
    }

    try {
        const response = await fetch('http://localhost:3001/api/ilots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ floorPlan: currentFloorPlan, distribution: parseDistribution(), options: { totalIlots } })
        });

        const result = await response.json();
        generatedIlots = result.ilots || [];
        document.getElementById('ilotCount').textContent = generatedIlots.length;

        // Update right sidebar list
        const ilotsList = document.getElementById('ilotsList');
        ilotsList.innerHTML = '';
        if (generatedIlots.length === 0) {
            ilotsList.innerHTML = '<div class="list-item">No îlots generated yet</div>';
        } else {
            generatedIlots.forEach((ilot, index) => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.textContent = `Îlot ${index + 1} - Capacity: ${ilot.capacity || 'N/A'}`;
                ilotsList.appendChild(item);
            });
        }

        // Warn if ilots missing coordinates and surface raw APS analysis to #aps-debug if present
        const missingCoords = generatedIlots.filter(p => !p || typeof p.x !== 'number' || typeof p.y !== 'number');
        if (missingCoords.length) {
            console.warn('Received ilots with missing coordinates; count=', missingCoords.length);
            const debugEl = document.getElementById('aps-debug');
            if (debugEl && currentFloorPlan) debugEl.textContent = JSON.stringify(currentFloorPlan, null, 2);
        }

        if (currentRenderer) {
            currentRenderer.renderFloorPlan(currentFloorPlan, generatedIlots, corridorNetwork);
            currentRenderer.updateMeasurements && currentRenderer.updateMeasurements();
        }
        // If viewer is active, update viewer overlay too
        if (rendererType === 'viewer' && typeof overlayShapes === 'function' && typeof viewerHandle !== 'undefined' && viewerHandle) {
            overlayShapes(document.getElementById('threeContainer'), generatedIlots, corridorNetwork, viewerHandle);
        }
        showNotification(`Generated ${generatedIlots.length} îlots successfully!`, 'success');

    } catch (error) {
        console.error('Îlot generation error:', error);
        showNotification('Îlot generation failed', 'error');
    }
}

function parseDistribution() {
    const txt = document.getElementById('distributionEditor')?.value;
    if (!txt) return { '0-1': 10, '1-3': 25, '3-5': 30, '5-10': 35 };
    try {
        const obj = JSON.parse(txt);
        if (typeof obj === 'object') return obj;
    } catch (e) {
        console.warn('Invalid distribution JSON, falling back to default');
    }
    return { '0-1': 10, '1-3': 25, '3-5': 30, '5-10': 35 };
}

async function generateCorridors() {
    if (!generatedIlots.length) {
        showNotification('Please generate îlots first', 'warning');
        return;
    }

    showNotification('Generating corridors...', 'info');

    try {
        const response = await fetch('http://localhost:3001/api/corridors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                floorPlan: currentFloorPlan,
                ilots: generatedIlots,
                corridorWidth: parseFloat(document.getElementById('corridorWidthSlider').value || '1.5')
            })
        });

        const result = await response.json();
        corridorNetwork = result.corridors || [];

        // Update right sidebar list
        const corridorList = document.getElementById('corridorList');
        corridorList.innerHTML = '';
        if (corridorNetwork.length === 0) {
            corridorList.innerHTML = '<div class="list-item">No corridors generated yet</div>';
        } else {
            corridorNetwork.forEach((corridor, index) => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.textContent = `Corridor ${index + 1} - Type: ${corridor.type || 'Standard'}`;
                corridorList.appendChild(item);
            });
        }

        if (currentRenderer) currentRenderer.renderFloorPlan(currentFloorPlan, generatedIlots, corridorNetwork);
        if (rendererType === 'viewer' && typeof overlayShapes === 'function' && typeof viewerHandle !== 'undefined' && viewerHandle) {
            overlayShapes(document.getElementById('threeContainer'), generatedIlots, corridorNetwork, viewerHandle);
        }
        showNotification(`Generated ${corridorNetwork.length} corridors successfully!`, 'success');

    } catch (error) {
        showNotification('Corridor generation failed', 'error');
    }
}

async function exportToPDF() {
    if (!currentFloorPlan) {
        showNotification('No floor plan to export.', 'warning');
        return;
    }
    showNotification('Generating PDF...', 'info');
    try {
        const response = await fetch('http://localhost:3001/api/export/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ floorPlan: currentFloorPlan, ilots: generatedIlots, corridors: corridorNetwork })
        });

        const result = await response.json();
        if (result && result.filepath) {
            showNotification('PDF exported: ' + result.filename, 'success');
            // Trigger download
            window.open(`http://localhost:3001/exports/${result.filename}`, '_blank');
        } else {
            showNotification('PDF export failed', 'error');
        }
    } catch (e) {
        showNotification('PDF export failed: ' + e.message, 'error');
    }
}

async function exportToImage() {
    if (!currentFloorPlan) {
        showNotification('No floor plan to export.', 'warning');
        return;
    }
    showNotification('Generating Image...', 'info');
    try {
        const response = await fetch('http://localhost:3001/api/export/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ floorPlan: currentFloorPlan, ilots: generatedIlots, corridors: corridorNetwork })
        });

        const result = await response.json();
        if (result && result.filepath) {
            showNotification('Image exported: ' + result.filename, 'success');
            window.open(`http://localhost:3001/exports/${result.filename}`, '_blank');
        } else {
            showNotification('Image export failed', 'error');
        }
    } catch (e) {
        showNotification('Image export failed: ' + e.message, 'error');
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

async function pollForAPSCompletion(urn) {
    const maxAttempts = 20;
    let attempts = 0;

    while (attempts < maxAttempts) {
        try {
            const analysisResponse = await fetch('http://localhost:3001/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urn: urn })
            });

            if (analysisResponse.status === 202) {
                const result = await analysisResponse.json();
                showNotification(`APS Processing: ${result.message}`, 'info');
                await new Promise(resolve => setTimeout(resolve, 10000));
                attempts++;
            } else if (analysisResponse.ok) {
                return await analysisResponse.json();
            } else {
                throw new Error('Analysis failed after processing.');
            }
        } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) {
                throw new Error('APS processing timeout.');
            }
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    throw new Error('APS processing failed to complete.');
}
