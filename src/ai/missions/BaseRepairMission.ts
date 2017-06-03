import {Mission, MissionMemory} from "./Mission";
import {ControllerOperation} from "../operations/ControllerOperation";
import {Layout} from "../layouts/Layout";
import {Scheduler} from "../../Scheduler";

interface BaseRepairMemory extends MissionMemory {
    roadIds: string[];
    rampId: string;
    rampThreshold: number;
}

export class BaseRepairMission extends Mission {

    private layout: Layout;
    private towers: StructureTower[];
    private repairMax: number;
    public memory: BaseRepairMemory;

    constructor(operation: ControllerOperation) {
        super(operation, "repair");
        this.layout = operation.layout;
    }

    protected init() {
        if (!this.memory.roadIds) { this.memory.roadIds = []; }
        this.towerSearch = _.memoize(this.towerSearch);
    }

    public update() {
        this.towers = this.room.findStructures<StructureTower>(STRUCTURE_TOWER);
        this.findRepairTargets();
    }

    public roleCall() {
    }

    public actions() {
        if (this.room.hostiles.length > 0) { return; }

        this.towerActions();
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private towerActions() {
        let structure = this.getNextRepair();
        if (structure) {
            let towers = this.findTowersByRange(structure.pos);
            for (let tower of towers) {
                if (!tower) { continue; }
                tower.repair(structure);
            }
        }
    }

    private findRepairTargets() {
        if (!this.layout || !this.layout.map) { return; }
        this.findRamparts();
        this.findRoads();
    }

    private findRamparts() {
        if (Scheduler.delay(this.memory, "findRamps", 100)) { return; }

        let lowest = _(this.layout.findStructures<StructureRampart>(STRUCTURE_RAMPART))
            .filter(x => x.hits < RAMPART_MAX_REPAIR)
            .min(x => x.hits);
        if (!_.isObject(lowest)) {
            console.log(`REPAIR: no ramparts under threshold in ${this.roomName}`);
            delete this.memory.rampId;
            return;
        }

        this.memory.rampId = lowest.id;
    }

    private findRoads() {
        if (Scheduler.delay(this.memory, "findRoads", 1000)) { return; }

        let roads = _(this.layout.findStructures<StructureRoad>(STRUCTURE_ROAD))
            .filter(x => x.hits < x.hitsMax * .5)
            .value();
        if (!roads || roads.length === 0) {
            console.log(`REPAIR: no roads need repair in ${this.roomName}`);
            return;
        }

        this.memory.roadIds = _.map(roads, x => x.id);
    }

    private getNextRepair(): Structure {
        if (this.memory.roadIds.length > 0) {
            for (let id of this.memory.roadIds) {
                let structure = Game.getObjectById<Structure>(id);
                if (structure && structure.hits < structure.hitsMax) {
                    return structure;
                } else {
                    this.memory.roadIds = _.remove(this.memory.roadIds, id);
                }
            }
        }

        if (this.memory.rampId) {
            let rampart = Game.getObjectById<StructureRoad>(this.memory.rampId);
            if (rampart) {
                return rampart;
            } else {
                delete this.memory.rampId;
            }
        }
    }

    private findTowersByRange(pos: RoomPosition): StructureTower[] {
        let ids = this.towerSearch(pos.x, pos.y);
        if (ids) {
            return _.map(ids, x => Game.getObjectById<StructureTower>(x));
        }
    }

    private towerSearch(x: number, y: number): string[] {
        let position = new RoomPosition(x, y, this.roomName);
        /*let inRange = position.findInRange<StructureTower>(this.towers, 5);
        if (inRange.length > 0) {
            return _.map(inRange, tower => tower.id);
        }*/

        let closest = position.findClosestByRange(this.towers);
        if (closest) {
            return [closest.id];
        }
    }
}

export const TOWER_REPAIR_IDEAL = 5;
export const RAMPART_MAX_REPAIR = 40000000;
