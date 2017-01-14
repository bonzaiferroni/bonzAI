import {TransportAnalysis} from "../../interfaces";
import {Operation} from "../operations/Operation";
import {Mission} from "./Mission";
import {LOADAMOUNT_MINERAL} from "../../config/constants";
import {helper} from "../../helpers/helper";
export class GeologyMission extends Mission {

    geologists: Creep[];
    carts: Creep[];
    repairers: Creep[];
    paver: Creep;
    mineral: Mineral;
    store: StructureStorage | StructureTerminal;
    analysis: TransportAnalysis;
    container: StructureContainer;

    memory: {
        distanceToStorage: number;
        distanceToSpawn: number;
        builtExtractor: boolean;
        bestBody: string[];
        roadRepairIds: string[];
        storageId: string;
        transportAnalysis: TransportAnalysis;
        containerPosition: RoomPosition;
        cartWaitPosition: RoomPosition;
    };

    constructor(operation: Operation, storeStructure?: StructureStorage | StructureTerminal) {
        super(operation, "geology");
        this.store = storeStructure;
    }

    initMission() {
        if (!this.hasVision) return;

        this.mineral = this.room.find<Mineral>(FIND_MINERALS)[0];
        if (!this.store) this.store = this.getStorage(this.mineral.pos);
        if (!this.store) return;
        this.mineralStats();

        if ((!this.room.controller || this.room.controller.level >= 7) && !this.memory.builtExtractor) {
            let extractor = this.mineral.pos.lookForStructure(STRUCTURE_EXTRACTOR);
            if (!extractor) {
                this.mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
            }
            this.memory.builtExtractor = true;
        }

        this.distanceToSpawn = this.findDistanceToSpawn(this.mineral.pos);

        if (!this.memory.bestBody) {
            this.memory.bestBody = this.calculateBestBody();
        }

        if (this.mineral.mineralAmount === 0 && this.mineral.ticksToRegeneration > 1000 &&
            this.mineral.ticksToRegeneration < MINERAL_REGEN_TIME - 1000) {
            return; // early
        }

        this.container = this.mineral.findMemoStructure(STRUCTURE_CONTAINER, 1) as StructureContainer;
        if (!this.container && this.memory.builtExtractor &&
            (this.mineral.ticksToRegeneration < 1000 || this.mineral.mineralAmount > 0)) {
            this.buildContainer();
        }
        this.analysis = this.cacheTransportAnalysis(this.memory.distanceToStorage, LOADAMOUNT_MINERAL);
    }

    roleCall() {
        let maxGeologists = 0;
        if (this.hasVision && this.container && this.mineral.mineralAmount > 0 && this.memory.builtExtractor) {
            maxGeologists = 1;
        }

        let geoBody = () => {
            if (this.room.controller && this.room.controller.my) {
                return this.memory.bestBody;
            }
            else {
                return this.workerBody(33, 0, 17);
            }
        };
        this.geologists = this.headCount("geologist", geoBody, maxGeologists, this.distanceToSpawn);

        let maxCarts = maxGeologists > 0 ? this.analysis.cartsNeeded : 0;
        this.carts = this.headCount("geologyCart",
            () => this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount),
            maxCarts, {prespawn: this.distanceToSpawn});

        let maxRepairers = this.mineral.mineralAmount > 5000 && this.container && this.container.hits < 50000 ? 1 : 0;
        this.repairers = this.headCount("repairer", () => this.workerBody(5, 15, 10), maxRepairers);

        if (this.memory.roadRepairIds) {
            this.paver = this.spawnPaver();
        }
    }

    missionActions() {
        for (let geologist of this.geologists) {
            this.geologistActions(geologist);
        }

        for (let cart of this.carts) {
            if (this.mineral.mineralAmount > 0) {
                this.cartActions(cart);
            }
            else {
                this.cleanupCartActions(cart);
            }
        }

        for (let repairer of this.repairers) {
            this.repairActions(repairer);
        }

        if (this.paver) {
            this.paverActions(this.paver);
        }

        if (this.memory.builtExtractor) {
            let distance = this.pavePath(this.store, this.mineral, 2);
            if (distance) {
                this.memory.distanceToStorage = distance;
            }
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        if (Math.random() < .01) {
            this.memory.storageId = undefined;
            this.memory.transportAnalysis = undefined;
            this.memory.distanceToStorage = undefined;
            this.memory.builtExtractor = undefined;
            this.memory.distanceToSpawn = undefined;
        }
    }

    private calculateBestBody() {
        let bestMineAmount = 0;
        let bestMovePartsCount = 0;
        let bestWorkPartsCount = 0;

        for (let i = 1; i < 50; i++) {
            let movePartsCount = i;
            let workPartsCount = MAX_CREEP_SIZE - movePartsCount;
            let ticksPerMove = Math.ceil(1 / (movePartsCount * 2 / workPartsCount));
            let minePerTick = workPartsCount;
            let travelTime = ticksPerMove * this.distanceToSpawn;
            let mineTime = CREEP_LIFE_TIME - travelTime;
            let mineAmount = minePerTick * mineTime;

            if (mineAmount > bestMineAmount) {
                bestMineAmount = mineAmount;
                bestMovePartsCount = movePartsCount;
                bestWorkPartsCount = workPartsCount;
            }
        }

        return this.workerBody(bestWorkPartsCount, 0, bestMovePartsCount);
    }

    private geologistActions(geologist: Creep) {

        let fleeing = geologist.fleeHostiles();
        if (fleeing) return; // early

        if (!this.container) {
            if (!geologist.pos.isNearTo(this.flag)) {
                geologist.blindMoveTo(this.flag);
            }
            return; // early
        }

        if (!geologist.pos.inRangeTo(this.container, 0)) {
            geologist.moveItOrLoseIt(this.container.pos, "geologist");
            return; // early
        }

        if (this.mineral.mineralAmount === 0) {
            if (this.container.store[this.mineral.mineralType] === 0) {
                // break down container
                geologist.dismantle(this.container);
            }
            return; // early
        }

        if (!this.container.store[this.mineral.mineralType] ||
            this.container.store[this.mineral.mineralType] < this.container.storeCapacity - 33) {
            if (Game.time % 6 === 0) geologist.harvest(this.mineral);
        }

    }

    private cleanupCartActions(cart: Creep) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) return; // early

        if (_.sum(cart.carry) === cart.carryCapacity) {
            if (cart.pos.isNearTo(this.store)) {
                cart.transferEverything(this.store);
            }
            else {
                cart.blindMoveTo(this.store);
            }
            return; // early;
        }

        if (this.container && _.sum(this.container.store) > 0) {
            if (cart.pos.isNearTo(this.container)) {
                if (this.container.store.energy > 0) {
                    cart.withdraw(this.container, RESOURCE_ENERGY);
                }
                else if (this.container.store[this.mineral.mineralType] > 0) {
                    cart.withdraw(this.container, this.mineral.mineralType);
                }
            }
            else {
                cart.blindMoveTo(this.container);
            }
        }
        else {
            if (_.sum(cart.carry) > 0) {
                if (cart.pos.isNearTo(this.store)) {
                    cart.transferEverything(this.store);
                }
                else {
                    cart.blindMoveTo(this.store);
                }
                return; // early;
            }

            let spawn = this.spawnGroup.spawns[0];
            if (cart.pos.isNearTo(spawn)) {
                spawn.recycleCreep(cart);
                let witness = this.room.find<Creep>(FIND_MY_CREEPS)[0];
                if (witness) {
                    witness.say("valhalla!");
                }
            }
            else {
                cart.blindMoveTo(spawn);
            }
            return; // early
        }
    }

    private buildContainer() {
        if (!this.memory.containerPosition) {
            this.memory.containerPosition = this.mineral.pos.walkablePath(this.store.pos)[0];
        }
        let position = helper.deserializeRoomPosition(this.memory.containerPosition);
        if (position.lookFor(LOOK_CONSTRUCTION_SITES).length === 0 && !position.lookForStructure(STRUCTURE_CONTAINER)) {
            console.log("GEO: building container in", this.operation.name);
            position.createConstructionSite(STRUCTURE_CONTAINER);
        }
    }

    private cartActions(cart: Creep) {

        let fleeing = cart.fleeHostiles();
        if (fleeing) return; // early

        let hasLoad = this.hasLoad(cart);
        if (!hasLoad) {
            if (!this.container) {
                if (!cart.pos.isNearTo(this.flag)) {
                    cart.blindMoveTo(this.flag);
                }
                return;
            }

            if (_.sum(this.container.store) < cart.carryCapacity &&
                this.container.pos.lookFor(LOOK_CREEPS).length === 0) {
                this.idleNear(cart, this.container, 3);
                return;
            }

            if (cart.pos.isNearTo(this.container)) {
                if (this.container.store.energy > 0) {
                    cart.withdraw(this.container, RESOURCE_ENERGY);
                }
                else {
                    let outcome = cart.withdrawIfFull(this.container, this.mineral.mineralType);
                    if (outcome === OK && this.container.store[this.mineral.mineralType] >= cart.storeCapacity) {
                        cart.blindMoveTo(this.store);
                    }
                }
            }
            else {
                cart.blindMoveTo(this.container);
            }
            return; // early
        }

        if (cart.pos.isNearTo(this.store)) {
            let outcome = cart.transferEverything(this.store);
            if (outcome === OK && cart.ticksToLive < this.analysis.distance) {
                cart.suicide();
            }
            else if (outcome === OK) {
                cart.blindMoveTo(this.container);
            }

        }
        else {
            cart.blindMoveTo(this.store);
        }
    }

    private repairActions(repairer: Creep) {
        let fleeing = repairer.fleeHostiles();
        if (fleeing) return;

        if (repairer.room.name !== this.flag.pos.roomName) {
            this.idleNear(repairer, this.flag);
            return;
        }

        let hasLoad = this.hasLoad(repairer);
        if (!hasLoad) {
            this.procureEnergy(repairer);
            return;
        }

        if (!this.container || this.container.hits === this.container.hitsMax) {
            repairer.idleOffRoad(this.flag);
            return;
        }

        if (repairer.pos.inRangeTo(this.container, 3)) {
            repairer.repair(this.container);
            repairer.yieldRoad(this.container);
        }
        else {
            repairer.blindMoveTo(this.container);
        }
    }

    mineralStats() {
        if (!Game.cache[this.mineral.mineralType]) Game.cache[this.mineral.mineralType] = 0;
        Game.cache[this.mineral.mineralType]++;
    }
}