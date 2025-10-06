import * as PIXI from 'https://cdn.skypack.dev/pixi.js';

export class PixiRenderer {
    constructor(container) {
        this.container = container;
        this.app = new PIXI.Application({
            width: container.clientWidth,
            height: container.clientHeight,
            backgroundColor: 0xffffff,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });
        container.appendChild(this.app.view);

        this.floorPlanContainer = new PIXI.Container();
        this.app.stage.addChild(this.floorPlanContainer);

        this.app.renderer.plugins.interaction.on('pointerdown', this.onPointerDown.bind(this));
        this.app.renderer.plugins.interaction.on('pointerup', this.onPointerUp.bind(this));
        this.app.renderer.plugins.interaction.on('pointerupoutside', this.onPointerUp.bind(this));
        this.app.renderer.plugins.interaction.on('pointermove', this.onPointerMove.bind(this));

        this.dragging = false;
        this.dragData = null;
        this.dragStart = null;
        this.offset = { x: 0, y: 0 };
        this.scale = 1;

        this.app.view.addEventListener('wheel', this.onWheel.bind(this));
    }

    clear() {
        this.floorPlanContainer.removeChildren();
    }

    renderFloorPlan(floorPlan, ilots, corridors) {
        this.clear();

        // Draw walls (black lines)
        if (floorPlan.walls) {
            floorPlan.walls.forEach(wall => {
                const line = new PIXI.Graphics();
                line.lineStyle(2, 0x000000);
                line.moveTo(wall.start.x, wall.start.y);
                line.lineTo(wall.end.x, wall.end.y);
                this.floorPlanContainer.addChild(line);
            });
        }

        // Draw forbidden zones (blue lines)
        if (floorPlan.forbiddenZones) {
            floorPlan.forbiddenZones.forEach(zone => {
                const line = new PIXI.Graphics();
                line.lineStyle(3, 0x0000ff);
                line.moveTo(zone.start.x, zone.start.y);
                line.lineTo(zone.end.x, zone.end.y);
                this.floorPlanContainer.addChild(line);
            });
        }

        // Draw entrances (red lines)
        if (floorPlan.entrances) {
            floorPlan.entrances.forEach(entrance => {
                const line = new PIXI.Graphics();
                line.lineStyle(4, 0xff0000);
                line.moveTo(entrance.start.x, entrance.start.y);
                line.lineTo(entrance.end.x, entrance.end.y);
                this.floorPlanContainer.addChild(line);
            });
        }

        // Draw ilots (colored rectangles)
        const ilotColors = {
            single: 0x10b981,
            double: 0x3b82f6,
            team: 0x8b5cf6,
            meeting: 0xf59e0b
        };
        if (ilots) {
            ilots.forEach(ilot => {
                const rect = new PIXI.Graphics();
                rect.beginFill(ilotColors[ilot.type] || 0x10b981, 0.8);
                rect.drawRect(ilot.x, ilot.y, ilot.width, ilot.height);
                rect.endFill();
                this.floorPlanContainer.addChild(rect);
            });
        }

        // Draw corridors (yellow polygons)
        if (corridors) {
            corridors.forEach(corridor => {
                if (corridor.polygon && corridor.polygon.length > 2) {
                    const poly = new PIXI.Graphics();
                    poly.beginFill(0xf5de19, 0.6);
                    poly.lineStyle(2, 0xf59e0b);
                    poly.moveTo(corridor.polygon[0][0], corridor.polygon[0][1]);
                    for (let i = 1; i < corridor.polygon.length; i++) {
                        poly.lineTo(corridor.polygon[i][0], corridor.polygon[i][1]);
                    }
                    poly.closePath();
                    poly.endFill();
                    this.floorPlanContainer.addChild(poly);
                }
            });
        }

        this.floorPlanContainer.x = this.offset.x;
        this.floorPlanContainer.y = this.offset.y;
        this.floorPlanContainer.scale.set(this.scale);
    }

    onPointerDown(event) {
        this.dragging = true;
        this.dragData = event.data;
        this.dragStart = this.dragData.getLocalPosition(this.app.stage);
    }

    onPointerUp() {
        this.dragging = false;
        this.dragData = null;
        this.dragStart = null;
    }

    onPointerMove() {
        if (this.dragging) {
            const newPosition = this.dragData.getLocalPosition(this.app.stage);
            this.offset.x += newPosition.x - this.dragStart.x;
            this.offset.y += newPosition.y - this.dragStart.y;
            this.dragStart = newPosition;
            this.renderFloorPlan(this.currentFloorPlan, this.currentIlots, this.currentCorridors);
        }
    }

    onWheel(event) {
        event.preventDefault();
        const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
        this.scale *= scaleFactor;
        this.renderFloorPlan(this.currentFloorPlan, this.currentIlots, this.currentCorridors);
    }

    updateData(floorPlan, ilots, corridors) {
        this.currentFloorPlan = floorPlan;
        this.currentIlots = ilots;
        this.currentCorridors = corridors;
        this.renderFloorPlan(floorPlan, ilots, corridors);
    }
}
