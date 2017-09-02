import {MemHelper} from "../../helpers/MemHelper";
import {
    Layout, LAYOUT_CUSTOM, LAYOUT_FLEX, LAYOUT_MINI, LAYOUT_PLUS, LAYOUT_QUAD, LAYOUT_TREE, LayoutData, LayoutType,
    PositionMap,
    Vector2,
} from "./Layout";
import {RoomMap} from "./RoomMap";
import {LayoutFactory} from "./LayoutFactory";
import {ROOMTYPE_SOURCEKEEPER, WorldMap} from "../WorldMap";
import {LayoutDisplay} from "./LayoutDisplay";
import {Observationer} from "../Observationer";
export class LayoutFinder {

    private roomName: string;
    private sourcePositions: RoomPosition[];
    private controllerPos: RoomPosition;
    private obstacleMap: RoomMap<number>;
    private progress: LayoutFinderProgress;
    private layoutTypes = [LAYOUT_TREE, LAYOUT_PLUS, LAYOUT_QUAD, LAYOUT_MINI, LAYOUT_FLEX];
    private validLayouts: {[typeName: string]: ValidLayoutData[]};
    private currentRadius: number;

    private structureScores = {
        [STRUCTURE_TERMINAL]: 10,
        [STRUCTURE_STORAGE]: 10,
        [STRUCTURE_SPAWN]: 5,
        [STRUCTURE_POWER_SPAWN]: 5,
        [STRUCTURE_LAB]: 3,
        [STRUCTURE_RAMPART]: 0,
    };

    private layoutScores = {
        [LAYOUT_TREE]: 10000,
        [LAYOUT_PLUS]: 1000,
        [LAYOUT_QUAD]: 500,
        [LAYOUT_MINI]: 400,
        [LAYOUT_FLEX]: 0,
    };

    constructor(roomName: string) {
        this.roomName = roomName;
    }

    public init(data?: LayoutFinderData): boolean {
        if (!Memory.rooms[this.roomName]) { Memory.rooms[this.roomName] = {} as any; }
        if (Memory.rooms[this.roomName].layout) { return; }
        if (!Memory.rooms[this.roomName].finder) {

            if (!data) {
                let room = Game.rooms[this.roomName];
                if (!room) {
                    console.log(`FINDER: ordering observer vision in ${this.roomName}`);
                    Observationer.observeRoom(this.roomName, 4);
                    return;
                }
                data = this.findData(room);
            }

            if (!data) {
                return;
            }

            let obstacleMap = this.findObstacleMap(data);
            Memory.rooms[this.roomName].finder = {
                sourcePositions: data.sourcePositions,
                controllerPos: data.controllerPos,
                mineralPos: data.mineralPos,
                obstacleMap: obstacleMap,
                validLayouts: {},
                progress: {
                    anchor: undefined,
                    rotation: 0,
                    typeIndex: 0,
                    final: false,
                },
            };
        }
        let layoutData = Memory.rooms[this.roomName].finder as LayoutFinderData;

        this.sourcePositions = MemHelper.posInstances(layoutData.sourcePositions);
        this.controllerPos = MemHelper.posInstance(layoutData.controllerPos);
        this.obstacleMap = new RoomMap<number>(layoutData.obstacleMap);
        this.progress = layoutData.progress;
        this.validLayouts = layoutData.validLayouts;
        return true;
    }

    private findData(room: Room): LayoutFinderData {
        if (!room.controller) {
            console.log(`FINDER: no controller in ${room.name}`);
            return;
        }
        let sourcePositions = _(room.find<Source>(FIND_SOURCES)).map(x => x.pos).value();
        let mineralPosition = room.find<Source>(FIND_MINERALS)[0].pos;
        return {
            sourcePositions: sourcePositions,
            controllerPos: room.controller.pos,
            mineralPos: mineralPosition,
        };
    }

    private findObstacleMap(data: LayoutFinderData): RoomMap<number> {
        let obstacles = [];
        for (let pos of data.sourcePositions) {
            if (pos.roomName !== this.roomName) { continue; }
            let block = this.findPositionBlock(pos, 2);
            obstacles = obstacles.concat(block);
        }
        let block = this.findPositionBlock(data.controllerPos, 3);
        obstacles = obstacles.concat(block);
        block = this.findPositionBlock(data.mineralPos, 2);
        obstacles = obstacles.concat(block);
        let walls = this.findWallObstacles();
        obstacles = obstacles.concat(walls);

        let obstacleMap = new RoomMap<number>();
        for (let obstacle of obstacles) {
            new RoomVisual(this.roomName).text("x", obstacle, {color: "white"});
            obstacleMap.set(obstacle.x, obstacle.y, 1);
        }

        return obstacleMap;
    }

    private findPositionBlock(pos: RoomPosition, radius: number): RoomPosition[] {
        let block = [];
        for (let xDelta = -radius; xDelta <= radius; xDelta++) {
            let x = pos.x + xDelta;
            if (x > 49 || x < 0) { continue; }
            for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                let y = pos.y + yDelta;
                if (y > 49 || y < 0) { continue; }
                block.push(new RoomPosition(x, y, this.roomName));
            }
        }
        return block;
    }

    private findWallObstacles(): RoomPosition[] {
        let walls = [];
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (Game.map.getTerrainAt(x, y, this.roomName) !== "wall") { continue; }
                walls.push(new RoomPosition(x, y, this.roomName));
            }
        }
        return walls;
    }

    public run(cpuQuota?: number) {
        if (Memory.rooms[this.roomName].layout) { return; }
        if (!this.sourcePositions) {
            console.log(`FINDER: I haven't been fully initilized in ${this.roomName}`);
            return;
        }

        let deadline = 300;
        if (cpuQuota) {
            deadline = Game.cpu.getUsed() + cpuQuota;
        }

        if (Game.cpu.bucket < 5000) { return; }
        console.log(`FINDER: beginning this tick with the following progress object:`);
        console.log(JSON.stringify(this.progress));
        while (!this.progress.final && Game.cpu.getUsed() < deadline) {
            this.runNextSimulation(this.progress);
        }

        if (this.progress.final) {
            this.finalize();
        }
    }

    private runNextSimulation(progress: LayoutFinderProgress) {
        let type = this.layoutTypes[progress.typeIndex];

        let layout = LayoutFactory.Instantiate(this.roomName, type);

        this.currentRadius = layout.fixedMap.radius;
        if (!progress.anchor) {
            progress.anchor = {x: this.currentRadius + 2, y: this.currentRadius + 2 };
        }

        layout.simulateData({
            anchor: progress.anchor,
            rotation: progress.rotation,
            type: type,
        }, [STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_SPAWN, STRUCTURE_NUKER, STRUCTURE_POWER_SPAWN]);

        let obstacle = this.obstacleMap.findAnyInRange(progress.anchor, layout.fixedMap.radius, layout.fixedMap.taper);
        if (obstacle) {
            this.incrementProgress(progress, layout.rotates, obstacle);
            return;
        }

        let validLayout: ValidLayoutData = {
            data: {
                anchor: {x: progress.anchor.x, y: progress.anchor.y },
                rotation: progress.rotation,
                type: type,
            },
            structureScore: 0,
            energyScore: 0,
            foundSpawn: false,
        };

        let structurePositions = layout.findFixedMap();
        let obstruction = this.analyzeStructures(structurePositions, validLayout);
        if (obstruction) {
            this.incrementProgress(progress, layout.rotates);
            return;
        }

        for (let sourcePos of this.sourcePositions) {
            validLayout.energyScore += this.findSourceScore(sourcePos, progress.anchor);
        }

        if (!this.validLayouts[type]) { this.validLayouts[type] = []; }
        this.validLayouts[type].push(validLayout);
        // console.log("found valid", JSON.stringify(validLayout.data));
        this.incrementProgress(progress, layout.rotates);
    }

    private incrementProgress(progress: LayoutFinderProgress, rotates: boolean, obstacle?: Vector2) {
        if (obstacle) {
            progress.rotation = 0;
            // TODO: could speed up progress considerably if you calculated how far to move ahead based on the obstacle
            progress.anchor.x++;
        } else {
            progress.rotation++;
        }

        if (progress.rotation > 3 || (progress.rotation > 0 && !rotates)) {
            progress.rotation = 0;
            progress.anchor.x++;
        }

        if (progress.anchor.x > 49 - this.currentRadius - 2) {
            progress.anchor.x = this.currentRadius + 2;
            progress.anchor.y++;
        }

        if (progress.anchor.y > 49 - this.currentRadius - 2) {
            progress.typeIndex++;

            let type = this.layoutTypes[progress.typeIndex];
            if (type) {
                delete progress.anchor;
            } else {
                progress.final = true;
            }
        }
    }

    private findSourceScore(sourcePos: RoomPosition, anchor: Vector2): number {
        let anchorPos = new RoomPosition(anchor.x, anchor.y, this.roomName);
        let score = SOURCE_ENERGY_CAPACITY;
        if (WorldMap.roomType(sourcePos.roomName) === ROOMTYPE_SOURCEKEEPER) {
            score = SOURCE_ENERGY_KEEPER_CAPACITY;
        }
        let ret = PathFinder.search(anchorPos, [{pos: sourcePos, range: 1}], {
            swampCost: 1,
            maxOps: 4000,
        });

        let pathLength = 100;
        if (!ret.incomplete) {
            pathLength = Math.max(ret.path.length, 50);
        }

        return score / pathLength;
    }

    private analyzeStructures(structurePositions: PositionMap, validLayout: ValidLayoutData) {
        let room = Game.rooms[this.roomName];
        let allowVisuals = false;
        if (room && room.visual.getSize() < 400000) {
            allowVisuals = true;
        }

        for (let structureType in structurePositions) {
            if (structureType === STRUCTURE_WALL || structureType === STRUCTURE_RAMPART) { continue; }
            let positions = structurePositions[structureType];
            for (let position of positions) {
                let obstacle = this.obstacleMap.get(position.x, position.y);
                if (obstacle) {
                    new RoomVisual(this.roomName).text("x", position, {color: "white"});
                    return true;
                }

                if (!this.structureScores[structureType] || !room) { continue; }
                if (allowVisuals) {
                    LayoutDisplay.showStructure(position, structureType);
                }
                let structure = _(position.lookFor<Structure>(LOOK_STRUCTURES))
                    .filter(x => x.structureType === structureType)
                    .head();
                if (!structure) { continue; }
                if (structure.structureType === STRUCTURE_SPAWN) {
                    console.log("found a spawn!");
                    validLayout.foundSpawn = true;
                }
                validLayout.structureScore += this.structureScores[structureType];
            }
        }
    }

    private finalize() {
        let bestLayout = this.chooseAmongValidLayouts();
        if (bestLayout) {
            console.log(`FINDER: found layout in ${this.roomName}`);
            console.log(JSON.stringify(bestLayout));
            Memory.rooms[this.roomName].layout = bestLayout.data;
        } else {
            console.log(`FINDER: unable to find auto-layout for ${this.roomName}`);
            console.log(`possible reasons: 1. spawn too close to sources, controller, wall, 2. not enough space`);
            console.log(`Initializing CustomLayout (won't build structures automatically but saves ones you build)`);
            console.log(`to rerun, delete the layout: "delete Memory.rooms.${this.roomName}.layout"`);
            Memory.rooms[this.roomName].layout = {
                type: LAYOUT_CUSTOM,
                rotation: 0,
                anchor: {x: 25, y: 25 },
            };
        }
        delete Memory.rooms[this.roomName].finder;
    }

    private chooseAmongValidLayouts(): ValidLayoutData {

        let spawnInRoom = false;
        let room = Game.rooms[this.roomName];
        if (room) {
            spawnInRoom = room.find(FIND_MY_SPAWNS).length > 0;
        }
        let spawnHit;
        let bestOverall;
        for (let type in this.validLayouts) {
            let validLayouts = this.validLayouts[type];

            if (spawnInRoom) {
                let best = _(validLayouts).filter(x => x.foundSpawn).max(x => x.energyScore);
                if (_.isObject(best)) {
                    return best;
                } else {
                    console.log("no!");
                }
            }

            let best = _(validLayouts)
                .filter(x => x.structureScore > 0)
                .max(x => x.structureScore * 1000 + x.energyScore + this.layoutScores[type]);
            if (_.isObject(best)) {
                if (!spawnInRoom || best.foundSpawn) {
                    return best;
                } else {
                    bestOverall = best;
                }
            }

            best = _(validLayouts).max(x => x.energyScore);
            if (_.isObject(best)) {
                if (!spawnInRoom || best.foundSpawn) {
                    return best;
                } else {
                    bestOverall = best;
                }
            }
        }

        if (spawnHit) {
            return spawnHit;
        } else {
            return bestOverall;
        }
    }
}

export interface LayoutFinderData {
    sourcePositions: RoomPosition[];
    controllerPos: RoomPosition;
    mineralPos: RoomPosition;
    obstacleMap?: RoomMap<number>;
    progress?: LayoutFinderProgress;
    validLayouts?: {[typeName: string]: ValidLayoutData[] };
}

export interface LayoutFinderProgress {
    anchor: Vector2;
    rotation: number;
    typeIndex: number;
    final: boolean;
}

export interface ValidLayoutData {
    data: LayoutData;
    energyScore: number;
    structureScore: number;
    foundSpawn: boolean;
}
