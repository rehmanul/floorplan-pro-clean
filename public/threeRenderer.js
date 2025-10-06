import * as THREE from './libs/build/three.module.js';
import { OrbitControls } from './libs/package/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from './libs/package/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './libs/package/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from './libs/package/examples/jsm/postprocessing/OutlinePass.js';
import { FXAAShader } from './libs/package/examples/jsm/shaders/FXAAShader.js';
import { ShaderPass } from './libs/package/examples/jsm/postprocessing/ShaderPass.js';

export class ThreeRenderer {
    constructor(container) {
        this.container = container;
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);

        // Enhanced camera setup
        this.camera = new THREE.OrthographicCamera(
            this.width / -2, this.width / 2,
            this.height / 2, this.height / -2,
            1, 10000
        );
        this.camera.position.set(0, 1500, 0);
        this.camera.lookAt(0, 0, 0);

        // Enhanced renderer with better settings
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        // Ensure canvas fills the container and remains responsive
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.display = 'block';
        container.appendChild(this.renderer.domElement);

        // Trigger initial resize logic in case container sizing wasn't ready earlier
        // (some browsers/layouts report 0 during initial construction)
        setTimeout(() => this.onWindowResize(), 50);

        // Enhanced controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableRotate = false;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        this.controls.minZoom = 0.1;
        this.controls.maxZoom = 10;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.8;
        this.controls.screenSpacePanning = false;
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };

        // Lighting setup
        this.setupLighting();

        // Post-processing setup (optional)
        try {
            this.setupPostProcessing();
        } catch (error) {
            console.warn('Post-processing setup failed, falling back to basic rendering:', error);
            this.usePostProcessing = false;
        }

        // Groups for organization
        this.floorPlanGroup = new THREE.Group();
        this.wallsGroup = new THREE.Group();
        this.ilotsGroup = new THREE.Group();
        this.corridorsGroup = new THREE.Group();
        this.scene.add(this.floorPlanGroup);
        this.floorPlanGroup.add(this.wallsGroup);
        this.floorPlanGroup.add(this.ilotsGroup);
        this.floorPlanGroup.add(this.corridorsGroup);

        // Materials cache for performance
        this.materials = new Map();

        // LOD system
        this.lodObjects = [];

        // Interaction system
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedObjects = [];

        // Performance monitoring
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;

        // Event listeners
        window.addEventListener('resize', () => this.onWindowResize());
        this.renderer.domElement.addEventListener('click', (event) => this.onMouseClick(event));
        this.renderer.domElement.addEventListener('mousemove', (event) => this.onMouseMove(event));

        this.animate();
    }

    setupLighting() {
        // Ambient light for overall illumination
        this.ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(this.ambientLight);

        // Main directional light (sun-like)
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(1000, 2000, 1000);
        this.directionalLight.castShadow = true;

        // Configure shadow properties
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 5000;
        this.directionalLight.shadow.camera.left = -2000;
        this.directionalLight.shadow.camera.right = 2000;
        this.directionalLight.shadow.camera.top = 2000;
        this.directionalLight.shadow.camera.bottom = -2000;
        this.directionalLight.shadow.bias = -0.0001;

        this.scene.add(this.directionalLight);

        // Hemisphere light for natural sky lighting
        this.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x98FB98, 0.3);
        this.scene.add(this.hemiLight);

        // Point lights for accent lighting
        this.pointLight1 = new THREE.PointLight(0xffffff, 0.5, 1000);
        this.pointLight1.position.set(500, 300, 500);
        this.scene.add(this.pointLight1);

        this.pointLight2 = new THREE.PointLight(0xffffff, 0.3, 800);
        this.pointLight2.position.set(-500, 200, -500);
        this.scene.add(this.pointLight2);
    }

    setupPostProcessing() {
        // Setup post-processing pipeline
        this.composer = new EffectComposer(this.renderer);

        // Render pass
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        // Outline pass for selection highlighting
        this.outlinePass = new OutlinePass(
            new THREE.Vector2(this.width, this.height),
            this.scene,
            this.camera
        );
        this.outlinePass.edgeStrength = 3;
        this.outlinePass.edgeGlow = 1;
        this.outlinePass.edgeThickness = 2;
        this.outlinePass.visibleEdgeColor.set('#ffffff');
        this.outlinePass.hiddenEdgeColor.set('#190a05');
        this.composer.addPass(this.outlinePass);

        // FXAA pass for anti-aliasing
        this.fxaaPass = new ShaderPass(FXAAShader);
        this.fxaaPass.uniforms['resolution'].value.set(1 / this.width, 1 / this.height);
        this.composer.addPass(this.fxaaPass);

        // Enable post-processing
        this.usePostProcessing = true;
    }

    onWindowResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;

        this.camera.left = this.width / -2;
        this.camera.right = this.width / 2;
        this.camera.top = this.height / 2;
        this.camera.bottom = this.height / -2;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(this.width, this.height);

        // Update post-processing
        if (this.composer) {
            this.composer.setSize(this.width, this.height);
            this.outlinePass.setSize(this.width, this.height);
            this.fxaaPass.uniforms['resolution'].value.set(1 / this.width, 1 / this.height);
        }
    }

    clear() {
        // Clear walls
        this.wallsGroup.children.forEach(child => {
            this.wallsGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material && !this.materials.has(child.material)) child.material.dispose();
        });

        // Clear ilots
        this.ilotsGroup.children.forEach(child => {
            this.ilotsGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material && !this.materials.has(child.material)) child.material.dispose();
        });

        // Clear corridors
        this.corridorsGroup.children.forEach(child => {
            this.corridorsGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material && !this.materials.has(child.material)) child.material.dispose();
        });

        // Clear LOD objects
        this.lodObjects.length = 0;
    }

    getMaterial(type, color, opacity = 1.0) {
        const key = `${type}_${color}_${opacity}`;
        if (this.materials.has(key)) {
            return this.materials.get(key);
        }

        let material;
        switch (type) {
            case 'wall':
                material = new THREE.LineBasicMaterial({ color, linewidth: 2 });
                break;
            case 'forbidden':
                material = new THREE.LineBasicMaterial({ color, linewidth: 3 });
                break;
            case 'entrance':
                material = new THREE.LineBasicMaterial({ color, linewidth: 4 });
                break;
            case 'ilot':
                material = new THREE.MeshLambertMaterial({
                    color,
                    transparent: true,
                    opacity,
                    side: THREE.DoubleSide
                });
                break;
            case 'corridor':
                material = new THREE.MeshLambertMaterial({
                    color,
                    transparent: true,
                    opacity: 0.6,
                    side: THREE.DoubleSide
                });
                break;
            default:
                material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
        }

        this.materials.set(key, material);
        return material;
    }

    renderFloorPlan(floorPlan, ilots, corridors) {
        this.clear();

        // Draw walls with enhanced materials
        if (floorPlan.walls) {
            floorPlan.walls.forEach(wall => {
                const material = this.getMaterial('wall', 0x000000);
                const points = [
                    new THREE.Vector3(wall.start.x, 0, wall.start.y),
                    new THREE.Vector3(wall.end.x, 0, wall.end.y)
                ];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(geometry, material);
                line.castShadow = false;
                line.receiveShadow = false;
                this.wallsGroup.add(line);
            });
        }

        // Draw forbidden zones with enhanced materials
        if (floorPlan.forbiddenZones) {
            floorPlan.forbiddenZones.forEach(zone => {
                const material = this.getMaterial('forbidden', 0x0000ff);
                const points = [
                    new THREE.Vector3(zone.start.x, 0, zone.start.y),
                    new THREE.Vector3(zone.end.x, 0, zone.end.y)
                ];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(geometry, material);
                line.castShadow = false;
                line.receiveShadow = false;
                this.wallsGroup.add(line);
            });
        }

        // Draw entrances with enhanced materials
        if (floorPlan.entrances) {
            floorPlan.entrances.forEach(entrance => {
                const material = this.getMaterial('entrance', 0xff0000);
                const points = [
                    new THREE.Vector3(entrance.start.x, 0, entrance.start.y),
                    new THREE.Vector3(entrance.end.x, 0, entrance.end.y)
                ];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(geometry, material);
                line.castShadow = false;
                line.receiveShadow = false;
                this.wallsGroup.add(line);
            });
        }

        // Draw ilots with enhanced materials and LOD
        const ilotColors = {
            single: 0x10b981,
            double: 0x3b82f6,
            team: 0x8b5cf6,
            meeting: 0xf59e0b
        };

        if (ilots) {
            ilots.forEach((ilot, index) => {
                const color = ilotColors[ilot.type] || 0x10b981;
                const material = this.getMaterial('ilot', color, 0.8);

                // Create LOD versions
                const highDetailGeometry = new THREE.BoxGeometry(ilot.width, 15, ilot.height);
                const lowDetailGeometry = new THREE.BoxGeometry(ilot.width * 0.8, 10, ilot.height * 0.8);

                const highDetailMesh = new THREE.Mesh(highDetailGeometry, material);
                const lowDetailMesh = new THREE.Mesh(lowDetailGeometry, material);

                // Position
                const x = ilot.x + ilot.width / 2;
                const z = ilot.y + ilot.height / 2;
                highDetailMesh.position.set(x, 7.5, z);
                lowDetailMesh.position.set(x, 5, z);

                // Enable shadows
                highDetailMesh.castShadow = true;
                highDetailMesh.receiveShadow = true;
                lowDetailMesh.castShadow = true;
                lowDetailMesh.receiveShadow = true;

                // Create LOD object
                const lod = new THREE.LOD();
                lod.addLevel(highDetailMesh, 0);
                lod.addLevel(lowDetailMesh, 500);
                lod.position.set(x, 0, z);
                lod.updateMatrix();

                // Store reference for interaction
                lod.userData = {
                    type: 'ilot',
                    index: index,
                    data: ilot
                };

                this.ilotsGroup.add(lod);
                this.lodObjects.push(lod);
            });
        }

        // Draw corridors with enhanced materials
        if (corridors) {
            corridors.forEach((corridor, index) => {
                if (corridor.polygon && corridor.polygon.length > 2) {
                    const shape = new THREE.Shape();
                    corridor.polygon.forEach((point, i) => {
                        if (i === 0) {
                            shape.moveTo(point[0], point[1]);
                        } else {
                            shape.lineTo(point[0], point[1]);
                        }
                    });
                    shape.lineTo(corridor.polygon[0][0], corridor.polygon[0][1]);

                    const geometry = new THREE.ShapeGeometry(shape);
                    const material = this.getMaterial('corridor', 0xf5de19);

                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(0, 1, 0);
                    mesh.rotation.set(-Math.PI / 2, 0, 0); // Lay flat

                    // Enable shadows
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    // Store reference for interaction
                    mesh.userData = {
                        type: 'corridor',
                        index: index,
                        data: corridor
                    };

                    this.corridorsGroup.add(mesh);
                }
            });
        }

        // Update LOD objects based on camera distance
        this.updateLOD();
    }

    updateLOD() {
        const cameraDistance = this.camera.position.distanceTo(this.floorPlanGroup.position);

        this.lodObjects.forEach(lod => {
            lod.update(this.camera);
        });

        // Adjust lighting based on zoom level
        const zoomFactor = this.camera.zoom;
        this.directionalLight.intensity = Math.min(0.8 * zoomFactor, 1.2);
        this.ambientLight.intensity = Math.max(0.2 * zoomFactor, 0.3);
    }

    onMouseClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for intersections with ilots and corridors
        const intersects = this.raycaster.intersectObjects([
            ...this.ilotsGroup.children,
            ...this.corridorsGroup.children
        ], true);

        if (intersects.length > 0) {
            const object = intersects[0].object;

            // Clear previous selection
            this.selectedObjects.forEach(obj => {
                if (obj.material && obj.material.emissive) {
                    obj.material.emissive.setHex(obj.userData.originalEmissive || 0x000000);
                }
            });
            this.selectedObjects.length = 0;

            // Highlight selected object
            if (object.material && object.material.emissive) {
                object.userData.originalEmissive = object.material.emissive.getHex();
                object.material.emissive.setHex(0x444444);
            }

            this.selectedObjects.push(object);

            // Update outline pass
            this.outlinePass.selectedObjects = this.selectedObjects;

            // Show information about selected object
            this.showObjectInfo(object);
        }
    }

    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for hover effects
        const intersects = this.raycaster.intersectObjects([
            ...this.ilotsGroup.children,
            ...this.corridorsGroup.children
        ], true);

        if (intersects.length > 0) {
            this.renderer.domElement.style.cursor = 'pointer';
        } else {
            this.renderer.domElement.style.cursor = 'default';
        }
    }

    showObjectInfo(object) {
        const userData = object.userData;
        if (userData && userData.data) {
            const data = userData.data;

            let info = '';
            if (userData.type === 'ilot') {
                info = `${data.type.charAt(0).toUpperCase() + data.type.slice(1)} Îlot\n`;
                info += `Capacity: ${data.capacity || 'N/A'} people\n`;
                info += `Size: ${data.width}m x ${data.height}m`;
            } else if (userData.type === 'corridor') {
                info = `Corridor\n`;
                info += `Area: ${data.area || 'N/A'} m²\n`;
                info += `Type: ${data.type || 'Standard'}`;
            }

            // Show tooltip or info panel
            console.log('Selected:', info);
        }
    }

    animate() {
        try {
            requestAnimationFrame(() => this.animate());

            // Update FPS counter
            this.frameCount++;
            const currentTime = performance.now();
            if (currentTime - this.lastTime >= 1000) {
                this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
                this.frameCount = 0;
                this.lastTime = currentTime;
            }

            // Update controls
            if (this.controls) {
                this.controls.update();
            }

            // Update LOD
            this.updateLOD();

            // Render with post-processing
            if (this.usePostProcessing && this.composer) {
                try {
                    this.composer.render();
                } catch (error) {
                    console.warn('Post-processing render failed, falling back to basic render:', error);
                    this.renderer.render(this.scene, this.camera);
                }
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        } catch (error) {
            console.error('Animation loop error:', error);
            // Prevent infinite error loops
            setTimeout(() => {
                this.animate();
            }, 100);
        }
    }
}
