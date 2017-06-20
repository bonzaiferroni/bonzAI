import {FreelanceStatus, Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {Traveler} from "../Traveler";
import {WorldMap, ROOMTYPE_ALLEY} from "../WorldMap";
import {helper} from "../../helpers/helper";
import {Agent} from "../agents/Agent";
import {empire} from "../Empire";
import {Scheduler} from "../../Scheduler";
import {Notifier} from "../../notifier";
import {Tick} from "../../Tick";

export interface PathMemory extends MissionMemory {
    distance: number;
    roadRepairIds: string[];
    pathCheck: number;
}

export class PathMission extends Mission {
    private startPos: RoomPosition;
    private endPos: RoomPosition;
    private rangeToEnd: number;
    private ignoreConstructionLimit: boolean;
    private pavers: Agent[];
    public memory: PathMemory;
    private repairLevel: number;

    constructor(operation: Operation, name: string) {
        super(operation, name);
    }

    public init() {
    }

    public updatePath(startPos: RoomPosition, endPos: RoomPosition, rangeToEnd: number, repairLevel = .2) {
        this.startPos = startPos;
        this.endPos = endPos;
        this.rangeToEnd = rangeToEnd;
        this.repairLevel = repairLevel;
    }

    public update() {
        if (!this.startPos) { return; }
        this.checkPath();
    }

    public getPaverBody = () => {
        if (this.spawnGroup.maxSpawnEnergy < 350) {
            return this.workerBody(1, 2, 1);
        }
        return this.bodyRatio(1, 3, 2, 1, 5);
    };

    public getMaxPavers = () => {
        if (!this.memory.roadRepairIds || !this.state.hasVision) {
            return 0;
        } else {
            return 1;
        }
    };

    public roleCall() {
        this.pavers = this.headCount("paver", this.getPaverBody, this.getMaxPavers, {
            freelance: {
                roomName: this.roomName,
                urgent: false,
            },
        });
    }

    public actions() {
        for (let paver of this.pavers) {
            this.paverActions(paver);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    public getdistance(): number { return this.memory.distance; }

    private checkPath() {
        if (Scheduler.delay(this.memory, "pathCheck", 1000)) { return; }

        if (Game.map.getRoomLinearDistance(this.startPos.roomName, this.endPos.roomName) > 2) {
            Notifier.log(`PAVER: path too long: ${this.startPos.roomName} to ${this.endPos.roomName}`);
            return;
        }
        let path = this.findPavedPath(this.startPos, this.endPos);
        if (!path) {
            Notifier.log(`incomplete pavePath, please investigate (${this.operation.name}), start: ${
                this.startPos}, finish: ${this.endPos}, mission: ${this.name}`);
            return;
        }

        let newConstructionPos = this.examinePavedPath(path);
        if (newConstructionPos && (this.ignoreConstructionLimit || Object.keys(Game.constructionSites).length < 60)) {
            Scheduler.nextTick(this, "pathCheck");
            if (!Tick.cache.placedRoad) {
                Tick.cache.placedRoad = true;
                console.log(`PAVER: placed road ${newConstructionPos} in ${this.operation.name}`);
                newConstructionPos.createConstructionSite(STRUCTURE_ROAD);
            }
        }  else {
            if (_.last(path).inRangeTo(this.endPos, 1)) {
                this.memory.distance = path.length;
            }
        }
    }

    protected findPavedPath(start: RoomPosition, finish: RoomPosition): RoomPosition[] {
        const ROAD_COST = 3;
        const PLAIN_COST = 4;
        const SWAMP_COST = 5;
        const AVOID_COST = 7;

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
                    let roomType = WorldMap.roomTypeFromName(roomName);
                    if (roomType === ROOMTYPE_ALLEY) {
                        let matrix = new PathFinder.CostMatrix();
                        return helper.blockOffExits(matrix, AVOID_COST, 0, roomName);
                    }
                    return;
                }

                let matrix = new PathFinder.CostMatrix();

                // avoid controller
                if (room.controller) {
                    helper.blockOffPosition(matrix, room.controller, 3, AVOID_COST, true);
                }

                // avoid container/link adjacency
                let sources = room.find<Source>(FIND_SOURCES);
                for (let source of sources) {
                    helper.blockOffPosition(matrix, source, 2, AVOID_COST, true);
                }

                let mineral = room.find<Mineral>(FIND_MINERALS)[0];
                if (mineral) {
                    helper.blockOffPosition(matrix, mineral, 2, AVOID_COST, true);
                }

                Traveler.addStructuresToMatrix(room, matrix, ROAD_COST);

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
        if (path.length <= this.rangeToEnd) { return; }

        let repairIds = [];
        let hitsToRepair = 0;

        for (let i = 0; i < path.length - this.rangeToEnd; i++) {
            let position = path[i];
            if (!Game.rooms[position.roomName]) { return; }
            if (position.isNearExit(0)) { continue; }
            let road = position.lookForStructure(STRUCTURE_ROAD);
            if (road) {
                repairIds.push(road.id);
                hitsToRepair += road.hitsMax - road.hits;
                // TODO: calculate how much "a whole lot" should be based on paver repair rate
                const A_WHOLE_LOT = 1000000;
                if (!this.memory.roadRepairIds && (hitsToRepair > A_WHOLE_LOT || road.hits < road.hitsMax * this.repairLevel)) {
                    console.log(`PAVER: I'm being summoned in ${this.operation.name}`);
                    this.memory.roadRepairIds = repairIds;
                }
                continue;
            }
            let construction = position.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
            if (construction) { continue; }
            return position;
        }
    }

    protected paverActions(paver: Agent) {
        let road = this.findRoadToRepair();
        if (!road) {
            if (Game.time % 5 === 0) { console.log(paver.name, "waiting to be hired", paver.ticksToLive, this.name, this.operation.name); }
            this.updateFreelanceStatus("paver", paver, FreelanceStatus.Available);
            let fleeing = paver.fleeHostiles();
            if (fleeing) { return; }
            paver.idleOffRoad(this.flag);
            return;
        } else {
            this.updateFreelanceStatus("paver", paver, FreelanceStatus.Busy);
        }

        let fleeing = paver.fleeHostiles();
        if (fleeing) { return; }

        // paver, healthyself
        if (paver.hits < paver.hitsMax) {
            if (paver.room.hostiles.length === 0 && !paver.pos.isNearExit(0)) {
                let tower = paver.pos.findClosestByRange(paver.room.findStructures<StructureTower>(STRUCTURE_TOWER));
                if (tower) {
                    tower.heal(paver.creep);
                    return;
                }
            }
        }

        let hasLoad = paver.hasLoad();
        if (!hasLoad) {
            paver.procureEnergy(this.findRoadToRepair());
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
        if (!this.memory.roadRepairIds) {
            return;
        }

        let road = Game.getObjectById<StructureRoad>(this.memory.roadRepairIds[0]);
        if (road && road.hits < road.hitsMax) {
            return road;
        } else {
            this.memory.roadRepairIds.shift();
            if (this.memory.roadRepairIds.length > 0) {
                return this.findRoadToRepair();
            } else {
                // allows paver to be reused by another mission
                delete this.memory.roadRepairIds;
            }
        }
    }
}
