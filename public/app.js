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

    // Initialize content.query immediately to prevent TypeErrors
    (function initializeContentQuery() {
        // Defensive shim: some browser extensions inject a global `content` object that conflicts with our usage.
        // Provide a minimal safe `content.query` stub if an unexpected `content` object exists to avoid runtime TypeErrors.
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
    })(); // Execute immediately

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
    // expose viewerHandle to window so overlay functions can access it reliably
    Object.defineProperty(window, '__viewerHandle', { configurable: true, enumerable: false, writable: true, value: viewerHandle });

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
                    // Prefer URN from currentFloorPlan, then auto URN from query param
                    const urn = currentFloorPlan?.urn || window.__AUTO_URN__ || '';
                    if (!urn) {
                        showNotification('No document loaded for Autodesk Viewer — upload a CAD file or provide ?urn=<urn>', 'warning');
                        return;
                    }
                    viewerHandle = await loadViewer(viewerContainer, urn, { autoApplyTransform: true });
                }
                // overlay existing ilots/corridors, passing viewer handle for projection
                overlayShapes(viewerContainer, generatedIlots, corridorNetwork, viewerHandle);
            } catch (e) {
                console.error('Failed to initialize Autodesk Viewer:', e);
                showNotification('Viewer initialization failed', 'error');
            }
        });
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

    // Viewer controls
    const resetCameraBtn = document.getElementById('resetCameraBtn');
    if (resetCameraBtn) {
        resetCameraBtn.addEventListener('click', () => {
            if (currentRenderer && currentRenderer.camera && currentRenderer.controls) {
                currentRenderer.camera.position.set(0, 1500, 0);
                currentRenderer.camera.lookAt(0, 0, 0);
                currentRenderer.controls.reset();
                showNotification('Camera reset', 'info');
            }
        });
    }

    const wireframeToggleBtn = document.getElementById('wireframeToggleBtn');
    if (wireframeToggleBtn) {
        wireframeToggleBtn.addEventListener('click', () => {
            if (currentRenderer && currentRenderer.scene) {
                currentRenderer.scene.traverse((obj) => {
                    if (obj.material) {
                        obj.material.wireframe = !obj.material.wireframe;
                    }
                });
                showNotification('Wireframe toggled', 'info');
            }
        });
    }

    const gridToggleBtn = document.getElementById('gridToggleBtn');
    if (gridToggleBtn) {
        gridToggleBtn.addEventListener('click', () => {
            if (currentRenderer && currentRenderer.gridHelper) {
                currentRenderer.gridHelper.visible = !currentRenderer.gridHelper.visible;
                showNotification('Grid toggled', 'info');
            }
        });
    }

    // Optimization buttons (may be noop if backend doesn't expose these endpoints)
    const optimizeLayoutBtn = document.getElementById('optimizeLayoutBtn');
    const optimizePathsBtn = document.getElementById('optimizePathsBtn');
    if (optimizeLayoutBtn) {
        optimizeLayoutBtn.addEventListener('click', async () => {
            if (!generatedIlots.length || !currentFloorPlan) { showNotification('Generate îlots first', 'warning'); return; }
            showNotification('Applying layout optimization...', 'info');
            try {
                const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
                const resp = await fetch(`${API}/api/optimize/layout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floorPlan: currentFloorPlan, ilots: generatedIlots }) });
                const j = await resp.json();
                if (j && Array.isArray(j.ilots)) {
                    generatedIlots = j.ilots;
                    document.getElementById('ilotCount').textContent = generatedIlots.length;
                    if (currentRenderer) currentRenderer.renderFloorPlan(currentFloorPlan, generatedIlots, corridorNetwork);
                    showNotification('Optimization complete', 'success');
                } else {
                    showNotification('No optimization changes returned', 'warning');
                }
            } catch (e) {
                console.error('Optimization layout failed', e);
                showNotification('Optimization failed', 'error');
            }
        });
    }

    if (optimizePathsBtn) {
        optimizePathsBtn.addEventListener('click', async () => {
            if (!generatedIlots.length || !currentFloorPlan) { showNotification('Generate îlots first', 'warning'); return; }
            showNotification('Optimizing corridors...', 'info');
            try {
                const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
                const resp = await fetch(`${API}/api/optimize/paths`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floorPlan: currentFloorPlan, ilots: generatedIlots }) });
                const j = await resp.json();
                if (j && Array.isArray(j.corridors)) {
                    corridorNetwork = j.corridors;
                    if (currentRenderer) currentRenderer.renderFloorPlan(currentFloorPlan, generatedIlots, corridorNetwork);
                    showNotification('Corridor optimization complete', 'success');
                } else {
                    showNotification('No corridor optimization returned', 'warning');
                }
            } catch (e) {
                console.error('Optimization paths failed', e);
                showNotification('Optimization failed', 'error');
            }
        });
    }

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
        showLoader('Uploading file...');
        const formData = new FormData();
        formData.append('file', file);

        const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
        const response = await fetch(`${API}/api/jobs`, {
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
            urn: result.urn, // Store the URN for Autodesk Viewer
            walls: analysisData.walls || [],
            forbiddenZones: analysisData.forbiddenZones || [],
            entrances: analysisData.entrances || [],
            bounds: analysisData.bounds,
            totalArea: analysisData.totalArea || 0,
            rooms: analysisData.rooms || [],
            placementTransform: analysisData.placementTransform || null
        };

        // Update UI statistics
        document.getElementById('roomCount').textContent = currentFloorPlan.rooms.length;
        document.getElementById('totalArea').textContent = `${currentFloorPlan.totalArea} m²`;

        if (currentRenderer) currentRenderer.renderFloorPlan(currentFloorPlan, generatedIlots, corridorNetwork);
        hideLoader();
        showNotification(`File processed successfully!`, 'success');

    } catch (error) {
        hideLoader();
        showNotification('Upload failed: ' + error.message, 'error');
    }
}

function updateStats() {
    document.getElementById('roomCount').textContent = currentFloorPlan.rooms.length;
    document.getElementById('totalArea').textContent = `${currentFloorPlan.totalArea} m²`;
    document.getElementById('ilotCount').textContent = generatedIlots.length;
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
}

function renderCurrentState() {
    if (currentRenderer) currentRenderer.renderFloorPlan(currentFloorPlan, generatedIlots, corridorNetwork);
    if (rendererType === 'viewer' && typeof overlayShapes === 'function' && typeof viewerHandle !== 'undefined' && viewerHandle) {
        overlayShapes(document.getElementById('threeContainer'), generatedIlots, corridorNetwork, viewerHandle);
    }
}


async function generateIlots() {
    if (!currentFloorPlan) {
        showNotification('Please upload a CAD file first', 'warning');
        return;
    }

    // Generate Îlots button handler
    if (generateIlotsBtn) {
        generateIlotsBtn.addEventListener('click', async () => {
            if (!currentFloorPlan) {
                showNotification('Please upload a CAD file first', 'warning');
                return;
            }

            try {
                showLoader('Generating îlots...');

                // Ensure floorPlan has required arrays (even if empty)
                const floorPlan = {
                    ...currentFloorPlan,
                    walls: currentFloorPlan.walls || [],
                    forbiddenZones: currentFloorPlan.forbiddenZones || [],
                    entrances: currentFloorPlan.entrances || [],
                    bounds: currentFloorPlan.bounds || { minX: 0, minY: 0, maxX: 100, maxY: 100 }
                };

                const distribution = {
                    '1-3': 0.25,
                    '3-5': 0.35,
                    '5-10': 0.40
                };

                const response = await fetch('/api/ilots', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        floorPlan: floorPlan,
                        distribution: distribution,
                        options: { 
                            totalIlots: 50,
                            seed: Date.now(),
                            minEntranceDistance: 1.0,
                            minIlotDistance: 0.5,
                            maxAttemptsPerIlot: 800
                        }
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to generate ilots');
                }

                const data = await response.json();
                generatedIlots = data.ilots || [];

                console.log(`Generated ${generatedIlots.length} ilots with total area: ${data.totalArea?.toFixed(2) || 0} m²`);

                updateStats();
                renderCurrentState();

                showNotification(`Generated ${generatedIlots.length} îlots`, 'success');
                hideLoader();
            } catch (error) {
                console.error('Îlot generation error:', error);
                showNotification(`Failed to generate îlots: ${error.message}`, 'error');
                hideLoader();
            }
        });
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
        const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
        const response = await fetch(`${API}/api/corridors`, {
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

        updateStats();
        renderCurrentState();

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
        const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
        const response = await fetch(`${API}/api/export/pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ floorPlan: currentFloorPlan, ilots: generatedIlots, corridors: corridorNetwork })
        });

        const result = await response.json();
        if (result && result.filepath) {
            showNotification('PDF exported: ' + result.filename, 'success');
            // Trigger download
            const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
            window.open(`${API}/exports/${result.filename}`, '_blank');
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
        const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
        const response = await fetch(`${API}/api/export/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ floorPlan: currentFloorPlan, ilots: generatedIlots, corridors: corridorNetwork })
        });

        const result = await response.json();
        if (result && result.filepath) {
            showNotification('Image exported: ' + result.filename, 'success');
            const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
            window.open(`${API}/exports/${result.filename}`, '_blank');
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
    const maxAttempts = 30;
    let attempts = 0;
    showLoader('Waiting for APS translation...');

    while (attempts < maxAttempts) {
        try {
            const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:5000';
            
            // First check status endpoint
            const statusResponse = await fetch(`${API}/api/jobs/${encodeURIComponent(urn)}/status`);
            const statusData = await statusResponse.json();
            
            console.log(`Polling attempt ${attempts + 1}/${maxAttempts}, status:`, statusData.status);
            
            if (statusData.status === 'failed' || statusData.status === 'failed-translating') {
                hideLoader();
                showNotification('CAD file translation failed. Please check the file format.', 'error');
                return;
            }
            
            if (!statusData.ready) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }
            
            // Now try analysis
            const analysisResponse = await fetch(`${API}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urn: urn })
            });

            if (analysisResponse.status === 202) {
                const result = await analysisResponse.json();
                // Update persistent loader message to surface server-side status
                try { showLoader(`APS Processing: ${result.message || 'working...'}`); } catch (e) { /* ignore */ }
                await new Promise(resolve => setTimeout(resolve, 10000));
                attempts++;
            } else if (analysisResponse.ok) {
                const payload = await analysisResponse.json();
                hideLoader();
                return payload;
            } else {
                hideLoader();
                throw new Error('Analysis failed after processing.');
            }
        } catch (error) {
            attempts++;
            if (attempts >= maxAttempts) {
                hideLoader();
                throw new Error('APS processing timeout.');
            }
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    throw new Error('APS processing failed to complete.');
}

// Loader helpers
function showLoader(message) {
    try {
        const overlay = document.getElementById('globalLoader');
        const msg = document.getElementById('loaderMessage');
        if (!overlay) return;
        if (msg && message) msg.textContent = message;
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
    } catch (e) { /* ignore */ }
}

function hideLoader() {
    try {
        const overlay = document.getElementById('globalLoader');
        if (!overlay) return;
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
    } catch (e) { /* ignore */ }
}