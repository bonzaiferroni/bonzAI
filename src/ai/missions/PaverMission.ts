import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {SpawnGroup} from "../SpawnGroup";
import {Archiver} from "../Archiver";
import {MemHelper} from "../../helpers/MemHelper";
import {Notifier} from "../../notifier";
import {ROOMTYPE_ALLEY, WorldMap} from "../WorldMap";
import {MatrixHelper} from "../../helpers/MatrixHelper";
import {Scheduler} from "../../Scheduler";
import {Layout} from "../layouts/Layout";
import {helper} from "../../helpers/helper";
import {Traveler} from "../../Traveler/Traveler";

interface PaverMemory extends MissionMemory {
}

interface PaverState extends MissionState {
}

export interface PaveData {
    id: string;
    startPos: RoomPosition;
    endPos: RoomPosition;
    rangeToEnd: number;
    validityInterval?: number;
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

    private static tick: number;
    private static constructionCount: number;

    constructor(operation: Operation) {
        super(operation, "paver");
    }

    protected init() {
        if (!this.state.hasVision) {
            this.operation.sleepMission(this, 100, true);
            return;
        }
        let roadData = PaverMission.findRoadData(this.room);
        let potholes = PaverMission.findDisrepaired(roadData.roads, .5);
        if (potholes.length + roadData.unpaved.length === 0) {
            if (this.roleCount("paver") === 0) {
                this.operation.removeMission(this);
            }
            return;
        }
        if (roadData.unpaved.length > 10) {
            this.boosts = [RESOURCE_CATALYZED_LEMERGIUM_ACID];
        }
        this.needsRepair = true;
    }

    protected update() {
    }

    protected paverBody = () => {
        if (this.boosts && this.spawnGroup.maxSpawnEnergy > 4000) {
            return this.workerUnitBody(1, 3, 2, 4);
        } else {
            return this.workerUnitBody(1, 1, 1, 4);
        }
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
            skipMoveToRoom: true,
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

    private paverActions(paver: Agent) {
        let fleeing = paver.fleeHostiles();
        if (fleeing) { return; }

        let outcome: number;
        let hasLoad = paver.hasLoad();
        if (hasLoad) {
            let target: ConstructionSite|StructureRoad|RoomPosition = this.findTarget(paver);
            if (!target) {
                if (paver.room === this.room) {
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
                } else {
                    paver.travelTo(this.flag);
                    return;
                }
            }

            let range = paver.pos.getRangeTo(target);
            if (range > 3 || paver.pos.isNearExit(0)) {
                paver.travelTo(target);
            } else {
                if (target instanceof ConstructionSite) {
                    outcome = paver.build(target);
                    paver.yieldRoad(target);
                } else if (target instanceof StructureRoad) {
                    outcome = paver.repair(target);
                    paver.yieldRoad(target);
                } else {
                    paver.yieldRoad({pos: target});
                }
            }
        } else {
            paver.procureEnergy({
                getFromSpawnRoom: true,
            });
        }

        if (outcome !== OK) {
            let road = paver.pos.lookForStructure(STRUCTURE_ROAD);
            if (road) {
                paver.repair(road);
            }
        }
    }

    private static findRoadData(room: Room): {unpaved: RoomPosition[], roads: StructureRoad[] } {
        let data = {
            unpaved: [],
            roads: [],
        };
        let positions = PaverMission.getRoadPositions(room.name);
        for (let position of positions) {
            let road = position.lookForStructure(STRUCTURE_ROAD);
            if (road) {
                data.roads.push(road);
            } else if (!position.isNearExit(0)) {
                data.unpaved.push(position);
            }
        }
        return data;
    }

    private static findDisrepaired(roads: StructureRoad[], disrepair: number): StructureRoad[] {
        return _.filter(roads, x => x.hits < x.hitsMax * disrepair);
    }

    private findTarget(paver: Agent): RoomPosition|ConstructionSite|StructureRoad {
        if (paver.memory.targetPos) {
            let position = helper.deserializeRoomPosition(paver.memory.targetPos);
            let room = Game.rooms[position.roomName];
            if (room) {
                let road = position.lookForStructure<StructureRoad>(STRUCTURE_ROAD);
                if (road) {
                    if (road.hits < road.hitsMax) {
                        return road;
                    } else {
                        paver.memory.targetPos = undefined;
                        return this.findTarget(paver);
                    }
                }
                let site = position.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
                if (site) {
                    return site;
                } else {
                    position.createConstructionSite(STRUCTURE_ROAD);
                }
            }
            return position;
        } else {
            if (!paver.memory.cleared) { paver.memory.cleared = {}; }
            if (paver.memory.cleared[paver.pos.roomName]) { return; }
            let data = PaverMission.findRoadData(paver.room);
            let closest = paver.pos.findClosestByPath(data.unpaved);
            if (!closest) {
                let closestDisrepair = paver.pos.findClosestByRange(PaverMission.findDisrepaired(data.roads, .9));
                if (closestDisrepair) {
                    closest = closestDisrepair.pos;
                }
            }

            if (closest) {
                paver.memory.targetPos = closest;
                return closest;
            } else {
                paver.memory.cleared[paver.pos.roomName] = true;
            }
        }
    }

    private static getArchive() {
        return Archiver.getSegment(ROADMAP_SEGMENTID);
    }

    public static getRoadPositions(roomName: string, excludeId?: string): RoomPosition[] {
        let archive = this.getArchive();
        if (!archive[roomName]) { archive[roomName] = {}; }
        let roomData = archive[roomName];

        let positions = [];
        let alreadyFound: {[intPos: number]: boolean } = {};
        for (let id in roomData) {
            if (id === excludeId) { continue; }
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
        rangeToEnd = Math.max(rangeToEnd, 1);
        for (let step = 0; step < path.length - (rangeToEnd - 1); step++) {
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

    public static updatePath(memory: {pathCheck?: number, pathDistance?: number}, callback: () => PaveData): number {
        if (Scheduler.delay(memory, "pathCheck", 1000)) { return; }

        let data = callback();
        if (!data) { return; }

        if (Game.map.getRoomLinearDistance(data.startPos.roomName, data.endPos.roomName) > 2) {
            Notifier.log(`PAVER: path too long: ${data.startPos.roomName} to ${data.endPos.roomName}`);
            return;
        }

        let path = this.findPavedPath(data.startPos, data.endPos, data.id);
        if (!path) {
            Notifier.log(`PAVER: incomplete pavePath, please investigate. ${data.startPos} to ${data.endPos}`);
            return;
        }

        let recheckInterval = 1000;
        let startRoom = Game.rooms[data.startPos.roomName];
        if (startRoom && startRoom.controller && startRoom.controller.level === 8) {
            recheckInterval = 5000;
        }

        if (!data.validityInterval) {
            data.validityInterval = recheckInterval * 2;
        }

        this.savePath(data.id, path, data.rangeToEnd, data.validityInterval);
        memory.pathCheck = Game.time + recheckInterval;

        // place all sites in owned rooms
        let endRoom = Game.rooms[data.endPos.roomName];
        if (endRoom && endRoom.controller && endRoom.controller.my) {
            if (this.tick !== Game.time) {
                this.tick = Game.time;
                this.constructionCount = Object.keys(Game.constructionSites).length;
            }

            let index = 0;
            for (let position of path) {
                if (index > path.length - (data.rangeToEnd - 1)) { continue; }
                index++;
                if (!Game.rooms[position.roomName] || this.constructionCount > 80) { continue; }

                let road = position.lookForStructure(STRUCTURE_ROAD);
                if (!road) {
                    let outcome = position.createConstructionSite(STRUCTURE_ROAD);
                    if (outcome === OK) {
                        this.constructionCount++;
                    }
                }
            }
        }

        memory.pathDistance = path.length;
    }

    private static findPavedPath(start: RoomPosition, finish: RoomPosition, id: string): RoomPosition[] {
        const UNPLACED_COST = 2;
        const ROAD_COST = 3;
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

                // avoid controller
                if (room.controller) {
                    MatrixHelper.blockOffPosition(matrix, room.controller, 3, AVOID_COST, true);
                }

                // avoid container/link adjacency
                let sources = room.find<Source>(FIND_SOURCES);
                for (let source of sources) {
                    MatrixHelper.blockOffPosition(matrix, source, 1, AVOID_COST, true);
                    MatrixHelper.blockOffPosition(matrix, source, 2, AVOID_COST, true);
                }

                let mineral = room.find<Mineral>(FIND_MINERALS)[0];
                if (mineral) {
                    MatrixHelper.blockOffPosition(matrix, mineral, 1, AVOID_COST, true);
                }

                // avoid going too close to lairs
                for (let lair of room.findStructures<StructureKeeperLair>(STRUCTURE_KEEPER_LAIR)) {
                    MatrixHelper.blockOffPosition(matrix, lair, 1, AVOID_COST, true);
                }

                Traveler.addStructuresToMatrix(room, matrix, ROAD_COST);

                // add construction sites too
                let constructionSites = room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
                for (let site of constructionSites) {
                    if (site.structureType === STRUCTURE_RAMPART) {
                        continue;
                    }

                    if (site.structureType === STRUCTURE_ROAD) {
                        matrix.set(site.pos.x, site.pos.y, ROAD_COST);
                    } else {
                        matrix.set(site.pos.x, site.pos.y, 0xff);
                    }
                }

                // add unplaced roads
                for (let pos of this.getRoadPositions(roomName, id)) {
                    let cost = matrix.get(pos.x, pos.y);
                    if (cost === 0xff || cost === ROAD_COST) { continue; }
                    matrix.set(pos.x, pos.y, UNPLACED_COST);
                }

                let layout = Layout.findMap(roomName);
                if (layout) {
                    let roads = layout[STRUCTURE_ROAD];
                    if (roads) {
                        for (let pos of roads) {
                            matrix.set(pos.x, pos.y, UNPLACED_COST);
                        }
                    }
                }

                let containers = room.findStructures(STRUCTURE_CONTAINER);
                for (let container of containers) {
                    matrix.set(container.pos.x, container.pos.y, 50);
                }

                return matrix;
            },
        });

        if (!ret.incomplete) {
            return ret.path;
        }
    }
}
