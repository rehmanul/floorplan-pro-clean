import * as BABYLON from 'https://cdn.skypack.dev/babylonjs';

export class BabylonRenderer {
    constructor(container) {
        this.container = container;
        this.engine = new BABYLON.Engine(container, true, { preserveDrawingBuffer: true, stencil: true });
        this.scene = new BABYLON.Scene(this.engine);

        this.camera = new BABYLON.ArcRotateCamera("Camera", Math.PI / 2, Math.PI / 2, 1000, BABYLON.Vector3.Zero(), this.scene);
        this.camera.attachControl(container, true);
        this.camera.lowerRadiusLimit = 100;
        this.camera.upperRadiusLimit = 2000;
        this.camera.wheelPrecision = 50;
        this.camera.panningSensibility = 50;
        this.camera.panningDistanceLimit = 1000;
        this.camera.useBouncingBehavior = true;

        this.light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);

        this.floorPlanMeshes = [];

        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        window.addEventListener('resize', () => {
            this.engine.resize();
        });
    }

    clear() {
        this.floorPlanMeshes.forEach(mesh => {
            mesh.dispose();
        });
        this.floorPlanMeshes = [];
    }

    renderFloorPlan(floorPlan, ilots, corridors) {
        this.clear();

        // Draw walls (black lines)
        if (floorPlan.walls) {
            floorPlan.walls.forEach(wall => {
                const points = [
                    new BABYLON.Vector3(wall.start.x, 0, wall.start.y),
                    new BABYLON.Vector3(wall.end.x, 0, wall.end.y)
                ];
                const lines = BABYLON.MeshBuilder.CreateLines("wall", { points: points, updatable: false }, this.scene);
                lines.color = new BABYLON.Color3.Black();
                this.floorPlanMeshes.push(lines);
            });
        }

        // Draw forbidden zones (blue lines)
        if (floorPlan.forbiddenZones) {
            floorPlan.forbiddenZones.forEach(zone => {
                const points = [
                    new BABYLON.Vector3(zone.start.x, 0, zone.start.y),
                    new BABYLON.Vector3(zone.end.x, 0, zone.end.y)
                ];
                const lines = BABYLON.MeshBuilder.CreateLines("forbiddenZone", { points: points, updatable: false }, this.scene);
                lines.color = new BABYLON.Color3.Blue();
                this.floorPlanMeshes.push(lines);
            });
        }

        // Draw entrances (red lines)
        if (floorPlan.entrances) {
            floorPlan.entrances.forEach(entrance => {
                const points = [
                    new BABYLON.Vector3(entrance.start.x, 0, entrance.start.y),
                    new BABYLON.Vector3(entrance.end.x, 0, entrance.end.y)
                ];
                const lines = BABYLON.MeshBuilder.CreateLines("entrance", { points: points, updatable: false }, this.scene);
                lines.color = new BABYLON.Color3.Red();
                this.floorPlanMeshes.push(lines);
            });
        }

        // Draw ilots (colored boxes)
        const ilotColors = {
            single: new BABYLON.Color3(0.06, 0.72, 0.51),
            double: new BABYLON.Color3(0.23, 0.51, 0.96),
            team: new BABYLON.Color3(0.54, 0.36, 0.96),
            meeting: new BABYLON.Color3(0.96, 0.62, 0.04)
        };
        if (ilots) {
            ilots.forEach(ilot => {
                const color = ilotColors[ilot.type] || new BABYLON.Color3(0.06, 0.72, 0.51);
                const box = BABYLON.MeshBuilder.CreateBox("ilot", { width: ilot.width, height: 10, depth: ilot.height }, this.scene);
                box.position = new BABYLON.Vector3(ilot.x + ilot.width / 2, 5, ilot.y + ilot.height / 2);
                const mat = new BABYLON.StandardMaterial("ilotMat", this.scene);
                mat.diffuseColor = color;
                mat.alpha = 0.8;
                box.material = mat;
                this.floorPlanMeshes.push(box);
            });
        }

        // Draw corridors (yellow boxes)
        if (corridors) {
            corridors.forEach(corridor => {
                if (corridor.polygon && corridor.polygon.length > 2) {
                    // Create shape from polygon points
                    const points = corridor.polygon.map(p => new BABYLON.Vector3(p[0], 0, p[1]));
                    // Create lines for corridor outline
                    const lines = BABYLON.MeshBuilder.CreateLines("corridor", { points: points.concat([points[0]]) }, this.scene);
                    lines.color = new BABYLON.Color3(0.96, 0.87, 0.10);
                    this.floorPlanMeshes.push(lines);
                }
            });
        }
    }
}
