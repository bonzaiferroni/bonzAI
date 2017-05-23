import {Mem} from "../../helpers/Mem";
import {Layout, LayoutData, LayoutType, PositionMap, Vector2} from "./Layout";
import {RoomMap} from "./RoomMap";
import {LayoutFactory} from "./LayoutFactory";
import {ROOMTYPE_SOURCEKEEPER, WorldMap} from "../WorldMap";
import {LayoutDisplay} from "./LayoutDisplay";
export class LayoutFinder {

    private sourcePositions: RoomPosition[];
    private controllerPos: RoomPosition;
    private obstacleMap: RoomMap<number>;
    private progress: LayoutFinderProgress;
    private layoutTypes = [LayoutType.Mini, LayoutType.Quad, LayoutType.Flex];

    private structureScores = {
        [STRUCTURE_TERMINAL]: 10,
        [STRUCTURE_STORAGE]: 10,
        [STRUCTURE_SPAWN]: 5,
        [STRUCTURE_POWER_SPAWN]: 5,
        [STRUCTURE_LAB]: 3,
        [STRUCTURE_ROAD]: 0,
        [STRUCTURE_RAMPART]: 0,
    };

    private roomName: string;
    constructor(roomName: string) {
        this.roomName = roomName;
    }

    public init(data?: LayoutFinderData): boolean {
        if (!Memory.rooms[this.roomName]) { Memory.rooms[this.roomName] = {} as any; }
        let layoutData = Memory.rooms[this.roomName].finder as LayoutFinderData;
        if (!layoutData) {

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
                validLayouts: [],
                progress: {
                    anchor: {x: 1, y: 1},
                    rotation: 0,
                    typeIndex: 0,
                },
            };
        }

        this.sourcePositions = Mem.posInstances(layoutData.sourcePositions);
        this.controllerPos = Mem.posInstance(layoutData.controllerPos);
        this.obstacleMap = new RoomMap<number>(layoutData.obstacleMap);
        this.progress = layoutData.progress;
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
        for (let x = -radius; x <= radius; x++) {
            if (x > 49 || x < 0) { continue; }
            for (let y = -radius; y <= radius; y++) {
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
        if (!this.sourcePositions) {
            console.log(`FINDER: I haven't been fully initilized in ${this.roomName}`);
            return;
        }

        let deadline = 300;
        if (cpuQuota) {
            deadline = Game.cpu.getUsed() + cpuQuota;
        }

        while (!this.progress.final && Game.cpu.getUsed() < deadline) {
            this.runNextSimulation(this.progress);
        }
    }

    private runNextSimulation(progress: LayoutFinderProgress) {

        let layout = LayoutFactory.Instantiate(this.roomName, {
            anchor: progress.anchor,
            rotation: progress.rotation,
            type: this.layoutTypes[progress.typeIndex],
        });

        let obstacle = this.obstacleMap.findAnyInRange(progress.anchor, layout.fixedMap.radius, layout.fixedMap.taper);
        if (obstacle) {
            this.incrementProgress(progress, layout, obstacle);
            return;
        }

        let structurePositions = layout.findFixedMap();
        if (this.findObstruction(structurePositions)) {
            this.incrementProgress(progress, layout);
            return;
        }

        let energyScore = 0;
        for (let sourcePos of this.sourcePositions) {
            energyScore += this.findSourceScore(sourcePos, progress.anchor);
        }

        let structureScore = 0;
        for (let structureType in structurePositions) {
            for (let position of structurePositions[structureType]) {
                let score = this.findStructureScore(position, structureType);
                if (!score) {
                    score = 0;
                }
                structureScore += score;
            }
        }
    }

    private incrementProgress(progress: LayoutFinderProgress, layout: Layout, obstacle?: Vector2) {
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

        if (progress.anchor.x > 49) {
            progress.anchor.x = layout.fixedMap.radius;
            progress.anchor.y++;
        }

        if (progress.anchor.y > 49) {
            progress.typeIndex++;
        }

        let type = this.layoutTypes[progress.typeIndex];
        if (type) {
            progress.anchor.y = 1;
            progress.anchor.x = 1;
        } else {
            progress.final = true;
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

    private findObstruction(structurePositions: PositionMap) {
        for (let structureType in structurePositions) {
            if (structureType === STRUCTURE_WALL || structureType === STRUCTURE_RAMPART) { continue; }
            for (let structure of structurePositions[structureType]) {
                LayoutDisplay.showStructure(structure, structureType);
                let obstacle = this.obstacleMap.get(structure.x, structure.y);
                if (obstacle) {
                    new RoomVisual(this.roomName).text("x", structure, {color: "red"});
                    return true;
                }
            }
        }
    }

    private findStructureScore(position: RoomPosition, structureType: string) {
        let room = Game.rooms[this.roomName];
        if (!room) { return 0; }
        let structure = _(position.lookFor<Structure>(LOOK_STRUCTURES))
            .filter(x => x.structureType === structureType)
            .head();
        if (structure) {
            return this.structureScores[structureType];
        }
    }
}

export interface LayoutFinderData {
    sourcePositions: RoomPosition[];
    controllerPos: RoomPosition;
    obstacleMap?: RoomMap<number>;
    progress?: LayoutFinderProgress;
    validLayouts?: {
        data: LayoutData;
        energyScore: number;
        structureScore: number;
        foundSpawn: boolean;
    }[];
}

export interface LayoutFinderProgress {
    anchor: Vector2;
    rotation: number;
    typeIndex: number;
    final: boolean;
}
