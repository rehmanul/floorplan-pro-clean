// Minimal Autodesk Viewer integration helper (uses Viewer v7+ CDN)
export async function loadViewer(container, urn, options = {}) {
    // load the Viewer script dynamically if necessary
    if (!window.Autodesk) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // get token from server
    const API_BASE = window.location.origin;
    let tokenJson = null;
    try {
        const tokenResp = await fetch(`${API_BASE}/api/viewer/token`);
        if (!tokenResp.ok) {
            const body = await tokenResp.text().catch(() => null);
            const errorMsg = `Viewer token endpoint returned ${tokenResp.status}${body ? ' - ' + body : ''}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
        tokenJson = await tokenResp.json();

        if (!tokenJson || !tokenJson.access_token) {
            throw new Error('Invalid token response - missing access_token');
        }

        console.log('Viewer token obtained successfully, expires in:', tokenJson.expires_in, 'seconds');
    } catch (e) {
        console.error('Failed to obtain viewer token:', e);
        throw new Error('Failed to get Autodesk Viewer token. Please check APS credentials in .env file.');
    }
    const auth = {
        getAccessToken: function (onGetAccessToken) {
            onGetAccessToken(tokenJson.access_token, tokenJson.expires_in);
        }
    };

    const initializerOpts = { env: 'AutodeskProduction', api: 'derivativeV2', getAccessToken: auth.getAccessToken };

    return new Promise((resolve, reject) => {
        window.Autodesk.Viewing.Initializer(initializerOpts, async () => {
            try {
                const viewerDiv = container;
                while (viewerDiv.firstChild) viewerDiv.removeChild(viewerDiv.firstChild);
                const viewer = new window.Autodesk.Viewing.GuiViewer3D(viewerDiv);
                viewer.start();

                // normalize URN and avoid calling the viewer with an empty placeholder
                let urnArg = '';
                try {
                    if (typeof urn === 'string' && urn.trim() !== '') {
                        urnArg = urn.startsWith('urn:') ? urn : `urn:${urn}`;
                    }
                } catch (e) { urnArg = ''; }

                // Try fetching manifest via server proxy first to detect CORS issues early (only when URN looks valid)
                if (urnArg && urnArg.toLowerCase() !== 'urn:') {
                    try {
                        const API = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
                        const proxyResp = await fetch(`${API}/api/aps/manifest?urn=${encodeURIComponent(urnArg)}`);
                        if (!proxyResp.ok) {
                            // include response body when possible to aid debugging and abort viewer load
                            const body = await proxyResp.text().catch(() => null);
                            const msg = 'Manifest proxy returned non-ok: ' + proxyResp.status + (body ? ' - ' + body : '');
                            console.warn(msg);
                            // Throw to stop the viewer from proceeding to CDN requests which can trigger CORS failures
                            throw new Error(msg);
                        }
                    } catch (e) {
                        console.warn('Could not fetch manifest via server proxy (CORS or network?):', e.message || e);
                        // Re-throw so caller (app.js) knows initialization failed and can surface a user-friendly error
                        throw e;
                    }
                }

                const loadOptions = { placementTransform: null };

                // If no valid URN provided, return the initialized viewer without loading a document
                if (!urnArg || urnArg.toLowerCase() === 'urn:') {
                    console.warn('No valid URN provided to viewer; initialized viewer without a document load');
                    return resolve({ viewer, doc: null, model: null });
                }

                // Load the document and apply placement transform if available
                window.Autodesk.Viewing.Document.load(urnArg, async (doc) => {
                    try {
                        const defaultModel = doc.getRoot().getDefaultGeometry();
                        const model = await viewer.loadDocumentNode(doc, defaultModel, loadOptions);
                        const loadedModel = model || viewer.model || null;

                        if (options && options.autoApplyTransform && urnArg) {
                            try {
                                const API2 = (window.__API_BASE__) ? window.__API_BASE__ : 'http://localhost:3001';
                                const resp = await fetch(`${API2}/api/transforms/${encodeURIComponent(urnArg)}/effective`);
                                if (resp.ok) {
                                    const j = await resp.json();
                                    if (j && j.transform) {
                                        try {
                                            let t = j.transform;
                                            if (t && t.elements) t = t.elements;
                                            if (loadedModel && loadedModel.getData) {
                                                if (Array.isArray(t) && t.length === 16) {
                                                    loadedModel.getData().placementTransform = t.slice();
                                                } else if (t && typeof t.x === 'number') {
                                                    loadedModel.getData().placementTransform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t.x, t.y, t.z, 1];
                                                }
                                            }
                                        } catch (e) { /* ignore */ }
                                    }
                                }
                            } catch (e) { /* ignore fetch errors */ }
                        }

                        return resolve({ viewer, doc, model: loadedModel });
                    } catch (e) {
                        return reject(e);
                    }
                }, (err) => reject(err));
            } catch (e) {
                reject(e);
            }
        });
    });
}

// Overlay ilots and corridors as simple 2D SVG overlay anchored to the viewer container.
export async function overlayShapes(container, ilots = [], corridors = [], viewerObj = null) {

    // User-facing message if no placements
    const haveItems = (Array.isArray(ilots) && ilots.length > 0) || (Array.isArray(corridors) && corridors.length > 0);
    if (!haveItems) {
        // Remove any previous overlay
        let svg = container.querySelector('svg.autodesk-overlay');
        if (svg) svg.remove();
        // Remove any previous message
        let msg = container.querySelector('.autodesk-overlay-message');
        if (msg) msg.remove();
        // Add a user-facing message
        msg = document.createElement('div');
        msg.className = 'autodesk-overlay-message';
        msg.style.position = 'absolute';
        msg.style.left = 0;
        msg.style.top = 0;
        msg.style.width = '100%';
        msg.style.height = '100%';
        msg.style.display = 'flex';
        msg.style.alignItems = 'center';
        msg.style.justifyContent = 'center';
        msg.style.background = 'rgba(255,255,255,0.85)';
        msg.style.color = '#222';
        msg.style.fontSize = '1.2em';
        msg.style.fontWeight = '500';
        msg.style.zIndex = 10000;
        msg.innerText = 'No placements found. Upload a CAD (DXF/DWG) and wait for processing to see overlays.';
        container.appendChild(msg);
        return null;
    } else {
        // Remove any previous message if overlays are present
        let msg = container.querySelector('.autodesk-overlay-message');
        if (msg) msg.remove();
    }

    // remove previous overlay
    let svg = container.querySelector('svg.autodesk-overlay');
    if (svg) svg.remove();

    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('autodesk-overlay');
    svg.style.position = 'absolute';
    svg.style.left = 0; svg.style.top = 0; svg.style.width = '100%'; svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    container.appendChild(svg);

    // sanitize helpers - make access to possibly-missing properties safe
    const safeNum = (v, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : fallback));
    const safePoint = (p) => {
        if (!p) return null;
        if (Array.isArray(p)) return [safeNum(p[0]), safeNum(p[1]), safeNum(p[2] || 0)];
        if (typeof p === 'object') return [safeNum(p.x), safeNum(p.y), safeNum(p.z || 0)];
        return null;
    };

    // Helper: build a projector that applies model->world transform (if available) then projects to client pixels
    const buildProjector = () => {
        try {
            if (!viewerObj || !viewerObj.viewer || !viewerObj.viewer.impl) return null;
            const viewer = viewerObj.viewer;
            const model = viewerObj.model || viewer.model || null;

            // Attempt to discover a placement transform (THREE.Matrix4 or array) from common locations
            let placementMatrix = null;
            try { if (model && typeof model.getPlacementTransform === 'function') placementMatrix = model.getPlacementTransform(); } catch (e) { }
            try { if (!placementMatrix && model && model.getData && model.getData().placementTransform) placementMatrix = model.getData().placementTransform; } catch (e) { }
            try {
                if (!placementMatrix && viewer.model && viewer.model.getData && viewer.model.getData().globalOffset) {
                    const off = viewer.model.getData().globalOffset || {};
                    placementMatrix = new window.Autodesk.Viewing.THREE.Matrix4().makeTranslation(off.x || 0, off.y || 0, off.z || 0);
                }
            } catch (e) { }

            if (placementMatrix && Array.isArray(placementMatrix) && placementMatrix.length === 16) {
                const m = new window.Autodesk.Viewing.THREE.Matrix4();
                m.fromArray(placementMatrix);
                placementMatrix = m;
            }

            return (worldPos) => {
                try {
                    if (!worldPos || !Array.isArray(worldPos)) return null;
                    const vec = new window.Autodesk.Viewing.THREE.Vector3(worldPos[0], worldPos[1], worldPos[2] || 0);
                    if (placementMatrix && typeof vec.applyMatrix4 === 'function') vec.applyMatrix4(placementMatrix);
                    const v = viewer.impl.worldToClient(vec);
                    return [v.x, v.y];
                } catch (e) { return null; }
            };
        } catch (e) { return null; }
    };

    const project = buildProjector();

    // If viewer is available, project world coords to client pixels. Otherwise, fall back to
    // a simple normalized coordinate mapping so demos can show overlays without the Viewer token.
    const drawFallback = (items, isCorridor) => {
        // compute bbox from items
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const ptsList = [];

        items.forEach(it => {
            if (!it) return;
            if (isCorridor) {
                const path = Array.isArray(it.path) ? it.path : [];
                path.forEach(p => {
                    const sp = safePoint(p);
                    if (!sp) return;
                    const x = sp[0], y = sp[1];
                    ptsList.push([x, y]);
                    minX = Math.min(minX, x); minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                });
            } else {
                const c = (it && it.center) ? (Array.isArray(it.center) ? [safeNum(it.center[0]), safeNum(it.center[1])] : [safeNum(it.center.x), safeNum(it.center.y)]) : null;
                const x = (it && typeof it.x === 'number') ? it.x : (c ? c[0] : 0);
                const y = (it && typeof it.y === 'number') ? it.y : (c ? c[1] : 0);
                ptsList.push([x, y]);
                minX = Math.min(minX, x); minY = Math.min(minY, y);
                maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
        });

        if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;
        const width = maxX - minX || 1;
        const height = maxY - minY || 1;
        const svgRect = svg.getBoundingClientRect();
        const sw = svgRect.width || 800;
        const sh = svgRect.height || 600;

        if (isCorridor) {
            items.forEach(it => {
                if (!it) return;
                const path = Array.isArray(it.path) ? it.path : [];
                const pts = path.map(p => safePoint(p)).filter(Boolean).map(sp => [((sp[0] - minX) / width) * sw, ((sp[1] - minY) / height) * sh]);
                if (pts.length < 2) return;
                const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
                pathEl.setAttribute('d', d);
                pathEl.setAttribute('stroke', 'rgba(0,0,255,0.6)');
                pathEl.setAttribute('stroke-width', 4);
                pathEl.setAttribute('fill', 'none');
                svg.appendChild(pathEl);
            });
        } else {
            items.forEach(it => {
                if (!it) return;
                const c = (it && it.center) ? (Array.isArray(it.center) ? [safeNum(it.center[0]), safeNum(it.center[1])] : [safeNum(it.center.x), safeNum(it.center.y)]) : null;
                const x = (it && typeof it.x === 'number') ? it.x : (c ? c[0] : 0);
                const y = (it && typeof it.y === 'number') ? it.y : (c ? c[1] : 0);
                const sx = ((x - minX) / width) * sw;
                const sy = ((y - minY) / height) * sh;
                const r = Math.max(4, (Math.sqrt((it && it.area) || 1)) * 0.6);
                const cEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                cEl.setAttribute('cx', sx);
                cEl.setAttribute('cy', sy);
                cEl.setAttribute('r', r);
                cEl.setAttribute('fill', 'rgba(0,128,0,0.6)');
                cEl.setAttribute('stroke', '#064e3b');
                svg.appendChild(cEl);
            });
        }
    };

    if (viewerObj && viewerObj.viewer) {
        // project using viewer
        try {
            ilots.forEach(ilot => {
                if (!ilot) return;
                const world = Array.isArray(ilot.world) && ilot.world.length >= 2 ? [safeNum(ilot.world[0]), safeNum(ilot.world[1]), safeNum(ilot.world[2] || 0)] : (ilot.center && typeof ilot.center === 'object' ? [safeNum(ilot.center.x != null ? ilot.center.x : (Array.isArray(ilot.center) ? ilot.center[0] : 0)), safeNum(ilot.center.y != null ? ilot.center.y : (Array.isArray(ilot.center) ? ilot.center[1] : 0)), 0] : [safeNum(ilot.x), safeNum(ilot.y), 0]);
                const p = (typeof project === 'function') ? project(world) : null;
                if (!p) return;
                const cx = p[0];
                const cy = p[1];
                const r = Math.max(4, (Math.sqrt((ilot && ilot.area) || 1)) * 0.6);
                const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                c.setAttribute('cx', cx);
                c.setAttribute('cy', cy);
                c.setAttribute('r', r);
                c.setAttribute('fill', 'rgba(0,128,0,0.6)');
                c.setAttribute('stroke', '#064e3b');
                svg.appendChild(c);
            });

            corridors.forEach(corr => {
                if (!corr) return;
                const path = Array.isArray(corr.path) ? corr.path : [];
                const pts = path.map(p => safePoint(p)).filter(Boolean).map(sp => (typeof project === 'function') ? project([sp[0], sp[1], sp[2] || 0]) : null).filter(Boolean);
                if (pts.length < 2) return;
                const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
                pathEl.setAttribute('d', d);
                pathEl.setAttribute('stroke', 'rgba(0,0,255,0.6)');
                pathEl.setAttribute('stroke-width', 4);
                pathEl.setAttribute('fill', 'none');
                svg.appendChild(pathEl);
            });
        } catch (e) {
            // if projection fails, fall back to normalized draw
            drawFallback(ilots, false);
            drawFallback(corridors, true);
        }

        // register one reproject handler per viewerObj (avoid duplicates)
        try {
            if (!viewerObj._overlayRegistered) {
                const viewer = viewerObj.viewer;
                const reproject = () => {
                    const old = container.querySelector('svg.autodesk-overlay');
                    if (old) old.remove();
                    // use cached overlay data if available to avoid repeated fetches
                    const last = (viewerObj && viewerObj._lastOverlayData) ? viewerObj._lastOverlayData : null;
                    overlayShapes(container, last ? last.ilots : ilots, last ? last.corridors : corridors, viewerObj).catch(() => { });
                };
                viewer.addEventListener(window.Autodesk.Viewing.CAMERA_CHANGE_EVENT, reproject);
                viewerObj._overlayRegistered = true;
            }
        } catch (e) { /* ignore */ }
    } else {
        // fallback demo draw using normalized coordinates
        drawFallback(ilots, false);
        drawFallback(corridors, true);
    }

    return svg;
}

// Fetch stored transform for a URN from server
export async function fetchSavedTransform(urn) {
    if (!urn) return null;
    try {
        const resp = await fetch(`/api/transforms/${encodeURIComponent(urn)}`);
        if (!resp.ok) return null;
        const j = await resp.json();
        return j.transform || null;
    } catch (e) {
        console.warn('Failed to fetch saved transform', e);
        return null;
    }
}

// Apply an override transform (THREE.Matrix4 or plain array) to a viewer model - returns normalized THREE.Matrix4 or null
export function normalizeTransform(matrixLike) {
    try {
        if (!matrixLike) return null;
        if (typeof matrixLike === 'string') {
            matrixLike = JSON.parse(matrixLike);
        }
        if (Array.isArray(matrixLike) && matrixLike.length === 16) {
            const m = new window.Autodesk.Viewing.THREE.Matrix4();
            m.fromArray(matrixLike);
            return m;
        }
        if (matrixLike && matrixLike.elements && matrixLike.elements.length === 16) {
            // assume it's already a Matrix4-like
            const m = new window.Autodesk.Viewing.THREE.Matrix4();
            m.fromArray(matrixLike.elements);
            return m;
        }
        if (matrixLike && typeof matrixLike.x === 'number' && typeof matrixLike.y === 'number' && typeof matrixLike.z === 'number') {
            const m = new window.Autodesk.Viewing.THREE.Matrix4();
            m.makeTranslation(matrixLike.x || 0, matrixLike.y || 0, matrixLike.z || 0);
            return m;
        }
        return null;
    } catch (e) {
        console.warn('normalizeTransform failed', e.message);
        return null;
    }
}

// Render a small debug panel (apply / save transform) into the viewer container
export function renderTransformDebugPanel(container, urn, viewerObj, opts = {}) {
    if (!container) return null;
    // remove existing panel
    const existing = container.querySelector('.transform-debug-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.className = 'transform-debug-panel';
    panel.style.position = 'absolute';
    panel.style.right = '10px';
    panel.style.top = '10px';
    panel.style.background = 'rgba(255,255,255,0.95)';
    panel.style.border = '1px solid rgba(0,0,0,0.1)';
    panel.style.padding = '8px';
    panel.style.zIndex = 9999;
    panel.style.maxWidth = '360px';
    panel.style.fontSize = '12px';

    const title = document.createElement('div');
    title.textContent = 'Transform Debug — URN';
    title.style.fontWeight = '600';
    panel.appendChild(title);

    const urnEl = document.createElement('div');
    urnEl.style.wordBreak = 'break-all';
    urnEl.style.marginBottom = '6px';
    urnEl.textContent = urn || '(no urn)';
    panel.appendChild(urnEl);

    const textarea = document.createElement('textarea');
    textarea.style.width = '100%';
    textarea.style.height = '120px';
    textarea.placeholder = 'Paste or edit a 4x4 matrix as JSON array (length 16) or {x,y,z} translation';
    panel.appendChild(textarea);

    const metaRow = document.createElement('div');
    metaRow.style.marginTop = '6px';
    metaRow.style.display = 'flex';
    metaRow.style.gap = '6px';

    const inputSavedBy = document.createElement('input');
    inputSavedBy.placeholder = 'savedBy (optional)';
    inputSavedBy.style.flex = '1';
    inputSavedBy.style.fontSize = '12px';
    metaRow.appendChild(inputSavedBy);

    const inputComment = document.createElement('input');
    inputComment.placeholder = 'comment (optional)';
    inputComment.style.flex = '2';
    inputComment.style.fontSize = '12px';
    metaRow.appendChild(inputComment);

    panel.appendChild(metaRow);

    const btnApply = document.createElement('button');
    btnApply.textContent = 'Apply (local)';
    btnApply.style.marginRight = '6px';
    panel.appendChild(btnApply);

    const btnSave = document.createElement('button');
    btnSave.textContent = 'Save (server)';
    panel.appendChild(btnSave);

    const info = document.createElement('div');
    info.style.marginTop = '6px';
    info.style.color = '#444';
    panel.appendChild(info);

    container.appendChild(panel);

    // Load saved transform if available (and populate meta fields)
    (async () => {
        try {
            const resp = await fetch(`/api/transforms/${encodeURIComponent(urn)}`);
            if (resp.ok) {
                const j = await resp.json();
                if (j && j.transform) textarea.value = JSON.stringify(j.transform, null, 2);
                if (j && j.meta) {
                    if (j.meta.savedBy) inputSavedBy.value = j.meta.savedBy;
                    if (j.meta.comment) inputComment.value = j.meta.comment;
                    if (j.meta.savedAt) info.textContent = 'Saved at: ' + j.meta.savedAt + (j.meta.savedBy ? (' by ' + j.meta.savedBy) : '');
                }
            }
        } catch (e) { /* ignore */ }
    })();

    btnApply.onclick = () => {
        try {
            const parsed = JSON.parse(textarea.value);
            const m = normalizeTransform(parsed);
            if (!m) { info.textContent = 'Invalid transform format'; return; }
            // attach to viewer model for overlay projection
            if (viewerObj && viewerObj.viewer && viewerObj.viewer.impl && viewerObj.viewer.model) {
                viewerObj.viewer.model.getData().placementTransform = m.elements ? m.elements.slice() : m.toArray();
                info.textContent = 'Applied transform locally';
                // force overlay redraw if present
                if (opts.onApply) opts.onApply(m);
            } else {
                info.textContent = 'Viewer not available to apply transform';
            }
        } catch (e) { info.textContent = 'Failed to parse JSON: ' + e.message; }
    };

    btnSave.onclick = async () => {
        try {
            const parsed = JSON.parse(textarea.value);
            // call server save endpoint (requires adminAuth - user must provide API key via header or query param in server)
            const payload = { transform: parsed };
            if (inputComment.value) payload.comment = inputComment.value;
            if (inputSavedBy.value) payload.savedBy = inputSavedBy.value;
            const resp = await fetch(`/api/transforms/${encodeURIComponent(urn)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                const j = await resp.json().catch(() => ({}));
                info.textContent = 'Saved transform to server';
                if (j && j.meta) {
                    info.textContent += ` — savedAt: ${j.meta.savedAt}${j.meta.savedBy ? ' by ' + j.meta.savedBy : ''}`;
                }
            } else {
                const j = await resp.json().catch(() => ({}));
                info.textContent = 'Save failed: ' + (j.error || resp.statusText || 'unknown');
            }
        } catch (e) { info.textContent = 'Save failed: ' + e.message; }
    };

    return panel;
}