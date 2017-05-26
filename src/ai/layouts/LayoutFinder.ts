import {Mem} from "../../helpers/Mem";
import {
    Layout, LAYOUT_CUSTOM, LAYOUT_FLEX, LAYOUT_MINI, LAYOUT_QUAD, LayoutData, LayoutType, PositionMap,
    Vector2,
} from "./Layout";
import {RoomMap} from "./RoomMap";
import {LayoutFactory} from "./LayoutFactory";
import {ROOMTYPE_SOURCEKEEPER, WorldMap} from "../WorldMap";
import {LayoutDisplay} from "./LayoutDisplay";
export class LayoutFinder {

    private roomName: string;
    private sourcePositions: RoomPosition[];
    private controllerPos: RoomPosition;
    private obstacleMap: RoomMap<number>;
    private progress: LayoutFinderProgress;
    private layoutTypes = [LAYOUT_MINI, LAYOUT_QUAD, LAYOUT_FLEX];
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
                    this.observeRoom();
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

        this.sourcePositions = Mem.posInstances(layoutData.sourcePositions);
        this.controllerPos = Mem.posInstance(layoutData.controllerPos);
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
        return {
            sourcePositions: sourcePositions,
            controllerPos: room.controller.pos,
        };
    }

    private findObstacleMap(data: LayoutFinderData): RoomMap<number> {
        let obstacles = [];
        for (let pos of data.sourcePositions) {
            let block = this.findPositionBlock(pos, 2);
            obstacles = obstacles.concat(block);
        }
        let block = this.findPositionBlock(data.controllerPos, 3);
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

    private observeRoom() {
        for (let spawnName in Game.spawns) {
            let spawn = Game.spawns[spawnName];
            if (Game.map.getRoomLinearDistance(this.roomName, spawn.pos.roomName) > OBSERVER_RANGE) { continue; }
            if (spawn.room.controller.level < 8) { continue; }
            let observer = _(spawn.room.find<Structure>(FIND_STRUCTURES))
                .filter(x => x.structureType === STRUCTURE_OBSERVER)
                .head() as StructureObserver;
            if (!observer) { continue; }
            observer.observeRoom(this.roomName);
            console.log(`FINDER: ordering observer vision in ${this.roomName}`);
            return;
        }

        console.log(`FINDER: need vision in ${this.roomName} or data with locations of sources and controller`);
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

        let layout = LayoutFactory.Instantiate(this.roomName, {
            anchor: progress.anchor,
            rotation: progress.rotation,
            type: type,
        });

        this.currentRadius = layout.fixedMap.radius;
        if (!progress.anchor) {
            progress.anchor = {x: this.currentRadius, y: this.currentRadius };
        }

        let obstacle = this.obstacleMap.findAnyInRange(progress.anchor, layout.fixedMap.radius, layout.fixedMap.taper);
        if (obstacle) {
            this.incrementProgress(progress, obstacle);
            return;
        }

        let validLayout: ValidLayoutData = {
            data: {
                anchor: progress.anchor,
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
            this.incrementProgress(progress);
            return;
        }

        for (let sourcePos of this.sourcePositions) {
            validLayout.energyScore += this.findSourceScore(sourcePos, progress.anchor);
        }

        if (!this.validLayouts[type]) { this.validLayouts[type] = []; }
        this.validLayouts[type].push(validLayout);
        this.incrementProgress(progress);
    }

    private incrementProgress(progress: LayoutFinderProgress, obstacle?: Vector2) {
        if (obstacle) {
            progress.rotation = 0;
            // TODO: could speed up progress considerably if you calculated how far to move ahead based on the obstacle
            progress.anchor.x++;
        } else {
            progress.rotation++;
        }

        if (progress.rotation > 3) {
            progress.rotation = 0;
            progress.anchor.x++;
        }

        if (progress.anchor.x > 49 - this.currentRadius) {
            progress.anchor.x = this.currentRadius;
            progress.anchor.y++;
        }

        if (progress.anchor.y > 49 - this.currentRadius) {
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
        if (WorldMap.roomTypeFromName(sourcePos.roomName) === ROOMTYPE_SOURCEKEEPER) {
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
                    new RoomVisual(this.roomName).text("x", position, {color: "red"});
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
        for (let type in this.validLayouts) {
            let validLayouts = this.validLayouts[type];

            if (Game.gcl.level <= 1) {
                // needs to have a spawn hit for the first room
                let best = _(validLayouts).filter(x => x.foundSpawn).max(x => x.energyScore);
                if (best) {
                    return best;
                } else {
                    continue;
                }
            }

            let best = _(validLayouts)
                .filter(x => x.structureScore > 0)
                .max(x => x.structureScore * 1000 + x.energyScore);
            if (best && best instanceof Object) { return best; }

            best = _(validLayouts).max(x => x.energyScore);
            if (best && best instanceof Object) { return best; }
        }
    }
}

export interface LayoutFinderData {
    sourcePositions: RoomPosition[];
    controllerPos: RoomPosition;
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
