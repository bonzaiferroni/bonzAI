import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {PaveData, PaverMission} from "./PaverMission";

interface SwapMissionMemory extends MissionMemory {
    rampartId: string;
    nextRampartCheck: number;
}

interface SwapMissionState extends MissionState {
    swapperPresent: boolean;
}

export class SwapMission extends Mission {

    public state: SwapMissionState;
    public memory: SwapMissionMemory;
    private swapperPos: RoomPosition;
    private swappers: Agent[];

    constructor(operation: Operation) {
        super(operation, "swap");
    }

    protected init() {
        if (!this.state.hasVision) {
            this.operation.sleepMission(this, 100);
            return;
        }

        if (!this.room.storage || !this.room.terminal) {
            this.operation.removeMission(this);
            return;
        }

        this.swapperPos = this.room.storage.pos.getPositionAtDirection(this.room.storage.pos.getDirectionTo(this.room.terminal));
    }

    protected update() {
        PaverMission.updatePath(this.memory, this.paverCallback);
    }

    protected paverCallback = (): PaveData => {
        return {
            id: this.operation.name + this.name,
            startPos: this.spawnGroup.pos,
            endPos: this.room.storage.pos,
            rangeToEnd: 2,
        };
    };

    private maxSwappers = () => {
        if (this.room.controller.level >= 4) {
            return 1;
        } else {
            return 0;
        }
    };

    private swapperBody = () => {
        return this.workerBody(0, 40, 1);
    };

    protected roleCall() {
        this.swappers = this.headCount("swapper", this.swapperBody, this.maxSwappers, {
            prespawn: this.operation.remoteSpawn.distance,
        });
    }

    protected actions() {
        for (let swapper of this.swappers) {
            this.swapperActions(swapper);
        }

        if (this.state.swapperPresent) {
            let rampartRepair = this.findRampartRepair();
            if (rampartRepair) {
                for (let tower of this.room.findStructures<StructureTower>(STRUCTURE_TOWER)) {
                    if (tower.energy >= tower.energyCapacity * .5) {
                        tower.repair(rampartRepair);
                    }
                }
            }
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }

    private swapperActions(swapper: Agent) {
        if (!swapper.pos.inRangeTo(this.swapperPos, 0)) {
            swapper.moveItOrLoseIt(this.swapperPos);
            return;
        }

        this.state.swapperPresent = true;

        let fillTarget = this.findFillTarget();
        if (!fillTarget) { return; }

        if (swapper.carry.energy > 0) {
            swapper.transfer(fillTarget, RESOURCE_ENERGY);
            return;
        }

        let source = this.findEnergySource(fillTarget);
        if (source) {
            swapper.withdraw(source, RESOURCE_ENERGY);
        }
    }

    private findFillTarget(): Structure {
        for (let tower of this.room.findStructures<StructureTower>(STRUCTURE_TOWER)) {
            if (tower.energy < tower.energyCapacity * .5) {
                return tower;
            }
        }

        if (this.room.controller.level >= 6 && this.room.storage.store.energy < this.room.storage.storeCapacity) {
            return this.room.storage;
        }
    }

    private findEnergySource(fillTarget: Structure): StoreStructure {
        if (fillTarget instanceof StructureTower) {
            if (this.room.storage.store.energy >= 2000) {
                return this.room.storage;
            }
        }

        if (fillTarget instanceof StructureStorage) {
            if (this.room.terminal.store.energy >= 2000) {
                return this.room.terminal;
            }
        }
    }

    private findRampartRepair() {
        if (this.memory.rampartId && Math.random() > .99) {
            let rampart = Game.getObjectById<StructureRampart>(STRUCTURE_RAMPART);
            if (rampart && rampart.hits < rampart.hitsMax) {
                return rampart;
            } else {
                delete this.memory.rampartId;
                return this.findRampartRepair();
            }
        } else {
            if (this.memory.nextRampartCheck > Game.time) { return; }

            let rampart = _(this.swapperPos.findInRange(this.room.findStructures(STRUCTURE_RAMPART), 1))
                .filter(x => x.hits < x.hitsMax * .8)
                .min(x => x.hits);
            if (_.isObject(rampart)) {
                this.memory.rampartId = rampart.id;
                return rampart;
            } else {
                this.memory.nextRampartCheck = Game.time + 100 + Math.floor(Math.random() * 100);
            }
        }
    }
}
