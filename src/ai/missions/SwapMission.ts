import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {RESERVE_AMOUNT, SWAP_RESERVE} from "../../config/constants";
export class SwapMission extends Mission {

    postMasters: Creep[];
    masons: Creep[];

    mineral: Mineral;
    isActive: boolean;
    towers: StructureTower[];
    terminal: StructureTerminal;
    storage: StructureStorage;
    invader: Creep;
    memory: {
        fortRoomNames: string[];
        needMasons: boolean;
    };

    constructor(operation: Operation) {
        super(operation, "swap");
    }

    initMission() {
        if (!this.hasVision) return;

        this.empire.registerSwap(this.room);
        this.mineral = this.room.find<Mineral>(FIND_MINERALS)[0];
        this.towers = this.room.findStructures(STRUCTURE_TOWER) as StructureTower[];
        this.terminal = this.room.terminal;
        this.storage = this.room.storage;

        // turn off activate when controller gets claimed
        if (this.memory.needMasons === undefined || Game.time % 10 === 0) {
            let ramparts = this.room.findStructures(STRUCTURE_RAMPART) as StructureRampart[];
            this.memory.needMasons = false;
            for (let rampart of ramparts) {
                if (rampart.hits < 1000000) {
                    this.memory.needMasons = true;
                }
                if (this.towers.length > 0 && rampart.hits < 1000) {
                    this.towers[0].repair(rampart);
                }
            }
        }

        this.invader = this.room.hostiles[0];
        this.isActive = this.room.controller.my;
    }

    roleCall() {
        // postMasters

        let maxPostMasters = this.isActive && this.room.controller.level >= 4 ? 1 : 0;

        let postMasterBody = () => this.workerBody(0, 40, 1);
        this.postMasters = this.headCount("postMaster", postMasterBody, maxPostMasters, {prespawn: 50});

        let maxMasons = this.memory.needMasons && this.room.controller.level >= 6 ? 1 : 0;
        let masonBody = () => {
            return this.workerBody(20, 4, 10);
        };

        this.masons = this.headCount("swapMason", masonBody, maxMasons);
    }

    missionActions() {
        for (let postMaster of this.postMasters) {
            this.postMasterActions(postMaster);
        }

        for (let mason of this.masons) {
            this.swapMasonActions(mason);
        }

        if (this.invader) {
            for (let tower of this.towers) tower.attack(this.invader);
        }

        this.transferMinerals();

        this.swapOut();

        this.sellExcessMineral();
    }

    finalizeMission() {
        if (!this.memory.fortRoomNames) {
            let roomNames = _.map(this.empire.terminals, (t: StructureTerminal) => t.room.name);
            this.memory.fortRoomNames = _.sortBy(roomNames, (s: string) => Game.map.getRoomLinearDistance(s, this.room.name, true));
        }
    }

    invalidateMissionCache() {
        this.memory.fortRoomNames = undefined;
    }

    private postMasterActions(postMaster: Creep) {
        if (!postMaster.memory.inPosition) {
            let position = this.terminal.pos.getPositionAtDirection(this.terminal.pos.getDirectionTo(this.storage));
            if (postMaster.pos.inRangeTo(position, 0)) {
                postMaster.memory.inPosition = true;
                postMaster.memory.scavanger = RESOURCE_ENERGY;
            }
            else {
                postMaster.moveItOrLoseIt(position, "postMaster");
                return; // early
            }
        }

        if (!this.isActive) return; // early

        if (postMaster.carry.energy > 0) {
            for (let tower of this.towers) {
                if (tower.energy === tower.energyCapacity) continue;
                postMaster.transfer(tower, RESOURCE_ENERGY);
                return; // early
            }

            if (this.room.controller.level >= 6 && this.storage.store.energy < SWAP_RESERVE) {
                postMaster.transfer(this.storage, RESOURCE_ENERGY);
            }
            return; // early
        }

        if (this.terminal.store.energy >= 30000 && postMaster.carry.energy < postMaster.carryCapacity) {
            postMaster.withdraw(this.terminal, RESOURCE_ENERGY);
        }
    }

    private transferMinerals() {
        if (this.room.controller.level < 6) return;

        if (this.terminal.store.energy >= 20000 && this.terminal.store[this.mineral.mineralType] >= RESERVE_AMOUNT) {
            for (let roomName of this.memory.fortRoomNames) {
                let room = Game.rooms[roomName];
                if (!room || room.controller.level < 6) continue;

                let terminal = room.terminal;
                if (!terminal) continue;

                let shortageFound = !terminal.store[this.mineral.mineralType]
                    || terminal.store[this.mineral.mineralType] < RESERVE_AMOUNT * 2;
                if (shortageFound) {
                    let outcome = this.terminal.send(this.mineral.mineralType, RESERVE_AMOUNT, terminal.room.name);
                    if (outcome === OK) {
                        console.log("SWAP: sending", RESERVE_AMOUNT, this.mineral.mineralType, "to", terminal.room.name);
                    }
                    break;
                }
            }
        }
    }

    private swapOut() {
        // switch to other another satellite
        if (Game.time % 100 === 0
            && this.room.controller.level >= 6
            && this.mineral.ticksToRegeneration > 10000
            && this.storage.store.energy >= SWAP_RESERVE
            && this.terminal.store.energy >= 50000 ) {
            console.log(this.name, "needs to swap out mining operations");
            this.empire.engageSwap(this.room);
        }
    }

    private sellExcessMineral() {
        if (this.room.controller.level < 6 || Game.time % 100 !== 1) return; // early
        let amount = this.room.terminal.store[this.mineral.mineralType];
        let needtoSell = amount > 100000;
        if (!needtoSell) return; // early
        console.log("TRADE: too much mineral in swap mission " + this.opName + ":", amount);
        this.empire.sellExcess(this.room, this.mineral.mineralType, RESERVE_AMOUNT);
    }

    private swapMasonActions(mason: Creep) {
        let ramparts = _.sortBy(this.room.findStructures(STRUCTURE_RAMPART), "hits") as StructureRampart[];
        if (ramparts.length === 0 || mason.pos.roomName !== this.flag.pos.roomName) {
            this.idleNear(mason, this.flag);
            return;
        }

        let hasLoad = this.hasLoad(mason);
        if (!hasLoad) {
            this.procureEnergy(mason);
            return;
        }

        let range = mason.pos.getRangeTo(ramparts[0]);
        if (range > 3) {
            mason.blindMoveTo(ramparts[0]);
        }
        else {
            mason.repair(ramparts[0]);
            mason.yieldRoad(ramparts[0]);
        }
    }
}