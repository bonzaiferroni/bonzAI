import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Traveler} from "../Traveler";
import {WorldMap, ROOMTYPE_ALLEY} from "../WorldMap";
import {helper} from "../../helpers/helper";
import {Agent} from "./Agent";
import {empire} from "../../helpers/loopHelper";
export class PathMission extends Mission {
    private start: {pos: RoomPosition };
    private end: {pos: RoomPosition };
    private rangeToEnd: number;
    private ignoreConstructionLimit: boolean;
    private pathData: {
        distance: number;
        roadRepairIds: string[];
        pathCheck: number;
    };
    private paver: Agent;

    constructor(operation: Operation, name: string, details: {
        start: {pos: RoomPosition};
        end: {pos: RoomPosition};
        rangeToEnd: number;
        ignoreConstructionLimit?: boolean;
    }) {
        super(operation, name);
        this.start = details.start;
        this.end = details.end;
        this.rangeToEnd = details.rangeToEnd;
        this.ignoreConstructionLimit = details.ignoreConstructionLimit;
        if (!this.memory.pathData) { this.memory.pathData = {}; }
        this.pathData = this.memory.pathData;
    }

    public initMission() {
        this.spawnGroup = empire.getSpawnGroup(this.start.pos.roomName);
        this.checkPath();
    }

    public roleCall() {
        if (!this.pathData.roadRepairIds) { return; }
        if (this.room.controller && this.room.controller.level === 1) { return; }
        let paverBody = () => { return this.bodyRatio(1, 3, 2, 1, 5); };
        this.paver = this.spawnSharedAgent("paver", paverBody);
    }

    public missionActions() {
        if (!this.paver) { return; }
        this.paverActions(this.paver);
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    get distance(): number { return this.pathData.distance; }

    private checkPath() {
        if (!this.pathData.pathCheck || Game.time < this.pathData.pathCheck) { return; }

        if (Game.map.getRoomLinearDistance(this.start.pos.roomName, this.end.pos.roomName) > 2) {
            console.log(`PAVER: path too long: ${this.start.pos.roomName} to ${this.end.pos.roomName}`);
            return;
        }
        let path = this.findPavedPath(this.start.pos, this.end.pos, this.rangeToEnd);

        if (!path) {
            console.log(`incomplete pavePath, please investigate (${this.operation.name}), start: ${this.start.pos}, ` +
                `finish: ${this.end.pos}, mission: ${this.name}`);
            return;
        }

        let newConstructionPos = this.examinePavedPath(path);

        if (newConstructionPos && (this.ignoreConstructionLimit || Object.keys(Game.constructionSites).length < 60)) {
            if (!Game.cache.placedRoad) {
                Game.cache.placedRoad = true;
                console.log(`PAVER: placed road ${newConstructionPos} in ${this.operation.name}`);
                newConstructionPos.createConstructionSite(STRUCTURE_ROAD);
            }
        }  else {
            this.pathData.pathCheck = Game.time + helper.randomInterval(1000);
            if (_.last(path).inRangeTo(this.end.pos, this.rangeToEnd)) {
                this.pathData.distance = path.length;
            }
        }
    }

    protected findPavedPath(start: RoomPosition, finish: RoomPosition, rangeAllowance: number): RoomPosition[] {
        const ROAD_COST = 3;
        const PLAIN_COST = 4;
        const SWAMP_COST = 5;
        const AVOID_COST = 7;

        let maxDistance = Game.map.getRoomLinearDistance(start.roomName, finish.roomName);
        let ret = PathFinder.search(start, [{pos: finish, range: rangeAllowance}], {
            plainCost: PLAIN_COST,
            swampCost: SWAMP_COST,
            maxOps: 12000,
            roomCallback: (roomName: string): CostMatrix | boolean => {

                // disqualify rooms that involve a circuitous path
                if (Game.map.getRoomLinearDistance(start.roomName, roomName) > maxDistance) {
                    return false;
                }

                // disqualify enemy rooms
                if (Traveler.checkOccupied(roomName)) {
                    return false;
                }

                let room = Game.rooms[roomName];
                if (!room) {
                    let roomType = WorldMap.roomTypeFromName(roomName);
                    if (roomType === ROOMTYPE_ALLEY) {
                        let matrix = new PathFinder.CostMatrix();
                        return helper.blockOffExits(matrix, AVOID_COST, roomName);
                    }
                    return;
                }

                let matrix = new PathFinder.CostMatrix();
                Traveler.addStructuresToMatrix(room, matrix, ROAD_COST);

                // avoid controller
                if (room.controller) {
                    helper.blockOffPosition(matrix, room.controller, 3, AVOID_COST);
                }

                // avoid container/link adjacency
                let sources = room.find<Source>(FIND_SOURCES);
                for (let source of sources) {
                    let structure = source.findMemoStructure<Structure>(STRUCTURE_CONTAINER, 1);
                    if (!structure) {
                        structure = source.findMemoStructure<Structure>(STRUCTURE_LINK, 1);
                    }

                    if (structure) {
                        helper.blockOffPosition(matrix, structure, 1, AVOID_COST);
                    }
                }

                // add construction sites too
                let constructionSites = room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
                for (let site of constructionSites) {
                    if (site.structureType === STRUCTURE_ROAD) {
                        matrix.set(site.pos.x, site.pos.y, ROAD_COST);
                    } else {
                        matrix.set(site.pos.x, site.pos.y, 0xff);
                    }
                }

                // avoid going too close to lairs
                for (let lair of room.findStructures<StructureKeeperLair>(STRUCTURE_KEEPER_LAIR)) {
                    helper.blockOffPosition(matrix, lair, 1, AVOID_COST);
                }

                return matrix;
            },
        });

        if (!ret.incomplete) {
            return ret.path;
        }
    }

    private examinePavedPath(path: RoomPosition[]) {

        let repairIds = [];
        let hitsToRepair = 0;

        for (let i = 0; i < path.length; i++) {
            let position = path[i];
            if (!Game.rooms[position.roomName]) { return; }
            if (position.isNearExit(0)) { continue; }
            let road = position.lookForStructure(STRUCTURE_ROAD);
            if (road) {
                repairIds.push(road.id);
                hitsToRepair += road.hitsMax - road.hits;
                // TODO: calculate how much "a whole lot" should be based on paver repair rate
                const A_WHOLE_LOT = 1000000;
                if (!this.pathData.roadRepairIds && (hitsToRepair > A_WHOLE_LOT || road.hits < road.hitsMax * .20)) {
                    console.log(`PAVER: I'm being summoned in ${this.operation.name}`);
                    this.pathData.roadRepairIds = repairIds;
                }
                continue;
            }
            let construction = position.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
            if (construction) { continue; }
            return position;
        }
    }

    protected paverActions(paver: Agent) {
        // paver, healthyself
        if (paver.hits < paver.hitsMax) {
            if (paver.room.hostiles.length === 0 && !paver.pos.isNearExit(0)) {
                let tower = paver.pos.findClosestByRange(paver.room.findStructures<StructureTower>(STRUCTURE_TOWER));
                if (tower) {
                    tower.heal(paver.creep);
                    return;
                }
            }
            let healersInRoom = _.filter(paver.room.find<Creep>(FIND_MY_CREEPS), c => c.getActiveBodyparts(HEAL));
            if (healersInRoom.length > 0) {
                paver.idleOffRoad();
                return;
            }
            if (paver.getActiveBodyparts(WORK) === 0) {
                paver.travelTo(this.spawnGroup);
                return;
            }
        }

        let hasLoad = paver.hasLoad();
        if (!hasLoad) {
            paver.procureEnergy(this.findRoadToRepair());
            return;
        }

        let road = this.findRoadToRepair();

        if (!road) {
            console.log(`this is ${this.operation.name} paver, checking out with ${paver.ticksToLive} ticks to live`);
            delete Memory.creeps[paver.name];
            paver.idleOffRoad(this.room.controller);
            return;
        }

        let paving = false;
        if (paver.pos.inRangeTo(road, 3) && !paver.pos.isNearExit(0)) {
            paving = paver.repair(road) === OK;
            let hitsLeftToRepair = road.hitsMax - road.hits;
            if (hitsLeftToRepair > 10000) {
                paver.yieldRoad(road, true);
            } else if (hitsLeftToRepair > 1500) {
                paver.yieldRoad(road, false);
            }
        } else {
            paver.travelTo(road, {range: 0});
        }

        if (!paving) {
            road = paver.pos.lookForStructure(STRUCTURE_ROAD) as StructureRoad;
            if (road && road.hits < road.hitsMax) { paver.repair(road); }
        }

        paver.stealNearby("creep");
    }

    private findRoadToRepair(): StructureRoad {
        if (!this.pathData.roadRepairIds) { return; }

        let road = Game.getObjectById<StructureRoad>(this.pathData.roadRepairIds[0]);
        if (road && road.hits < road.hitsMax) {
            return road;
        } else {
            this.pathData.roadRepairIds.shift();
            if (this.pathData.roadRepairIds.length > 0) {
                return this.findRoadToRepair();
            } else {
                this.pathData.roadRepairIds = undefined;
            }
        }
    }
}
