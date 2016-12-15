import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
export class RemoteLevelMission extends Mission {

    workers: Creep[];
    construction: ConstructionSite[];
    recycleWhenDone: boolean;
    private boost: boolean;

    /**
     * Sends 6 miner/workers to a remote room where they will (in order of priority)...
     *  Fill EnergyStructures.
     *  Build Construction Sites.
     *  Upgrade the controller.
     * @param operation
     * @param recycleWhenDone - recycles creep in spawnroom if there are no available construction sites
     * @param boost
     */

    constructor(operation: Operation) {
        super(operation, "remoteLevel");
    }

    initMission() {
        if (!this.hasVision) {
            return; // early
        }
        let ignoreStructures = [STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_CONTAINER /*, STRUCTURE_ROAD*/];
        this.construction = _.filter(this.room.find<ConstructionSite>(FIND_CONSTRUCTION_SITES), (cs: ConstructionSite) => ignoreStructures.indexOf(cs.structureType) === -1);
    }

    roleCall() {
        let maxWorkers = 6;
        let getBody = () => {
            if (this.memory.activateBoost) {
                return this.workerBody(16, 16, 16);
            }
            return this.bodyRatio(1, 1, 1, .8, 15);
        };
        this.workers = this.headCount("remoteLeveler", getBody, maxWorkers, { prespawn: 100 });
    }

    missionActions() {
        for (let worker of this.workers) {


            this.workerActions(worker);

        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private _structuresToFill: Structure[];
    private getStructuresToFill() {
        if(!this._structuresToFill) {
            this._structuresToFill = [];
            let stuff = this.room.findStructures(STRUCTURE_TOWER)
                .concat(this.room.findStructures(STRUCTURE_EXTENSION))
                .concat(this.room.findStructures(STRUCTURE_SPAWN));

            let stuffToFill: Structure[] = _.filter(stuff, (s: any) => s.energy < s.energyCapacity);
        }
        return this._structuresToFill;
    }

    private assignSource(): string {
        let creeps = this.room.find<Creep>(FIND_MY_CREEPS);
        let distribution = _.groupBy(creeps, (c: Creep) => c.memory.source);
        let sources = this.room.find<Source>(FIND_SOURCES);
        let lowestSource = _.min(sources, (s: Source) => distribution[s.id] ? distribution[s.id].length : 0);
        return lowestSource.id;
    }

    private workerActions(worker: Creep) {
        let destinationReached = worker.travelByWaypoint(this.waypoints);
        if (!destinationReached) return; // early
        
        let flag = this.flag;
        if(worker.getActiveBodyparts(WORK) < 1) {
            worker.suicide();
            return;
        }
        let hasLoad = this.hasLoad(worker);
        if(!hasLoad) {

            let terminal = this.room.terminal;
            let storage = this.room.storage;
            if(terminal && terminal.store.energy > 0) {
                if (worker.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    worker.blindMoveTo(terminal);
                }
            } else if (storage && storage.store.energy > 0) {
                if (worker.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    worker.blindMoveTo(storage);
                }
            } else {
                if (!worker.memory.source) {
                    worker.memory.source = this.assignSource();
                } else {
                    let source = Game.getObjectById<Source>(worker.memory.source);
                    if (source) {
                        if (!worker.pos.isNearTo(source)) {
                            worker.blindMoveTo(source);
                        } else {
                            worker.harvest(source);
                        }
                    }
                }
            }


        }
        else {
            let stuffToFill = this.getStructuresToFill();
            if (stuffToFill.length > 0) {
                let closest = worker.pos.findClosestByRange(stuffToFill);
                if (closest) {
                    if (worker.transfer(closest, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        worker.blindMoveTo(closest.pos);
                    }
                }
            } else {
                let controller = worker.room.controller;
                if (this.construction.length) {
                    if(worker.build(this.construction[0]) === ERR_NOT_IN_RANGE) {
                        worker.blindMoveTo(this.construction[0].pos);
                    }
                } else if (controller) {
                    if (worker.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                        worker.blindMoveTo(controller.pos);
                    }
                }
            }
        }
    }
}