import {Mission, MissionMemory} from "./Mission";
import {ControllerOperation} from "../operations/ControllerOperation";
import {Layout} from "../layouts/Layout";
import {Scheduler, SchedulerPriority} from "../../Scheduler";
import {Viz} from "../../helpers/Viz";
import {NEED_ENERGY_THRESHOLD, POWER_PROCESS_THRESHOLD, SUPPLY_ENERGY_THRESHOLD} from "../TradeNetwork";

interface BaseRepairMemory extends MissionMemory {
    findRamps: number;
    roadIds: string[];
    rampId: string;
    lowestHits: number;
}

export class BaseRepairMission extends Mission {

    private layout: Layout;
    private towers: StructureTower[];
    public memory: BaseRepairMemory;

    constructor(operation: ControllerOperation) {
        super(operation, "repair");
        this.layout = operation.layout;
    }

    protected init() {

        if (this.room.findStructures(STRUCTURE_TOWER).length === 0) {
            this.operation.removeMission(this);
            return;
        }

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
        if (this.room.storage && this.room.storage.store.energy < 10000) { return; }
        this.towerActions();
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private towerActions() {
        let structure = this.getNextRepair();
        if (structure) {

            let doRepair = () => {
                let towers = this.findTowersByRange(structure.pos);
                for (let tower of towers) {
                    if (!tower) { continue; }
                    if (tower.energy < tower.energyCapacity * .5) { continue; }
                    tower.repair(structure);
                }
            };

            if (structure.hits < 10000000) {
                doRepair();
            } else {
                // 10m hits, non emergency, repair when cpu is ideal
                Scheduler.addPassiveProcess(SchedulerPriority.Medium, doRepair);
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

        let maxHits = 100000;
        if (this.room.storage) {
            if (this.room.storage.store[RESOURCE_ENERGY] > NEED_ENERGY_THRESHOLD) {
                maxHits = 10000000;
            }
            if (this.room.storage.store[RESOURCE_ENERGY] > POWER_PROCESS_THRESHOLD - 50000) {
                maxHits = RAMPART_MAX_REPAIR;
            }
        }

        let ramparts = this.layout.findStructures<StructureRampart>(STRUCTURE_RAMPART);
        let controllerRamparts = this.findControllerRamparts();
        if (controllerRamparts) {
            ramparts = ramparts.concat(controllerRamparts);
        }

        let lowest = _(ramparts)
            .filter(x => x.hits < maxHits)
            .min(x => x.hits);
        if (!_.isObject(lowest)) {
            console.log(`REPAIR: no ramparts under threshold in ${this.roomName}`);
            this.memory.findRamps = Game.time + 1000;
            delete this.memory.rampId;
            return;
        }

        Memory.stats["core.walls." + this.roomName] = lowest.hits;
        this.memory.lowestHits = lowest.hits;
        this.memory.rampId = lowest.id;
    }

    private findRoads() {
        if (Scheduler.delay(this.memory, "findRoads", 1000)) { return; }

        let roads = _(this.layout.findStructures<StructureRoad>(STRUCTURE_ROAD))
            .filter(x => x.hits < x.hitsMax * .8)
            .value();
        if (!roads || roads.length === 0) {
            console.log(`REPAIR: no roads need repair in ${this.roomName}`);
            return;
        }

        roads.forEach(x => Viz.animatedPos(x.pos, "cyan"));

        // console.log(`found ${roads.length} to repair`);

        this.memory.roadIds = _.map(roads, x => x.id);
    }

    private getNextRepair(): Structure {
        let flag = Game.flags[`${this.operation.name}_repair`];
        if (flag) {
            let structure = _(flag.pos.lookFor<Structure>(LOOK_STRUCTURES)).filter(x => x.hits < x.hitsMax).head();
            if (structure) {
                return structure;
            }
        }

        if (this.memory.roadIds.length > 0) {
            for (let id of this.memory.roadIds) {
                let structure = Game.getObjectById<Structure>(id);
                if (structure && structure.hits < structure.hitsMax) {
                    return structure;
                } else {
                    _.pull(this.memory.roadIds, id);
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
        let inRange = position.findInRange<StructureTower>(this.towers, 8);
        if (inRange.length > 0) {
            return _.map(inRange, tower => tower.id);
        }

        let closest = position.findClosestByRange(this.towers);
        if (closest) {
            return [closest.id];
        }
    }

    private findControllerRamparts() {
        if (this.room.controller.level < 8) { return; }

        let ramparts = [];
        for (let position of this.room.controller.pos.openAdjacentSpots(true)) {
            let rampart = position.lookForStructure<StructureRampart>(STRUCTURE_RAMPART);
            if (rampart) {
                ramparts.push(rampart);
            } else {
                position.createConstructionSite(STRUCTURE_RAMPART);
            }
        }
        return ramparts;
    }
}

export const TOWER_REPAIR_IDEAL = 5;
export const RAMPART_MAX_REPAIR = 40000000;
