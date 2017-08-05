import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {SpawnGroup} from "../SpawnGroup";
import {Archiver} from "../Archiver";
import {MemHelper} from "../../helpers/MemHelper";
import {Notifier} from "../../notifier";
import {Traveler} from "../Traveler";
import {ROOMTYPE_ALLEY, WorldMap} from "../WorldMap";
import {MatrixHelper} from "../../helpers/MatrixHelper";
import {Scheduler} from "../../Scheduler";

interface PaverMemory extends MissionMemory {
}

interface PaverState extends MissionState {
}

interface RoadMapData {
    tick: number;
    intPositions: number[];
}

export const ROADMAP_SEGMENTID = 66;

export class PaverMission extends Mission {

    public memory: PaverMemory;
    public state: PaverState;
    private pavers: Agent[];
    private needsRepair: boolean;
    private boosts: string[];
    private roads: StructureRoad;

    private static tick: number;
    private static constructionCount: number;

    constructor(operation: Operation) {
        super(operation, "paver");
    }

    protected init() {
        if (!this.state.hasVision) { this.operation.sleepMission(this, 100, true); }
        let potholes = this.findPotholes(.5);
        let construction = this.findConstruction();
        if (potholes.length + construction.length === 0) {
            if (this.roleCount("paver") === 0) {
                this.operation.removeMission(this);
            }
            return;
        }
        if (construction.length > 0) {
            this.boosts = [RESOURCE_CATALYZED_LEMERGIUM_ACID];
        }
        this.needsRepair = true;
    }

    protected update() {
    }

    protected paverBody = () => {
        return this.bodyRatio(1, 1, 1, 1, 4);
    };

    protected maxPavers = () => {
        if (this.needsRepair) {
            return 1;
        } else {
            return 0;
        }
    };

    protected roleCall() {
        this.pavers = this.headCount("paver", this.paverBody, this.maxPavers, {
            memory: { scavenger: RESOURCE_ENERGY },
            boosts: this.boosts,
            allowUnboosted: true,
        });
    }

    protected actions() {
        for (let paver of this.pavers) {
            this.paverActions(paver);
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }

    private findPotholes(disrepair: number): StructureRoad[] {
        if (!this.room) { return []; }
        let potholes = [];
        for (let roadPos of PaverMission.getRoadPositions(this.roomName)) {
            let road = roadPos.lookForStructure(STRUCTURE_ROAD);
            if (road && road.hits < road.hitsMax * disrepair) {
                potholes.push(road);
            }
        }
        return potholes;
    }

    private findConstruction(): ConstructionSite[] {
        if (!this.room) { return []; }
        let sites = [];
        for (let roadPos of PaverMission.getRoadPositions(this.roomName)) {
            let site = roadPos.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
            if (site) {
                sites.push(site);
            }
        }
        return sites;
    }

    private paverActions(paver: Agent) {

        let fleeing = paver.fleeHostiles();
        if (fleeing) { return; }

        let outcome: number;
        let hasLoad = paver.hasLoad();
        if (hasLoad) {
            let target: ConstructionSite|StructureRoad = this.findConstructionSite(paver);
            if (!target) {
                target = this.findRoadRepair(paver);
                if (!target) {
                    this.needsRepair = false;
                    let onRoad = paver.pos.lookForStructure(STRUCTURE_ROAD);
                    if (onRoad) {
                        paver.idleOffRoad();
                        return;
                    }
                    if (this.roleCount("paver") === 1) {
                        this.operation.removeMission(this);
                        return;
                    }
                }
            }

            let range = paver.pos.getRangeTo(target);
            if (range > 3) {
                paver.travelTo(target);
            } else {
                if (target instanceof ConstructionSite) {
                    outcome = paver.build(target);
                } else {
                    outcome = paver.repair(target);
                }
                paver.yieldRoad(target);
            }
        } else {
            paver.memory.siteId = undefined;
            paver.memory.roadId = undefined;
            paver.procureEnergy();
        }

        if (outcome !== OK) {
            let road = paver.pos.lookForStructure(STRUCTURE_ROAD);
            if (road) {
                paver.repair(road);
            }
        }
    }

    private findConstructionSite(paver: Agent): ConstructionSite {
        if (paver.memory.siteId) {
            let target = Game.getObjectById<ConstructionSite>(paver.memory.siteId);
            if (target) {
                return target;
            } else {
                paver.memory.siteId = undefined;
                return this.findConstructionSite(paver);
            }
        } else {
            let closest = paver.pos.findClosestByRange(this.findConstruction());
            if (closest) {
                paver.memory.siteId = closest.id;
                return closest;
            } else {

            }
        }
    }

    private findRoadRepair(paver: Agent): StructureRoad {
        if (paver.memory.roadId) {
            let target = Game.getObjectById<StructureRoad>(paver.memory.roadId);
            if (target && target.hits < target.hitsMax) {
                return target;
            } else {
                paver.memory.roadId = undefined;
                return this.findRoadRepair(paver);
            }
        } else {
            let closest = paver.pos.findClosestByRange(this.findPotholes(.9));
            if (closest) {
                paver.memory.roadId = closest.id;
                return closest;
            }
        }
    }

    private static getArchive() {
        return Archiver.getSegment(ROADMAP_SEGMENTID);
    }

    public static getRoadPositions(roomName: string): RoomPosition[] {
        let archive = this.getArchive();
        if (!archive[roomName]) { archive[roomName] = {}; }
        let roomData = archive[roomName];

        let positions = [];
        let alreadyFound: {[intPos: number]: boolean } = {};
        for (let id in roomData) {
            let data = roomData[id] as RoadMapData;
            if (Game.time > data.tick) {
                delete roomData[id];
                continue;
            }
            for (let intPos of data.intPositions) {
                if (alreadyFound[intPos]) { continue; }
                alreadyFound[intPos] = true;
                let position = MemHelper.deserializeIntPosition(intPos, roomName);
                positions.push(position);
            }
        }

        return positions;
    }

    private static savePath(id: string, path: RoomPosition[], rangeToEnd: number, validityInterval: number) {
        let roadMaps: {[roomName: string]: RoadMapData} = {};
        for (let step = 0; step < path.length - rangeToEnd; step++) {
            let position = path[step];
            if (!roadMaps[position.roomName]) {
                roadMaps[position.roomName] = {
                    tick: Game.time + validityInterval,
                    intPositions: [],
                };
            }
            let intPos = MemHelper.intPosition(position);
            roadMaps[position.roomName].intPositions.push(intPos);
        }

        let archive = this.getArchive();
        for (let roomName in roadMaps) {
            if (!archive[roomName]) { archive[roomName] = {}; }
            let roomData = archive[roomName];
            let pathData = roadMaps[roomName];
            roomData[id] = pathData;
        }
        Archiver.saveSegment(ROADMAP_SEGMENTID);
    }

    public static updatePath(id: string, startPos: RoomPosition, endPos: RoomPosition, rangeToEnd: number, memory: any): number {
        // if (Object.keys(Game.constructionSites).length > 50) { return; }
        if (Scheduler.delay(memory, "pathCheck", 100)) { return; }

        if (Game.map.getRoomLinearDistance(startPos.roomName, endPos.roomName) > 2) {
            Notifier.log(`PAVER: path too long: ${startPos.roomName} to ${endPos.roomName}`);
            return;
        }

        let path = this.findPavedPath(startPos, endPos);
        if (!path) {
            Notifier.log(`PAVER: incomplete pavePath, please investigate. ${startPos} to ${endPos}`);
            return;
        }

        let roadsNeeded = 0;
        let roadsPlaced = 0;
        if (this.tick !== Game.time) {
            this.tick = Game.time;
            this.constructionCount = Object.keys(Game.constructionSites).length;
        }

        for (let position of path) {
            if (!Game.rooms[position.roomName] || this.constructionCount > 80) { continue; }

            let road = position.lookForStructure(STRUCTURE_ROAD);
            if (!road) {
                roadsNeeded++;
                let outcome = position.createConstructionSite(STRUCTURE_ROAD);
                if (outcome === OK) {
                    roadsPlaced++;
                    this.constructionCount++;
                }
            }
        }

        if (roadsPlaced > 0) {
            console.log("roads placed", roadsPlaced);
        }

        let interval = 100;
        let startRoom = Game.rooms[startPos.roomName];
        if (roadsNeeded === 0 && startRoom && startRoom.controller && startRoom.controller.level === 8) {
            interval = 5000;
        }

        this.savePath(id, path, rangeToEnd, interval * 2);
        memory.pathCheck = Game.time + interval;

        return path.length;
    }

    private static findPavedPath(start: RoomPosition, finish: RoomPosition): RoomPosition[] {
        const ROAD_COST = 3;
        const UNPLACED_COST = 4;
        const PLAIN_COST = 5;
        const SWAMP_COST = 6;
        const AVOID_COST = 12;

        let maxDistance = Game.map.getRoomLinearDistance(start.roomName, finish.roomName);
        let ret = PathFinder.search(start, [{pos: finish, range: 1}], {
            plainCost: PLAIN_COST,
            swampCost: SWAMP_COST,
            maxOps: 12000,
            roomCallback: (roomName: string): CostMatrix | boolean => {

                // disqualify rooms that involve a circuitous path
                if (Game.map.getRoomLinearDistance(start.roomName, roomName) > maxDistance) {
                    return false;
                }

                // disqualify enemy rooms
                if (Traveler.checkAvoid(roomName)) {
                    return false;
                }

                let room = Game.rooms[roomName];
                if (!room) {
                    let roomType = WorldMap.roomType(roomName);
                    if (roomType === ROOMTYPE_ALLEY) {
                        let matrix = new PathFinder.CostMatrix();
                        return MatrixHelper.blockOffExits(matrix, AVOID_COST, 0, roomName);
                    }
                    return;
                }

                let matrix = new PathFinder.CostMatrix();
                Traveler.addStructuresToMatrix(room, matrix, ROAD_COST);

                // avoid controller
                if (room.controller) {
                    MatrixHelper.blockOffPosition(matrix, room.controller, 3, AVOID_COST, true);
                }

                // avoid container/link adjacency
                let sources = room.find<Source>(FIND_SOURCES);
                for (let source of sources) {
                    MatrixHelper.blockOffPosition(matrix, source, 2, AVOID_COST, true);
                }

                let mineral = room.find<Mineral>(FIND_MINERALS)[0];
                if (mineral) {
                    MatrixHelper.blockOffPosition(matrix, mineral, 2, AVOID_COST, true);
                }

                // avoid going too close to lairs
                for (let lair of room.findStructures<StructureKeeperLair>(STRUCTURE_KEEPER_LAIR)) {
                    MatrixHelper.blockOffPosition(matrix, lair, 1, AVOID_COST);
                }

                // add construction sites too
                let constructionSites = room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
                for (let site of constructionSites) {
                    if (site.structureType === STRUCTURE_CONTAINER || site.structureType === STRUCTURE_RAMPART) {
                        continue;
                    }
                    if (site.structureType === STRUCTURE_ROAD) {
                        matrix.set(site.pos.x, site.pos.y, ROAD_COST);
                    } else {
                        matrix.set(site.pos.x, site.pos.y, 0xff);
                    }
                }

                // add unplaced roads
                for (let pos of this.getRoadPositions(roomName)) {
                    let cost = matrix.get(pos.x, pos.y);
                    if (cost === 0xff || cost === ROAD_COST) { continue; }
                    matrix.set(pos.x, pos.y, UNPLACED_COST);
                }

                return matrix;
            },
        });

        if (!ret.incomplete) {
            return ret.path;
        }
    }
}
